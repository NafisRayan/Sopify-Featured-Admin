// ─── Parity expansion entities (Admin API gap closure) ─────────────────────
import type { Address, ID } from './index'

// Orders — fraud/risk signals (kept off the core Order type)
export interface OrderRisk {
  level: 'low' | 'medium' | 'high'
  signals: string[]
}

// B2B — Companies
export interface CompanyLocation {
  id: ID
  name: string
  phone?: string
  address: Address
  taxExempt: boolean
  priceListId?: ID
}

export interface CompanyContact {
  id: ID
  name: string
  email: string
  phone?: string
  locationIds: ID[]
  isPrimary: boolean
}

export interface Company {
  id: ID
  name: string
  externalId?: string
  status: 'active' | 'draft'
  customerId: ID // primary buyer
  note?: string
  locations: CompanyLocation[]
  contacts: CompanyContact[]
  priceListDiscountPercent: number // B2B catalog adjustment
  createdAt: string
}

// Customers — Segments
export type SegmentColumn = 'orders_count' | 'total_spent' | 'tag' | 'email_state' | 'city' | 'country'
export type SegmentRelation = 'gt' | 'lt' | 'equals' | 'contains'

export interface CustomerSegment {
  id: ID
  name: string
  description?: string
  /** simplified query representation of Shopify QueryLanguage */
  filters: { column: SegmentColumn; relation: SegmentRelation; value: string }[]
  createdAt: string
}

// Inventory — Transfers
export interface InventoryTransferLine {
  id: ID
  variantId: ID
  sku: string
  title: string
  variantTitle: string
  quantity: number
  receivedQuantity: number
}

export interface InventoryTransfer {
  id: ID
  name: string // "TF-1001"
  status: 'draft' | 'in_transit' | 'received'
  fromLocationId: ID
  toLocationId: ID
  lines: InventoryTransferLine[]
  createdAt: string
  sentAt?: string
  receivedAt?: string
  note?: string
}

// Gift cards
export interface GiftCard {
  id: ID
  code: string // last-4 style display handled in UI
  customerId?: ID
  initialBalance: number
  balance: number
  currency: 'USD'
  status: 'enabled' | 'disabled' | 'expired'
  expiresAt?: string
  note?: string
  createdAt: string
  history: { id: ID; at: string; type: 'issued' | 'used' | 'adjusted' | 'disabled' | 'enabled' | 'redeemed'; amount: number; note?: string }[]
}

// Finances — Payouts
export interface BalanceTransaction {
  id: ID
  at: string
  type: 'charge' | 'refund' | 'fee' | 'payout' | 'adjustment' | 'dispute'
  amount: number // gross
  fee: number
  net: number
  orderId?: ID
  description: string
  payoutId?: ID
}

export interface Payout {
  id: ID
  status: 'paid' | 'in_transit' | 'scheduled'
  amount: number
  currency: 'USD'
  issuedAt: string
  arrivedAt?: string
  bankAccount: string // "•••• 4821"
}

// Metafields
export type MetafieldType =
  | 'single_line_text'
  | 'multi_line_text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'url'

export interface MetafieldDefinition {
  id: ID
  namespace: string
  key: string
  name: string
  type: MetafieldType
  description?: string
  resourceType: 'product' | 'customer' | 'order' | 'company'
}

export interface Metafield {
  id: ID
  definitionId: ID
  value: string
}

/** metafields stored per-resource: `${resourceType}:${resourceId}` -> list */
export interface MetafieldOwnerMap {
  [ownerKey: string]: Metafield[]
}

// Online store — Redirects
export interface UrlRedirect {
  id: ID
  from: string // "/old-path"
  to: string   // "/pages/new-path" or absolute URL
  createdAt: string
}

// Localizations
export interface StoreLocale {
  code: string
  name: string
  isDefault: boolean
  published: boolean
}

// Markets (lite)
export interface MarketCountry {
  code: string
  name: string
  currency: string
  priceAdjustmentPercent: number // e.g. 10 = +10% on international prices
  enabled: boolean
}

// Access — activity log
export interface StaffActivityEntry {
  id: ID
  at: string
  staffId: ID
  staffName: string
  action: string
  resource: string
  resourceId?: ID
}

// Orders — returns & edits (parity depth)
export interface ReturnLine {
  lineItemId: ID
  quantity: number
  exchangeForVariantId?: ID
}

export interface ReturnRecord {
  id: ID
  orderId: ID
  status: 'open' | 'returned' | 'cancelled'
  lines: ReturnLine[]
  reason: string
  restock: boolean
  refundAmount: number
  createdAt: string
  closedAt?: string
}

export interface OrderEditRecord {
  id: ID
  orderId: ID
  at: string
  author: string
  added: { variantId: ID; quantity: number }[]
  removed: { lineItemId: ID; quantity: number }[]
  deltaTotal: number
}

// Store plan
export interface StorePlan {
  name: string
  status: 'trial' | 'active'
  trialDaysLeft: number
  storeId: string
}

// Metaobjects (lite) — content entries
export interface MetaobjectDefinition {
  id: ID
  name: string
  fields: { key: string; label: string; type: MetafieldType }[]
}

export interface MetaobjectEntry {
  id: ID
  definitionId: ID
  fields: Record<string, string>
  status: 'published' | 'draft'
  updatedAt: string
}

// Discount combinations (parity)
export interface DiscountCombinations {
  orderDiscounts: boolean
  productDiscounts: boolean
  shippingDiscounts: boolean
}
