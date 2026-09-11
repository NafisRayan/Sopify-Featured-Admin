import { getStore } from '@/store/useStore'
import { variantLevelAt } from '@/store/selectors'
import { uid } from '@/lib/id'
import { syncMutation, gqlLiteral, mutatePayload, IS_REMOTE } from './api'
import { delay } from '@/lib/delay'
import { roundMoney } from '@/lib/money'
import { CURRENT_USER } from '@/lib/constants'
import type {
  Order, OrderLineItem, TimelineEventType, PaymentStatus, Fulfillment, Refund, Customer,
  Address, OrderStatus, FulfillmentStatus,
} from '@/types'

/**
 * Orders service. Business rules per spec §48:
 *  - fulfill → fulfillment record, committed stock decremented, timeline event
 *  - refund → refund record, payment status, optional restock, timeline event
 *  - cancel → status change, reserved stock released, timeline event
 */

const author = CURRENT_USER.name

function addTimeline(orderId: string, type: TimelineEventType, message: string): void {
  const order = getStore().orders.find((o) => o.id === orderId)
  if (!order) return
  getStore().patchOrder(orderId, {
    timeline: [
      ...order.timeline,
      { id: uid('ev'), createdAt: new Date().toISOString(), type, message, author },
    ],
  })
}

/** Orders are queryable through the store hook; these helpers support services */
function recomputeFulfillmentStatus(order: Order): FulfillmentStatus {
  const fulfillable = order.lineItems.filter((li) => li.requiresShipping)
  if (fulfillable.length === 0) return 'unfulfilled'
  const fulfilledIds = new Set(order.fulfillments.flatMap((f) => f.lineItemIds))
  const allFulfilled = fulfillable.every((li) => fulfilledIds.has(li.id))
  const someFulfilled = fulfillable.some((li) => fulfilledIds.has(li.id))
  return allFulfilled ? 'fulfilled' : someFulfilled ? 'partial' : 'unfulfilled'
}

function recomputePaymentStatus(order: Order): PaymentStatus {
  if (order.status === 'cancelled') return order.paymentStatus
  const refunded = order.refunds.reduce((s, r) => s + r.amount, 0)
  if (refunded === 0) return order.paymentStatus
  return refunded >= order.total - 0.01 ? 'refunded' : 'partially_refunded'
}

// ─── Fulfillment ───────────────────────────────────────────────────────────

export interface FulfillInput {
  orderId: string
  lineItemIds: string[]
  locationId: string
  trackingNumber?: string
  carrier?: string
  notifyCustomer: boolean
}

export async function fulfillOrder(input: FulfillInput): Promise<void> {
  await delay(450)
  const store = getStore()
  const order = store.orders.find((o) => o.id === input.orderId)
  if (!order) throw new Error('Order not found')

  // move reserved units out of committed stock
  for (const li of order.lineItems) {
    if (!input.lineItemIds.includes(li.id)) continue
    const level = variantLevelAt(li.variantId, input.locationId)
    if (level) {
      store.upsertInventoryLevel({
        ...level,
        committed: Math.max(0, level.committed - li.quantity),
      })
    } else {
      // order fulfilled from a location without a recorded level: create one
      store.upsertInventoryLevel({
        variantId: li.variantId, locationId: input.locationId,
        available: 0, committed: 0, unavailable: 0,
      })
    }
  }

  const fulfillment: Fulfillment = {
    id: uid('ff'),
    createdAt: new Date().toISOString(),
    lineItemIds: input.lineItemIds,
    trackingNumber: input.trackingNumber || undefined,
    carrier: input.carrier || undefined,
    locationId: input.locationId,
    status: 'success',
  }
  const updated: Partial<Order> = {
    fulfillments: [...order.fulfillments, fulfillment],
  }
  const withFulfillment = { ...order, fulfillments: updated.fulfillments } as Order
  updated.fulfillmentStatus = recomputeFulfillmentStatus(withFulfillment)
  store.patchOrder(order.id, updated)

  const location = store.locations.find((l) => l.id === input.locationId)
  const qty = order.lineItems.filter((li) => input.lineItemIds.includes(li.id)).reduce((s, li) => s + li.quantity, 0)
  const tracking = input.trackingNumber ? ` · Tracking ${input.carrier ?? ''} ${input.trackingNumber}` : ''
  addTimeline(
    order.id,
    'fulfillment',
    `${qty} item${qty === 1 ? '' : 's'} fulfilled from ${location?.name ?? 'default location'}${tracking}${input.notifyCustomer ? ' · Customer notified' : ''}`,
  )
  if (updated.fulfillmentStatus === 'fulfilled') {
    store.patchOrder(order.id, { status: 'closed', closedAt: new Date().toISOString() })
  }
}

