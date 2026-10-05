// ─── Domain model for the Northstar Goods admin ───────────────────────────
// Kept independent of UI so services can later be swapped for a real API.

export type ID = string

export type SalesChannel = 'online_store' | 'point_of_sale'
export const SALES_CHANNELS: { value: SalesChannel; label: string }[] = [
  { value: 'online_store', label: 'Online Store' },
  { value: 'point_of_sale', label: 'Point of Sale' },
]

export type ProductStatus = 'active' | 'draft' | 'archived'

export interface ProductOption {
  name: string
  values: string[]
}

export interface ProductVariant {
  id: ID
  productId: ID
  title: string // "Black / M" or "Default Title"
  sku: string
  barcode?: string
  price: number
  compareAtPrice?: number
  costPerItem?: number
  optionValues: Record<string, string> // option name -> value, e.g. { Color: 'Black' }
  weightGrams?: number
  imageId?: ID
  available: boolean
}

export interface ProductMedia {
  id: ID
  productId: ID
  type: 'image'
  src: string
  alt: string
}

export interface Product {
  id: ID
  title: string
  descriptionHtml: string
  vendor: string
  productType: string
  category?: string
  status: ProductStatus
  tags: string[]
  collectionIds: ID[]
  channels: SalesChannel[]
  options: ProductOption[]
  variants: ProductVariant[]
  media: ProductMedia[]
  seo: { title: string; description: string; handle: string }
  weightGrams?: number
  requiresShipping: boolean
  trackQuantity: boolean
  createdAt: string
  updatedAt: string
}

export interface Address {
  firstName: string
  lastName: string
  company?: string
  address1: string
  address2?: string
  city: string
  province: string
  country: string
  zip: string
  phone?: string
}

export type MarketingConsent = 'subscribed' | 'not_subscribed' | 'pending'

export interface Customer {
  id: ID
  firstName: string
  lastName: string
  email: string
  phone?: string
  defaultAddress?: Address
  addresses: Address[]
  tags: string[]
  note?: string
  emailMarketingConsent: MarketingConsent
  taxExempt: boolean
  createdAt: string
  lastOrderId?: ID
}

// ─── Orders ────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | 'paid'
  | 'pending'
  | 'authorized'
  | 'partially_refunded'
  | 'refunded'
  | 'voided'
  | 'unpaid'

export type FulfillmentStatus = 'fulfilled' | 'unfulfilled' | 'partial' | 'returned'
export type OrderStatus = 'open' | 'closed' | 'cancelled' | 'draft'
export type OrderChannel = 'Online Store' | 'Point of Sale'

export interface OrderLineItem {
  id: ID
  productId: ID
  variantId: ID
  title: string
  variantTitle: string
  sku: string
  quantity: number
  price: number
  totalDiscount: number
  requiresShipping: boolean
  imageSrc?: string
  restockedQty?: number
}

export type TimelineEventType =
  | 'created'
  | 'payment'
  | 'fulfillment'
  | 'refund'
  | 'cancel'
  | 'note'
  | 'tag'
  | 'edit'

export interface TimelineEvent {
  id: ID
  createdAt: string
  type: TimelineEventType
  message: string
  author: string
}

export interface FulfillmentEvent {
  id: ID
  status: string
  message?: string
  occurredAt: string
}

export interface Fulfillment {
  id: ID
  createdAt: string
  lineItemIds: ID[]
  trackingNumber?: string
  carrier?: string
  locationId: ID
  status: 'success' | 'canceled'
  events?: FulfillmentEvent[]
}

export interface Refund {
  id: ID
  createdAt: string
  amount: number
  reason: string
  lineItemIds: ID[]
  restock: boolean
}

export interface Order {
  id: ID
  name: string // "#1048"
  customerId: ID
  email: string
  phone?: string
  createdAt: string
  cancelledAt?: string
  closedAt?: string
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  status: OrderStatus
  channel: OrderChannel
  lineItems: OrderLineItem[]
  shippingAddress: Address
  billingAddress: Address
  shippingTitle: string
  shippingPrice: number
  discountCode?: { code: string; amount: number }
  subtotal: number
  taxTotal: number
  total: number
  currency: 'USD'
  tags: string[]
  note?: string
  timeline: TimelineEvent[]
  fulfillments: Fulfillment[]
  refunds: Refund[]
  paymentGateway: string
  giftCardCode?: string | null
  giftCardApplied?: number
  transactions?: OrderTransaction[]
  isDraft?: boolean
}

