import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { syncMutation, gqlLiteral, mutatePayload, IS_REMOTE } from './api'
import { delay } from '@/lib/delay'
import { roundMoney } from '@/lib/money'
import { CURRENT_USER } from '@/lib/constants'
import { customerStats } from '@/store/selectors'
import type {
  Company, CustomerSegment, InventoryTransfer, GiftCard,
} from '@/types/parity'
import type { Customer, Address, InventoryHistoryEntry } from '@/types'

const author = () => CURRENT_USER.name

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


function recordTransferHistory(
  variantId: string,
  locationId: string,
  change: number,
  resultingAvailable: number,
  reason: string,
): InventoryHistoryEntry {
  return {
    id: uid('ih'),
    variantId,
    locationId,
    change,
    resultingAvailable,
    reason,
    createdAt: new Date().toISOString(),
    author: author(),
  }
}

// ─── B2B companies ─────────────────────────────────────────────────────────

export async function createCompany(input: {
  name: string
  customerId: string
  locationName: string
  address: Address
  priceListDiscountPercent: number
}): Promise<Company> {
  await delay(400)
  const store = getStore()
  if (store.companies.some((c) => c.name.toLowerCase() === input.name.trim().toLowerCase())) {
    throw new Error('A company with this name already exists')
  }
  const locationId = uid('cl')
  const company: Company = {
    id: uid('company'),
    name: input.name.trim(),
    status: 'active',
    customerId: input.customerId,
    priceListDiscountPercent: input.priceListDiscountPercent,
    locations: [
      {
        id: locationId,
        name: input.locationName.trim() || 'Main location',
        address: input.address,
        taxExempt: false,
      },
    ],
    contacts: [],
    createdAt: new Date().toISOString(),
  }
  store.upsertCompany(company)
  syncMutation(`mutation { companyCreate(company: ${gqlLiteral({ name: company.name, customerId: company.customerId, locationName: input.locationName, address: input.address, priceListDiscountPercent: input.priceListDiscountPercent })}) { userErrors { message } } }`)
  logActivity('Created company', 'company', company.id)
  return company
}

export async function updateCompany(id: string, patch: Partial<Company>): Promise<void> {
  await delay(300)
  const c = getStore().companies.find((x) => x.id === id)
  if (!c) throw new Error('Company not found')
  getStore().upsertCompany({ ...c, ...patch })
}

export async function deleteCompany(id: string): Promise<void> {
  await delay(300)
  const c = getStore().companies.find((x) => x.id === id)
  if (!c) throw new Error('Company not found')
  getStore().removeCompany(id)
  logActivity('Deleted company', 'company', id)
}

export async function addCompanyLocation(companyId: string, name: string, address: Address): Promise<void> {
  await delay(250)
  const c = getStore().companies.find((x) => x.id === companyId)
  if (!c) throw new Error('Company not found')
  getStore().upsertCompany({
    ...c,
    locations: [...c.locations, { id: uid('cl'), name, address, taxExempt: false }],
  })
}

export async function addCompanyContact(companyId: string, contact: { name: string; email: string; phone?: string }): Promise<void> {
  await delay(250)
  const c = getStore().companies.find((x) => x.id === companyId)
  if (!c) throw new Error('Company not found')
  if (c.contacts.some((x) => x.email.toLowerCase() === contact.email.toLowerCase())) {
    throw new Error('This contact already exists')
  }
  getStore().upsertCompany({
    ...c,
    contacts: [
      ...c.contacts,
      { id: uid('cc'), name: contact.name, email: contact.email, phone: contact.phone, locationIds: c.locations.map((l) => l.id), isPrimary: c.contacts.length === 0 },
    ],
  })
}

export function companySpend(company: Company): number {
  return roundMoney(customerStats(company.customerId).totalSpent)
}

// ─── Customer segments ─────────────────────────────────────────────────────

export function matchesSegment(
  customer: Customer,
  filters: CustomerSegment['filters'],
): boolean {
  const stats = customerStats(customer.id)
  return filters.every((f) => {
    const value = f.value.trim().toLowerCase()
    if (f.column === 'tag') {
      const tags = customer.tags.map((t) => t.toLowerCase())
      if (f.relation === 'equals') return tags.includes(value)
      if (f.relation === 'contains') return tags.some((t) => t.includes(value))
      return false
    }
    const actual =
      f.column === 'orders_count' ? stats.ordersCount
      : f.column === 'total_spent' ? stats.totalSpent
      : f.column === 'email_state' ? customer.emailMarketingConsent
      : f.column === 'city' ? customer.defaultAddress?.city ?? ''
      : customer.defaultAddress?.country ?? ''
    const numeric = Number(value)
    switch (f.relation) {
      case 'gt': return !Number.isNaN(numeric) && Number(actual) > numeric
      case 'lt': return !Number.isNaN(numeric) && Number(actual) < numeric
      case 'equals': return String(actual).toLowerCase() === value || actual === value
      case 'contains': return String(actual).toLowerCase().includes(value)
      default: return false
    }
  })
}

export function segmentMembers(segment: CustomerSegment): Customer[] {
  return getStore().customers.filter((c) => matchesSegment(c, segment.filters))
}