// ─── Payments ──────────────────────────────────────────────────────────────

export async function markAsPaid(orderId: string): Promise<void> {
  await delay(300)
  const order = getStore().orders.find((o) => o.id === orderId)
  if (!order) throw new Error('Order not found')
  getStore().patchOrder(orderId, { paymentStatus: 'paid' })
  syncMutation(`mutation { orderMarkAsPaid(id: ${gqlLiteral(orderId)}) { userErrors { message } } }`)
  addTimeline(orderId, 'payment', `Payment of $${order.total.toFixed(2)} marked as received`)
}

// ─── Refunds ───────────────────────────────────────────────────────────────

export interface RefundInput {
  orderId: string
  amount: number
  reason: string
  lineItemIds: string[]
  restock: boolean
}

export async function refundOrder(input: RefundInput): Promise<void> {
  await delay(450)
  const store = getStore()
  const order = store.orders.find((o) => o.id === input.orderId)
  if (!order) throw new Error('Order not found')
  if (input.amount <= 0) throw new Error('Refund amount must be greater than 0')
  const alreadyRefunded = order.refunds.reduce((s, r) => s + r.amount, 0)
  if (alreadyRefunded + input.amount > order.total + 0.01) {
    throw new Error('Refund exceeds order total')
  }

  const refund: Refund = {
    id: uid('rf'),
    createdAt: new Date().toISOString(),
    amount: roundMoney(input.amount),
    reason: input.reason,
    lineItemIds: input.lineItemIds,
    restock: input.restock,
  }
  const updated: Partial<Order> = { refunds: [...order.refunds, refund] }
  const withRefund = { ...order, refunds: updated.refunds } as Order
  updated.paymentStatus = recomputePaymentStatus(withRefund)
  store.patchOrder(order.id, updated)

  if (input.restock) {
    for (const li of order.lineItems) {
      if (!input.lineItemIds.includes(li.id)) continue
      const levels = store.inventoryLevels.filter((l) => l.variantId === li.variantId)
      if (levels.length > 0) {
        const level = levels[0]!
        store.upsertInventoryLevel({ ...level, available: level.available + li.quantity })
      }
    }
  }

  addTimeline(
    order.id,
    'refund',
    `Refund of $${refund.amount.toFixed(2)} issued (${input.reason})${input.restock ? ' · items restocked' : ''}`,
  )
  if (updated.paymentStatus === 'refunded' && order.fulfillmentStatus === 'unfulfilled') {
    store.patchOrder(order.id, { fulfillmentStatus: 'returned', status: 'closed', closedAt: new Date().toISOString() })
  }
}

// ─── Cancel / close ────────────────────────────────────────────────────────