export interface OrderTransaction {
  id: string
  createdAt: string
  kind: 'SALE' | 'REFUND' | 'GIFT_CARD'
  amount: number
  fee: number
  net: number
  gateway: string
  description: string
}

// Abandoned checkout shares most order shape
export interface AbandonedCheckout {
  id: ID
  customerId: ID
  email: string
  createdAt: string
  lineItems: OrderLineItem[]
  total: number
  recoveryStatus: 'not_recovered' | 'recovered' | 'email_sent'
}

// ─── Collections ───────────────────────────────────────────────────────────

export type CollectionRuleColumn = 'tag' | 'title' | 'product_type' | 'vendor'
export type CollectionRuleRelation = 'equals' | 'contains' | 'starts_with'

export interface CollectionRule {
  column: CollectionRuleColumn
  relation: CollectionRuleRelation
  condition: string
}

export interface Collection {
  id: ID
  title: string
  descriptionHtml: string
  imageSrc?: string
  handle: string
  type: 'manual' | 'smart'
  rules: CollectionRule[]
  rulesMatch: 'all' | 'any'
  productIds: ID[]
  status: 'active' | 'draft'
  seoTitle?: string
  seoDescription?: string
  publishedAt?: string
  createdAt: string
}

// ─── Inventory ─────────────────────────────────────────────────────────────

export interface Location {
  id: ID
  name: string
  address1: string
  city: string
  province: string
  country: string
  zip: string
  phone?: string
  active: boolean
  createdAt: string
}

export interface InventoryLevel {
  variantId: ID
  locationId: ID
  available: number
  committed: number
  unavailable: number
}

export interface InventoryHistoryEntry {
  id: ID
  variantId: ID
  locationId: ID
  change: number
  resultingAvailable: number
  reason: string
  createdAt: string
  author: string
}

// ─── Discounts ─────────────────────────────────────────────────────────────

export type DiscountType = 'percentage' | 'fixed_amount' | 'free_shipping' | 'bxgy'
export type DiscountStatus = 'active' | 'scheduled' | 'expired' | 'draft'

export interface BxgyConfig {
  customerBuysQuantity: number
  customerBuysAmount?: number
  customerGetsQuantity: number
  customerGetsDiscountPercent: number
}

export interface Discount {
  id: ID
  code: string
  title: string
  type: DiscountType
  method: 'code' | 'automatic'
  value?: number // percentage (0-100) or fixed amount
  bxgy?: BxgyConfig
  minPurchase?: number
  customerEligibility: 'all' | 'email_subscribers'
  productEligibility: 'all' | 'specific'
  productIds: ID[]
  usageLimit?: number
  usedCount: number
  startsAt: string
  endsAt?: string
  status: DiscountStatus
  combinations?: {
    orderDiscounts: boolean
    productDiscounts: boolean
    shippingDiscounts: boolean
  }
}

// ─── Marketing ─────────────────────────────────────────────────────────────

export type CampaignChannel = 'email' | 'social' | 'search' | 'sms'
export type CampaignStatus = 'active' | 'completed' | 'scheduled' | 'draft'

export interface Campaign {
  id: ID
  name: string
  channel: CampaignChannel
  status: CampaignStatus
  sentAt?: string
  audience: number
  reached: number
  sessions: number
  orders: number
  revenue: number
  cost: number
}

// ─── Staff & permissions ───────────────────────────────────────────────────

export type PermissionResource = 'products' | 'orders' | 'customers' | 'analytics' | 'settings'
export const PERMISSION_RESOURCES: PermissionResource[] = [
  'products',
  'orders',
  'customers',
  'analytics',
  'settings',
]

export interface StaffMember {
  id: ID
  name: string
  email: string
  role: 'owner' | 'admin' | 'staff'
  status: 'active' | 'invited' | 'deactivated'
  lastActiveAt: string
  permissions: Record<PermissionResource, string[]>
}

// ─── Content / online store ────────────────────────────────────────────────

