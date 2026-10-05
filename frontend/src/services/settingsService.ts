import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { syncMutation, gqlLiteral } from './api'
import { delay } from '@/lib/delay'
import type {
  StoreSettings, PaymentProvider, ShippingRate, StaffMember, PermissionResource,
  ThemeSettings, StoreDomain,
} from '@/types'
import type { ThemeLibraryEntry } from '@/data'

// ─── Store settings ────────────────────────────────────────────────────────

export async function updateStoreSettings(patch: Partial<StoreSettings>): Promise<void> {
  await delay(350)
  getStore().updateSettings(patch)
  const current = getStore().settings
  syncMutation(`mutation { settingsUpdate(value: ${gqlLiteral({ ...current, ...patch })}) { storeName } }`)
}

export async function togglePaymentProvider(id: string): Promise<void> {
  await delay(250)
  const store = getStore()
  const payments = store.settings.payments.map((p: PaymentProvider) =>
    p.id === id ? { ...p, enabled: !p.enabled } : p,
  )
  await updateStoreSettings({ payments })
}

export async function setPaymentTestMode(id: string, testMode: boolean): Promise<void> {
  await delay(200)
  const store = getStore()
  const payments = store.settings.payments.map((p) => (p.id === id ? { ...p, testMode } : p))
  await updateStoreSettings({ payments })
}

export async function saveShippingRates(rates: ShippingRate[]): Promise<void> {
  await delay(300)
  await updateStoreSettings({ shipping: rates })
}

// ─── Staff & permissions (§26) ─────────────────────────────────────────────

export async function inviteStaff(input: { name: string; email: string; role: StaffMember['role'] }): Promise<StaffMember> {
  await delay(350)
  const store = getStore()
  if (store.staff.some((s) => s.email === input.email)) {
    throw new Error('Someone with this email already has access')
  }
  const member: StaffMember = {
    id: uid('staff'),
    name: input.name,
    email: input.email,
    role: input.role,
    status: 'invited',
    lastActiveAt: '',
    permissions: {
      products: ['view'],
      orders: ['view'],
      customers: ['view'],
      analytics: [],
      settings: [],
    },
  }
  store.addStaff(member)
  syncMutation(`mutation { staffMemberCreate(input: ${gqlLiteral({ name: input.name, email: input.email, role: input.role })}) { userErrors { message } } }`)
  return member
}

export async function updateStaffPermissions(
  id: string,
  resource: PermissionResource,
  actions: string[],
): Promise<void> {
  await delay(250)
  const store = getStore()
  const member = store.staff.find((s) => s.id === id)
  if (!member) throw new Error('Staff member not found')
  store.patchStaff(id, {
    permissions: { ...member.permissions, [resource]: actions },
  })
  syncMutation(`mutation { staffMemberPermissionSet(id: ${gqlLiteral(id)}, resource: ${gqlLiteral(resource)}, actions: ${gqlLiteral(actions)}) { userErrors { message } } }`)
}

export async function updateStaff(id: string, patch: Partial<StaffMember>): Promise<void> {
  await delay(250)
  getStore().patchStaff(id, patch)
  const args = [
    `id: ${gqlLiteral(id)}`,
    ...(patch.name !== undefined ? [`name: ${gqlLiteral(patch.name)}`] : []),
    ...(patch.email !== undefined ? [`email: ${gqlLiteral(patch.email)}`] : []),
    ...(patch.role !== undefined ? [`role: ${gqlLiteral(patch.role)}`] : []),
  ].join(', ')
  syncMutation(`mutation { staffMemberUpdate(${args}) { userErrors { message } } }`)
}

export async function setStaffStatus(id: string, status: StaffMember['status']): Promise<void> {
  await delay(250)
  const owner = getStore().staff.find((s) => s.id === id)
  if (owner?.role === 'owner') throw new Error('The store owner’s access cannot be changed')
  getStore().patchStaff(id, { status })
  syncMutation(`mutation { staffMemberSetStatus(id: ${gqlLiteral(id)}, status: ${gqlLiteral(status)}) { userErrors { message } } }`)
}
export async function removeStaff(id: string): Promise<void> {
  await delay(300)
  const member = getStore().staff.find((s) => s.id === id)
  if (member?.role === 'owner') throw new Error('The store owner cannot be removed')
  getStore().removeStaff(id)
  syncMutation(`mutation { staffMemberDelete(id: ${gqlLiteral(id)}) { userErrors { message } } }`)
}

// ─── Theme / online store ──────────────────────────────────────────────────

export async function updateTheme(patch: Partial<ThemeSettings>): Promise<void> {
  await delay(300)
  getStore().updateTheme(patch)
  syncMutation(`mutation { themeUpdate(value: ${gqlLiteral(patch)}) { activeTheme } }`)
}

export async function publishTheme(id: string): Promise<void> {
  await delay(400)
  const store = getStore()
  const theme = store.themeLibrary.find((t) => t.id === id)
  if (!theme) throw new Error('Theme not found')
  store.setThemeLibrary(
    store.themeLibrary.map((t) => ({
      ...t,
      role: t.id === id ? 'current' : t.role === 'current' ? 'published-mirror' : t.role,
    })),
  )
  store.updateTheme({ activeTheme: theme.name })
  syncMutation(`mutation { themePublish(id: ${gqlLiteral(id)}) { storeName } }`)
}

export async function addThemeToLibrary(name: string): Promise<ThemeLibraryEntry> {
  await delay(350)
  const store = getStore()
  const entry: ThemeLibraryEntry = {
    id: uid('th'),
    name,
    version: '1.0.0',
    role: 'library',
    imageSrc: `/images/banners/theme-${slugName(name)}.svg`,
    addedAt: new Date().toISOString(),
  }
  store.setThemeLibrary([...store.themeLibrary, entry])
  syncMutation(`mutation { themeLibraryAdd(name: ${gqlLiteral(name)}) { id } }`)
  return entry
}

