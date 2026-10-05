import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MapPin, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { useStore } from '@/store/useStore'
import {
  Badge, Button, Card, CardHeader, DividedCard, Drawer, EmptyState, Input, Modal, PageHeader,
  Select, useConfirm, useToast,
} from '@/components/ui'
import { VariantPickerModal, type PickedVariant } from '@/components/VariantPickerModal'
import { formatMoney, formatPercent, initials } from '@/lib/format'
import { uid } from '@/lib/id'
import {
  addCompanyContact, addCompanyLocation, companySpend, createPriceList, deleteCompany,
  deletePriceList, updateCompany, updatePriceList,
} from '@/services/parityService'
import { ordersForCustomer } from '@/store/selectors'
import { useCan } from '@/lib/permissions'
import type { Product } from '@/types'

interface PriceListEntryDraft {
  variantId: string
  title: string
  variantTitle: string
  price: string
}

interface PriceListDraft {
  id?: string
  name: string
  currency: string
  locationId: string // '' = all locations
  entries: PriceListEntryDraft[]
}

function variantLabel(products: Product[], variantId: string): { title: string; variantTitle: string } {
  for (const p of products) {
    const v = p.variants.find((x) => x.id === variantId)
    if (v) return { title: p.title, variantTitle: v.title === 'Default Title' ? '' : v.title }
  }
  return { title: 'Deleted variant', variantTitle: '' }
}

