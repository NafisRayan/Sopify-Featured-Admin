import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { delay } from '@/lib/delay'
import { CURRENT_USER } from '@/lib/constants'
import { IS_REMOTE, gqlRequest, gqlLiteral, syncMutation, refreshFromServer } from '@/services/api'
import { ORDER_SELECTION, recomputeFulfillmentStatus } from '@/services/ordersService'
import type { ReturnRecord } from '@/types/parity'
import type { Fulfillment, FulfillmentEvent, InventoryHistoryEntry, Order, TimelineEvent } from '@/types'

/**
 * Thin order-mutation wrappers for the return lifecycle + fulfillment tracking
 * (returnApprove/Decline/Cancel, fulfillmentCancel, fulfillmentEventCreate).
 * Server-first where the backend owns the semantics (fulfillmentCancel):
 * remote mode awaits the mutation and mirrors the returned order + restock;
 * offline mode reproduces the same rules locally. Returns/fulfillment events
 * keep the local patch + syncMutation reconcile pattern.
 */

function addTimeline(orderId: string, message: string, type: TimelineEvent['type']): void {
  const order = getStore().orders.find((o) => o.id === orderId)
  if (!order) return
  getStore().patchOrder(orderId, {
    timeline: [...order.timeline, { id: uid('ev'), createdAt: new Date().toISOString(), type, message, author: CURRENT_USER.name }],
  })
}

function logActivity(action: string, resource: string, resourceId?: string): void {
  getStore().appendActivity({
    id: uid('act'),
    at: new Date().toISOString(),
    staffId: CURRENT_USER.id,
    staffName: CURRENT_USER.name,
    action,
    resource,
    resourceId,
  })
}

function findOrder(orderId: string): Order {
  const order = getStore().orders.find((o) => o.id === orderId)
  if (!order) throw new Error('Order not found')
  return order
}

function findReturn(returnId: string): ReturnRecord {
  const ret = getStore().returns.find((r) => r.id === returnId)
  if (!ret) throw new Error('Return not found')
  return ret
}

const itemCount = (ret: ReturnRecord) => ret.lines.reduce((s, l) => s + l.quantity, 0)

// ─── Return lifecycle (Admin API: returnApprove / returnDecline / returnCancel) ──

/** Statuses that can still be approved or processed (legacy 'open' = 'requested'). */
export const PENDING_RETURN_STATUSES: ReturnRecord['status'][] = ['requested', 'open']

export async function approveReturn(returnId: string): Promise<void> {
  await delay(300)
  const ret = findReturn(returnId)
  if (!PENDING_RETURN_STATUSES.includes(ret.status)) throw new Error('Only requested returns can be approved')
  getStore().upsertReturn({ ...ret, status: 'approved' })
  syncMutation(`mutation { returnApprove(id: ${gqlLiteral(returnId)}) { userErrors { message } } }`)
  addTimeline(ret.orderId, `Return approved — ${itemCount(ret)} item(s) expected back`, 'refund')
  logActivity('Approved return', 'order', ret.orderId)
}

export async function declineReturn(returnId: string, reason: string): Promise<void> {
  await delay(300)
  const ret = findReturn(returnId)
  if (ret.status !== 'requested' && ret.status !== 'open' && ret.status !== 'approved') {
    throw new Error('Only requested or approved returns can be declined')
  }
  getStore().upsertReturn({ ...ret, status: 'declined', closedAt: new Date().toISOString() })
  syncMutation(`mutation { returnDecline(id: ${gqlLiteral(returnId)}, reason: ${gqlLiteral(reason)}) { userErrors { message } } }`)
  addTimeline(ret.orderId, `Return declined (${reason})`, 'refund')
  logActivity('Declined return', 'order', ret.orderId)
}

export async function cancelReturn(returnId: string): Promise<void> {
  await delay(300)
  const ret = findReturn(returnId)
  if (ret.status !== 'requested' && ret.status !== 'open' && ret.status !== 'approved') {
    throw new Error('Only requested or approved returns can be canceled')
  }
  getStore().upsertReturn({ ...ret, status: 'canceled', closedAt: new Date().toISOString() })
  syncMutation(`mutation { returnCancel(id: ${gqlLiteral(returnId)}) { userErrors { message } } }`)
  addTimeline(ret.orderId, `Return canceled by staff — ${itemCount(ret)} item(s)`, 'cancel')
  logActivity('Canceled return', 'order', ret.orderId)
}

// ─── Fulfillment tracking (Admin API: fulfillmentCancel / fulfillmentEventCreate) ──

export const FULFILLMENT_EVENT_STATUSES: Record<string, string> = {
  LABEL_PRINTED: 'Label printed',
  CONFIRMED: 'Confirmed',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  FAILURE: 'Failure',
}

type RestockKind = 'committed' | 'available' | 'none'

/** The server records this map at fulfill time; scalar JSON now, legacy rows carried a JSON string or missed it → 'available'. */
function parseRestockMap(raw: string | Record<string, RestockKind> | undefined | null): Record<string, RestockKind> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, RestockKind>
  } catch {
    // invalid map falls back to legacy behavior
  }
  return {}
}

