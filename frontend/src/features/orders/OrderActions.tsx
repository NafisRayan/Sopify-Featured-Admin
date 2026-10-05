import { useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Drawer, Input, Select, Toggle, useToast } from '@/components/ui'
import { VariantPickerModal, type PickedVariant } from '@/components/VariantPickerModal'
import { formatMoney } from '@/lib/format'
import { roundMoney } from '@/lib/money'
import { createReturn, editOrder } from '@/services/orderEditService'
import type { Order, OrderLineItem } from '@/types'
import type { ReturnLine } from '@/types/parity'


// ── Edit order (unfulfilled only) ──────────────────────────────────────────

interface EditDraftLine {
  key: string
  lineItemId?: string // present for original lines
  variantId: string
  title: string
  variantTitle: string
  sku: string
  price: number
  quantity: number
  totalDiscount?: number
  imageSrc?: string
  originalQuantity: number // 0 for new lines
}

/** Real implementation keeps state per open-order so reopening resets */
export function EditOrderDrawer({
  open,
  order,
  onClose,
}: {
  open: boolean
  order: Order | undefined
  onClose: () => void
}) {
  const { toast } = useToast()
  const settings = useStore((s) => s.settings)
  const customers = useStore((s) => s.customers)
  const [draft, setDraft] = useState<EditDraftLine[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const lines: EditDraftLine[] = useMemo(() => {
    if (draft) return draft
    if (!order) return []
    return order.lineItems.map((li) => ({
      key: li.id,
      lineItemId: li.id,
      variantId: li.variantId,
      title: li.title,
      variantTitle: li.variantTitle,
      sku: li.sku,
      price: li.price,
      quantity: li.quantity,
      totalDiscount: li.totalDiscount ?? 0,
      imageSrc: li.imageSrc,
      originalQuantity: li.quantity,
    }))
  }, [draft, order])

  const setLines = (next: EditDraftLine[]) => setDraft(next)

  const setQty = (key: string, delta: number) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l)))

  const removeLine = (key: string) => setLines(lines.filter((l) => l.key !== key))

  const totals = useMemo(() => {
    const subtotal = roundMoney(lines.reduce((s, l) => s + l.price * l.quantity - (l.totalDiscount ?? 0), 0))
    const discountAmount = order?.discountCode?.amount ?? 0
    const shipping = order?.shippingPrice ?? 0
    const customer = order ? customers.find((c) => c.id === order.customerId) : undefined
    let tax = 0
    if (!customer?.taxExempt) {
      const rate = (settings.taxes?.taxRate ?? 8) / 100
      const taxableBase = Math.max(0, subtotal - discountAmount) + (settings.taxes?.chargeTaxOnShipping ? shipping : 0)
      tax = roundMoney(taxableBase * rate)
    }
    const taxRate = settings.taxes?.taxRate ?? 8
    return { subtotal, tax, shipping, total: roundMoney(Math.max(0, subtotal - discountAmount) + shipping + tax), taxRate }
  }, [lines, order, customers, settings])

  if (!order) return null

  const save = async () => {
    const added: { variantId: string; quantity: number }[] = []
    const removed: { lineItemId: string; quantity: number }[] = []

    // 1. Check existing items for removal or qty decrease
    for (const orig of order.lineItems) {
      const current = lines.find((l) => l.lineItemId === orig.id)
      if (!current) {
        // Line was deleted via trash button
        removed.push({ lineItemId: orig.id, quantity: orig.quantity })
      } else if (current.quantity < orig.quantity) {
        // Line quantity decreased
        removed.push({ lineItemId: orig.id, quantity: orig.quantity - current.quantity })
      } else if (current.quantity > orig.quantity) {
        // Line quantity increased
        added.push({ variantId: orig.variantId, quantity: current.quantity - orig.quantity })
      }
    }

    // 2. Check brand new items added via picker
    for (const l of lines) {
      if (l.originalQuantity === 0 && l.quantity > 0) {
        added.push({ variantId: l.variantId, quantity: l.quantity })
      }
    }

    if (added.length === 0 && removed.length === 0) {
      toast('No changes to save', { tone: 'warning' })
      return
    }
    setSaving(true)
    try {
      await editOrder(order.id, { added, removed })
      toast('Order updated')
      setDraft(null)
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to edit order', { tone: 'critical' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={() => {
          setDraft(null)
          onClose()
        }}
        title={`Edit ${order.name}`}
        subtitle="Changes recalculate totals before payment capture"
        width="max-w-2xl"
        footer={
          <>
            <Button onClick={() => { setDraft(null); onClose() }}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              Update order · {formatMoney(totals.total)}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ul className="divide-y divide-border rounded-lg border border-border">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-3 px-3 py-2.5">
                {l.imageSrc ? (
                  <img src={l.imageSrc} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
                ) : (
                  <span className="h-10 w-10 shrink-0 rounded-md bg-[#f1f1f1]" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{l.title}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {l.variantTitle && `${l.variantTitle} · `}
                    {formatMoney(l.price)} · {l.sku || 'no SKU'}
                    {l.originalQuantity === 0 && (
                      <Badge tone="success">New</Badge>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button aria-label="Decrease quantity" onClick={() => setQty(l.key, -1)} className="rounded border border-border p-1 hover:bg-surface-hover">
                    <Minus size={11} />
                  </button>
                  <span className="w-8 text-center text-[13px] font-medium">{l.quantity}</span>
                  <button aria-label="Increase quantity" onClick={() => setQty(l.key, 1)} className="rounded border border-border p-1 hover:bg-surface-hover">
                    <Plus size={11} />
                  </button>
                </span>
                <span className="w-16 shrink-0 text-right text-[13px] font-medium">
                  {formatMoney(l.price * l.quantity)}
                </span>
                <button
                  aria-label={`Remove ${l.title}`}
                  onClick={() => removeLine(l.key)}
                  className="shrink-0 rounded p-1.5 text-text-muted hover:bg-critical-surface hover:text-critical-strong"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>

          <Button size="sm" onClick={() => setPickerOpen(true)}>
            Add item
          </Button>

          <div className="ml-auto max-w-xs space-y-1 rounded-lg bg-[#fafafa] p-3 text-[13px]">
            <div className="flex justify-between"><span className="text-text-muted">Subtotal</span><span>{formatMoney(totals.subtotal)}</span></div>
            {order.discountCode && <div className="flex justify-between"><span className="text-text-muted">Discount</span><span>−{formatMoney(order.discountCode.amount)}</span></div>}
            <div className="flex justify-between"><span className="text-text-muted">Shipping</span><span>{shippingLabel(totals.shipping)}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Tax ({totals.taxRate}%)</span><span>{formatMoney(totals.tax)}</span></div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>New total</span><span>{formatMoney(totals.total)}</span>
            </div>
            <p className="text-xs text-text-muted">
              Original total {formatMoney(order.total)} ·{' '}
              <span className={totals.total >= order.total ? 'text-success' : 'text-critical-strong'}>
                {totals.total >= order.total ? '+' : '−'}{formatMoney(Math.abs(totals.total - order.total))}
              </span>
            </p>
          </div>
        </div>

        <VariantPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          title="Add item to order"
          onPick={(p: PickedVariant) =>
            setDraft([
              ...lines,
              {
                key: `new_${p.variantId}_${Date.now()}`,
                variantId: p.variantId,
                title: p.title,
                variantTitle: p.variantTitle,
                sku: p.sku,
                price: p.price,
                quantity: p.quantity,
                imageSrc: p.imageSrc,
                originalQuantity: 0,
              },
            ])
          }
        />
      </Drawer>
    </>
  )
}

function shippingLabel(price: number): string {
  return price === 0 ? 'Free' : formatMoney(price)
}

// ── Return / exchange flow ─────────────────────────────────────────────────

export function ReturnDrawer({
  open,
  order,
  onClose,
}: {
  open: boolean
  order: Order | undefined
  onClose: () => void
}) {
  const { toast } = useToast()
  const [qtyDraft, setQtyDraft] = useState<Record<string, number> | null>(null)
  const [reason, setReason] = useState('Changed mind')
  const [restock, setRestock] = useState(true)
  const [refundAmount, setRefundAmount] = useState<string | null>(null)
  const [refundTouched, setRefundTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const quantities: Record<string, number> = qtyDraft ?? {}
  const maxFor = (li: OrderLineItem) => li.quantity

  const subtotal = useMemo(() => {
    if (!order) return 0
    return roundMoney(
      order.lineItems.reduce((s, li) => s + li.price * (quantities[li.id] ?? 0), 0),
    )
  }, [order, quantities])

  if (!order) return null

  const selectedLines: ReturnLine[] = order.lineItems
    .filter((li) => (quantities[li.id] ?? 0) > 0)
    .map((li) => ({ lineItemId: li.id, quantity: quantities[li.id]! }))

  const submit = async () => {
    if (selectedLines.length === 0) {
      toast('Select at least one item', { tone: 'warning' })
      return
    }
    setSaving(true)
    try {
      const finalRefund = !refundTouched ? subtotal : Number(refundAmount || 0)
      await createReturn({
        orderId: order.id,
        lines: selectedLines,
        reason,
        restock,
        refundAmount: finalRefund,
      })
      // lands as 'requested' — approve/decline/cancel/process from the Returns card
      toast(`Return requested for ${order.name}`)
      setQtyDraft(null)
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create return', { tone: 'critical' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => {
        setQtyDraft(null)
        setRefundTouched(false)
        setRefundAmount(null)
        onClose()
      }}
      title={`Return items · ${order.name}`}
      subtitle="Restocked units return to inventory; refunds update payment status"
      footer={
        <>
          <Button onClick={() => { setQtyDraft(null); onClose() }}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            Return {selectedLines.reduce((s, l) => s + l.quantity, 0)} item(s)
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {order.lineItems.map((li) => {
            const q = quantities[li.id] ?? 0
            return (
              <li key={li.id} className="flex items-center gap-3 px-3 py-2.5">
                {li.imageSrc && <img src={li.imageSrc} alt="" className="h-9 w-9 shrink-0 rounded-md border border-border object-cover" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{li.title}</span>
                  <span className="block truncate text-xs text-text-muted">{li.variantTitle} · qty {li.quantity}</span>
                </span>
                <span className="flex items-center gap-1">
                  <button
                    aria-label="Decrease return quantity"
                    onClick={() => setQtyDraft({ ...quantities, [li.id]: Math.max(0, q - 1) })}
                    className="rounded border border-border p-1 hover:bg-surface-hover"
                  >
                    <Minus size={11} />
                  </button>
                  <span className="w-7 text-center text-[13px] font-medium">{q}</span>
                  <button
                    aria-label="Increase return quantity"
                    disabled={q >= maxFor(li)}
                    onClick={() => setQtyDraft({ ...quantities, [li.id]: Math.min(maxFor(li), q + 1) })}
                    className="rounded border border-border p-1 hover:bg-surface-hover disabled:opacity-30"
                  >
                    <Plus size={11} />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>

        <Select
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={[
            { label: 'Changed mind', value: 'Changed mind' },
            { label: 'Arrived damaged', value: 'Arrived damaged' },
            { label: 'Wrong item shipped', value: 'Wrong item shipped' },
            { label: 'Size or fit issue', value: 'Size or fit issue' },
            { label: 'Other', value: 'Other' },
          ]}
        />
        <Toggle label="Restock returned items" checked={restock} onChange={setRestock} />
        <Input
          label="Refund amount"
          type="number"
          step="0.01"
          min="0"
          prefix="$"
          value={refundTouched ? (refundAmount ?? '') : (subtotal > 0 ? subtotal.toFixed(2) : '0.00')}
          onChange={(e) => {
            setRefundTouched(true)
            setRefundAmount(e.target.value)
          }}
          helpText={`Items value: ${formatMoney(subtotal)}`}
        />
      </div>
    </Drawer>
  )
}
