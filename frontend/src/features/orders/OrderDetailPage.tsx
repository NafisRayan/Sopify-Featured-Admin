import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Ban, Archive, ArchiveRestore, DollarSign, Mail, MapPin, MoreVertical, Package, Phone, Printer,
  TagIcon, Truck,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { customerStats } from '@/store/selectors'
import {
  Badge, Button, Card, CardHeader, CardSection, DividedCard, Drawer, EmptyState, Input, Modal,
  PageHeader, PortalMenu, Select, TagInput, Textarea, Toggle, useConfirm, useToast,
  type MenuItemDef,
} from '@/components/ui'
import { formatDateTime, formatMoney, formatRelative, initials } from '@/lib/format'
import { FULFILLMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS, ORDER_STATUS_LABELS } from '@/lib/constants'
import { paymentTone, fulfillmentTone } from './OrdersListPage'
import {
  addOrderNote, cancelOrder, closeOrder, convertDraft, createDraft, fulfillOrder,
  markAsPaid, refundOrder, reopenOrder, setOrderTags,
} from '@/services/ordersService'
import { useCan } from '@/lib/permissions'
import { canEditOrder, sendDraftInvoice } from '@/services/orderEditService'
import { closeReturn } from '@/services/orderEditService'
import { EditOrderDrawer, ReturnDrawer } from './OrderActions'
import type { Order, OrderLineItem, TimelineEvent } from '@/types'

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL']

