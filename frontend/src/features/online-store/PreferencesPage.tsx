import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import { Button, Card, CardHeader, CardSection, DividedCard, Input, PageHeader, Textarea, Toggle, useToast } from '@/components/ui'
import { updateStoreSettings } from '@/services/settingsService'
import { useCan } from '@/lib/permissions'

export default function PreferencesPage() {
  const settings = useStore((s) => s.settings)
  const { toast } = useToast()
  const canEdit = useCan('products', 'edit')
  const [form, setForm] = useState({
    pageTitle: settings.pageTitle ?? `${settings.storeName} — Everyday objects built to be kept`,
    metaDescription: settings.metaDescription ?? 'Durable everyday goods: apparel, bags, kitchen and home goods designed in Portland.',
    passwordPage: Boolean(settings.passwordProtected),
  })
  const [contact, setContact] = useState({
    email: settings.email,
    phone: settings.phone,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      pageTitle: settings.pageTitle ?? `${settings.storeName} — Everyday objects built to be kept`,
      metaDescription: settings.metaDescription ?? 'Durable everyday goods: apparel, bags, kitchen and home goods designed in Portland.',
      passwordPage: Boolean(settings.passwordProtected),
    })
    setContact({ email: settings.email, phone: settings.phone })
  }, [settings])

  const save = async () => {
    setSaving(true)
    try {
      await updateStoreSettings({
        email: contact.email,
        phone: contact.phone,
        pageTitle: form.pageTitle,
        metaDescription: form.metaDescription,
        passwordProtected: form.passwordPage,
      })
      toast('Preferences saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Preferences"
        subtitle="Storefront metadata, contact info and customer accounts"
        backTo="/online-store"
        backLabel="Online Store"
        primaryAction={<Button variant="primary" loading={saving} onClick={() => void save()} disabled={!canEdit}>Save</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <DividedCard>
          <CardHeader title="Homepage" />
          <CardSection>
            <div className="space-y-3">
              <Input label="Homepage title" value={form.pageTitle} onChange={(e) => setForm({ ...form, pageTitle: e.target.value })} helpText="Browser tab title on the storefront" disabled={!canEdit} />
              <Textarea label="Homepage meta description" rows={3} value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} disabled={!canEdit} />
            </div>
          </CardSection>
        </DividedCard>

        <DividedCard>
          <CardHeader title="Password protection" subtitle="Hide the store until you launch" />
          <CardSection>
            <Toggle
              label="Password page"
              helpText="Visitors must enter a password to view the storefront"
              checked={form.passwordPage}
              onChange={(v) => setForm({ ...form, passwordPage: v })}
              disabled={!canEdit}
            />
          </CardSection>
          <CardSection className="border-t border-border">
            <div className="space-y-3">
              <Input label="Store contact email" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} disabled={!canEdit} />
              <Input label="Store contact phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} disabled={!canEdit} />
            </div>
          </CardSection>
        </DividedCard>

        <Card padding={false} className="lg:col-span-2">
          <CardHeader title="Customer accounts" subtitle="Also configurable under Settings → Checkout" />
          <CardSection>
            <p className="text-[13px] text-text-muted">
              Current setting: <span className="font-medium text-text">{settings.checkout.customerAccounts === 'optional' ? 'Accounts optional at checkout' : settings.checkout.customerAccounts === 'required' ? 'Accounts required' : 'Accounts disabled'}</span>.
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Manage in <a href="/settings/checkout" className="text-accent hover:underline">Settings → Checkout</a>.
            </p>
          </CardSection>
        </Card>
      </div>
    </div>
  )
}
