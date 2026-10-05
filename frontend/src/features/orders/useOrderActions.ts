import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { delay } from '@/lib/delay'
import { CURRENT_USER } from '@/lib/constants'
import { syncMutation, gqlLiteral } from '@/services/api'
import type { ReturnRecord } from '@/types/parity'
import type { FulfillmentEvent, Order, TimelineEvent } from '@/types'

/**
 * Thin order-mutation wrappers for the return lifecycle + fulfillment tracking
 * (returnApprove/Decline/Cancel, fulfillmentCancel, fulfillmentEventCreate).
 * Follows the service pattern: local store patch + timeline/activity entries,
 * then syncMutation reconciles with the backend (debounced).
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

export async function cancelFulfillment(orderId: string, fulfillmentId: string): Promise<void> {
  await delay(350)
  const order = findOrder(orderId)
  const fulfillment = order.fulfillments.find((f) => f.id === fulfillmentId)
  if (!fulfillment) throw new Error('Fulfillment not found')
  if (fulfillment.status === 'canceled') throw new Error('Fulfillment already canceled')
  getStore().patchOrder(orderId, {
    fulfillments: order.fulfillments.map((f) => (f.id === fulfillmentId ? { ...f, status: 'canceled' as const } : f)),
  })
  syncMutation(`mutation { fulfillmentCancel(fulfillmentId: ${gqlLiteral(fulfillmentId)}) { userErrors { message } } }`)
  addTimeline(orderId, `Fulfillment canceled${fulfillment.trackingNumber ? ` · tracking ${fulfillment.carrier ?? ''} ${fulfillment.trackingNumber}` : ''}`, 'fulfillment')
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