export async function cancelOrder(orderId: string, restock = true): Promise<void> {
  await delay(400)
  const store = getStore()
  const order = store.orders.find((o) => o.id === orderId)
  if (!order) throw new Error('Order not found')

  // release reserved stock back to available
  if (restock && order.fulfillmentStatus !== 'fulfilled') {
    for (const li of order.lineItems) {
      const levels = store.inventoryLevels.filter((l) => l.variantId === li.variantId)
      if (levels.length > 0) {
        const level = levels[0]!
        const release = Math.min(level.committed, li.quantity)
        store.upsertInventoryLevel({
          ...level,
          committed: level.committed - release,
          available: level.available + release,
        })
      }
    }
  }
  syncMutation(`mutation { orderCancel(id: ${gqlLiteral(orderId)}, restock: ${restock}) { userErrors { message } } }`)
  store.patchOrder(orderId, {
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
    paymentStatus: order.paymentStatus === 'paid' ? 'refunded' : order.paymentStatus === 'pending' ? 'voided' : order.paymentStatus,
  })
  addTimeline(orderId, 'cancel', `Order cancelled${restock ? ' · items restocked' : ''}`)
}

export async function closeOrder(orderId: string): Promise<void> {
  await delay(250)
  syncMutation(`mutation { orderClose(id: ${gqlLiteral(orderId)}) { userErrors { message } } }`)
  getStore().patchOrder(orderId, { status: 'closed', closedAt: new Date().toISOString() })
  addTimeline(orderId, 'edit', 'Order archived')
}

export async function reopenOrder(orderId: string): Promise<void> {
  await delay(250)
  syncMutation(`mutation { orderReopen(id: ${gqlLiteral(orderId)}) { userErrors { message } } }`)
  getStore().patchOrder(orderId, { status: 'open', closedAt: undefined })
  addTimeline(orderId, 'edit', 'Order unarchived')
}

// ─── Notes & tags ──────────────────────────────────────────────────────────

export async function addOrderNote(orderId: string, note: string): Promise<void> {
  await delay(200)
  const order = getStore().orders.find((o) => o.id === orderId)
  if (!order) throw new Error('Order not found')
  getStore().patchOrder(orderId, { note })
  syncMutation(`mutation { orderUpdate(id: ${gqlLiteral(orderId)}, order: { note: ${gqlLiteral(note)} }) { userErrors { message } } }`)
  addTimeline(orderId, 'note', note)
}

export async function setOrderTags(orderId: string, tags: string[]): Promise<void> {
  await delay(200)
  getStore().patchOrder(orderId, { tags })
  syncMutation(`mutation { orderUpdate(id: ${gqlLiteral(orderId)}, order: { tags: ${gqlLiteral(tags)} }) { userErrors { message } } }`)
}

export async function bulkAddTags(orderIds: string[], tags: string[]): Promise<void> {
  await delay(300)
  const store = getStore()
  for (const id of orderIds) {
    const o = store.orders.find((x) => x.id === id)
    if (o) store.patchOrder(id, { tags: [...new Set([...o.tags, ...tags])] })
  }
}

// ─── Draft orders ──────────────────────────────────────────────────────────

function nextOrderNumber(): number {
  const numbers = getStore()
    .orders.filter((o) => !o.isDraft)
    .map((o) => Number(o.name.replace('#', '')))
  return Math.max(1000, ...numbers) + 1
}

export interface DraftInput {
  customerId: string
  lineItems: { variantId: string; quantity: number }[]
  note?: string
  tags?: string[]
  email?: string
  shippingPrice?: number
  discountAmount?: number
}