export interface StorePage {
  id: ID
  title: string
  contentHtml: string
  handle: string
  status: 'published' | 'draft'
  seoTitle?: string
  seoDescription?: string
  createdAt: string
  updatedAt: string
}

export interface BlogPost {
  id: ID
  title: string
  author: string
  excerpt: string
  contentHtml: string
  imageSrc?: string
  tags: string[]
  status: 'published' | 'draft' | 'scheduled'
  publishedAt?: string
}

export type FileAssetType = 'image' | 'document' | 'video'

export interface FileAsset {
  id: ID
  name: string
  type: FileAssetType
  src: string
  sizeKb: number
  dimensions?: { width: number; height: number }
  uploadedAt: string
  alt?: string
}

export interface MenuItem {
  id: ID
  title: string
  url: string
  children: MenuItem[]
}

export interface NavMenu {
  id: ID
  title: string
  handle: 'main-menu' | 'footer'
  items: MenuItem[]
}

export interface AppEntry {
  id: ID
  name: string
  description: string
  iconBg: string
  iconChar: string
  status: 'installed' | 'disabled'
  permissions: string[]
  category: string
}

export interface ThemeSettings {
  activeTheme: string
  colors: { primary: string; background: string; text: string; accent: string }
  typography: { headingFont: string; bodyFont: string; baseSize: number }
  productGridColumns: 2 | 3 | 4
  showVendor: boolean
  showQuantitySelector: boolean
}

// ─── Settings ──────────────────────────────────────────────────────────────

export interface PaymentProvider {
  id: string
  provider: string
  enabled: boolean
  testMode: boolean
}

export interface ShippingRate {
  id: string
  name: string
  regions: string
  rate: number
  freeOver?: number
}

export interface StoreSettings {
  storeName: string
  legalName: string
  email: string
  phone: string
  storeAddress: Address
  currency: string
  timezone: string
  unitSystem: 'metric' | 'imperial'
  weightUnit: 'kg' | 'lb'
  orderPrefix: string
  checkout: {
    customerAccounts: 'disabled' | 'optional' | 'required'
    emailReceipts: boolean
    tipLine: boolean
    abandonedRecovery: boolean
  }
  payments: PaymentProvider[]
  shipping: ShippingRate[]
  taxes: { chargeTaxOnShipping: boolean; includeTaxInPrices: boolean; taxRate: number }
  policies: { refund: string; privacy: string; terms: string; shipping: string; subscriber: string }
  notifications: {
    orderConfirmation: boolean
    shippingConfirmation: boolean
    abandonedCheckout: boolean
    customerWelcome: boolean
  }
  pageTitle?: string
  metaDescription?: string
  passwordProtected?: boolean
  payouts?: { schedule: string; dayOfWeek?: string }
  domains?: StoreDomain[]
}

// ─── Notifications & tasks ─────────────────────────────────────────────────

export interface AdminNotification {
  id: ID
  kind: 'info' | 'warning' | 'critical'
  title: string
  body: string
  createdAt: string
  read: boolean
  link?: string
}

export interface TaskItem {
  id: ID
  title: string
  description: string
  done: boolean
  link?: string
}

// ─── B2B price lists, saved searches, domains, analytics (parity) ──────────

export interface PriceListEntry {
  id: ID
  variantId: ID
  price: number
}

export interface PriceList {
  id: ID
  name: string
  currency: string
  companyId?: ID
  locationId?: ID
  parentCompanyId: ID
  entries: PriceListEntry[]
  createdAt: string
  updatedAt: string
}

export interface SavedSearch {
  id: ID
  name: string
  resourceType: string
  query: string
  createdAt: string
}

export interface StoreDomain {
  host: string
  primary: boolean
  sslEnabled: boolean
  verificationStatus: string
  createdAt: string
}

export interface AnalyticsTopProduct {
  productId: ID
  title: string
  units: number
  revenue: number
}

export interface AnalyticsSummary {
  from: string
  to: string
  grossSales: number
  discounts: number
  refunds: number
  netSales: number
  shipping: number
  taxes: number
  giftCardSales: number
  ordersCount: number
  avgOrderValue: number
  returningCustomerRate: number
  topProducts: AnalyticsTopProduct[]
}
