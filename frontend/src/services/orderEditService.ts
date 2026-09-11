import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { syncMutation, gqlLiteral } from './api'
import { delay } from '@/lib/delay'
import { roundMoney } from '@/lib/money'
import { CURRENT_USER } from '@/lib/constants'
import type { ReturnRecord, ReturnLine, OrderEditRecord } from '@/types/parity'
import type { Order, OrderLineItem } from '@/types'

const author = () => CURRENT_USER.name

function addTimeline(orderId: string, message: string, type: 'edit' | 'refund' | 'note' = 'edit'): void {
  const order = getStore().orders.find((o) => o.id === orderId)
  if (!order) return
  getStore().patchOrder(orderId, {
    timeline: [...order.timeline, { id: uid('ev'), createdAt: new Date().toISOString(), type, message, author: author() }],
  })
}

function logActivity(action: string, resource: string, resourceId?: string): void {
  const store = getStore()
  store.appendActivity({
    id: uid('act'),
    at: new Date().toISOString(),
    staffId: CURRENT_USER.id,
    staffName: CURRENT_USER.name,
    action,
    resource,
    resourceId,
  })
}

// ─── Order editing (Admin API: orderEditCommit) ────────────────────────────

export interface OrderEditInput {
  added: { variantId: string; quantity: number }[]
  removed: { lineItemId: string; quantity: number }[]
}

export function canEditOrder(order: Order): boolean {
  return order.status === 'open' && order.fulfillmentStatus === 'unfulfilled'
}

export async function editOrder(orderId: string, input: OrderEditInput): Promise<void> {
  await delay(450)
  const store = getStore()
  const order = store.orders.find((o) => o.id === orderId)
  if (!order) throw new Error('Order not found')
  if (!canEditOrder(order)) throw new Error('Only unfulfilled orders can be edited')

  let lineItems: OrderLineItem[] = [...order.lineItems]

  // apply removals (reduce qty or drop the line)
  for (const rem of input.removed) {
    lineItems = lineItems
      .map((li) => (li.id === rem.lineItemId ? { ...li, quantity: li.quantity - rem.quantity } : li))
      .filter((li) => li.quantity > 0)
  }
  // apply additions (merge into existing line for the same variant)
  for (const add of input.added) {
    const variant = store.products.flatMap((p) => p.variants).find((v) => v.id === add.variantId)
    const product = store.products.find((p) => p.variants.some((v) => v.id === add.variantId))
    if (!variant || !product) throw new Error('Variant no longer exists')
    const existing = lineItems.find((li) => li.variantId === add.variantId)
    if (existing) {
      lineItems = lineItems.map((li) => (li.id === existing.id ? { ...li, quantity: li.quantity + add.quantity } : li))
    } else {
      lineItems.push({
        id: uid('li'),
        productId: product.id,
        variantId: variant.id,
        title: product.title,
        variantTitle: variant.title === 'Default Title' ? '' : variant.title,
        sku: variant.sku,
        quantity: add.quantity,
        price: variant.price,
        totalDiscount: 0,
        requiresShipping: true,
        imageSrc: product.media[0]?.src,
      })
    }
  }
  if (lineItems.length === 0) throw new Error('An order needs at least one item')

  const subtotal = roundMoney(lineItems.reduce((s, li) => s + li.price * li.quantity - li.totalDiscount, 0))
  const discountAmount = order.discountCode?.amount ?? 0
  const taxTotal = roundMoney((subtotal - discountAmount) * 0.08)
  const total = roundMoney(subtotal - discountAmount + order.shippingPrice + taxTotal)
  const deltaTotal = roundMoney(total - order.total)

  store.patchOrder(orderId, { lineItems, subtotal, taxTotal, total })
  syncMutation(`mutation { orderEdit(id: ${gqlLiteral(orderId)}, added: ${gqlLiteral(input.added)}, removed: ${gqlLiteral(input.removed)}) { userErrors { message } } }`)
  const record: OrderEditRecord = {
    id: uid('oe'),
    orderId,
    at: new Date().toISOString(),
    author: author(),
    added: input.added,
    removed: input.removed,
    deltaTotal,
  }
  store.addOrderEdit(record)
  const parts: string[] = []
  if (input.added.length) parts.push(`added ${input.added.reduce((s, a) => s + a.quantity, 0)} item(s)`)
  if (input.removed.length) parts.push(`removed ${input.removed.reduce((s, r) => s + r.quantity, 0)} item(s)`)
  addTimeline(orderId, `Order edited — ${parts.join(', ')} · total ${deltaTotal >= 0 ? '+' : '−'}$${Math.abs(deltaTotal).toFixed(2)}`)
  logActivity('Edited order', 'order', orderId)
}