/** Reverse the stock consumed by a fulfillment at its ship-from location (mirrors the backend). */
function restockFulfillment(order: Order, fulfillment: Fulfillment): void {
  const restock = parseRestockMap(fulfillment.restockMap)
  const store = getStore()
  const history: InventoryHistoryEntry[] = []
  for (const lid of fulfillment.lineItemIds) {
    const li = order.lineItems.find((x) => x.id === lid)
    if (!li) continue
    const kind = restock[lid] ?? 'available'
    if (kind === 'none') continue
    const level = store.inventoryLevels.find((l) => l.variantId === li.variantId && l.locationId === fulfillment.locationId)
    if (!level) continue
    store.upsertInventoryLevel({
      ...level,
      committed: kind === 'committed' ? level.committed + li.quantity : level.committed,
      available: kind === 'available' ? level.available + li.quantity : level.available,
    })
    history.push({
      id: uid('ih'),
      variantId: level.variantId,
      locationId: level.locationId,
      change: kind === 'available' ? li.quantity : 0,
      resultingAvailable: kind === 'available' ? level.available + li.quantity : level.available,
      reason: 'fulfillment_cancelled',
      createdAt: new Date().toISOString(),
      author: CURRENT_USER.name,
    })
  }
  if (history.length > 0) store.addInventoryHistory(history)
}

export async function cancelFulfillment(orderId: string, fulfillmentId: string): Promise<void> {
  const order = findOrder(orderId)
  const fulfillment = order.fulfillments.find((f) => f.id === fulfillmentId)
  if (!fulfillment) throw new Error('Fulfillment not found')
  if (fulfillment.status === 'canceled') throw new Error('Fulfillment already canceled')
  if (IS_REMOTE) {
    const data = await gqlRequest<{ fulfillmentCancel: { order: Partial<Order> | null; userErrors: { field: string[]; message: string }[] } }>(
      `mutation _ { fulfillmentCancel(fulfillmentId: ${gqlLiteral(fulfillmentId)}) { order { ${ORDER_SELECTION} } userErrors { field message } } }`,
    )
    const payload = data.fulfillmentCancel
    if (payload.userErrors.length > 0) throw new Error(payload.userErrors.map((e) => e.message).join('; '))
    if (!payload.order) throw new Error('Fulfillment cancel failed')
    getStore().patchOrder(orderId, payload.order)
    // The server already restored stock (committed→committed / legacy→available /
    // untracked→none). A local restock here would double it. Refresh DIRECTLY —
    // not via the 600ms debounce, whose fetch can start before the server commits
    // and hydrate stale pre-cancel state over the fresh patch. The queued-retry in
    // refreshFromServer makes the overlap safe.
    void refreshFromServer()
    logActivity('Canceled fulfillment', 'order', orderId)
    return
  }
  // Offline demo: same rules as the server — remove the fulfillment, restock, recompute.
  await delay(350)
  restockFulfillment(order, fulfillment)
  const remaining = order.fulfillments.filter((f) => f.id !== fulfillmentId)
  const fulfillmentStatus = recomputeFulfillmentStatus({ ...order, fulfillments: remaining })
  const patch: Partial<Order> = { fulfillments: remaining, fulfillmentStatus }
  if (order.status === 'closed' && fulfillmentStatus !== 'fulfilled') {
    patch.status = 'open'
    patch.closedAt = undefined
  }
  getStore().patchOrder(orderId, patch)
  addTimeline(orderId, `Fulfillment cancelled — ${fulfillment.lineItemIds.length} item(s) restocked`, 'fulfillment')
  logActivity('Canceled fulfillment', 'order', orderId)
}

export async function addFulfillmentEvent(
  orderId: string,
  fulfillmentId: string,
  status: string,
  message?: string,
): Promise<void> {
  await delay(250)
  const order = findOrder(orderId)
  const fulfillment = order.fulfillments.find((f) => f.id === fulfillmentId)
  if (!fulfillment) throw new Error('Fulfillment not found')
  const note = message?.trim() || undefined
  const event: FulfillmentEvent = {
    id: uid('fev'),
    status,
    message: note,
    occurredAt: new Date().toISOString(),
  }
  getStore().patchOrder(orderId, {
    fulfillments: order.fulfillments.map((f) =>
      f.id === fulfillmentId ? { ...f, events: [...(f.events ?? []), event] } : f,
    ),
  })
  syncMutation(
    `mutation { fulfillmentEventCreate(fulfillmentId: ${gqlLiteral(fulfillmentId)}, status: ${gqlLiteral(status)}${note ? `, message: ${gqlLiteral(note)}` : ''}) { userErrors { message } } }`,
  )
  addTimeline(orderId, `Tracking update: ${FULFILLMENT_EVENT_STATUSES[status] ?? status}${note ? ` — ${note}` : ''}`, 'fulfillment')
}