function buildDraft(input: DraftInput): Order {
  const store = getStore()
  const customer = store.customers.find((c) => c.id === input.customerId)
  if (!customer) throw new Error('Select a customer')
  const lineItems: OrderLineItem[] = input.lineItems.map((li) => {
    const product = store.products.find((p) => p.variants.some((v) => v.id === li.variantId))
    const variant = product?.variants.find((v) => v.id === li.variantId)
    if (!product || !variant) throw new Error('Invalid variant in draft')
    return {
      id: uid('li'),
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      variantTitle: variant.title === 'Default Title' ? '' : variant.title,
      sku: variant.sku,
      quantity: li.quantity,
      price: variant.price,
      totalDiscount: 0,
      requiresShipping: true,
      imageSrc: product.media[0]?.src,
    }
  })
  const subtotal = roundMoney(lineItems.reduce((s, li) => s + li.price * li.quantity, 0))
  const shippingPrice = input.shippingPrice ?? 6.99
  const discountAmount = input.discountAmount ?? 0
  const taxTotal = roundMoney((subtotal - discountAmount) * 0.08)
  const addr: Address | undefined = customer.defaultAddress
  const now = new Date().toISOString()
  return {
    id: uid('o'),
    name: `#D${Math.floor(Math.random() * 900 + 100)}`,
    customerId: customer.id,
    email: input.email || customer.email,
    createdAt: now,
    paymentStatus: 'unpaid',
    fulfillmentStatus: 'unfulfilled',
    status: 'draft',
    channel: 'Online Store',
    lineItems,
    shippingAddress: addr!,
    billingAddress: addr!,
    shippingTitle: shippingPrice === 0 ? 'Free shipping' : 'Standard shipping',
    shippingPrice,
    subtotal,
    taxTotal,
    total: roundMoney(subtotal - discountAmount + shippingPrice + taxTotal),
    discountCode: discountAmount > 0 ? { code: 'CUSTOM', amount: discountAmount } : undefined,
    currency: 'USD',
    tags: input.tags ?? [],
    note: input.note,
    timeline: [{ id: uid('ev'), createdAt: now, type: 'created', message: 'Draft order created', author }],
    fulfillments: [],
    refunds: [],
    paymentGateway: 'Shopify Payments',
    isDraft: true,
  }
}

export async function createDraft(input: DraftInput): Promise<Order> {
  await delay(350)
  if (IS_REMOTE) {
    const { entity } = await mutatePayload('draftOrderCreate', `draftOrderCreate(customerId: ${gqlLiteral(input.customerId)}, items: ${gqlLiteral(input.lineItems)}, note: ${gqlLiteral(input.note ?? null)}, tags: ${gqlLiteral(input.tags ?? [])}, shippingPrice: ${input.shippingPrice ?? 6.99}, discountAmount: ${input.discountAmount ?? 0}) { order { id name customerId email phone createdAt paymentStatus fulfillmentStatus status channel lineItems { id productId variantId title variantTitle sku quantity price totalDiscount requiresShipping imageSrc } shippingAddress { firstName lastName address1 address2 city province country zip phone company } billingAddress { firstName lastName address1 address2 city province country zip phone company } shippingTitle shippingPrice subtotal taxTotal total currency tags note timeline { id createdAt type message author } fulfillments { id createdAt lineItemIds trackingNumber carrier locationId status } refunds { id createdAt amount reason lineItemIds restock } paymentGateway isDraft riskLevel riskSignals } userErrors { field message } }`)
    getStore().addOrder(entity as Order)
    return entity as Order
  }
  const draft = buildDraft(input)
  getStore().addOrder(draft)
  return draft
}

export async function updateDraft(orderId: string, input: DraftInput): Promise<void> {
  await delay(300)
  const existing = getStore().orders.find((o) => o.id === orderId)
  if (!existing || !existing.isDraft) throw new Error('Draft not found')
  const rebuilt = buildDraft(input)
  getStore().patchOrder(orderId, {
    lineItems: rebuilt.lineItems,
    subtotal: rebuilt.subtotal,
    taxTotal: rebuilt.taxTotal,
    total: rebuilt.total,
    customerId: rebuilt.customerId,
    email: rebuilt.email,
    note: rebuilt.note,
    tags: rebuilt.tags,
  })
}