export async function createSegment(input: { name: string; description?: string; filters: CustomerSegment['filters'] }): Promise<CustomerSegment> {
  await delay(300)
  const store = getStore()
  if (store.segments.some((s) => s.name.toLowerCase() === input.name.trim().toLowerCase())) {
    throw new Error('A segment with this name already exists')
  }
  if (input.filters.length === 0) throw new Error('Add at least one filter')
  const segment: CustomerSegment = {
    id: uid('seg'),
    name: input.name.trim(),
    description: input.description,
    filters: input.filters,
    createdAt: new Date().toISOString(),
  }
  store.upsertSegment(segment)
  logActivity('Created segment', 'segment', segment.id)
  return segment
}

export async function updateSegment(id: string, patch: Partial<CustomerSegment>): Promise<void> {
  await delay(250)
  const s = getStore().segments.find((x) => x.id === id)
  if (!s) throw new Error('Segment not found')
  getStore().upsertSegment({ ...s, ...patch })
}

export async function deleteSegment(id: string): Promise<void> {
  await delay(250)
  getStore().removeSegment(id)
  logActivity('Deleted segment', 'segment', id)
}

// ─── Inventory transfers ───────────────────────────────────────────────────

export async function createTransfer(input: {
  fromLocationId: string
  toLocationId: string
  note?: string
  lines: { variantId: string; sku: string; title: string; variantTitle: string; quantity: number }[]
}): Promise<InventoryTransfer> {
  await delay(400)
  if (input.fromLocationId === input.toLocationId) throw new Error('Choose two different locations')
  if (input.lines.length === 0) throw new Error('Add at least one item')
  const store = getStore()
  if (IS_REMOTE) {
    const { entity } = await mutatePayload(
      'inventoryTransferCreate',
      `inventoryTransferCreate(input: ${gqlLiteral({
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        note: input.note,
        lines: input.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      })}) { transfer { id name status fromLocationId toLocationId note createdAt sentAt receivedAt lines { id variantId sku title variantTitle quantity receivedQuantity } } userErrors { field message } }`,
    )
    const transfer = entity as InventoryTransfer
    store.upsertTransfer(transfer)
    logActivity('Created transfer', 'transfer', transfer.id)
    return transfer
  }
  const seq = store.transfers.length + 1001
  const transfer: InventoryTransfer = {
    id: uid('tf'),
    name: `TF-${seq}`,
    status: 'draft',
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    note: input.note,
    lines: input.lines.map((l) => ({
      id: uid('itl'), variantId: l.variantId, sku: l.sku, title: l.title,
      variantTitle: l.variantTitle, quantity: l.quantity, receivedQuantity: 0,
    })),
    createdAt: new Date().toISOString(),
  }
  store.upsertTransfer(transfer)
  logActivity('Created transfer', 'transfer', transfer.id)
  return transfer
}

export async function sendTransfer(transferId: string): Promise<void> {
  await delay(400)
  const store = getStore()
  const t = store.transfers.find((x) => x.id === transferId)
  if (!t) throw new Error('Transfer not found')
  if (t.status !== 'draft') throw new Error('Transfer already sent')
  if (IS_REMOTE) {
    const { entity } = await mutatePayload(
      'inventoryTransferSend',
      `inventoryTransferSend(id: ${gqlLiteral(transferId)}) { transfer { id name status fromLocationId toLocationId note createdAt sentAt receivedAt lines { id variantId sku title variantTitle quantity receivedQuantity } } userErrors { field message } }`,
    )
    if (entity) store.upsertTransfer(entity as InventoryTransfer)
    logActivity('Sent transfer', 'transfer', transferId)
    return
  }
  for (const line of t.lines) {
    const level = store.inventoryLevels.find((l) => l.variantId === line.variantId && l.locationId === t.fromLocationId)
    const current = level?.available ?? 0
    if (current < line.quantity) {
      throw new Error(`Insufficient stock at source location (has ${current}, needs ${line.quantity})`)
    }
  }
  const historyEntries: InventoryHistoryEntry[] = []
  for (const line of t.lines) {
    const level = store.inventoryLevels.find((l) => l.variantId === line.variantId && l.locationId === t.fromLocationId)
    const current = level?.available ?? 0
    const nextAvailable = current - line.quantity
    store.upsertInventoryLevel({
      ...(level ?? { variantId: line.variantId, locationId: t.fromLocationId, available: current, committed: 0, unavailable: 0 }),
      available: nextAvailable,
    })
    historyEntries.push(recordTransferHistory(line.variantId, t.fromLocationId, -line.quantity, nextAvailable, `Outgoing ${t.name}`))
  }
  store.addInventoryHistory(historyEntries)
  store.upsertTransfer({ ...t, status: 'in_transit', sentAt: new Date().toISOString() })
  logActivity('Sent transfer', 'transfer', transferId)
}

