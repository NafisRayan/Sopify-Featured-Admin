import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, RotateCcw, Save, Trash2, UserPlus } from 'lucide-react'
import { useStore } from '@/store/useStore'
import {
  Badge, Button, Card, CardHeader, CardSection, DividedCard, Input, Modal, PageHeader, Radio,
  Select, Textarea, Toggle, useConfirm, useToast,
} from '@/components/ui'
import { formatRelative } from '@/lib/format'
import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { delay } from '@/lib/delay'
import type { MetafieldDefinition, MetafieldType, MarketCountry, StoreLocale } from '@/types/parity'
import { initials } from '@/lib/format'
import { PERMISSION_RESOURCES } from '@/types'
import {
  domainAdd, domainDelete, domainSetPrimary, inviteStaff, resetDemoData, saveShippingRates,
  setPaymentTestMode, shopPolicyUpdate, togglePaymentProvider, updateStoreSettings,
} from '@/services/settingsService'
import { useCan } from '@/lib/permissions'
import type { ShippingRate } from '@/types'

const SECTION_TITLES: Record<string, string> = {
  markets: 'Markets',
  languages: 'Languages',
  activity: 'Activity log',
  metafields: 'Metafields',
  general: 'General',
  billing: 'Plan and billing',
  payments: 'Payments',
  checkout: 'Checkout',
  shipping: 'Shipping and delivery',
  taxes: 'Taxes and duties',
  notifications: 'Notifications',
  policies: 'Policies',
  domains: 'Domains',
  users: 'Users and permissions',
}