export async function deleteTheme(id: string): Promise<void> {
  await delay(300)
  const store = getStore()
  const theme = store.themeLibrary.find((t) => t.id === id)
  if (!theme) throw new Error('Theme not found')
  if (theme.role === 'current') throw new Error('Cannot delete the live theme')
  store.setThemeLibrary(store.themeLibrary.filter((t) => t.id !== id))
  syncMutation(`mutation { themeLibraryDelete(id: ${gqlLiteral(id)}) { storeName } }`)
}

function slugName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

// ─── Apps ──────────────────────────────────────────────────────────────────

export async function installApp(id: string): Promise<void> {
  await delay(450)
  const store = getStore()
  const suggestion = store.appSuggestions.find((a) => a.id === id)
  if (!suggestion) throw new Error('App not found')
  store.addApp({ ...suggestion, id: uid('app'), status: 'installed' })
  syncMutation(`mutation { appInstall(id: ${gqlLiteral(id)}) { userErrors { message } } }`)
}

export async function uninstallApp(id: string): Promise<void> {
  await delay(350)
  const app = getStore().apps.find((a) => a.id === id)
  if (!app) throw new Error('App not found')
  getStore().removeApp(id)
  syncMutation(`mutation { appUninstall(id: ${gqlLiteral(id)}) { userErrors { message } } }`)
}

export async function toggleApp(id: string): Promise<void> {
  await delay(250)
  const store = getStore()
  const app = store.apps.find((a) => a.id === id)
  if (!app) throw new Error('App not found')
  store.patchApp(id, { status: app.status === 'installed' ? 'disabled' : 'installed' })
  syncMutation(`mutation { appToggle(id: ${gqlLiteral(id)}) { userErrors { message } } }`)
}

// ─── Notifications / tasks ─────────────────────────────────────────────────

export async function markNotificationRead(id: string): Promise<void> {
  getStore().patchNotification(id, { read: true })
  syncMutation(`mutation { notificationMarkRead(id: ${gqlLiteral(id)}) { storeName } }`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await delay(150)
  getStore().markAllNotificationsRead()
  syncMutation(`mutation { notificationMarkAllRead { storeName } }`)
}

export async function toggleTask(id: string): Promise<void> {
  getStore().toggleTask(id)
  syncMutation(`mutation { taskToggle(id: ${gqlLiteral(id)}) { storeName } }`)
}

/** Dev utility (spec §38): wipe localStorage changes and re-hydrate seeds */
export async function resetDemoData(): Promise<void> {
  await delay(500)
  localStorage.removeItem('northstar-admin-v1')
  getStore().resetData()
}

// ─── Domains / policies / localization (parity wrappers) ───────────────────

export async function domainAdd(host: string): Promise<void> {
  await delay(300)
  const store = getStore()
  const domains: StoreDomain[] = [
    ...(store.settings.domains ?? []),
    { host: host.trim(), primary: false, sslEnabled: false, verificationStatus: 'pending', createdAt: new Date().toISOString() },
  ]
  store.updateSettings({ domains })
  syncMutation(`mutation { domainAdd(host: ${gqlLiteral(host.trim())}) { host } }`)
}

export async function domainSetPrimary(host: string): Promise<void> {
  await delay(250)
  const store = getStore()
  const domains: StoreDomain[] = (store.settings.domains ?? []).map((d) => ({ ...d, primary: d.host === host }))
  store.updateSettings({ domains })
  syncMutation(`mutation { domainSetPrimary(host: ${gqlLiteral(host)}) { host } }`)
}

export async function domainDelete(host: string): Promise<void> {
  await delay(250)
  const store = getStore()
  const domains: StoreDomain[] = (store.settings.domains ?? []).filter((d) => d.host !== host)
  store.updateSettings({ domains })
  syncMutation(`mutation { domainDelete(host: ${gqlLiteral(host)}) { host } }`)
}

export async function shopPolicyUpdate(policy: 'refund' | 'privacy' | 'terms' | 'shipping' | 'subscriber', body: string): Promise<void> {
  await delay(300)
  const store = getStore()
  store.updateSettings({ policies: { ...store.settings.policies, [policy]: body } })
  syncMutation(`mutation { shopPolicyUpdate(policy: ${gqlLiteral(policy)}, body: ${gqlLiteral(body)}) { storeName } }`)
}

export async function localeUpdate(code: string, name: string): Promise<void> {
  await delay(250)
  const store = getStore()
  store.updateLocales(store.locales.map((l) => (l.code === code ? { ...l, name } : l)))
  syncMutation(`mutation { localeUpdate(code: ${gqlLiteral(code)}, name: ${gqlLiteral(name)}) { storeName } }`)
}

export async function marketCreate(code: string, name: string, currency: string): Promise<void> {
  await delay(300)
  const store = getStore()
  store.updateMarkets([...store.markets, { code, name, currency, priceAdjustmentPercent: 0, enabled: true }])
  syncMutation(`mutation { marketCreate(code: ${gqlLiteral(code)}, name: ${gqlLiteral(name)}, currency: ${gqlLiteral(currency)}) { code } }`)
}

export async function marketDelete(code: string): Promise<void> {
  await delay(250)
  const store = getStore()
  store.updateMarkets(store.markets.filter((m) => m.code !== code))
  syncMutation(`mutation { marketDelete(code: ${gqlLiteral(code)}) { userErrors { message } } }`)
}
