import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { syncMutation, gqlLiteral } from './api'
import { delay } from '@/lib/delay'
import type {
  StoreSettings, PaymentProvider, ShippingRate, StaffMember, PermissionResource,
  ThemeSettings,
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
  store.updateSettings({
    payments: store.settings.payments.map((p: PaymentProvider) =>
      p.id === id ? { ...p, enabled: !p.enabled } : p,
    ),
  })
}

export async function setPaymentTestMode(id: string, testMode: boolean): Promise<void> {
  await delay(200)
  const store = getStore()
  store.updateSettings({
    payments: store.settings.payments.map((p) => (p.id === id ? { ...p, testMode } : p)),
  })
}

export async function saveShippingRates(rates: ShippingRate[]): Promise<void> {
  await delay(300)
  getStore().updateSettings({ shipping: rates })
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
}

export async function updateStaff(id: string, patch: Partial<StaffMember>): Promise<void> {
  await delay(250)
  getStore().patchStaff(id, patch)
}

export async function setStaffStatus(id: string, status: StaffMember['status']): Promise<void> {
  await delay(250)
  const owner = getStore().staff.find((s) => s.id === id)
  if (owner?.role === 'owner') throw new Error('The store owner’s access cannot be changed')
  getStore().patchStaff(id, { status })
}

export async function removeStaff(id: string): Promise<void> {
  await delay(300)
  const member = getStore().staff.find((s) => s.id === id)
  if (member?.role === 'owner') throw new Error('The store owner cannot be removed')
  getStore().removeStaff(id)
}

// ─── Theme / online store ──────────────────────────────────────────────────

export async function updateTheme(patch: Partial<ThemeSettings>): Promise<void> {
  await delay(300)
  getStore().updateTheme(patch)
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
  return entry
}

export async function deleteTheme(id: string): Promise<void> {
  await delay(300)
  const store = getStore()
  const theme = store.themeLibrary.find((t) => t.id === id)
  if (!theme) throw new Error('Theme not found')
  if (theme.role === 'current') throw new Error('Cannot delete the live theme')
  store.setThemeLibrary(store.themeLibrary.filter((t) => t.id !== id))
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
}

export async function uninstallApp(id: string): Promise<void> {
  await delay(350)
  const app = getStore().apps.find((a) => a.id === id)
  if (!app) throw new Error('App not found')
  getStore().removeApp(id)
}

export async function toggleApp(id: string): Promise<void> {
  await delay(250)
  const store = getStore()
  const app = store.apps.find((a) => a.id === id)
  if (!app) throw new Error('App not found')
  store.patchApp(id, { status: app.status === 'installed' ? 'disabled' : 'installed' })
}

// ─── Notifications / tasks ─────────────────────────────────────────────────

export async function markNotificationRead(id: string): Promise<void> {
  getStore().patchNotification(id, { read: true })
}

export async function markAllNotificationsRead(): Promise<void> {
  await delay(150)
  getStore().markAllNotificationsRead()
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