// ─── Returns & exchanges (Admin API: returnCreate / returnClose) ───────────

export interface ReturnInput {
  orderId: string
  lines: ReturnLine[]
  reason: string
  restock: boolean
  refundAmount: number
}

export async function createReturn(input: ReturnInput): Promise<ReturnRecord> {
  await delay(400)
  const store = getStore()
  const order = store.orders.find((o) => o.id === input.orderId)
  if (!order) throw new Error('Order not found')
  if (input.lines.length === 0) throw new Error('Select at least one item to return')

  const record: ReturnRecord = {
    id: uid('ret'),
    orderId: input.orderId,
    status: 'open',
    lines: input.lines,
    reason: input.reason,
    restock: input.restock,
    refundAmount: roundMoney(input.refundAmount),
    createdAt: new Date().toISOString(),
  }
  store.upsertReturn(record)
  syncMutation(`mutation { returnCreate(orderId: ${gqlLiteral(input.orderId)}, lines: ${gqlLiteral(input.lines)}, reason: ${gqlLiteral(input.reason)}, restock: ${input.restock}, refundAmount: ${input.refundAmount}) { userErrors { message } } }`)
  addTimeline(input.orderId, `Return requested for ${input.lines.reduce((s, l) => s + l.quantity, 0)} item(s) (${input.reason})`, 'refund')
  logActivity('Created return', 'order', input.orderId)
  return record
}

export async function closeReturn(returnId: string, opts: { markRefunded: boolean }): Promise<void> {
  await delay(450)
  const store = getStore()
  const ret = store.returns.find((r) => r.id === returnId)
  if (!ret || ret.status !== 'open') throw new Error('Return not found or already closed')
  const order = store.orders.find((o) => o.id === ret.orderId)
  if (!order) throw new Error('Order not found')

  // restock returned units into the first recorded level of each variant
  if (ret.restock) {
    for (const line of ret.lines) {
      const li = order.lineItems.find((x) => x.id === line.lineItemId)
      if (!li) continue
      // exchange: restock goes to the exchanged-for variant being returned — here we restock original
      const levels = store.inventoryLevels.filter((l) => l.variantId === li.variantId)
      if (levels.length > 0) {
        const level = levels[0]!
        store.upsertInventoryLevel({ ...level, available: level.available + line.quantity })
      }
    }
  }

  // apply refund like refundOrder does
  if (opts.markRefunded && ret.refundAmount > 0) {
    const alreadyRefunded = order.refunds.reduce((s, r) => s + r.amount, 0)
    if (alreadyRefunded + ret.refundAmount > order.total + 0.01) throw new Error('Refund exceeds order total')
    store.patchOrder(order.id, {
      refunds: [
        ...order.refunds,
        {
          id: uid('rf'),
          createdAt: new Date().toISOString(),
          amount: ret.refundAmount,
          reason: ret.reason,
          lineItemIds: ret.lines.map((l) => l.lineItemId),
          restock: false, // restock handled by the return itself
        },
      ],
    })
  }

  const refundedAll = order.lineItems.every((li) =>
    ret.lines.some((l) => l.lineItemId === li.id && l.quantity >= li.quantity),
  )
  store.patchOrder(order.id, {
    fulfillmentStatus: refundedAll ? 'returned' : order.fulfillmentStatus,
  })
  store.upsertReturn({ ...ret, status: 'returned', closedAt: new Date().toISOString() })
  syncMutation(`mutation { returnClose(id: ${gqlLiteral(returnId)}, markRefunded: ${opts.markRefunded}) { userErrors { message } } }`)
  addTimeline(
    order.id,
    `Return closed — ${ret.refundAmount > 0 && opts.markRefunded ? `$${ret.refundAmount.toFixed(2)} refunded` : 'no refund issued'}${ret.restock ? ' · items restocked' : ''}`,
    'refund',
  )
  logActivity('Closed return', 'order', order.id)
}

// ─── Draft invoices (Admin API: orderSendInvoice) ──────────────────────────

export async function sendDraftInvoice(orderId: string): Promise<void> {
  await delay(350)
  const order = getStore().orders.find((o) => o.id === orderId)
  if (!order || !order.isDraft) throw new Error('Draft not found')
  addTimeline(orderId, `Invoice emailed to ${order.email}`, 'note')
  logActivity('Sent draft invoice', 'order', orderId)
}