export default function SettingsSectionPage() {
  const { section = 'general' } = useParams()
  const settings = useStore((s) => s.settings)
  const staff = useStore((s) => s.staff)
  const locations = useStore((s) => s.locations)
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm, confirmElement } = useConfirm()
  const canEdit = useCan('settings', 'edit')

  const markets = useStore((s2) => s2.markets)
  const locales = useStore((s2) => s2.locales)
  const planInfo = useStore((s2) => s2.plan[0]!)
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [rates, setRates] = useState<ShippingRate[]>(settings.shipping)
  const [invite, setInvite] = useState({ name: '', email: '', role: 'staff' as 'admin' | 'staff' })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [savingPolicies, setSavingPolicies] = useState(false)
  const [payoutSchedule, setPayoutSchedule] = useState(settings.payouts?.schedule ?? 'weekly')
  const [payoutDay, setPayoutDay] = useState(settings.payouts?.dayOfWeek ?? 'Friday')

  useEffect(() => {
    setForm(settings)
    setRates(settings.shipping)
    setPayoutSchedule(settings.payouts?.schedule ?? 'weekly')
    setPayoutDay(settings.payouts?.dayOfWeek ?? 'Friday')
  }, [settings])

  const title = SECTION_TITLES[section] ?? 'Settings'

  const saveGeneral = async () => {
    setSaving(true)
    try {
      await updateStoreSettings({
        storeName: form.storeName,
        legalName: form.legalName,
        email: form.email,
        phone: form.phone,
        storeAddress: form.storeAddress,
        currency: form.currency,
        timezone: form.timezone,
        unitSystem: form.unitSystem,
        weightUnit: form.weightUnit,
        orderPrefix: form.orderPrefix,
      })
      toast('Settings saved')
    } finally {
      setSaving(false)
    }
  }

  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))

  return (
    <div>
      {confirmElement}
      <PageHeader
        title={title}
        subtitle="Changes save to this demo store and persist across reloads"
        backTo="/settings"
        backLabel="Settings"
        primaryAction={
          section === 'general' ? (
            <Button variant="primary" icon={<Save size={13} />} loading={saving} onClick={() => void saveGeneral()} disabled={!canEdit}>
              Save
            </Button>
          ) : undefined
        }
      />

      {/* ── General ── */}
      {section === 'general' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <DividedCard>
            <CardHeader title="Store details" />
            <CardSection>
              <div className="space-y-3">
                <Input label="Store name" value={form.storeName} onChange={(e) => patch({ storeName: e.target.value })} disabled={!canEdit} />
                <Input label="Legal business name" value={form.legalName} onChange={(e) => patch({ legalName: e.target.value })} disabled={!canEdit} />
              </div>
            </CardSection>
          </DividedCard>

          <DividedCard>
            <CardHeader title="Contact information" />
            <CardSection>
              <div className="space-y-3">
                <Input label="Store email" type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} disabled={!canEdit} />
                <Input label="Phone" value={form.phone} onChange={(e) => patch({ phone: e.target.value })} disabled={!canEdit} />
                <Input label="Street address" value={form.storeAddress.address1} onChange={(e) => patch({ storeAddress: { ...form.storeAddress, address1: e.target.value } })} disabled={!canEdit} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="City" value={form.storeAddress.city} onChange={(e) => patch({ storeAddress: { ...form.storeAddress, city: e.target.value } })} disabled={!canEdit} />
                  <Input label="State" value={form.storeAddress.province} onChange={(e) => patch({ storeAddress: { ...form.storeAddress, province: e.target.value } })} disabled={!canEdit} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="ZIP" value={form.storeAddress.zip} onChange={(e) => patch({ storeAddress: { ...form.storeAddress, zip: e.target.value } })} disabled={!canEdit} />
                  <Input label="Country" value={form.storeAddress.country} onChange={(e) => patch({ storeAddress: { ...form.storeAddress, country: e.target.value } })} disabled={!canEdit} />
                </div>
              </div>
            </CardSection>
          </DividedCard>

          <DividedCard>
            <CardHeader title="Standards and format" />
            <CardSection>
              <div className="space-y-3">
                <Select
                  label="Currency"
                  value={form.currency}
                  onChange={(e) => patch({ currency: e.target.value })}
                  options={[{ label: 'US Dollar (USD)', value: 'USD' }, { label: 'Euro (EUR)', value: 'EUR' }, { label: 'British Pound (GBP)', value: 'GBP' }, { label: 'Canadian Dollar (CAD)', value: 'CAD' }]}
                  disabled={!canEdit}
                />
                <Select
                  label="Timezone"
                  value={form.timezone}
                  onChange={(e) => patch({ timezone: e.target.value })}
                  options={['(GMT-08:00) Pacific Time', '(GMT-05:00) Eastern Time', '(GMT+00:00) London', '(GMT+01:00) Berlin'].map((t) => ({ label: t, value: t }))}
                  disabled={!canEdit}
                />
                <div>
                  <p className="mb-1 text-xs font-medium">Unit system</p>
                  <div className="flex gap-5">
                    <Radio name="units" label="Imperial" checked={form.unitSystem === 'imperial'} onChange={() => patch({ unitSystem: 'imperial' })} disabled={!canEdit} />
                    <Radio name="units" label="Metric" checked={form.unitSystem === 'metric'} onChange={() => patch({ unitSystem: 'metric' })} disabled={!canEdit} />
                  </div>
                </div>
                <Select
                  label="Weight unit"
                  value={form.weightUnit}
                  onChange={(e) => patch({ weightUnit: e.target.value as 'kg' | 'lb' })}
                  options={[{ label: 'Kilograms (kg)', value: 'kg' }, { label: 'Pounds (lb)', value: 'lb' }]}
                  disabled={!canEdit}
                  className="max-w-[200px]"
                />
              </div>
            </CardSection>
          </DividedCard>

          <DividedCard>
            <CardHeader title="Plan" subtitle="Store properties" />
            <CardSection>
              {(() => {
                return (
                  <div className="space-y-2 text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{planInfo.name}</span>
                      <Badge tone={planInfo.status === 'trial' ? 'warning' : 'success'} dot>
                        {planInfo.status === 'trial' ? `Trial · ${planInfo.trialDaysLeft} days left` : 'Active'}
                      </Badge>
                    </div>
                    <p className="text-text-muted">Store ID: {planInfo.storeId}</p>
                    <p className="text-xs text-text-muted">
                      Billing runs through the demo — no real charges are made.
                    </p>
                  </div>
                )
              })()}
            </CardSection>
          </DividedCard>

          <DividedCard>
            <CardHeader title="Danger zone" subtitle="Demo utilities" />
            <CardSection>
              <p className="text-[13px] text-text-muted">
                Reset wipes every change you've made (orders, products, settings…) and restores the generated seed data.
              </p>
              <Button
                variant="destructive"
                icon={<RotateCcw size={13} />}
                className="mt-3"
                onClick={() =>
                  confirm({
                    title: 'Reset demo data?',
                    body: 'All local changes will be discarded and the original demo dataset restored.',
                    confirmLabel: 'Reset demo data',
                    destructive: true,
                    onConfirm: async () => {
                      await resetDemoData()
                      toast('Demo data reset', { tone: 'warning' })
                    },
                  })
                }
              >
                Reset demo data
              </Button>
            </CardSection>
          </DividedCard>
        </div>
      )}
      {/* ── Billing ── */}
      {section === 'billing' && (
        <div className="space-y-4">
          <DividedCard>
            <CardHeader title="Current plan" subtitle="Your active Shopify plan and renewal terms" />
            <CardSection>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{planInfo?.name ?? 'Shopify Basic'}</span>
                    <Badge tone="success" dot>{planInfo?.status ?? 'active'}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Billed annually · Renews in {planInfo?.trialDaysLeft ?? 365} days
                  </p>
                </div>
                <Button variant="secondary" onClick={() => toast('Plan changes are managed by the store owner')}>
                  Change plan
                </Button>
              </div>
            </CardSection>
            <CardSection className="border-t border-border bg-[#fafafa]">
              <p className="text-xs text-text-muted">
                Need more staff accounts or custom reports? Upgrade to Shopify Advanced.
              </p>
            </CardSection>
          </DividedCard>

          <DividedCard>
            <CardHeader title="Payment method" subtitle="Cards on file used for subscription charges" />
            <CardSection>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="rounded border border-border bg-[#f6f6f7] px-2 py-1 text-xs font-medium">VISA</span>
                  <div>
                    <span className="text-[13px] font-medium">Ending in 4242</span>
                    <span className="block text-xs text-text-muted">Expires 12/28 · Primary payment method</span>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => toast('Payment method updated')}>Replace</Button>
              </div>
            </CardSection>
          </DividedCard>

          <Card padding={false}>
            <CardHeader title="Recent invoices" subtitle="Billing history for subscriptions and transaction fees" />
            <ul className="divide-y divide-border">
              <li className="flex items-center justify-between px-4 py-3 text-[13px]">
                <div>
                  <span className="font-medium">INV-2026-009</span>
                  <span className="block text-xs text-text-muted">Sep 1, 2026 · Subscription</span>
                </div>
                <div className="text-right">
                  <span className="font-medium">$39.00</span>
                  <Badge tone="success">Paid</Badge>
                </div>
              </li>
              <li className="flex items-center justify-between px-4 py-3 text-[13px]">
                <div>
                  <span className="font-medium">INV-2026-008</span>
                  <span className="block text-xs text-text-muted">Aug 1, 2026 · Subscription</span>
                </div>
                <div className="text-right">
                  <span className="font-medium">$39.00</span>
                  <Badge tone="success">Paid</Badge>
                </div>
              </li>
            </ul>
          </Card>
        </div>
      )}

      {/* ── Payments ── */}
      {section === 'payments' && (
        <Card padding={false}>
          <CardHeader title="Payment providers" subtitle="Toggle providers available at checkout" />
          <ul className="divide-y divide-border">
            {form.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium">{p.provider}</p>
                  <p className="text-xs text-text-muted">{p.enabled ? (p.testMode ? 'Test mode — no real charges' : 'Active') : 'Disabled'}</p>
                </div>
                <div className="flex items-center gap-4">
                  {p.enabled && (
                    <Toggle checked={p.testMode} onChange={(v) => void setPaymentTestMode(p.id, v).then(() => toast('Test mode updated'))} label="Test mode" disabled={!canEdit} />
                  )}
                  <Toggle
                    checked={p.enabled}
                    onChange={() => void togglePaymentProvider(p.id).then(() => toast(`${p.provider} ${p.enabled ? 'disabled' : 'enabled'}`))}
                    disabled={!canEdit}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Checkout ── */}
      {section === 'checkout' && (
        <DividedCard>
          <CardHeader title="Checkout" />
          <CardSection>
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-medium">Customer accounts</p>
                <div className="space-y-2">
                  <Radio name="accounts" label="Accounts disabled — guests only" checked={form.checkout.customerAccounts === 'disabled'} onChange={() => void updateStoreSettings({ checkout: { ...form.checkout, customerAccounts: 'disabled' } }).then(() => { patch({ checkout: { ...form.checkout, customerAccounts: 'disabled' } }); toast('Checkout updated') })} />
                  <Radio name="accounts" label="Accounts optional" checked={form.checkout.customerAccounts === 'optional'} onChange={() => void updateStoreSettings({ checkout: { ...form.checkout, customerAccounts: 'optional' } }).then(() => { patch({ checkout: { ...form.checkout, customerAccounts: 'optional' } }); toast('Checkout updated') })} />
                  <Radio name="accounts" label="Accounts required" checked={form.checkout.customerAccounts === 'required'} onChange={() => void updateStoreSettings({ checkout: { ...form.checkout, customerAccounts: 'required' } }).then(() => { patch({ checkout: { ...form.checkout, customerAccounts: 'required' } }); toast('Checkout updated') })} />
                </div>
              </div>
              <Toggle label="Email receipts to customers" checked={form.checkout.emailReceipts} onChange={(v) => void updateStoreSettings({ checkout: { ...form.checkout, emailReceipts: v } }).then(() => { patch({ checkout: { ...form.checkout, emailReceipts: v } }); toast('Checkout updated') })} disabled={!canEdit} />
              <Toggle label="Ask for tips at checkout" checked={form.checkout.tipLine} onChange={(v) => void updateStoreSettings({ checkout: { ...form.checkout, tipLine: v } }).then(() => { patch({ checkout: { ...form.checkout, tipLine: v } }); toast('Checkout updated') })} disabled={!canEdit} />
              <Toggle label="Abandoned checkout recovery emails" checked={form.checkout.abandonedRecovery} onChange={(v) => void updateStoreSettings({ checkout: { ...form.checkout, abandonedRecovery: v } }).then(() => { patch({ checkout: { ...form.checkout, abandonedRecovery: v } }); toast('Checkout updated') })} disabled={!canEdit} />
            </div>
          </CardSection>
        </DividedCard>
      )}

      {/* ── Shipping ── */}
      {section === 'shipping' && (
        <Card padding={false}>
          <CardHeader
            title="Shipping rates"
            subtitle={`${locations.filter((l) => l.active).length} active locations ship from these rates`}
            actions={
              canEdit && (
                <Button size="sm" icon={<Plus size={12} />} onClick={() => setRates([...rates, { id: `ship_${Date.now()}`, name: 'New rate', regions: 'United States', rate: 5 }])}>
                  Add rate
                </Button>
              )
            }
          />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-[#fafafa] text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Regions</th>
                  <th className="px-4 py-2 font-medium">Rate</th>
                  <th className="px-4 py-2 font-medium">Free over</th>
                  <th className="px-4 py-2"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rates.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">
                      <Input value={r.name} onChange={(e) => setRates(rates.map((x, ix) => (ix === i ? { ...x, name: e.target.value } : x)))} disabled={!canEdit} aria-label="Rate name" />
                    </td>
                    <td className="px-4 py-2">
                      <Input value={r.regions} onChange={(e) => setRates(rates.map((x, ix) => (ix === i ? { ...x, regions: e.target.value } : x)))} disabled={!canEdit} aria-label="Regions" />
                    </td>
                    <td className="px-4 py-2">
                      <Input type="number" step="0.01" min="0" prefix="$" value={r.rate} onChange={(e) => setRates(rates.map((x, ix) => (ix === i ? { ...x, rate: Number(e.target.value) } : x)))} disabled={!canEdit} className="max-w-[110px]" aria-label="Rate amount" />
                    </td>
                    <td className="px-4 py-2">
                      <Input type="number" step="0.01" min="0" prefix="$" value={r.freeOver ?? ''} onChange={(e) => setRates(rates.map((x, ix) => (ix === i ? { ...x, freeOver: e.target.value === '' ? undefined : Number(e.target.value) } : x)))} disabled={!canEdit} className="max-w-[110px]" aria-label="Free over" />
                    </td>
                    <td className="px-4 py-2">
                      {canEdit && (
                        <button aria-label={`Remove ${r.name}`} onClick={() => setRates(rates.filter((_, ix) => ix !== i))} className="rounded p-1.5 text-text-muted hover:bg-critical-surface hover:text-critical-strong">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="flex justify-end border-t border-border px-4 py-3">
              <Button variant="primary" onClick={() => void saveShippingRates(rates).then(() => toast('Shipping rates saved'))}>
                Save rates
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ── Taxes ── */}
      {section === 'taxes' && (
        <DividedCard>
          <CardHeader title="Tax settings" />
          <CardSection>
            <div className="space-y-4">
              <Input
                label="Tax rate (%)"
                type="number"
                step="0.01"
                min="0"
                max="40"
                value={String(form.taxes.taxRate)}
                onChange={(e) => patch({ taxes: { ...form.taxes, taxRate: Number(e.target.value) } })}
                disabled={!canEdit}
                className="max-w-[160px]"
              />
              <Toggle label="Charge tax on shipping rates" checked={form.taxes.chargeTaxOnShipping} onChange={(v) => void updateStoreSettings({ taxes: { ...form.taxes, chargeTaxOnShipping: v } }).then(() => { patch({ taxes: { ...form.taxes, chargeTaxOnShipping: v } }); toast('Tax settings saved') })} disabled={!canEdit} />
              <Toggle label="Include tax in prices" checked={form.taxes.includeTaxInPrices} onChange={(v) => void updateStoreSettings({ taxes: { ...form.taxes, includeTaxInPrices: v } }).then(() => { patch({ taxes: { ...form.taxes, includeTaxInPrices: v } }); toast('Tax settings saved') })} disabled={!canEdit} />
              <Button variant="primary" onClick={() => void updateStoreSettings({ taxes: form.taxes }).then(() => toast('Tax settings saved'))} disabled={!canEdit}>
                Save
              </Button>
            </div>
          </CardSection>
        </DividedCard>
      )}

      {/* ── Notifications ── */}
      {section === 'notifications' && (
        <Card padding={false}>
          <CardHeader title="Customer notifications" subtitle="Emails sent on your behalf" />
          <ul className="divide-y divide-border">
            {(
              [
                ['orderConfirmation', 'Order confirmation', 'Sent when an order is placed'],
                ['shippingConfirmation', 'Shipping confirmation', 'Sent when an order is fulfilled'],
                ['abandonedCheckout', 'Abandoned checkout recovery', 'Sent to shoppers who leave items behind'],
                ['customerWelcome', 'Customer welcome', 'Sent when an account is created'],
              ] as const
            ).map(([key, label, help]) => (
              <li key={key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium">{label}</p>
                  <p className="text-xs text-text-muted">{help}</p>
                </div>
                <Toggle
                  checked={form.notifications[key]}
                  onChange={(v) => void updateStoreSettings({ notifications: { ...form.notifications, [key]: v } }).then(() => { patch({ notifications: { ...form.notifications, [key]: v } }); toast('Notification settings saved') })}
                  disabled={!canEdit}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Policies (shopPolicyUpdate per changed policy) ── */}
      {section === 'policies' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {(
            [
              ['refund', 'Refund policy'],
              ['privacy', 'Privacy policy'],
              ['terms', 'Terms of service'],
              ['shipping', 'Shipping policy'],
              ['subscriber', 'Subscriber policy'],
            ] as const
          ).map(([key, label]) => (
            <DividedCard key={key}>
              <CardHeader title={label} />
              <CardSection>
                <Textarea
                  rows={4}
                  value={form.policies[key]}
                  onChange={(e) => patch({ policies: { ...form.policies, [key]: e.target.value } })}
                  disabled={!canEdit}
                  aria-label={label}
                />
              </CardSection>
            </DividedCard>
          ))}
          {canEdit && (
            <div className="flex justify-end lg:col-span-2">
              <Button
                variant="primary"
                loading={savingPolicies}
                onClick={() => {
                  const changed = (['refund', 'privacy', 'terms', 'shipping', 'subscriber'] as const).filter(
                    (key) => form.policies[key] !== settings.policies[key],
                  )
                  if (changed.length === 0) {
                    toast('No changes to save', { tone: 'info' })
                    return
                  }
                  setSavingPolicies(true)
                  void Promise.all(changed.map((key) => shopPolicyUpdate(key, form.policies[key])))
                    .then(() => toast(`Saved ${changed.length} polic${changed.length === 1 ? 'y' : 'ies'}`))
                    .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Failed to save policies', { tone: 'critical' }))
                    .finally(() => setSavingPolicies(false))
                }}
              >
                Save policies
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Domains + payout schedule ── */}
      {section === 'domains' && (
        <div className="space-y-4">
          <Card padding={false}>
            <CardHeader title="Domains" subtitle="Domains connected to your store, with SSL and verification state" />
            <ul className="divide-y divide-border">
              {(settings.domains ?? []).map((d) => (
                <li key={d.host} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{d.host}</span>
                    <span className="block text-xs text-text-muted">
                      {d.sslEnabled ? 'SSL active' : 'SSL pending'} · verification {d.verificationStatus}
                    </span>
                  </span>
                  {d.primary ? (
                    <Badge tone="success" dot>Primary</Badge>
                  ) : (
                    <Badge tone={d.sslEnabled ? 'neutral' : 'warning'}>
                      {d.sslEnabled ? 'Connected' : 'Verifying'}
                    </Badge>
                  )}
                  {canEdit && (
                    <span className="flex items-center gap-2">
                      {!d.primary && (
                        <Button
                          size="sm"
                          onClick={() =>
                            void domainSetPrimary(d.host)
                              .then(() => toast(`${d.host} is now the primary domain`))
                              .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Failed', { tone: 'critical' }))
                          }
                        >
                          Set as primary
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          confirm({
                            title: `Remove ${d.host}?`,
                            body: 'The domain stops resolving to your store immediately.',
                            confirmLabel: 'Remove domain',
                            destructive: true,
                            onConfirm: async () => {
                              await domainDelete(d.host)
                              toast(`${d.host} removed`, { tone: 'critical' })
                            },
                          })
                        }
                      >
                        Remove
                      </Button>
                    </span>
                  )}
                </li>
              ))}
              {(settings.domains ?? []).length === 0 && (
                <li className="px-4 py-8 text-center text-[13px] text-text-muted">No domains connected yet.</li>
              )}
            </ul>
            {canEdit && (
              <CardSection className="border-t border-border bg-[#fafafa]">
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const host = newDomain.trim().toLowerCase()
                    if (!host || !host.includes('.')) {
                      toast('Enter a valid domain like example.com', { tone: 'critical' })
                      return
                    }
                    void domainAdd(host)
                      .then(() => {
                        toast(`${host} added — verification pending`)
                        setNewDomain('')
                      })
                      .catch((err: unknown) => toast(err instanceof Error ? err.message : 'Failed to add domain', { tone: 'critical' }))
                  }}
                >
                  <Input
                    label="Add a domain"
                    placeholder="example.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button size="sm" variant="primary" type="submit" disabled={!newDomain.trim()}>
                    Add domain
                  </Button>
                </form>
              </CardSection>
            )}
          </Card>

          <Card padding={false}>
            <CardHeader title="Payout schedule" subtitle="How often balance is sent to your bank account" />
            <CardSection>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Schedule"
                  value={payoutSchedule}
                  onChange={(e) => setPayoutSchedule(e.target.value)}
                  options={[
                    { label: 'Daily', value: 'daily' },
                    { label: 'Weekly', value: 'weekly' },
                    { label: 'Every 2 weeks', value: 'biweekly' },
                    { label: 'Monthly', value: 'monthly' },
                  ]}
                  disabled={!canEdit}
                />
                {(payoutSchedule === 'weekly' || payoutSchedule === 'biweekly') && (
                  <Select
                    label="Payout day"
                    value={payoutDay}
                    onChange={(e) => setPayoutDay(e.target.value)}
                    options={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d) => ({ label: d, value: d }))}
                    disabled={!canEdit}
                  />
                )}
              </div>
              {canEdit && (
                <Button
                  variant="primary"
                  className="mt-3"
                  onClick={() =>
                    void updateStoreSettings({
                      payouts: {
                        schedule: payoutSchedule,
                        dayOfWeek: payoutSchedule === 'weekly' || payoutSchedule === 'biweekly' ? payoutDay : undefined,
                      },
                    }).then(() => toast('Payout schedule saved'))
                  }
                >
                  Save schedule
                </Button>
              )}
            </CardSection>
          </Card>
        </div>
      )}

      {/* ── Markets ── */}
      {section === 'markets' && (
        <Card padding={false}>
          <CardHeader title="International markets" subtitle="Adjust prices per country and choose display currency" />
          <ul className="divide-y divide-border">
            {markets.map((m) => (
              <MarketRow key={m.code} market={m} />
            ))}
          </ul>
          <CardSection className="border-t border-border bg-[#fafafa] text-xs text-text-muted">
            Markets mirror Shopify Markets: prices in the customer's currency with your adjustment applied.
          </CardSection>
        </Card>
      )}

      {/* ── Languages ── */}
      {section === 'languages' && (
        <Card padding={false}>
          <CardHeader
            title="Store languages"
            subtitle="Locales your storefront theme can be translated into"
            actions={
              canEdit && (
                <AddLocaleButton />
              )
            }
          />
          <ul className="divide-y divide-border">
            {locales.map((l) => (
              <li key={l.code} className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="block text-[13px] font-medium">{l.name} <span className="text-text-muted">({l.code})</span></span>
                  {l.isDefault && <span className="text-xs text-text-muted">Default language</span>}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={l.published ? 'success' : 'neutral'} dot>{l.published ? 'Published' : 'Unpublished'}</Badge>
                  {!l.isDefault && canEdit && (
                    <Button
                      size="sm"
                      variant="tertiary"
                      onClick={() => {
                        const store = getStore()
                        store.updateLocales(store.locales.filter((x) => x.code !== l.code))
                        toast(`${l.name} removed`)
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Activity log ── */}
      {section === 'activity' && <ActivityLog />}

      {/* ── Metafields ── */}
      {section === 'metafields' && <MetafieldDefinitionsEditor />}

      {/* ── Users & permissions ── */}
      {section === 'users' && (
        <Card padding={false}>
          <CardHeader
            title="Staff"
            subtitle={`${staff.filter((s) => s.status === 'active').length} active · ${staff.filter((s) => s.status === 'invited').length} invited`}
            actions={
              canEdit && (
                <Button size="sm" variant="primary" icon={<UserPlus size={12} />} onClick={() => setInviteOpen(true)}>
                  Invite staff
                </Button>
              )
            }
          />
          <ul className="divide-y divide-border">
            {staff.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e3e3e3] text-xs font-semibold">
                  {initials(m.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{m.name}</p>
                  <p className="truncate text-xs text-text-muted">{m.email}</p>
                </div>
                <Badge tone={m.role === 'owner' ? 'highlight' : m.role === 'admin' ? 'info' : 'neutral'}>{m.role}</Badge>
                <Badge tone={m.status === 'active' ? 'success' : m.status === 'invited' ? 'warning' : 'neutral'} dot>
                  {m.status}
                </Badge>
                <span className="hidden w-24 text-right text-xs text-text-muted sm:block">
                  {m.lastActiveAt ? formatRelative(m.lastActiveAt) : '—'}
                </span>
                <Link to={`/settings/users/${m.id}`} className="text-xs text-accent hover:underline">
                  Edit permissions
                </Link>
              </li>
            ))}
          </ul>
          <CardSection className="border-t border-border bg-[#fafafa]">
            <p className="text-xs text-text-muted">
              Tip: use the account menu (top-right avatar) to <em>simulate acting as a staff member</em> — their
              permissions hide actions across the admin, including this page.
            </p>
          </CardSection>
        </Card>
      )}

      {section === 'users' && (
        <p className="mt-3 text-xs text-text-muted">
          Permission resources: {PERMISSION_RESOURCES.join(', ')}
        </p>
      )}

      {/* Invite modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite staff member"
        size="sm"
        footer={
          <>
            <Button onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!invite.name.trim() || !invite.email.trim()) {
                  toast('Name and email are required', { tone: 'critical' })
                  return
                }
                try {
                  const created = await inviteStaff({ name: invite.name.trim(), email: invite.email.trim(), role: invite.role })
                  toast(`Invitation sent to ${created.email}`)
                  setInviteOpen(false)
                  setInvite({ name: '', email: '', role: 'staff' })
                  navigate(`/settings/users/${created.id}`)
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'Failed to invite', { tone: 'critical' })
                }
              }}
            >
              Send invite
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Full name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          <Input label="Email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <Select
            label="Role"
            value={invite.role}
            onChange={(e) => setInvite({ ...invite, role: e.target.value as 'admin' | 'staff' })}
            options={[
              { label: 'Staff — limited permissions', value: 'staff' },
              { label: 'Admin — most permissions', value: 'admin' },
            ]}
          />
          <p className="text-xs text-text-muted">Permissions can be customized after sending the invite.</p>
        </div>
      </Modal>
    </div>
  )
}

// ── Markets row ────────────────────────────────────────────────────────────
function MarketRow({ market }: { market: MarketCountry }) {
  const { toast } = useToast()
  const canEdit = useCan('settings', 'edit')
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="text-[13px] font-medium">
          {market.name} <span className="text-text-muted">({market.code})</span>
        </p>
        <p className="text-xs text-text-muted">Prices shown in {market.currency}</p>
      </div>
      <div className="flex items-center gap-3">
        {draft !== null ? (
          <>
            <Input type="number" min="0" max="100" value={draft} onChange={(e) => setDraft(e.target.value)} className="w-24" aria-label="Price adjustment" />
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const store = getStore()
                store.updateMarkets(
                  store.markets.map((m) => (m.code === market.code ? { ...m, priceAdjustmentPercent: Number(draft) || 0 } : m)),
                )
                setDraft(null)
                toast('Market updated')
              }}
            >
              Save
            </Button>
          </>
        ) : (
          <button className="text-[13px] text-accent hover:underline" onClick={() => canEdit && setDraft(String(market.priceAdjustmentPercent))}>
            {market.priceAdjustmentPercent > 0 ? `+${market.priceAdjustmentPercent}% price adjustment` : 'No price adjustment'}
          </button>
        )}
        <Toggle
          label={market.enabled ? 'Active' : 'Inactive'}
          checked={market.enabled}
          onChange={(v) => {
            const store = getStore()
            store.updateMarkets(store.markets.map((m) => (m.code === market.code ? { ...m, enabled: v } : m)))
            toast(`Market ${v ? 'activated' : 'deactivated'}`)
          }}
          disabled={!canEdit}
        />
      </div>
    </li>
  )
}

// ── Add locale ─────────────────────────────────────────────────────────────
const LOCALE_POOL: StoreLocale[] = [
  { code: 'es', name: 'Spanish', isDefault: false, published: false },
  { code: 'it', name: 'Italian', isDefault: false, published: false },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', isDefault: false, published: false },
  { code: 'ja', name: 'Japanese', isDefault: false, published: false },
  { code: 'nl', name: 'Dutch', isDefault: false, published: false },
]

function AddLocaleButton() {
  const locales = useStore((s2) => s2.locales)
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState('')
  const available = LOCALE_POOL.filter((l) => !locales.some((x) => x.code === l.code))
  return (
    <>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)} disabled={available.length === 0}>
        Add language
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add language"
        size="sm"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!choice}
              onClick={() => {
                const locale = available.find((l) => l.code === choice)
                if (!locale) return
                const store = getStore()
                store.updateLocales([...store.locales, { ...locale, published: true }])
                toast(`${locale.name} added and published`)
                setOpen(false)
                setChoice('')
              }}
            >
              Add
            </Button>
          </>
        }
      >
        <Select
          label="Language"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          options={[{ label: 'Choose a language…', value: '' }, ...available.map((l) => ({ label: l.name, value: l.code }))]}
        />
      </Modal>
    </>
  )
}

// ── Activity log ───────────────────────────────────────────────────────────
function ActivityLog() {
  const activity = useStore((s2) => s2.staffActivity)
  const staff = useStore((s2) => s2.staff)
  const [staffFilter, setStaffFilter] = useState('')
  const filtered = staffFilter ? activity.filter((a) => a.staffId === staffFilter) : activity
  return (
    <Card padding={false}>
      <CardHeader
        title="Staff activity"
        subtitle="Actions taken in this admin, newest first"
        actions={
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            aria-label="Filter by staff member"
            className="h-8 cursor-pointer rounded-lg border border-[#c9c9c9] bg-surface px-2 text-[13px]"
          >
            <option value="">All staff</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        }
      />
      <ul className="divide-y divide-border">
        {filtered.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
            <span className="min-w-0">
              <span className="block truncate font-medium">{a.action}</span>
              <span className="block truncate text-xs text-text-muted">
                {a.staffName} · {a.resource}
                {a.resourceId ? ` · ${a.resourceId}` : ''}
              </span>
            </span>
            <span className="shrink-0 text-xs text-text-muted">{formatRelative(a.at)}</span>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center text-[13px] text-text-muted">No activity recorded for this staff member.</li>
        )}
      </ul>
    </Card>
  )
}

// ── Metafield definitions editor ───────────────────────────────────────────
const MF_TYPES: MetafieldType[] = ['single_line_text', 'multi_line_text', 'integer', 'decimal', 'boolean', 'date', 'url']
const MF_RESOURCE_LABEL: Record<MetafieldDefinition['resourceType'], string> = {
  product: 'Products', customer: 'Customers', order: 'Orders', company: 'Companies',
}

function MetafieldDefinitionsEditor() {
  const definitions = useStore((s2) => s2.metafieldDefinitions)
  const { toast } = useToast()
  const canEdit = useCan('settings', 'edit')
  const [form, setForm] = useState({ name: '', namespace: 'custom', key: '', type: 'single_line_text' as MetafieldType, resourceType: 'product' as MetafieldDefinition['resourceType'] })
  const [open, setOpen] = useState(false)

  return (
    <div>
      <Card padding={false}>
        <CardHeader
          title="Metafield definitions"
          subtitle="Structured fields for products, customers, orders and companies"
          actions={
            canEdit && (
              <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
                Add definition
              </Button>
            )
          }
        />
        <ul className="divide-y divide-border">
          {definitions.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">
                  {d.name} <span className="font-mono text-xs text-text-muted">{d.namespace}.{d.key}</span>
                </span>
                <span className="block text-xs text-text-muted">
                  {MF_RESOURCE_LABEL[d.resourceType]} · {d.type}
                  {d.description ? ` · ${d.description}` : ''}
                </span>
              </span>
              {canEdit && (
                <Button
                  size="sm"
                  variant="tertiary"
                  onClick={() => {
                    const store = getStore()
                    store.removeMetafieldDefinition(d.id)
                    toast('Definition removed')
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
          {definitions.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-text-muted">No definitions yet.</li>
          )}
        </ul>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add metafield definition"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!form.name.trim() || !form.key.trim()) {
                  toast('Name and key are required', { tone: 'critical' })
                  return
                }
                await delay(250)
                const store = getStore()
                store.upsertMetafieldDefinition({
                  id: uid('mfdef'),
                  namespace: form.namespace.trim() || 'custom',
                  key: form.key.trim().toLowerCase().replace(/\s+/g, '_'),
                  name: form.name.trim(),
                  type: form.type,
                  resourceType: form.resourceType,
                })
                toast('Definition added')
                setOpen(false)
                setForm({ name: '', namespace: 'custom', key: '', type: 'single_line_text', resourceType: 'product' })
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Care instructions" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Namespace" value={form.namespace} onChange={(e) => setForm({ ...form, namespace: e.target.value })} />
            <Input label="Key" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="care_instructions" />
          </div>
          <Select
            label="Content type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as MetafieldType })}
            options={MF_TYPES.map((t) => ({ label: t.replace(/_/g, ' '), value: t }))}
          />
          <Select
            label="Applies to"
            value={form.resourceType}
            onChange={(e) => setForm({ ...form, resourceType: e.target.value as MetafieldDefinition['resourceType'] })}
            options={Object.entries(MF_RESOURCE_LABEL).map(([value, label]) => ({ label, value }))}
          />
        </div>
      </Modal>
    </div>
  )
}