/** Mark a draft as a real order: moves it into the live order flow */
export async function convertDraft(orderId: string): Promise<string> {
  await delay(400)
  const store = getStore()
  const draft = store.orders.find((o) => o.id === orderId)
  if (!draft || !draft.isDraft) throw new Error('Draft not found')
  const name = `#${nextOrderNumber()}`
  store.patchOrder(orderId, {
    name,
    status: 'open',
    isDraft: false,
    paymentStatus: 'pending',
    createdAt: new Date().toISOString(),
    timeline: [
      ...draft.timeline,
      { id: uid('ev'), createdAt: new Date().toISOString(), type: 'created', message: `Draft converted to order ${name}`, author },
    ],
  })
  syncMutation(`mutation { draftOrderConvert(id: ${gqlLiteral(orderId)}) { userErrors { message } } }`)
  return orderId
}

export async function deleteDrafts(ids: string[]): Promise<void> {
  await delay(250)
  getStore().removeOrders(ids)
  syncMutation(`mutation { draftOrderDelete(ids: ${gqlLiteral(ids)}) { userErrors { message } } }`)
}

// ─── Abandoned checkouts ───────────────────────────────────────────────────

export async function sendRecoveryEmail(checkoutId: string): Promise<void> {
  await delay(350)
  const store = getStore()
  const co = store.abandoned.find((a) => a.id === checkoutId)
  if (!co) throw new Error('Checkout not found')
  store.patchAbandoned(checkoutId, { recoveryStatus: 'email_sent' })
}

export async function createOrderFromAbandoned(checkoutId: string): Promise<string | undefined> {
  await delay(400)
  const store = getStore()
  const co = store.abandoned.find((a) => a.id === checkoutId)
  if (!co) return undefined
  const customer = store.customers.find((c) => c.id === co.customerId)
  if (!customer) return undefined
  const draft = await createDraft({ customerId: customer.id, lineItems: co.lineItems.map((li) => ({ variantId: li.variantId, quantity: li.quantity })) })
  store.patchAbandoned(checkoutId, { recoveryStatus: 'recovered' })
  return convertDraft(draft.id)
}

// ─── Bulk operations ───────────────────────────────────────────────────────

export async function bulkFulfill(orderIds: string[], locationId: string): Promise<number> {
  // server sync happens per-order inside fulfillOrder
  let count = 0
  for (const id of orderIds) {
    const o = getStore().orders.find((x) => x.id === id)
    if (!o || o.status === 'cancelled' || o.status === 'draft') continue
    if (o.fulfillmentStatus === 'unfulfilled' || o.fulfillmentStatus === 'partial') {
      const unfulfilledIds = o.lineItems
        .filter((li) => li.requiresShipping && !o.fulfillments.some((f) => f.lineItemIds.includes(li.id)))
        .map((li) => li.id)
      await fulfillOrder({ orderId: id, lineItemIds: unfulfilledIds, locationId, notifyCustomer: true })
      count++
    }
  }
  return count
}

export async function bulkMarkPaid(orderIds: string[]): Promise<number> {
  let count = 0
  for (const id of orderIds) {
    const o = getStore().orders.find((x) => x.id === id)
    if (o && (o.paymentStatus === 'pending' || o.paymentStatus === 'authorized' || o.paymentStatus === 'unpaid')) {
      await markAsPaid(id)
      count++
    }
  }
  return count
}

export async function bulkCancel(orderIds: string[]): Promise<void> {
  await delay(400)
  for (const id of orderIds) {
    const o = getStore().orders.find((x) => x.id === id)
    if (o && o.status !== 'cancelled' && o.status !== 'draft') await cancelOrder(id)
  }
}

export async function bulkArchive(orderIds: string[]): Promise<void> {
  await delay(300)
  for (const id of orderIds) await closeOrder(id)
}

export async function getOrder(id: string): Promise<Order | undefined> {
  return getStore().orders.find((o) => o.id === id)
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  return getStore().customers.find((c) => c.id === id)
}

export function orderStatusLabel(o: Order): string {
  if (o.isDraft) return 'Draft'
  const map: Record<OrderStatus, string> = { open: 'Open', closed: 'Archived', cancelled: 'Cancelled', draft: 'Draft' }
  return map[o.status]
}