export async function receiveTransfer(transferId: string): Promise<void> {
  await delay(450)
  const store = getStore()
  const t = store.transfers.find((x) => x.id === transferId)
  if (!t) throw new Error('Transfer not found')
  if (t.status !== 'in_transit') throw new Error('Only in-transit transfers can be received')
  if (IS_REMOTE) {
    const { entity } = await mutatePayload(
      'inventoryTransferReceive',
      `inventoryTransferReceive(id: ${gqlLiteral(transferId)}) { transfer { id name status fromLocationId toLocationId note createdAt sentAt receivedAt lines { id variantId sku title variantTitle quantity receivedQuantity } } userErrors { field message } }`,
    )
    if (entity) store.upsertTransfer(entity as InventoryTransfer)
    logActivity('Received transfer', 'transfer', transferId)
    return
  }
  const historyEntries: InventoryHistoryEntry[] = []
  for (const line of t.lines) {
    const level = store.inventoryLevels.find((l) => l.variantId === line.variantId && l.locationId === t.toLocationId)
    const current = level?.available ?? 0
    const nextAvailable = current + line.quantity
    store.upsertInventoryLevel({
      ...(level ?? { variantId: line.variantId, locationId: t.toLocationId, available: current, committed: 0, unavailable: 0 }),
      available: nextAvailable,
    })
    historyEntries.push(recordTransferHistory(line.variantId, t.toLocationId, line.quantity, nextAvailable, `Incoming ${t.name}`))
  }
  store.addInventoryHistory(historyEntries)
  store.upsertTransfer({
    ...t,
    status: 'received',
    receivedAt: new Date().toISOString(),
    lines: t.lines.map((l) => ({ ...l, receivedQuantity: l.quantity })),
  })
  logActivity('Received transfer', 'transfer', transferId)
}

// ─── Gift cards ────────────────────────────────────────────────────────────

export async function issueGiftCard(input: {
  customerId?: string
  initialBalance: number
  note?: string
  expiresAt?: string
  code?: string
}): Promise<GiftCard> {
  await delay(400)
  if (input.initialBalance <= 0) throw new Error('Initial balance must be greater than 0')
  const gen = () => String(rngInt(1000, 9999))
  const card: GiftCard = {
    id: uid('gc'),
    code: input.code?.trim() || `NORTH-${gen()}-${gen()}-${gen()}`,
    customerId: input.customerId || undefined,
    initialBalance: roundMoney(input.initialBalance),
    balance: roundMoney(input.initialBalance),
    currency: 'USD',
    status: 'enabled',
    expiresAt: input.expiresAt || undefined,
    note: input.note,
    createdAt: new Date().toISOString(),
    history: [
      {
        id: uid('gch'), at: new Date().toISOString(), type: 'issued',
        amount: roundMoney(input.initialBalance),
        note: input.customerId
          ? `Issued to ${ownerName(input.customerId)}`
          : `Issued by ${author()}`,
      },
    ],
  }
  getStore().upsertGiftCard(card)
  syncMutation(`mutation { giftCardCreate(input: ${gqlLiteral({ customerId: input.customerId, initialBalance: input.initialBalance, note: input.note, expiresAt: input.expiresAt })}) { userErrors { message } } }`)
  logActivity('Issued gift card', 'gift_card', card.id)
  return card
}

function ownerName(customerId: string): string {
  const c = getStore().customers.find((x) => x.id === customerId)
  return c ? `${c.firstName} ${c.lastName}` : 'customer'
}

export async function setGiftCardStatus(id: string, status: 'enabled' | 'disabled'): Promise<void> {
  await delay(300)
  const store = getStore()
  const card = store.giftCards.find((g) => g.id === id)
  if (!card) throw new Error('Gift card not found')
  if (card.status === 'expired') throw new Error('Expired cards cannot be re-enabled')
  store.upsertGiftCard({
    ...card,
    status,
    history: [...card.history, { id: uid('gch'), at: new Date().toISOString(), type: status, amount: 0, note: status === 'disabled' ? `Disabled by ${author()}` : `Enabled by ${author()}` }],
  })
  syncMutation(`mutation { ${status === 'disabled' ? 'giftCardDisable' : 'giftCardEnable'}(id: ${gqlLiteral(id)}) { userErrors { message } } }`)
  logActivity(status === 'disabled' ? 'Disabled gift card' : 'Enabled gift card', 'gift_card', id)
}

export async function adjustGiftCardBalance(id: string, newBalance: number, note: string): Promise<void> {
  await delay(350)
  if (newBalance < 0) throw new Error('Balance cannot be negative')
  const store = getStore()
  const card = store.giftCards.find((g) => g.id === id)
  if (!card) throw new Error('Gift card not found')
  const change = roundMoney(newBalance - card.balance)
  store.upsertGiftCard({
    ...card,
    balance: roundMoney(newBalance),
    history: [...card.history, { id: uid('gch'), at: new Date().toISOString(), type: 'adjusted', amount: change, note: note || `Adjusted by ${author()}` }],
  })
  syncMutation(`mutation { giftCardBalanceAdjust(id: ${gqlLiteral(id)}, newBalance: ${newBalance}, note: ${gqlLiteral(note)}) { userErrors { message } } }`)
  logActivity('Adjusted gift card balance', 'gift_card', id)
}

function rngInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
