import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Badge, Button, Card, CardHeader, CardSection, Input, PageHeader, Select, TagInput, Textarea, useToast } from '@/components/ui'
import { VariantPickerModal, type PickedVariant } from '@/components/VariantPickerModal'
import { formatMoney, initials } from '@/lib/format'
import { roundMoney } from '@/lib/money'
import { createDraft, convertDraft, markAsPaid } from '@/services/ordersService'
import { IS_REMOTE, mutatePayload } from '@/services/api'


/** Orders → Create order (full admin flow) */
export default function OrderCreatePage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const customers = useStore((s) => s.customers)
  const companies = useStore((s) => s.companies)
  const discounts = useStore((s) => s.discounts)
  const giftCards = useStore((s) => s.giftCards)
  const settings = useStore((s) => s.settings)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [items, setItems] = useState<PickedVariant[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [shipping, setShipping] = useState('6.99')
  const [discount, setDiscount] = useState('0')
  const [discountCode, setDiscountCode] = useState('')
  const [giftCard, setGiftCard] = useState('')
  const [saving, setSaving] = useState<'draft' | 'paid' | null>(null)
  const customer = customers.find((c) => c.id === customerId)
  const customerOptions = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    return customers
      .filter((c) => !q || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 50)
  }, [customers, customerQuery])

  useEffect(() => {
    if (!customerId && customerOptions.length > 0) setCustomerId(customerOptions[0]!.id)
  }, [customerOptions, customerId])

  const company = useMemo(() => companies.find((c) => c.customerId === customerId), [companies, customerId])
  const b2bDiscountPct = company?.priceListDiscountPercent ?? 0

  const totals = useMemo(() => {
    const subtotal = roundMoney(
      items.reduce((s, i) => {
        const unitPrice = b2bDiscountPct > 0 ? roundMoney(i.price * (1 - b2bDiscountPct / 100)) : i.price
        return s + unitPrice * i.quantity
      }, 0),
    )

    let discountAmount = Math.min(Number(discount) || 0, subtotal)
    const activeDisc = discountCode ? discounts.find((d) => d.code.toUpperCase() === discountCode.trim().toUpperCase() && d.status === 'active') : null
    if (activeDisc) {
      if (activeDisc.type === 'percentage') {
        discountAmount = roundMoney(subtotal * ((activeDisc.value ?? 0) / 100))
      } else if (activeDisc.type === 'fixed_amount') {
        discountAmount = Math.min(subtotal, roundMoney(activeDisc.value ?? 0))
      }
    }

    const shippingPrice = Number(shipping) || 0
    let tax = 0
    if (!customer?.taxExempt) {
      const rate = (settings.taxes?.taxRate ?? 8) / 100
      const taxableBase = Math.max(0, subtotal - discountAmount) + (settings.taxes?.chargeTaxOnShipping ? shippingPrice : 0)
      tax = roundMoney(taxableBase * rate)
    }

    const taxRate = settings.taxes?.taxRate ?? 8
    return {
      subtotal,
      discountAmount,
      shippingPrice: Number(shipping) || 0,
      tax,
      taxRate,
      total: roundMoney(Math.max(0, subtotal - discountAmount) + shippingPrice + tax),
    }
  }, [items, discount, discountCode, shipping, b2bDiscountPct, customer, settings, discounts])
  const activeGiftCard = giftCard.trim()
    ? giftCards.find((g) => g.code.toUpperCase() === giftCard.trim().toUpperCase() && g.status !== 'disabled')
    : undefined
  const giftCardApplied = activeGiftCard && activeGiftCard.balance > 0
    ? roundMoney(Math.max(0, Math.min(activeGiftCard.balance, totals.total)))
    : 0

  const setQty = (variantId: string, delta: number) =>
    setItems((prev) =>
      prev.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)),
    )
  const removeItem = (variantId: string) => setItems((prev) => prev.filter((i) => i.variantId !== variantId))

  const save = async (thenPaid: boolean) => {
    if (!customerId || items.length === 0) return
    setSaving(thenPaid ? 'paid' : 'draft')
    try {
      const draft = await createDraft({
        customerId,
        lineItems: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        note: note || undefined,
        tags,
        shippingPrice: Number(shipping) || 0,
        discountAmount: totals.discountAmount,
        discountCode: discountCode.trim() || undefined,
        giftCardCode: giftCard.trim() || undefined,
      })
      if (thenPaid) {
        if (IS_REMOTE) {
          // server-sequential: draft already exists server-side (createDraft)
          const conv = await mutatePayload(
            'draftOrderConvert',
            `draftOrderConvert(id: ${JSON.stringify(draft.id)}) { order { id paymentStatus } userErrors { field message } }`,
          )
          const paymentStatus = conv.entity?.paymentStatus ?? conv.entity?.order?.paymentStatus ?? 'pending'
          if (paymentStatus !== 'paid') {
            await mutatePayload('orderMarkAsPaid', `orderMarkAsPaid(id: ${JSON.stringify(draft.id)}) { order { id } userErrors { field message } }`)
          }
          useStore.getState().patchOrder(draft.id, { isDraft: false, status: 'open', paymentStatus: 'paid' })
          navigate(`/orders/${draft.id}`)
        } else {
          const realId = await convertDraft(draft.id)
          const converted = useStore.getState().orders.find((o) => o.id === realId)
          if (converted && converted.paymentStatus !== 'paid') {
            await markAsPaid(realId)
          }
          navigate(`/orders/${realId}`)
        }
      } else {
        navigate(`/draft-orders/${draft.id}`)
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save order', { tone: 'critical' })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="pb-24">
      <PageHeader title="Create order" backTo="/orders" backLabel="Orders" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card padding={false}>
            <CardHeader title="Customer" />
            <CardSection>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="Search customers"
                  aria-label="Search customers"
                  className="max-w-[220px]"
                />
                <Select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  options={customerOptions.map((c) => ({ label: `${c.firstName} ${c.lastName} — ${c.email}`, value: c.id }))}
                  className="max-w-md"
                  aria-label="Customer"
                />
              </div>
              {customer && (
                <p className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e3e3e3] text-[10px] font-semibold">
                    {initials(`${customer.firstName} ${customer.lastName}`)}
                  </span>
                  {customer.defaultAddress
                    ? `${customer.defaultAddress.address1}, ${customer.defaultAddress.city} ${customer.defaultAddress.province}`
                    : 'No address on file'}
                </p>
              )}
            </CardSection>
          </Card>

          <Card padding={false}>
            <CardHeader
              title="Items"
              subtitle="Quantities of unfulfilled items count against inventory when the order is fulfilled"
              actions={
                <Button size="sm" icon={<Plus size={12} />} onClick={() => setPickerOpen(true)}>
                  Add item
                </Button>
              }
            />
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-text-muted">
                No items yet — add products to the order.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((i) => {
                  const unitPrice = b2bDiscountPct > 0 ? roundMoney(i.price * (1 - b2bDiscountPct / 100)) : i.price
                  return (
                  <li key={i.variantId} className="flex items-center gap-3 px-4 py-3">
                    {i.imageSrc && <img src={i.imageSrc} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{i.title}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {i.variantTitle && `${i.variantTitle} · `}
                        {formatMoney(unitPrice)} · {i.sku || 'no SKU'}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <button aria-label="Decrease" onClick={() => setQty(i.variantId, -1)} className="rounded border border-border p-1 hover:bg-surface-hover">
                        <Minus size={11} />
                      </button>
                      <span className="w-8 text-center text-[13px] font-medium">{i.quantity}</span>
                      <button aria-label="Increase" onClick={() => setQty(i.variantId, 1)} className="rounded border border-border p-1 hover:bg-surface-hover">
                        <Plus size={11} />
                      </button>
                    </span>
                    <span className="w-20 text-right text-[13px] font-medium">{formatMoney(unitPrice * i.quantity)}</span>
                    <button aria-label={`Remove ${i.title}`} onClick={() => removeItem(i.variantId)} className="rounded p-1.5 text-text-muted hover:bg-critical-surface hover:text-critical-strong">
                      <Trash2 size={13} />
                    </button>
                  </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card padding={false}>
            <CardHeader title="Additional" />
            <CardSection>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="Shipping" type="number" step="0.01" min="0" prefix="$" value={shipping} onChange={(e) => setShipping(e.target.value)} />
                <Input label="Discount code" placeholder="e.g. SAVE10" value={discountCode} onChange={(e) => setDiscountCode(e.target.value)} />
                <Input label="Gift card code" placeholder="e.g. NORTH-1234-…" value={giftCard} onChange={(e) => setGiftCard(e.target.value)} />
                <Input label="Custom discount" type="number" step="0.01" min="0" prefix="$" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div className="mt-3 space-y-3">
                <Textarea label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note or instructions" />
                <TagInput value={tags} onChange={setTags} suggestions={['priority', 'gift', 'wholesale']} />
              </div>
            </CardSection>
          </Card>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <Card padding={false}>
            <CardHeader title="Order summary" />
            <CardSection>
              <dl className="space-y-1.5 text-[13px]">
                <div className="flex justify-between"><dt className="text-text-muted">Subtotal</dt><dd>{formatMoney(totals.subtotal)}</dd></div>
                {totals.discountAmount > 0 && (
                  <div className="flex justify-between"><dt className="text-text-muted">Discount</dt><dd className="text-critical-strong">−{formatMoney(totals.discountAmount)}</dd></div>
                )}
                <div className="flex justify-between"><dt className="text-text-muted">Shipping</dt><dd>{totals.shippingPrice === 0 ? 'Free' : formatMoney(totals.shippingPrice)}</dd></div>
                <div className="flex justify-between"><dt className="text-text-muted">Tax ({totals.taxRate}%)</dt><dd>{formatMoney(totals.tax)}</dd></div>
                {giftCardApplied > 0 && (
                  <div className="flex justify-between"><dt className="text-text-muted">Gift card</dt><dd className="text-critical-strong">−{formatMoney(giftCardApplied)}</dd></div>
                )}
                {giftCardApplied > 0 && (
                  <div className="flex justify-between"><dt className="text-text-muted">Amount due</dt><dd className="font-semibold text-critical-strong">{formatMoney(roundMoney(totals.total - giftCardApplied))}</dd></div>
                )}
                <div className="flex justify-between border-t border-border pt-1.5 text-[15px] font-semibold"><dt>Total</dt><dd>{formatMoney(totals.total)}</dd></div>
              </dl>
              <div className="mt-4 space-y-2">
                <Badge tone="info">Payment: {items.length === 0 ? 'add items first' : 'pending'}</Badge>
              </div>
            </CardSection>
          </Card>

          <Card>
            <h3 className="text-[13px] font-semibold">What happens next</h3>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-text-muted">
              <li><strong className="text-text">Save as draft</strong> keeps it as a draft you can invoice or collect payment on later.</li>
              <li><strong className="text-text">Collect payment</strong> converts it to a live order marked as paid and reserves inventory.</li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-3 py-2.5 md:px-6">
          <span className="text-xs text-text-muted">
            {items.length} item{items.length === 1 ? '' : 's'} · total <span className="font-semibold text-text">{formatMoney(totals.total)}</span>
          </span>
          <span className="flex items-center gap-2">
            <Button
              onClick={() => void save(false)}
              loading={saving === 'draft'}
              disabled={items.length === 0 || !customerId}
            >
              Save as draft
            </Button>
            <Button
              variant="primary"
              onClick={() => void save(true)}
              loading={saving === 'paid'}
              disabled={items.length === 0 || !customerId}
            >
              Collect payment · {formatMoney(totals.total)}
            </Button>
          </span>
        </div>
      </div>

      <VariantPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add item to order"
        onPick={(p) =>
          setItems((prev) => {
            const existing = prev.find((x) => x.variantId === p.variantId)
            if (existing) return prev.map((x) => (x.variantId === p.variantId ? { ...x, quantity: x.quantity + p.quantity } : x))
            return [...prev, p]
          })
        }
      />
    </div>
  )
}