export default function CompanyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm, confirmElement } = useConfirm()
  const company = useStore((s) => s.companies.find((c) => c.id === id))
  const customer = useStore((s) => s.customers.find((c) => c.id === company?.customerId))
  const orders = useStore((s) => s.orders)
  const [locationOpen, setLocationOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [locationForm, setLocationForm] = useState({ name: '', address1: '', city: '', province: '', zip: '' })
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '' })
  const [discountDraft, setDiscountDraft] = useState<string | null>(null)
  const priceLists = useStore((s) => s.priceLists)
  const products = useStore((s) => s.products)
  const [plDraft, setPlDraft] = useState<PriceListDraft | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [savingPl, setSavingPl] = useState(false)
  const canEdit = useCan('customers', 'edit')
  const canRemove = useCan('customers', 'delete')

  const companyOrders = useMemo(() => (customer ? ordersForCustomer(customer.id) : []), [orders, customer])
  const companyPriceLists = useMemo(
    () => priceLists.filter((p) => p.companyId === id || p.parentCompanyId === id),
    [priceLists, id],
  )

  const submitPriceList = async () => {
    if (!plDraft || !company) return
    if (!plDraft.name.trim()) {
      toast('Name is required', { tone: 'critical' })
      return
    }
    if (plDraft.entries.length === 0) {
      toast('Add at least one fixed price', { tone: 'critical' })
      return
    }
    setSavingPl(true)
    try {
      if (plDraft.id) {
        await updatePriceList(plDraft.id, {
          name: plDraft.name.trim(),
          currency: plDraft.currency,
          locationId: plDraft.locationId || undefined,
          entries: plDraft.entries.map((e) => ({ id: uid('ple'), variantId: e.variantId, price: Math.max(0, Number(e.price) || 0) })),
        })
        toast('Price list updated')
      } else {
        await createPriceList({
          name: plDraft.name.trim(),
          currency: plDraft.currency,
          companyId: company.id,
          locationId: plDraft.locationId || undefined,
          entries: plDraft.entries.map((e) => ({ variantId: e.variantId, price: Math.max(0, Number(e.price) || 0) })),
        })
        toast('Price list created')
      }
      setPlDraft(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save price list', { tone: 'critical' })
    } finally {
      setSavingPl(false)
    }
  }

  if (!company) {
    return (
      <div>
        <PageHeader title="Company not found" backTo="/companies" backLabel="Companies" />
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState heading="Company not found" primaryAction={{ label: 'Back to companies', onClick: () => navigate('/companies') }} />
        </div>
      </div>
    )
  }

  return (
    <div>
      {confirmElement}
      <PageHeader
        title={company.name}
        subtitle={`B2B company · added ${new Date(company.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
        backTo="/companies"
        backLabel="Companies"
        secondaryActions={
          canRemove ? (
            <Button
              variant="destructive"
              onClick={() =>
                confirm({
                  title: `Delete ${company.name}?`,
                  body: 'Its locations and contacts will be removed.',
                  confirmLabel: 'Delete',
                  destructive: true,
                  onConfirm: async () => {
                    await deleteCompany(company.id)
                    toast('Company deleted', { tone: 'critical' })
                    navigate('/companies')
                  },
                })
              }
            >
              Delete
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        {[
          { label: 'Locations', value: String(company.locations.length) },
          { label: 'Contacts', value: String(company.contacts.length) },
          { label: 'Price list discount', value: `−${formatPercent(company.priceListDiscountPercent, 0)}` },
          { label: 'Spent to date', value: formatMoney(companySpend(company)) },
        ].map((s) => (
          <Card key={s.label} className="min-w-[140px] flex-1">
            <p className="text-xs text-text-muted">{s.label}</p>
            <p className="mt-1 text-lg font-semibold">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <DividedCard>
            <CardHeader
              title={`Locations (${company.locations.length})`}
              actions={
                canEdit && (
                  <Button size="sm" icon={<Plus size={12} />} onClick={() => setLocationOpen(true)}>
                    Add location
                  </Button>
                )
              }
            />
            <ul className="divide-y divide-border">
              {company.locations.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <span className="flex items-start gap-2.5 text-[13px]">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-text-muted" />
                    <span>
                      <span className="block font-medium">{l.name}</span>
                      <span className="block text-xs text-text-muted">
                        {l.address.address1}, {l.address.city} {l.address.province} {l.address.zip}
                      </span>
                    </span>
                  </span>
                  {l.taxExempt && <Badge tone="info">Tax exempt</Badge>}
                </li>
              ))}
            </ul>
          </DividedCard>

          <DividedCard>
            <CardHeader
              title={`Contacts (${company.contacts.length})`}
              actions={
                canEdit && (
                  <Button size="sm" icon={<UserPlus size={12} />} onClick={() => setContactOpen(true)}>
                    Add contact
                  </Button>
                )
              }
            />
            {company.contacts.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-text-muted">No contacts yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {company.contacts.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e3e3e3] text-[11px] font-semibold">
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-text-muted">{c.email}</span>
                    </span>
                    {c.isPrimary && <Badge tone="success">Primary</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </DividedCard>

          <DividedCard>
            <CardHeader
              title={`Price lists (${companyPriceLists.length})`}
              subtitle="Fixed per-variant prices this company pays"
              actions={
                canEdit && (
                  <Button size="sm" icon={<Plus size={12} />} onClick={() => setPlDraft({ name: '', currency: 'USD', locationId: '', entries: [] })}>
                    Create price list
                  </Button>
                )
              }
            />
            {companyPriceLists.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-text-muted">
                No price lists yet — create one to offer fixed B2B pricing.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {companyPriceLists.map((pl) => (
                  <li key={pl.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{pl.name}</span>
                      <span className="block text-xs text-text-muted">
                        {pl.currency} · {pl.entries.length} fixed price{pl.entries.length === 1 ? '' : 's'} ·{' '}
                        {pl.locationId ? (company.locations.find((l) => l.id === pl.locationId)?.name ?? 'One location') : 'All locations'}
                      </span>
                    </span>
                    {canEdit && (
                      <span className="flex items-center gap-1">
                        <button
                          aria-label={`Edit ${pl.name}`}
                          onClick={() =>
                            setPlDraft({
                              id: pl.id,
                              name: pl.name,
                              currency: pl.currency,
                              locationId: pl.locationId ?? '',
                              entries: pl.entries.map((e) => {
                                const label = variantLabel(products, e.variantId)
                                return { variantId: e.variantId, title: label.title, variantTitle: label.variantTitle, price: e.price.toFixed(2) }
                              }),
                            })
                          }
                          className="rounded p-1.5 text-text-muted hover:bg-surface-hover hover:text-text"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          aria-label={`Delete ${pl.name}`}
                          onClick={() =>
                            confirm({
                              title: `Delete ${pl.name}?`,
                              body: 'Its fixed prices stop applying to this company immediately.',
                              confirmLabel: 'Delete price list',
                              destructive: true,
                              onConfirm: async () => {
                                await deletePriceList(pl.id)
                                toast('Price list deleted', { tone: 'critical' })
                              },
                            })
                          }
                          className="rounded p-1.5 text-text-muted hover:bg-critical-surface hover:text-critical-strong"
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </DividedCard>

          <DividedCard>
            <CardHeader
              title={`Orders (${companyOrders.length})`}
              subtitle={`Through primary buyer${customer ? ` ${customer.firstName} ${customer.lastName}` : ''}`}
              actions={
                customer && (
                  <Link to={`/customers/${customer.id}`} className="text-xs text-accent hover:underline">
                    View customer
                  </Link>
                )
              }
            />
            {companyOrders.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-text-muted">No orders yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {companyOrders.slice(0, 8).map((o) => (
                  <li key={o.id}>
                    <Link to={`/orders/${o.id}`} className="flex items-center justify-between px-4 py-2 text-[13px] hover:bg-surface-hover">
                      <span className="font-medium">{o.name}</span>
                      <span className="text-text-muted">{formatMoney(o.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DividedCard>
        </div>

        <div className="space-y-4">
          <Card>
            <h3 className="text-[13px] font-semibold">Price list</h3>
            <p className="mt-1 text-xs text-text-muted">
              Catalog prices shown to this company are reduced by the discount below.
            </p>
            {canEdit ? (
              discountDraft !== null ? (
                <div className="mt-2 flex items-end gap-2">
                  <Input
                    label="Discount %"
                    type="number"
                    min="0"
                    max="90"
                    value={discountDraft}
                    onChange={(e) => setDiscountDraft(e.target.value)}
                    className="max-w-[100px]"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      void updateCompany(company.id, { priceListDiscountPercent: Number(discountDraft) || 0 }).then(() => {
                        toast('Price list updated')
                        setDiscountDraft(null)
                      })
                    }
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <button className="mt-2 text-[13px] font-medium text-accent hover:underline" onClick={() => setDiscountDraft(String(company.priceListDiscountPercent))}>
                  −{formatPercent(company.priceListDiscountPercent, 0)} — Edit
                </button>
              )
            ) : (
              <p className="mt-2 text-[13px]">−{formatPercent(company.priceListDiscountPercent, 0)}</p>
            )}
          </Card>

          {company.note && (
            <Card>
              <h3 className="text-[13px] font-semibold">Note</h3>
              <p className="mt-1.5 text-[13px] text-text-muted">{company.note}</p>
            </Card>
          )}

          <Card>
            <h3 className="text-[13px] font-semibold">External ID</h3>
            <p className="mt-1 text-[13px] text-text-muted">{company.externalId || '—'}</p>
          </Card>
        </div>
      </div>

      {/* Add location drawer */}
      <Drawer
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        title="Add company location"
        footer={
          <>
            <Button onClick={() => setLocationOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!locationForm.name.trim() || !locationForm.address1.trim()) {
                  toast('Name and street are required', { tone: 'critical' })
                  return
                }
                await addCompanyLocation(company.id, locationForm.name, {
                  firstName: '', lastName: '', address1: locationForm.address1,
                  city: locationForm.city, province: locationForm.province, country: 'United States', zip: locationForm.zip,
                })
                toast('Location added')
                setLocationOpen(false)
                setLocationForm({ name: '', address1: '', city: '', province: '', zip: '' })
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Location name" value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} />
          <Input label="Street address" value={locationForm.address1} onChange={(e) => setLocationForm({ ...locationForm, address1: e.target.value })} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="City" value={locationForm.city} onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })} />
            <Input label="State" value={locationForm.province} onChange={(e) => setLocationForm({ ...locationForm, province: e.target.value })} />
            <Input label="ZIP" value={locationForm.zip} onChange={(e) => setLocationForm({ ...locationForm, zip: e.target.value })} />
          </div>
        </div>
      </Drawer>

      {/* Add contact drawer */}
      <Drawer
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        title="Add company contact"
        footer={
          <>
            <Button onClick={() => setContactOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!contactForm.name.trim() || !contactForm.email.trim()) {
                  toast('Name and email are required', { tone: 'critical' })
                  return
                }
                try {
                  await addCompanyContact(company.id, { name: contactForm.name, email: contactForm.email, phone: contactForm.phone || undefined })
                  toast('Contact added')
                  setContactOpen(false)
                  setContactForm({ name: '', email: '', phone: '' })
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'Failed', { tone: 'critical' })
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Full name" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
          <Input label="Email" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
          <Input label="Phone (optional)" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
        </div>
      </Drawer>

      {/* Price list editor */}
      <Modal
        open={!!plDraft}
        onClose={() => setPlDraft(null)}
        title={plDraft?.id ? 'Edit price list' : 'Create price list'}
        size="lg"
        footer={
          <>
            <Button onClick={() => setPlDraft(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={savingPl}
              disabled={!plDraft?.name.trim() || (plDraft?.entries.length ?? 0) === 0}
              onClick={() => void submitPriceList()}
            >
              {plDraft?.id ? 'Save price list' : 'Create price list'}
            </Button>
          </>
        }
      >
        {plDraft && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Name" value={plDraft.name} onChange={(e) => setPlDraft({ ...plDraft, name: e.target.value })} />
              <Select
                label="Currency"
                value={plDraft.currency}
                onChange={(e) => setPlDraft({ ...plDraft, currency: e.target.value })}
                options={[
                  { label: 'US Dollar (USD)', value: 'USD' },
                  { label: 'Euro (EUR)', value: 'EUR' },
                  { label: 'British Pound (GBP)', value: 'GBP' },
                  { label: 'Canadian Dollar (CAD)', value: 'CAD' },
                ]}
              />
            </div>
            <Select
              label="Applies to location (optional)"
              value={plDraft.locationId}
              onChange={(e) => setPlDraft({ ...plDraft, locationId: e.target.value })}
              options={[
                { label: 'All locations', value: '' },
                ...company.locations.map((l) => ({ label: l.name, value: l.id })),
              ]}
            />
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-semibold">Fixed prices</p>
                <Button size="sm" icon={<Plus size={12} />} onClick={() => setPickerOpen(true)}>
                  Add variant
                </Button>
              </div>
              {plDraft.entries.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-text-muted">
                  No fixed prices yet — pick variants to set company-specific prices.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {plDraft.entries.map((e, i) => (
                    <li key={e.variantId} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{e.title}</span>
                        {e.variantTitle && <span className="block text-xs text-text-muted">{e.variantTitle}</span>}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        prefix="$"
                        value={e.price}
                        onChange={(ev) =>
                          setPlDraft({
                            ...plDraft,
                            entries: plDraft.entries.map((x, ix) => (ix === i ? { ...x, price: ev.target.value } : x)),
                          })
                        }
                        className="w-28"
                        aria-label={`Price for ${e.title}`}
                      />
                      <button
                        aria-label={`Remove ${e.title}`}
                        onClick={() => setPlDraft({ ...plDraft, entries: plDraft.entries.filter((_, ix) => ix !== i) })}
                        className="rounded p-1.5 text-text-muted hover:bg-critical-surface hover:text-critical-strong"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      <VariantPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add variant to price list"
        onPick={(picked: PickedVariant) => {
          if (!plDraft) return
          if (plDraft.entries.some((e) => e.variantId === picked.variantId)) {
            toast('That variant already has a fixed price', { tone: 'warning' })
            return
          }
          setPlDraft({
            ...plDraft,
            entries: [
              ...plDraft.entries,
              { variantId: picked.variantId, title: picked.title, variantTitle: picked.variantTitle, price: picked.price.toFixed(2) },
            ],
          })
        }}
      />
    </div>
  )
}