function TimelineRow({ event }: { event: TimelineEvent }) {
  const dotTone: Record<TimelineEvent['type'], string> = {
    created: 'bg-[#8a8a8a]',
    payment: 'bg-success',
    fulfillment: 'bg-[#196ec2]',
    refund: 'bg-critical-strong',
    cancel: 'bg-critical-strong',
    note: 'bg-[#9c7a12]',
    tag: 'bg-[#8a8a8a]',
    edit: 'bg-[#8a8a8a]',
  }
  return (
    <li className="flex gap-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotTone[event.type]}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-[13px] text-text">{event.message}</p>
        <p className="text-xs text-text-muted">
          {formatDateTime(event.createdAt)} · {event.author}
        </p>
      </div>
    </li>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm, confirmElement } = useConfirm()
  const order = useStore((s) => s.orders.find((o) => o.id === id))
  const customer = useStore((s) => s.customers.find((c) => c.id === order?.customerId))
  const allLocations = useStore((s) => s.locations)
  const locations = allLocations.filter((l) => l.active)
  const [fulfillOpen, setFulfillOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteVisible, setNoteVisible] = useState(true)
  const [tagDraft, setTagDraft] = useState<string[]>([])
  // fulfill form
  const [fulItemIds, setFulItemIds] = useState<Set<string>>(new Set())
  const [fulLocation, setFulLocation] = useState(locations[0]?.id ?? '')
  const [fulCarrier, setFulCarrier] = useState('')
  const [fulTracking, setFulTracking] = useState('')
  const [fulNotify, setFulNotify] = useState(true)
  // refund form
  const [refundAmount, setRefundAmount] = useState('0.00')
  const [refundReason, setRefundReason] = useState('customer')
  const [refundRestock, setRefundRestock] = useState(true)
  const [refundItems, setRefundItems] = useState<Set<string>>(new Set())
  const [editOpen, setEditOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)

  const can = {
    edit: useCan('orders', 'edit'),
    refund: useCan('orders', 'refund'),
    cancel: useCan('orders', 'cancel'),
  }

  const alreadyRefunded = useMemo(() => order?.refunds.reduce((s, r) => s + r.amount, 0) ?? 0, [order])
  const orderReturns = useStore((st) => st.returns)
  const orderRiskMap = useStore((st) => st.orderRisk)
  const orderReturnRecords = useMemo(
    () => (order ? orderReturns.filter((r) => r.orderId === order.id) : []),
    [orderReturns, order],
  )

  const unfulfilledItems: OrderLineItem[] = useMemo(() => {
    if (!order) return []
    if (order.status === 'cancelled' || order.paymentStatus === 'refunded' || order.fulfillmentStatus === 'returned' || order.fulfillmentStatus === 'fulfilled') {
      return []
    }
    const fulfilledIds = new Set(order.fulfillments.flatMap((f) => f.lineItemIds))
    return order.lineItems.filter((li) => li.requiresShipping && !fulfilledIds.has(li.id))
  }, [order])

  if (!order) {
    return (
      <div>
        <PageHeader title="Order not found" backTo="/orders" backLabel="Orders" />
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState heading="Order not found" message="It may have been deleted." primaryAction={{ label: 'Back to orders', onClick: () => navigate('/orders') }} />
        </div>
      </div>
    )
  }

  const openFulfill = () => {
    setFulItemIds(new Set(unfulfilledItems.map((li) => li.id)))
    setFulTracking('')
    setFulCarrier('')
    setFulfillOpen(true)
  }

  const openRefund = () => {
    const refundable = order.total - alreadyRefunded
    setRefundAmount(refundable.toFixed(2))
    setRefundItems(new Set())
    setRefundOpen(true)
  }

  const doFulfill = async () => {
    if (fulItemIds.size === 0) return
    try {
      await fulfillOrder({
        orderId: order.id,
        lineItemIds: [...fulItemIds],
        locationId: fulLocation,
        trackingNumber: fulTracking || undefined,
        carrier: fulCarrier || undefined,
        notifyCustomer: fulNotify,
      })
      toast('Order fulfilled')
      setFulfillOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to fulfill', { tone: 'critical' })
    }
  }

  const doRefund = async () => {
    try {
      await refundOrder({
        orderId: order.id,
        amount: Number(refundAmount),
        reason: refundReason,
        lineItemIds: [...refundItems],
        restock: refundRestock,
      })
      toast('Refund issued', { tone: 'warning' })
      setRefundOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to refund', { tone: 'critical' })
    }
  }

  const timeline = [...order.timeline].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="pb-4">
      {confirmElement}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {order.name}
            {order.isDraft && <Badge tone="neutral" dot>Draft</Badge>}
          </span>
        }
        subtitle={`${formatDateTime(order.createdAt)} from ${order.channel}`}
        backTo={order.isDraft ? '/draft-orders' : '/orders'}
        backLabel={order.isDraft ? 'Drafts' : 'Orders'}
        primaryAction={
          <span className="flex flex-wrap items-center gap-2">
            {order.isDraft ? (
              <>
                {can.edit && (
                  <Button
                    variant="primary"
                    onClick={() => void convertDraft(order.id).then(() => toast('Draft converted to order'))}
                  >
                    Convert to order
                  </Button>
                )}
                {can.edit && (
                  <Button
                    onClick={() => void sendDraftInvoice(order.id).then(() => toast('Invoice sent'))}
                  >
                    Send invoice
                  </Button>
                )}
                {can.edit && (
                  <Button
                    onClick={() => void markAsPaidAsDraft(order.id)}
                  >
                    Collect payment
                  </Button>
                )}
              </>
            ) : (
              <>
                {can.refund && (order.paymentStatus === 'paid' || order.paymentStatus === 'partially_refunded') && (
                  <Button onClick={openRefund}>Refund</Button>
                )}
                {can.edit && (order.paymentStatus === 'pending' || order.paymentStatus === 'authorized' || order.paymentStatus === 'unpaid') && (
                  <Button icon={<DollarSign size={13} />} onClick={() => void markAsPaid(order.id).then(() => toast('Marked as paid'))}>
                    Mark as paid
                  </Button>
                )}
                {can.edit && unfulfilledItems.length > 0 && order.status !== 'cancelled' && order.status !== 'closed' && order.paymentStatus !== 'refunded' && order.fulfillmentStatus !== 'returned' && (
                  <Button variant="primary" icon={<Package size={13} />} onClick={openFulfill}>
                    {order.fulfillmentStatus === 'partial' ? 'Fulfill remaining' : 'Fulfill'}
                  </Button>
                )}
                {can.edit && canEditOrder(order) && (
                  <Button onClick={() => setEditOpen(true)}>
                    Edit
                  </Button>
                )}
                {can.refund && (order.fulfillmentStatus === 'fulfilled' || order.fulfillmentStatus === 'partial') && (
                  <Button onClick={() => setReturnOpen(true)}>
                    Return items
                  </Button>
                )}
              </>
            )}
          </span>
        }
        secondaryActions={
          <PortalMenu
            align="right"
            trigger={
              <button aria-label="More actions" className="rounded-lg border border-[#d0d0d0] p-2 hover:bg-surface-hover">
                <MoreVertical size={15} />
              </button>
            }
            items={moreMenuItems(order, can, {
              openTags: () => {
                setTagDraft(order.tags)
                setTagsOpen(true)
              },
              print: () => window.print(),
              archive: () => void closeOrder(order.id).then(() => toast('Order archived')),
              unarchive: () => void reopenOrder(order.id).then(() => toast('Order unarchived')),
              cancel: () =>
                confirm({
                  title: `Cancel ${order.name}?`,
                  body: 'Unfulfilled items will be restocked. This cannot be undone.',
                  confirmLabel: 'Cancel order',
                  destructive: true,
                  onConfirm: async () => {
                    await cancelOrder(order.id)
                    toast('Order cancelled', { tone: 'critical' })
                  },
                }),
              duplicateDraft: () =>
                void createDraft({
                  customerId: order.customerId,
                  lineItems: order.lineItems.map((li) => ({ variantId: li.variantId, quantity: li.quantity })),
                  note: order.note,
                }).then(() => toast('Draft created from order')),
            })}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Status strip */}
          {!order.isDraft && (
            <DividedCard>
              <CardSection>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={order.status === 'open' ? 'attention' : order.status === 'cancelled' ? 'critical' : 'neutral'} dot>
                    {ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                  <Badge tone={paymentTone(order.paymentStatus)} dot>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Badge>
                  <Badge tone={fulfillmentTone(order.fulfillmentStatus)} dot>
                    {FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus]}
                  </Badge>
                  <span className="text-xs text-text-muted">
                    {order.fulfillmentStatus === 'returned'
                      ? 'Returned'
                      : order.paymentStatus === 'refunded'
                      ? 'Refunded'
                      : unfulfilledItems.length > 0
                      ? `${unfulfilledItems.length} unfulfilled item${unfulfilledItems.length === 1 ? '' : 's'}${order.status === 'closed' ? ' (archived)' : ''}`
                      : order.status === 'closed'
                      ? 'Archived'
                      : 'Everything fulfilled'}
                  </span>
                </div>
              </CardSection>
            </DividedCard>
          )}

          {/* Line items */}
          <DividedCard>
            <CardHeader title={`${order.lineItems.reduce((s, li) => s + li.quantity, 0)} item${order.lineItems.length === 1 && order.lineItems[0]?.quantity === 1 ? '' : 's'}`} />
            <ul className="divide-y divide-border">
              {order.lineItems.map((li) => {
                const fulfillment = order.fulfillments.find((f) => f.lineItemIds.includes(li.id))
                const refunded = order.refunds.some((r) => r.lineItemIds.includes(li.id))
                return (
                  <li key={li.id} className="flex items-start gap-3 px-4 py-3 md:px-5">
                    {li.imageSrc ? (
                      <img src={li.imageSrc} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover" />
                    ) : (
                      <span className="h-11 w-11 shrink-0 rounded-lg bg-[#f1f1f1]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link to={`/products/${li.productId}`} className="text-[13px] font-medium hover:text-accent hover:underline">
                        {li.title}
                      </Link>
                      {li.variantTitle && <p className="text-xs text-text-muted">{li.variantTitle}</p>}
                      <p className="text-xs text-text-muted">
                        {formatMoney(li.price)} × {li.quantity}
                        {li.sku && ` · ${li.sku}`}
                      </p>
                      {fulfillment && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-success">
                          <Truck size={11} />
                          Fulfilled{fulfillment.trackingNumber ? ` · ${fulfillment.carrier ?? ''} ${fulfillment.trackingNumber}` : ''}
                        </p>
                      )}
                      {refunded && <p className="mt-0.5 text-xs text-critical-strong">Refunded</p>}
                    </div>
                    <span className="shrink-0 text-[13px] font-medium">
                      {formatMoney(li.price * li.quantity - li.totalDiscount)}
                    </span>
                  </li>
                )
              })}
            </ul>
            <CardSection className="border-t border-border bg-[#fafafa]">
              <dl className="ml-auto max-w-xs space-y-1 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-text-muted">Subtotal · {order.lineItems.reduce((s, li) => s + li.quantity, 0)} items</dt>
                  <dd>{formatMoney(order.subtotal)}</dd>
                </div>
                {order.discountCode && (
                  <div className="flex justify-between">
                    <dt className="text-text-muted">Discount ({order.discountCode.code})</dt>
                    <dd className="text-critical-strong">-{formatMoney(order.discountCode.amount)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-text-muted">{order.shippingTitle}</dt>
                  <dd>{order.shippingPrice === 0 ? 'Free' : formatMoney(order.shippingPrice)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">Tax</dt>
                  <dd>{formatMoney(order.taxTotal)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                  <dt>Total</dt>
                  <dd>{formatMoney(order.total)} {order.currency}</dd>
                </div>
                {(order.giftCardApplied ?? 0) > 0 && order.giftCardCode && (
                  <div className="flex justify-between text-critical-strong">
                    <dt>Gift card ({order.giftCardCode})</dt>
                    <dd>-{formatMoney(order.giftCardApplied ?? 0)}</dd>
                  </div>
                )}
                {(order.transactions?.length ?? 0) > 0 && (
                  <div className="mt-3 border-t border-border pt-2">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-subdued">Transactions</p>
                    <ul className="space-y-1 text-xs text-text-muted">
                      {order.transactions!.map((t) => (
                        <li key={t.id} className="flex justify-between">
                          <span>{t.kind === 'GIFT_CARD' ? 'Gift card' : t.kind === 'SALE' ? 'Sale' : 'Refund'} · {t.gateway}</span>
                          <span className={t.amount < 0 ? 'text-critical-strong' : ''}>
                            {t.amount < 0 ? '' : '+'}{formatMoney(t.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {alreadyRefunded > 0 && (
                  <div className="flex justify-between text-critical-strong">
                    <dt>Refunded</dt>
                    <dd>-{formatMoney(alreadyRefunded)}</dd>
                  </div>
                )}
                <div className="flex justify-between text-xs text-text-muted">
                  <dt>Net</dt>
                  <dd>{formatMoney(order.total - alreadyRefunded)}</dd>
                </div>
              </dl>
            </CardSection>
          </DividedCard>

          {/* Timeline */}
          <DividedCard>
            <CardHeader title="Timeline" subtitle="Activity on this order" />
            <CardSection>
              <div className="mb-4 rounded-lg border border-border">
                <Textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={2}
                  placeholder="Add a note to the timeline…"
                  aria-label="Timeline note"
                  className="border-0 focus:ring-0"
                />
                <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
                  <label className="flex items-center gap-1.5 text-xs text-text-muted">
                    <input type="checkbox" checked={noteVisible} onChange={(e) => setNoteVisible(e.target.checked)} className="h-3.5 w-3.5 accent-[#303030]" />
                    Visible to customer
                  </label>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!noteDraft.trim() || !can.edit}
                    onClick={async () => {
                      await addOrderNote(order.id, noteDraft.trim())
                      setNoteDraft('')
                      toast('Note added to timeline')
                    }}
                  >
                    Post
                  </Button>
                </div>
              </div>
              <ol className="space-y-3">
                {timeline.map((ev) => (
                  <TimelineRow key={ev.id} event={ev} />
                ))}
              </ol>
            </CardSection>
          </DividedCard>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Customer */}
          <Card padding={false}>
            <CardHeader
              title="Customer"
              actions={
                customer && (
                  <Link to={`/customers/${customer.id}`} className="text-xs text-accent hover:underline">
                    View profile
                  </Link>
                )
              }
            />
            <CardSection>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e3e3e3] text-xs font-semibold text-text">
                  {customer ? initials(`${customer.firstName} ${customer.lastName}`) : '?'}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    {customer ? `${customer.firstName} ${customer.lastName}` : 'Deleted customer'}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {customer ? `${customerStats(customer.id).ordersCount} orders · ${formatMoney(customerStats(customer.id).totalSpent)} spent` : order.email}
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5 text-[13px]">
                <li className="flex items-center gap-2 text-text-muted">
                  <Mail size={13} /> <span className="truncate">{order.email}</span>
                </li>
                {order.phone && (
                  <li className="flex items-center gap-2 text-text-muted">
                    <Phone size={13} /> {order.phone}
                  </li>
                )}
              </ul>
            </CardSection>
          </Card>

          {/* Addresses */}
          <Card padding={false}>
            <CardHeader title="Addresses" />
            <CardSection className="space-y-3 text-[13px]">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-subdued">
                  <MapPin size={11} /> Ship to
                </p>
                <p className="mt-1 text-text">
                  {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                  <br />
                  {order.shippingAddress.address1}
                  {order.shippingAddress.address2 && <>, {order.shippingAddress.address2}</>}
                  <br />
                  {order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.zip}
                  <br />
                  {order.shippingAddress.country}
                </p>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-subdued">Billing</p>
                <p className="mt-1 text-text">
                  Same as shipping address
                </p>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-subdued">Shipping method</p>
                <p className="mt-1">
                  {order.shippingTitle}
                  {order.shippingPrice > 0 && ` · ${formatMoney(order.shippingPrice)}`}
                </p>
              </div>
            </CardSection>
          </Card>

          {/* Payment info */}
          <Card padding={false}>
            <CardHeader title="Payment" />
            <CardSection className="space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Gateway</span>
                <span>{order.paymentGateway}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Status</span>
                <Badge tone={paymentTone(order.paymentStatus)} dot>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Badge>
              </div>
              {order.refunds.map((r) => (
                <div key={r.id} className="rounded-lg bg-[#fafafa] p-2 text-xs">
                  <p className="font-medium text-text">Refund {formatMoney(r.amount)}</p>
                  <p className="text-text-muted">
                    {formatRelative(r.createdAt)} · reason: {r.reason}
                    {r.restock && ' · restocked'}
                  </p>
                </div>
              ))}
            </CardSection>
          </Card>

          {/* Fraud / risk */}
          {(() => {
            const risk = orderRiskMap[order.id]
            if (!risk) return null
            const tone = risk.level === 'high' ? 'critical' : risk.level === 'medium' ? 'warning' : 'success'
            return (
              <Card padding={false}>
                <CardHeader title="Fraud analysis" subtitle="Order risk assessment" />
                <CardSection>
                  <Badge tone={tone} dot>
                    {risk.level === 'high' ? 'High risk' : risk.level === 'medium' ? 'Medium risk' : 'Low risk'}
                  </Badge>
                  {risk.signals.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-text-muted">
                      {risk.signals.map((sig) => (
                        <li key={sig} className="flex gap-1.5">
                          <span aria-hidden>•</span> {sig}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-text-muted">No risk signals detected for this order.</p>
                  )}
                </CardSection>
              </Card>
            )
          })()}

          {/* Returns on this order */}
          {orderReturnRecords.length > 0 && (
            <Card padding={false}>
              <CardHeader title={`Returns (${orderReturnRecords.length})`} />
              <ul className="divide-y divide-border">
                {orderReturnRecords.map((r) => (
                  <li key={r.id} className="px-4 py-2.5 text-[13px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Return · {r.lines.reduce((s, l) => s + l.quantity, 0)} item(s)</span>
                      <Badge tone={r.status === 'open' ? 'warning' : r.status === 'returned' ? 'success' : 'neutral'} dot>
                        {r.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {r.reason} · {formatMoney(r.refundAmount)}
                    </p>
                    {r.status === 'open' && can.refund && (
                      <button
                        className="mt-1 text-xs text-accent hover:underline"
                        onClick={() =>
                          void closeReturn(r.id, { markRefunded: true })
                            .then(() => toast('Return closed — items restocked'))
                            .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Failed', { tone: 'critical' }))
                        }
                      >
                        Close return & refund
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Tags */}
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">Tags</h3>
              {can.edit && (
                <button
                  className="text-xs text-accent hover:underline"
                  onClick={() => {
                    setTagDraft(order.tags)
                    setTagsOpen(true)
                  }}
                >
                  Edit
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {order.tags.length === 0 && <p className="text-[13px] text-text-muted">No tags</p>}
              {order.tags.map((t) => (
                <Badge key={t} tone="info">{t}</Badge>
              ))}
            </div>
            {order.note && (
              <p className="mt-3 rounded-lg bg-warning-surface-soft p-2 text-xs text-warning">
                <TagIcon size={11} className="mr-1 inline" />
                {order.note}
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Fulfill drawer */}
      <Drawer
        open={fulfillOpen}
        onClose={() => setFulfillOpen(false)}
        title="Fulfill items"
        subtitle={`${unfulfilledItems.length} item${unfulfilledItems.length === 1 ? '' : 's'} to fulfill`}
        footer={
          <>
            <Button onClick={() => setFulfillOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void doFulfill()} disabled={fulItemIds.size === 0}>
              Fulfill {fulItemIds.size} item{fulItemIds.size === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-text">Items</p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {unfulfilledItems.map((li) => (
                <li key={li.id} className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#303030]"
                    checked={fulItemIds.has(li.id)}
                    onChange={(e) => {
                      const next = new Set(fulItemIds)
                      if (e.target.checked) next.add(li.id)
                      else next.delete(li.id)
                      setFulItemIds(next)
                    }}
                    aria-label={`Fulfill ${li.title}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{li.title} {li.variantTitle && `· ${li.variantTitle}`}</span>
                    <span className="block text-xs text-text-muted">Qty {li.quantity}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <Select
            label="Fulfill from location"
            value={fulLocation}
            onChange={(e) => setFulLocation(e.target.value)}
            options={locations.map((l) => ({ label: l.name, value: l.id }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Carrier"
              value={fulCarrier}
              onChange={(e) => setFulCarrier(e.target.value)}
              options={[{ label: 'None', value: '' }, ...CARRIERS.map((c) => ({ label: c, value: c }))]}
            />
            <Input label="Tracking number" value={fulTracking} onChange={(e) => setFulTracking(e.target.value)} />
          </div>
          <Toggle label="Notify customer of shipment" checked={fulNotify} onChange={setFulNotify} />
        </div>
      </Drawer>

      {/* Refund modal */}
      <Modal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Refund order"
        footer={
          <>
            <Button onClick={() => setRefundOpen(false)}>Cancel</Button>
            <Button variant="primary" className="bg-critical-strong hover:bg-[#a02510]" onClick={() => void doRefund()}>
              Refund {formatMoney(Number(refundAmount) || 0)}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Refund amount"
            type="number"
            step="0.01"
            min="0.01"
            prefix="$"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            helpText={`Refundable balance: ${formatMoney(order.total - alreadyRefunded)}`}
          />
          <Select
            label="Reason"
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            options={[
              { label: 'Customer request', value: 'customer' },
              { label: 'Damaged item', value: 'damaged' },
              { label: 'Wrong item shipped', value: 'wrong_item' },
              { label: 'Other', value: 'other' },
            ]}
          />
          <div>
            <p className="mb-1 text-xs font-medium">Items to restock</p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {order.lineItems.map((li) => (
                <li key={li.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#303030]"
                    checked={refundItems.has(li.id)}
                    onChange={(e) => {
                      const next = new Set(refundItems)
                      if (e.target.checked) next.add(li.id)
                      else next.delete(li.id)
                      setRefundItems(next)
                    }}
                    aria-label={`Restock ${li.title}`}
                  />
                  <span className="flex-1">{li.title} {li.variantTitle && `· ${li.variantTitle}`}</span>
                  <span className="text-text-muted">×{li.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
          <Toggle label="Restock selected items" checked={refundRestock} onChange={setRefundRestock} />
        </div>
      </Modal>

      {/* Edit order drawer */}
      <EditOrderDrawer open={editOpen} order={order} onClose={() => setEditOpen(false)} />

      {/* Return drawer */}
      <ReturnDrawer open={returnOpen} order={order} onClose={() => setReturnOpen(false)} />

      {/* Returns list drawer trigger card lives in sidebar; drawers above */}

      {/* Tags drawer */}
      <Drawer
        open={tagsOpen}
        onClose={() => setTagsOpen(false)}
        title="Order tags"
        footer={
          <>
            <Button onClick={() => setTagsOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                await setOrderTags(order.id, tagDraft)
                toast('Tags updated')
                setTagsOpen(false)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <TagInput value={tagDraft} onChange={setTagDraft} suggestions={['priority', 'wholesale', 'gift', 'subscription']} />
      </Drawer>
    </div>
  )
}

async function markAsPaidAsDraft(orderId: string): Promise<void> {
  // drafts: convert then immediately mark paid (collect payment flow)
  const newId = await convertDraft(orderId)
  await markAsPaid(newId)
}

function moreMenuItems(
  order: Order,
  can: { edit: boolean; refund: boolean; cancel: boolean },
  actions: {
    openTags: () => void
    print: () => void
    archive: () => void
    unarchive: () => void
    cancel: () => void
    duplicateDraft: () => void
  },
): MenuItemDef[] {
  if (order.isDraft) {
    return [
      { label: 'Duplicate as new draft', icon: <Package size={13} />, onClick: actions.duplicateDraft },
    ]
  }
  return [
    { label: 'Edit tags', icon: <TagIcon size={13} />, onClick: actions.openTags, disabled: !can.edit },
    { label: 'Print packing slip', icon: <Printer size={13} />, onClick: () => window.open(`/orders/${order.id}/print?type=packing-slip`, '_blank') },
    { label: 'Print invoice', icon: <Printer size={13} />, onClick: () => window.open(`/orders/${order.id}/print?type=invoice`, '_blank') },
    { label: 'Duplicate as draft', onClick: actions.duplicateDraft },
    ...(order.status === 'closed'
      ? [{ label: 'Unarchive', icon: <ArchiveRestore size={13} />, onClick: actions.unarchive, disabled: !can.edit }]
      : [{ label: 'Archive', icon: <Archive size={13} />, onClick: actions.archive, disabled: !can.edit || order.status === 'cancelled' }]),
    ...(can.cancel && order.status !== 'cancelled'
      ? [{
          label: 'Cancel order', icon: <Ban size={13} />, destructive: true, separatorBefore: true,
          onClick: actions.cancel,
        }]
      : []),
  ]
}
