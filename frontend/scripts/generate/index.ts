/**
 * Deterministic seed-data generator for the Northstar Goods demo store.
 * Run: npm run seed:generate   → writes src/data/*.json + public/images/**
 * Cross-references are guaranteed: orders→customers/variants, inventory→variants×locations.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Rng } from '../../src/lib/rng'
import {
  FAMILIES, VENDORS, FIRST_NAMES, LAST_NAMES, CITIES, STREETS, LOCATION_DEFS,
  PAYMENT_GATEWAYS, CARRIERS, CUSTOMER_TAGS_POOL,
} from './pools'
import { productImage, collectionImage, blogImage, bannerImage, writeArt } from './svg'
import type {
  Product, ProductVariant, ProductMedia, Customer, Address, Order, OrderLineItem,
  TimelineEvent, Collection, Location, InventoryLevel, InventoryHistoryEntry, Discount,
  Campaign, StaffMember, StorePage, BlogPost, FileAsset, NavMenu, AppEntry, StoreSettings,
  AdminNotification, TaskItem, AbandonedCheckout, ThemeSettings, Fulfillment, Refund,
  PaymentStatus, FulfillmentStatus,
} from '../../src/types'

const here = fileURLToPath(import.meta.url)
const DATA = join(here, '..', '..', '..', 'src', 'data')
const rng = new Rng(1337)

// create output dirs up front — image writers depend on them
writeArt()

const iso = (d: Date) => d.toISOString()
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000)
const round2 = (n: number) => Math.round(n * 100) / 100

// ─── 1. Products + variants + media ───────────────────────────────────────

const products: Product[] = []
const allVariants: ProductVariant[] = []

const SKU_ROOT: Record<string, string> = {}
FAMILIES.forEach((f, i) => {
  SKU_ROOT[f.slug] = f.slug.split('-').map((w) => w[0]).join('').toUpperCase().slice(0, 3) + (10 + i)
})

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const COLOR_WORDS = ['Black', 'White', 'Navy', 'Olive', 'Charcoal', 'Oatmeal', 'Forest', 'Dusty Rose', 'Field Green', 'Tan', 'Slate', 'Sand', 'Cream', 'Ink Blue', 'Sage', 'Clay', 'Chestnut', 'Sky', 'Terracotta', 'Moss', 'Graphite', 'Blush', 'Brushed Steel', 'Matte Black', 'Juniper', 'Sandstone', 'Rust', 'Mustard', 'Heather Grey', 'Storm Blue', 'Highlight Yellow', 'Aged Brass', 'Natural', 'Khaki', 'Oat', 'Scratch Stripe']

function colorSlug(c: string): string {
  return c.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 4)
}

FAMILIES.forEach((f) => {
  const id = `p_${f.slug}`
  const createdAt = iso(daysAgo(rng.int(120, 700)))
  const media: ProductMedia[] = []
  const mainSrc = productImage(f.slug)
  media.push({ id: `m_${f.slug}_1`, productId: id, type: 'image', src: mainSrc, alt: f.title })
  media.push({ id: `m_${f.slug}_2`, productId: id, type: 'image', src: productImage(`${f.slug}-alt`), alt: `${f.title} detail` })

  const options: { name: string; values: string[] }[] = []
  const colorCount = f.colorCount ?? f.colors?.length ?? 0
  if (colorCount > 0) options.push({ name: 'Color', values: f.colors!.slice(0, colorCount) })
  if (f.sizes) options.push({ name: 'Size', values: f.sizes })

  const variants: ProductVariant[] = []
  const combos: Record<string, string>[] = []
  if (options.length === 0) {
    combos.push({})
  } else if (options.length === 1) {
    options[0]!.values.forEach((v) => combos.push({ [options[0]!.name]: v }))
  } else {
    for (const c of options[0]!.values) for (const s of options[1]!.values) combos.push({ [options[0]!.name]: c, [options[1]!.name]: s })
  }

  combos.forEach((ov, i) => {
    const title = Object.entries(ov).map(([, v]) => v).join(' / ') || 'Default Title'
    const skuParts = [SKU_ROOT[f.slug]!, ...Object.values(ov).map(colorSlug)].join('-').toUpperCase()
    const vid = `${id}_v${i + 1}`
    const variant: ProductVariant = {
      id: vid,
      productId: id,
      title,
      sku: skuParts,
      barcode: `084${rng.int(1000000000, 9999999999)}`,
      price: f.price,
      compareAtPrice: f.compareAt,
      costPerItem: f.cost,
      optionValues: ov,
      imageId: media[0]!.id,
      requiresShipping: f.requiresShipping ?? true,
      tracked: f.trackQuantity ?? true,
      weightGrams: f.weight,
      available: true,
    }
    variants.push(variant)
    allVariants.push(variant)
  })

  products.push({
    id,
    title: f.title,
    descriptionHtml: f.description,
    vendor: f.vendor,
    productType: f.type,
    category: f.category,
    status: rng.weighted<ProductStatusTuple>([['active', 78], ['draft', 12], ['archived', 10]]) as Product['status'],
    tags: rng.sample([...f.tags, ...['staff-pick', 'sustainable', 'new-arrival', 'limited']], rng.int(2, 4)).filter((t, ix, a) => a.indexOf(t) === ix),
    collectionIds: [], // filled after collections
    channels: rng.weighted<string>([['online_store', 9], ['both', 3]]) === 'both'
      ? (['online_store', 'point_of_sale'] as Product['channels'])
      : (['online_store'] as Product['channels']),
    options,
    variants,
    media,
    seo: { title: f.title, description: f.description.replace(/<[^>]+>/g, '').slice(0, 150), handle: f.slug },
    weightGrams: f.weight,
    requiresShipping: f.requiresShipping ?? true,
    trackQuantity: f.trackQuantity ?? true,
    createdAt,
    updatedAt: iso(rng.dateWithin(40, true)),
  })
})

type ProductStatusTuple = 'active' | 'draft' | 'archived'
type channelsTuple = 'online_store' | 'point_of_sale' | 'both'

// A couple of true multi-image products get a 3rd shot
products.filter((_, i) => i % 5 === 0).forEach((p) => {
  p.media.push({
    id: `${p.id}_m3`,
    productId: p.id,
    type: 'image',
    src: productImage(`${p.id}-3`),
    alt: `${p.title} lifestyle`,
  })
})

// ─── 2. Locations ──────────────────────────────────────────────────────────

const locations: Location[] = LOCATION_DEFS.map((l, i) => ({
  id: `loc_${i + 1}`,
  name: l.name,
  address1: l.address1,
  city: l.city,
  province: l.province,
  country: 'United States',
  zip: l.zip,
  phone: l.phone,
  active: true,
  createdAt: iso(daysAgo(700 - i * 30)),
}))

// ─── 3. Customers ──────────────────────────────────────────────────────────

const customers: Customer[] = []
const usedEmails = new Set<string>(['ava@northstargoods.com'])

function makeAddress(r: Rng, firstName: string, lastName: string): Address {
  const c = r.pick(CITIES)
  return {
    firstName, lastName,
    address1: `${r.int(12, 9800)} ${r.pick(STREETS)}`,
    city: c.city, province: c.province, country: c.country, zip: c.zip,
    phone: `(${r.int(201, 989)}) 555-${String(r.int(100, 9999)).padStart(4, '0')}`,
  }
}

for (let i = 0; i < 62; i++) {
  const first = rng.pick(FIRST_NAMES)
  const last = rng.pick(LAST_NAMES)
  let email = `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}@example.com`
  while (usedEmails.has(email)) email = `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}${i}@example.com`
  usedEmails.add(email)
  const addr = makeAddress(rng, first, last)
  customers.push({
    id: `c_${100 + i}`,
    firstName: first,
    lastName: last,
    email,
    phone: addr.phone,
    defaultAddress: addr,
    addresses: [addr],
    tags: rng.chance(0.45) ? rng.sample(CUSTOMER_TAGS_POOL, rng.int(1, 2)) : [],
    note: rng.chance(0.12) ? rng.pick([
      'Prefers email contact. Repeat wholesale buyer.',
      'Asked to be notified when restocks land.',
      'VIP — prioritize fulfillment during holiday season.',
      'Local pickup preferred at Portland Flagship.',
    ]) : undefined,
    emailMarketingConsent: rng.weighted<MarketingConsentTuple>([['subscribed', 6], ['not_subscribed', 3], ['pending', 1]]),
    taxExempt: rng.chance(0.05),
    createdAt: iso(daysAgo(rng.int(10, 720))),
  })
}
type MarketingConsentTuple = 'subscribed' | 'not_subscribed' | 'pending'

// ─── 4. Orders (line items reference real variants) ───────────────────────

const orders: Order[] = []
const abandoned: AbandonedCheckout[] = []
const TAX_RATE = 0.08
let orderSeq = 1001

// customer creation dates must precede order dates
const customersSorted = [...customers].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

interface OrderSeed { customer: Customer; date: Date; kind: 'standard' | 'draft' | 'abandoned' }

const seeds: OrderSeed[] = []
// 120 real orders over 90 days, recent-skewed
for (let i = 0; i < 122; i++) {
  const cust = rng.pick(customersSorted)
  const created = new Date(cust.createdAt)
  created.setDate(created.getDate() + 1)
  const date = rng.dateBetween(created, new Date())
  seeds.push({ customer: cust, date, kind: 'standard' })
}
seeds.sort((a, b) => a.date.getTime() - b.date.getTime())

const fulfillableVariants = allVariants.filter((v) => {
  const p = products.find((pp) => pp.id === v.productId)!
  return p.status !== 'draft'
})

function makeLineItems(count: number): OrderLineItem[] {
  const chosen = rng.sample(fulfillableVariants, count)
  return chosen.map((v) => {
    const prod = products.find((p) => p.id === v.productId)!
    const qty = rng.weighted([[1, 6], [2, 2.4], [3, 1], [4, 0.5]])
    const discount = rng.chance(0.18) ? round2(v.price * qty * (rng.pick([0.1, 0.15, 0.2]))) : 0
    return {
      id: `li_${uid6()}`,
      productId: prod.id,
      variantId: v.id,
      title: prod.title,
      variantTitle: v.title === 'Default Title' ? '' : v.title,
      sku: v.sku,
      quantity: qty,
      price: v.price,
      totalDiscount: discount,
      requiresShipping: prod.requiresShipping,
      imageSrc: prod.media[0]?.src,
    }
  })
}

let uidCounter = 0
function uid6(): string {
  return (++uidCounter).toString(36) + Math.floor(rng.float(0, 46655)).toString(36).padStart(3, '0')
}

function pickStatus(r: Rng): { paymentStatus: PaymentStatus; fulfillmentStatus: FulfillmentStatus; status: Order['status'] } {
  const w = r.weighted<string>([
    ['paid_fulfilled', 52], ['paid_unfulfilled', 13], ['paid_partial', 6],
    ['pending', 11], ['refunded', 7], ['partially_refunded', 5], ['cancelled', 6],
  ])
  switch (w) {
    case 'paid_fulfilled': return { paymentStatus: 'paid', fulfillmentStatus: 'fulfilled', status: 'closed' }
    case 'paid_unfulfilled': return { paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled', status: 'open' }
    case 'paid_partial': return { paymentStatus: 'paid', fulfillmentStatus: 'partial', status: 'open' }
    case 'pending': return { paymentStatus: 'pending', fulfillmentStatus: 'unfulfilled', status: 'open' }
    case 'refunded': return { paymentStatus: 'refunded', fulfillmentStatus: 'returned', status: 'closed' }
    case 'partially_refunded': return { paymentStatus: 'partially_refunded', fulfillmentStatus: r.chance(0.5) ? 'fulfilled' : 'partial', status: 'open' }
    default: return { paymentStatus: 'voided', fulfillmentStatus: 'unfulfilled', status: 'cancelled' }
  }
}

function timeline(created: Date, kind: ReturnType<typeof pickStatus>, total: number, author: string, r: Rng): TimelineEvent[] {
  const events: TimelineEvent[] = [{
    id: `ev_${uid6()}`, createdAt: iso(created), type: 'created',
    message: `Order placed by customer from ${'Online Store'}`, author: 'Northstar Goods',
  }]
  if (kind.paymentStatus === 'paid' || kind.paymentStatus === 'partially_refunded') {
    events.push({
      id: `ev_${uid6()}`, createdAt: iso(new Date(created.getTime() + r.int(20, 300) * 1000)), type: 'payment',
      message: `Payment of $${total.toFixed(2)} captured via Shopify Payments`, author: 'Northstar Goods',
    })
  }
  if (kind.fulfillmentStatus === 'fulfilled' || kind.fulfillmentStatus === 'partial') {
    events.push({
      id: `ev_${uid6()}`, createdAt: iso(new Date(created.getTime() + r.int(2, 40) * 3600_000)), type: 'fulfillment',
      message: kind.fulfillmentStatus === 'fulfilled' ? 'All items fulfilled' : 'Some items fulfilled',
      author: r.pick(['Ava Chen', 'Noah Kim', 'Maya Patel']),
    })
  }
  if (kind.paymentStatus === 'refunded' || kind.paymentStatus === 'partially_refunded') {
    events.push({
      id: `ev_${uid6()}`, createdAt: iso(new Date(created.getTime() + r.int(1, 10) * 86400_000)), type: 'refund',
      message: `Refund issued (${kind.paymentStatus === 'refunded' ? 'full' : 'partial'})`, author: 'Ava Chen',
    })
  }
  if (kind.status === 'cancelled') {
    events.push({
      id: `ev_${uid6()}`, createdAt: iso(new Date(created.getTime() + r.int(1, 24) * 3600_000)), type: 'cancel',
      message: 'Order cancelled by staff', author: 'Noah Kim',
    })
  }
  return events
}

const ORDER_TAGS = ['priority', 'wholesale', 'gift', 'subscription', 'holiday-2025']

for (const seed of seeds) {
  const kind = pickStatus(rng)
  const items = makeLineItems(rng.weighted([[1, 5], [2, 2.6], [3, 1.2], [4, 0.5]]))
  const subtotal = round2(items.reduce((s, li) => s + li.price * li.quantity - li.totalDiscount, 0))
  const channel = rng.weighted<'Online Store' | 'Point of Sale'>([['Online Store', 9], ['Point of Sale', 2]])
  const shippingPrice = channel === 'Point of Sale' ? 0 : subtotal >= 75 ? 0 : round2(rng.pick([4.99, 6.99, 8.99]))
  const shippingTitle = channel === 'Point of Sale' ? 'In-store pickup' : shippingPrice === 0 ? 'Free shipping' : 'Standard shipping'
  const discountCode = rng.chance(0.2) ? { code: rng.pick(['WELCOME10', 'SAVE15', 'FREESHIP']), amount: round2(subtotal * 0.1) } : undefined
  const taxTotal = round2((subtotal - (discountCode?.amount ?? 0)) * TAX_RATE)
  const total = round2(subtotal - (discountCode?.amount ?? 0) + shippingPrice + taxTotal)
  const addr = seed.customer.defaultAddress!
  const createdAt = seed.date

  const fulfillments: Fulfillment[] = []
  if (kind.fulfillmentStatus === 'fulfilled' || kind.fulfillmentStatus === 'partial') {
    const fulfilledItems = kind.fulfillmentStatus === 'fulfilled' ? items : items.slice(0, Math.max(1, Math.floor(items.length / 2)))
    fulfillments.push({
      id: `ff_${uid6()}`,
      createdAt: iso(new Date(createdAt.getTime() + rng.int(2, 40) * 3600_000)),
      lineItemIds: fulfilledItems.map((li) => li.id),
      trackingNumber: rng.chance(0.8) ? `1Z${rng.int(100, 999)}AA${rng.int(100000000, 999999999)}` : undefined,
      carrier: rng.pick(CARRIERS),
      locationId: rng.pick(locations.slice(0, 4)).id,
      status: 'success',
    })
  }
  const refunds: Refund[] = []
  if (kind.paymentStatus === 'refunded') {
    refunds.push({ id: `rf_${uid6()}`, createdAt: iso(new Date(createdAt.getTime() + rng.int(1, 10) * 86400_000)), amount: total, reason: rng.pick(['customer', 'damaged', 'wrong_item']), lineItemIds: items.map((li) => li.id), restock: rng.chance(0.6) })
  } else if (kind.paymentStatus === 'partially_refunded') {
    refunds.push({ id: `rf_${uid6()}`, createdAt: iso(new Date(createdAt.getTime() + rng.int(1, 10) * 86400_000)), amount: round2(total * rng.float(0.2, 0.6)), reason: 'customer', lineItemIds: items.slice(0, 1).map((li) => li.id), restock: true })
  }

  orders.push({
    id: `o_${orderSeq}`,
    name: `#${orderSeq}`,
    customerId: seed.customer.id,
    email: seed.customer.email,
    phone: seed.customer.phone,
    createdAt: iso(createdAt),
    cancelledAt: kind.status === 'cancelled' ? iso(new Date(createdAt.getTime() + 3600_000)) : undefined,
    closedAt: kind.status === 'closed' ? iso(new Date(createdAt.getTime() + 2 * 86400_000)) : undefined,
    paymentStatus: kind.paymentStatus,
    fulfillmentStatus: kind.fulfillmentStatus,
    status: kind.status,
    channel,
    lineItems: items,
    shippingAddress: addr,
    billingAddress: addr,
    shippingTitle,
    shippingPrice,
    discountCode,
    subtotal,
    taxTotal,
    total,
    currency: 'USD',
    tags: rng.chance(0.25) ? rng.sample(ORDER_TAGS, rng.int(1, 2)) : [],
    note: rng.chance(0.1) ? rng.pick(['Please leave package at side door.', 'Gift — include receipt without prices.', 'Customer called about delivery window.']) : undefined,
    timeline: timeline(createdAt, kind, total, 'Northstar Goods', rng),
    fulfillments,
    refunds,
    paymentGateway: rng.weighted(PAYMENT_GATEWAYS.map((g) => [g, g === 'Shopify Payments' ? 7 : 2] as [string, number])),
  })
  orderSeq++
}

// 8 draft orders
for (let i = 0; i < 8; i++) {
  const cust = rng.pick(customersSorted)
  const items = makeLineItems(rng.int(1, 3))
  const subtotal = round2(items.reduce((s, li) => s + li.price * li.quantity, 0))
  orders.push({
    id: `o_draft${i + 1}`,
    name: `#D${1000 + i}`,
    customerId: cust.id,
    email: cust.email,
    createdAt: iso(rng.dateWithin(20, true)),
    paymentStatus: 'unpaid',
    fulfillmentStatus: 'unfulfilled',
    status: 'draft',
    channel: 'Online Store',
    lineItems: items,
    shippingAddress: cust.defaultAddress!,
    billingAddress: cust.defaultAddress!,
    shippingTitle: 'Standard shipping',
    shippingPrice: 6.99,
    subtotal,
    taxTotal: round2(subtotal * TAX_RATE),
    total: round2(subtotal * (1 + TAX_RATE) + 6.99),
    currency: 'USD',
    tags: [],
    timeline: [{ id: `ev_${uid6()}`, createdAt: iso(rng.dateWithin(20, true)), type: 'created', message: 'Draft order created', author: 'Ava Chen' }],
    fulfillments: [],
    refunds: [],
    paymentGateway: 'Shopify Payments',
    isDraft: true,
  })
}

// 12 abandoned checkouts
for (let i = 0; i < 12; i++) {
  const cust = rng.pick(customersSorted)
  const items = makeLineItems(rng.int(1, 2))
  const subtotal = round2(items.reduce((s, li) => s + li.price * li.quantity, 0))
  abandoned.push({
    id: `ab_${i + 1}`,
    customerId: cust.id,
    email: cust.email,
    createdAt: iso(rng.dateWithin(30, true)),
    lineItems: items,
    total: round2(subtotal * (1 + TAX_RATE)),
    recoveryStatus: rng.weighted([['not_recovered', 6], ['email_sent', 3], ['recovered', 1]]),
  })
}

// ─── 5. Inventory (variants × locations, honoring order states) ───────────

const inventoryLevels: InventoryLevel[] = []
const inventoryHistory: InventoryHistoryEntry[] = []
const fulfillmentLocations = locations.slice(0, 4)

for (const v of allVariants) {
  const product = products.find((p) => p.id === v.productId)!
  if (!product.trackQuantity) continue // digital products carry no stock rows
  const stockedAt = [fulfillmentLocations[0]!, rng.chance(0.55) ? rng.pick(fulfillmentLocations.slice(1)) : null].filter(Boolean) as Location[]
  for (const loc of stockedAt) {
    inventoryLevels.push({
      variantId: v.id, locationId: loc.id,
      available: rng.weighted([[rng.int(0, 8), 2], [rng.int(9, 60), 8]]),
      committed: 0, unavailable: 0,
    })
  }
}
// Apply inventory semantics: placing an order moves units available→committed;
// fulfilling them ships them (on-hand drops); returns restock available.
for (const order of orders) {
  if (order.status === 'draft') continue
  for (const li of order.lineItems) {
    const level = inventoryLevels.find((l) => l.variantId === li.variantId)
    if (!level) continue
    if (order.status === 'cancelled') continue
    if (order.fulfillmentStatus === 'fulfilled') {
      level.available = Math.max(0, level.available - li.quantity)
    } else if (order.fulfillmentStatus === 'unfulfilled' || order.fulfillmentStatus === 'partial') {
      const committedQty = order.fulfillmentStatus === 'partial' ? Math.max(1, li.quantity - 1) : li.quantity
      level.available = Math.max(0, level.available - committedQty)
      level.committed += committedQty
      if (order.paymentStatus === 'pending') level.unavailable += Math.max(0, li.quantity - committedQty)
    } else if (order.fulfillmentStatus === 'returned') {
      level.available += li.quantity
    }
  }
}
// Some history entries
for (let i = 0; i < 40; i++) {
  const level = rng.pick(inventoryLevels)
  const change = rng.pick([10, 20, 25, -5, -10, 50])
  inventoryHistory.push({
    id: `ih_${i + 1}`,
    variantId: level.variantId,
    locationId: level.locationId,
    change,
    resultingAvailable: Math.max(0, level.available + change),
    reason: rng.pick(['Received stock', 'Cycle count correction', 'Opening stock', 'Damage adjustment', 'Manual adjustment']),
    createdAt: iso(rng.dateWithin(60, true)),
    author: rng.pick(['Ava Chen', 'Noah Kim', 'Maya Patel']),
  })
}

// ─── 6. Collections ───────────────────────────────────────────────────────

const collectionDefs: { title: string; type: 'manual' | 'smart'; rule?: Collection['rules']; match?: 'all' | 'any'; desc: string }[] = [
  { title: 'New Arrivals', type: 'smart', rule: [{ column: 'tag', relation: 'equals', condition: 'new-arrival' }], desc: 'The latest additions to the Northstar shelf.' },
  { title: 'Bestsellers', type: 'smart', rule: [{ column: 'tag', relation: 'equals', condition: 'bestseller' }], desc: 'What everyone is taking home.' },
  { title: 'Apparel', type: 'smart', rule: [{ column: 'product_type', relation: 'equals', condition: 'Apparel' }], desc: 'Everyday clothing, built to last.' },
  { title: 'Home Goods', type: 'manual', desc: 'Objects for a warmer home — ceramics, textiles, and light.' },
  { title: 'Outdoor & Travel', type: 'smart', rule: [{ column: 'tag', relation: 'equals', condition: 'outdoor' }, { column: 'tag', relation: 'equals', condition: 'travel' }], match: 'any', desc: 'Gear for the trail, the commute, and the red-eye.' },
  { title: 'Kitchen & Dining', type: 'smart', rule: [{ column: 'product_type', relation: 'equals', condition: 'Kitchen' }], desc: 'Tools and tableware for slow mornings.' },
  { title: 'Gift Guide', type: 'smart', rule: [{ column: 'tag', relation: 'equals', condition: 'gift' }], desc: 'Hand-picked gifts under $100.' },
  { title: 'Leather Goods', type: 'smart', rule: [{ column: 'tag', relation: 'equals', condition: 'leather' }], desc: 'Vegetable-tanned pieces that age well.' },
  { title: 'Made in Portland', type: 'manual', desc: 'Designed and finished in our Portland workshop.' },
  { title: 'Office & Desk', type: 'manual', desc: 'Upgrade the nine-to-five surface.' },
  { title: 'Stationery', type: 'smart', rule: [{ column: 'product_type', relation: 'equals', condition: 'Stationery' }], desc: 'Paper goods worth writing on.' },
  { title: 'Archive Sale', type: 'manual', desc: 'Final markdowns — while stock lasts.', },
]

const collections: Collection[] = collectionDefs.map((def, i) => {
  const handle = slugify(def.title)
  let productIds: string[] = []
  if (def.type === 'manual') {
    productIds = rng.sample(products.filter((p) => p.status === 'active').map((p) => p.id), rng.int(4, 10))
  } else {
    productIds = products.filter((p) => {
      const matches = def.rule!.map((r) => {
        const val = r.column === 'tag' ? p.tags.join('|') : r.column === 'title' ? p.title : r.column === 'product_type' ? p.productType : p.vendor
        const needle = r.condition.toLowerCase()
        if (r.relation === 'equals') return val.toLowerCase() === needle || val.split('|').includes(r.condition)
        if (r.relation === 'contains') return val.toLowerCase().includes(needle)
        return val.toLowerCase().startsWith(needle)
      })
      return (def.match ?? 'all') === 'all' ? matches.every(Boolean) : matches.some(Boolean)
    }).map((p) => p.id)
  }
  return {
    id: `col_${i + 1}`,
    title: def.title,
    descriptionHtml: `<p>${def.desc}</p>`,
    imageSrc: collectionImage(handle),
    handle,
    type: def.type,
    rules: def.rule ?? [],
    rulesMatch: def.match ?? 'all',
    productIds,
    status: 'active',
    publishedAt: iso(daysAgo(rng.int(30, 300))),
    createdAt: iso(daysAgo(rng.int(60, 500))),
    seoTitle: def.title,
    seoDescription: def.desc,
  }
})

// link products back to collections
for (const col of collections) {
  for (const pid of col.productIds) {
    const p = products.find((pp) => pp.id === pid)!
    if (!p.collectionIds.includes(col.id)) p.collectionIds.push(col.id)
  }
}

// ─── 7. Discounts ──────────────────────────────────────────────────────────

const discountDefs: Partial<Discount>[] = [
  { code: 'WELCOME10', title: 'Welcome offer', type: 'percentage', value: 10, minPurchase: 30 },
  { code: 'SAVE15', title: 'Fifteen off', type: 'fixed_amount', value: 15, minPurchase: 75 },
  { code: 'FREESHIP', title: 'Free shipping October', type: 'free_shipping', minPurchase: 50 },
  { code: 'BOGO-MUG', title: 'Buy a mug get one half off', type: 'bxgy' },
  { code: 'VIP20', title: 'VIP early access', type: 'percentage', value: 20, minPurchase: 100 },
  { code: 'NEWSLETTER5', title: 'Newsletter signup reward', type: 'fixed_amount', value: 5 },
  { code: 'HOLIDAY25', title: 'Holiday 2025 teaser', type: 'percentage', value: 25, minPurchase: 150 },
  { code: 'BACKPACK-BUNDLE', title: 'Backpack bundle deal', type: 'bxgy' },
  { code: 'SOCK3PACK', title: 'Socks trio saver', type: 'percentage', value: 12, minPurchase: 30 },
  { code: 'AUTUMN10', title: 'Autumn app-exclusive', type: 'percentage', value: 10 },
  { code: 'JOURNAL5', title: 'Journal reader offer', type: 'fixed_amount', value: 5, minPurchase: 25 },
  { code: 'GIFTSHIP', title: 'Free gift shipping', type: 'free_shipping' },
  { code: 'TEES2FOR30', title: 'Two tees for $30 logic test', type: 'bxgy' },
  { code: 'LOCALPICKUP5', title: 'Local pickup thanks-you', type: 'fixed_amount', value: 5 },
  { code: 'ANNIVERSARY30', title: 'Store anniversary — 30% weekend', type: 'percentage', value: 30, minPurchase: 200 },
  { code: 'RETURNING15', title: 'We-miss-you offer', type: 'percentage', value: 15, minPurchase: 60 },
]

const discounts: Discount[] = discountDefs.map((d, i) => {
  const startsAt = iso(daysAgo(rng.int(5, 90)))
  const status = rng.weighted<Discount['status']>([['active', 7], ['scheduled', 3], ['expired', 3], ['draft', 2]])
  return {
    id: `disc_${i + 1}`,
    code: d.code!,
    title: d.title!,
    type: d.type!,
    method: i === 0 ? 'automatic' : rng.weighted([['code', 8], ['automatic', 2]]),
    value: d.value,
    bxgy: d.type === 'bxgy'
      ? { customerBuysQuantity: 1, customerBuysAmount: d.code === 'BOGO-MUG' ? 18 : 68, customerGetsQuantity: 1, customerGetsDiscountPercent: 50 }
      : undefined,
    minPurchase: d.minPurchase,
    customerEligibility: d.code === 'VIP20' ? 'email_subscribers' : 'all',
    productEligibility: d.type === 'bxgy' ? 'specific' : 'all',
    productIds: d.type === 'bxgy' ? rng.sample(products, 4).map((p) => p.id) : [],
    usageLimit: rng.chance(0.4) ? rng.pick([100, 250, 500]) : undefined,
    usedCount: status === 'active' || status === 'expired' ? rng.int(3, 90) : 0,
    startsAt,
    endsAt: status === 'scheduled' ? iso(daysAgo(-rng.int(10, 45))) : status === 'expired' ? iso(daysAgo(rng.int(1, 5))) : rng.chance(0.5) ? iso(daysAgo(-rng.int(20, 90))) : undefined,
    status,
  } as Discount
})

// ─── 8. Marketing campaigns ───────────────────────────────────────────────

const campaignDefs = [
  ['Spring Refresh Email', 'email', 'completed'], ['Tote Bag Launch — Instagram', 'social', 'completed'],
  ['Google Search — Always On', 'search', 'active'], ['Abandoned Cart Recovery', 'email', 'active'],
  ['Summer Solstice Promo', 'email', 'completed'], ['New Mover Postcards', 'sms', 'completed'],
  ['Fall Lookbook Teaser', 'social', 'scheduled'], ['Back-to-School Push', 'email', 'completed'],
  ['Retargeting — Display', 'search', 'active'], ['Birthday Reward SMS', 'sms', 'active'],
  ['Holiday Gift Guide', 'email', 'draft'], ['Influencer Collab — Trailhead', 'social', 'active'],
] as const

const campaigns: Campaign[] = campaignDefs.map(([name, channel, status], i) => {
  const audience = rng.int(800, 42000)
  const reached = Math.round(audience * rng.float(0.5, 0.95))
  const sessions = Math.round(reached * rng.float(0.04, 0.3))
  const ordersCount = Math.round(sessions * rng.float(0.01, 0.09))
  const revenue = round2(ordersCount * rng.float(38, 130))
  const cost = round2(revenue / rng.float(1.4, 6.2))
  return {
    id: `camp_${i + 1}`, name, channel, status: status as Campaign['status'],
    sentAt: status === 'draft' || status === 'scheduled' ? undefined : iso(rng.dateWithin(90, true)),
    audience, reached, sessions, orders: ordersCount, revenue, cost,
  }
})

// ─── 9. Staff ──────────────────────────────────────────────────────────────

const staffDefs = [
  ['Ava Chen', 'ava@northstargoods.com', 'owner', 'active'],
  ['Noah Kim', 'noah@northstargoods.com', 'admin', 'active'],
  ['Maya Patel', 'maya@northstargoods.com', 'staff', 'active'],
  ['Leo Fischer', 'leo@northstargoods.com', 'staff', 'active'],
  ['Sofia Marino', 'sofia@northstargoods.com', 'staff', 'active'],
  ['Elias Warner', 'elias@northstargoods.com', 'staff', 'invited'],
  ['Priya Nair', 'priya@northstargoods.com', 'staff', 'active'],
  ['Omar Haddad', 'omar@northstargoods.com', 'staff', 'deactivated'],
  ['June Park', 'june@northstargoods.com', 'staff', 'active'],
  ['Ruby Osei', 'ruby@northstargoods.com', 'staff', 'invited'],
  ['Kenji Sato', 'kenji@northstargoods.com', 'staff', 'active'],
] as const

const staff: StaffMember[] = staffDefs.map(([name, email, role, status], i) => ({
  id: i === 0 ? 'staff_owner' : `staff_${i}`,
  name, email, role: role as StaffMember['role'], status: status as StaffMember['status'],
  lastActiveAt: status === 'invited' ? '' : iso(rng.dateWithin(status === 'deactivated' ? 90 : 7, true)),
  permissions: role === 'owner'
    ? { products: ['view', 'create', 'edit', 'delete'], orders: ['view', 'edit', 'refund', 'cancel'], customers: ['view', 'edit', 'delete'], analytics: ['view'], settings: ['view', 'edit'] }
    : role === 'admin'
      ? { products: ['view', 'create', 'edit', 'delete'], orders: ['view', 'edit', 'refund', 'cancel'], customers: ['view', 'edit'], analytics: ['view'], settings: ['view'] }
      : { products: ['view', 'edit'], orders: ['view', 'edit', 'refund'], customers: ['view'], analytics: rng.chance(0.6) ? ['view'] : [], settings: [] },
}))

// ─── 10. Content: pages, blog, files ──────────────────────────────────────

const pageDefs = [
  ['About Northstar', 'about', '<p>Northstar Goods started in a Portland garage in 2018 with one product: a waxed canvas tote. Today we make and curate everyday objects that are built to be kept.</p><p>Every product we sell is chosen for durability, repairability, and quiet good looks.</p>'],
  ['Contact Us', 'contact', '<p>Questions, wholesale, press? Email <strong>hello@northstargoods.com</strong> and we answer within one business day.</p><p>Our studio: 4218 Alder St, Portland OR.</p>'],
  ['FAQ', 'faq', '<h3>How long does shipping take?</h3><p>Domestic orders ship in 1–2 business days and arrive in 3–5.</p><h3>What is your return policy?</h3><p>60 days, no questions. Items just need to be unused.</p>'],
  ['Shipping & Delivery', 'shipping-and-delivery', '<p>We ship worldwide from Portland and Brooklyn. Free domestic shipping on orders over $75.</p>'],
  ['Size Guide', 'size-guide', '<p>Our tees run relaxed. If you prefer a classic fit, size down. Hoodies are true to size.</p>'],
  ['Wholesale Inquiry', 'wholesale', '<p>We partner with select retailers. Minimum opening order $500. Email wholesale@northstargoods.com.</p>'],
]

const pages: StorePage[] = pageDefs.map(([title, handle, content], i) => ({
  id: `page_${i + 1}`, title, handle, contentHtml: content,
  status: i === 5 ? 'draft' : 'published',
  seoTitle: title, seoDescription: content.replace(/<[^>]+>/g, '').slice(0, 150),
  createdAt: iso(daysAgo(rng.int(90, 600))),
  updatedAt: iso(rng.dateWithin(60, true)),
}))

const postDefs = [
  ['How to Wax Your Own Canvas', 'Journal staff', 'A ten-minute ritual that adds years to your bag.'],
  ['Meet the Maker: Hearthstone Ceramics', 'Ava Chen', 'A studio visit with the potters behind our favorite mugs.'],
  ['Five Ways to Fold a Packable Hammock', 'Trailhead Supply', 'Only two of them are wrong.'],
  ['The Case for Buying Less', 'Ava Chen', 'Durability is the most sustainable feature.'],
  ['Portland Field Guide: Our Top 6 Coffee Bars', 'Maya Patel', 'Where the team drinks when we are not drinking our own press coffee.'],
  ['Gift Wrapping with Recycled Materials', 'Journal staff', 'Twice as nice, half the waste.'],
  ['Behind the Seams: Our 2026 Apparel Mills', 'Noah Kim', 'Traceability from fiber to shelf.'],
  ['Winter Care for Leather Goods', 'Alder & Oak', 'Salt, slush, and how to fight back.'],
]

const posts: BlogPost[] = postDefs.map(([title, author, excerpt], i) => ({
  id: `post_${i + 1}`, title, author, excerpt,
  contentHtml: `<p>${excerpt}</p><p>Lorem body for the demo — swap with real editorial content before publishing.</p>`,
  imageSrc: blogImage(slugify(title)),
  tags: rng.sample(['guides', 'stories', 'care', 'makers'], 2),
  status: i < 5 ? 'published' : i === 5 ? 'scheduled' : 'draft',
  publishedAt: i < 5 ? iso(daysAgo(7 * (i + 2))) : undefined,
}))

const fileDefs: [string, FileAsset['type'], number][] = [
  ...FAMILIES.slice(0, 14).map((f): [string, FileAsset['type'], number] => [`${f.slug}.svg`, 'image', rng.int(40, 320)]),
  ['hero-banner-spring.svg', 'image', 186], ['promo-giftguide.svg', 'image', 154],
  ['email-header-holiday.svg', 'image', 98], ['team-photo-studio.svg', 'image', 512],
  ['wholesale-line-sheet.pdf', 'document', 842], ['returns-form.pdf', 'document', 120],
  ['brand-guidelines-2026.pdf', 'document', 2410], ['license-agreement.docx', 'document', 64],
  ['launch-teaser.mp4', 'video', 8200], ['studio-timelapse.mp4', 'video', 15400],
]

const files: FileAsset[] = fileDefs.map(([name, type, sizeKb], i) => ({
  id: `file_${i + 1}`, name, type, sizeKb,
  src: type === 'image'
    ? name.includes('banner') || name.includes('promo') || name.includes('header')
      ? bannerImage(name.replace('.svg', ''))
      : `/images/products/${name}`
    : '',
  dimensions: type === 'image' ? { width: 640, height: 640 } : undefined,
  uploadedAt: iso(rng.dateWithin(180, true)),
  alt: type === 'image' ? name.replace(/[-_.](svg)?/g, ' ').trim() : undefined,
}))

// ─── 11. Menus ─────────────────────────────────────────────────────────────

const menus: NavMenu[] = [
  {
    id: 'menu_main', title: 'Main menu', handle: 'main-menu',
    items: [
      { id: 'mi_home', title: 'Home', url: '/', children: [] },
      { id: 'mi_catalog', title: 'Catalog', url: '/collections/all', children: [
        { id: 'mi_new', title: 'New Arrivals', url: '/collections/new-arrivals', children: [] },
        { id: 'mi_best', title: 'Bestsellers', url: '/collections/bestsellers', children: [] },
        { id: 'mi_apparel', title: 'Apparel', url: '/collections/apparel', children: [] },
        { id: 'mi_home', title: 'Home Goods', url: '/collections/home-goods', children: [] },
        { id: 'mi_outdoor', title: 'Outdoor & Travel', url: '/collections/outdoor-travel', children: [] },
      ] },
      { id: 'mi_about', title: 'About', url: '/pages/about', children: [] },
      { id: 'mi_journal', title: 'Journal', url: '/blogs/journal', children: [] },
      { id: 'mi_contact', title: 'Contact', url: '/pages/contact', children: [] },
    ],
  },
  {
    id: 'menu_footer', title: 'Footer menu', handle: 'footer',
    items: [
      { id: 'mi_f_quick', title: 'Quick links', url: '#', children: [
        { id: 'mi_f_search', title: 'Search', url: '/search', children: [] },
        { id: 'mi_f_shipping', title: 'Shipping & Delivery', url: '/pages/shipping-and-delivery', children: [] },
        { id: 'mi_f_faq', title: 'FAQ', url: '/pages/faq', children: [] },
      ] },
      { id: 'mi_f_info', title: 'Info', url: '#', children: [
        { id: 'mi_f_about', title: 'About', url: '/pages/about', children: [] },
        { id: 'mi_f_contact', title: 'Contact', url: '/pages/contact', children: [] },
        { id: 'mi_f_privacy', title: 'Privacy policy', url: '/policies/privacy-policy', children: [] },
        { id: 'mi_f_terms', title: 'Terms of service', url: '/policies/terms-of-service', children: [] },
      ] },
    ],
  },
]

// ─── 12. Apps ──────────────────────────────────────────────────────────────

const apps: AppEntry[] = [
  ['Klaviyo Email', 'Email & SMS marketing automation', '#232426', 'K', 'Email marketing, Customer data', 'Marketing', 'installed'],
  ['Judge.me Reviews', 'Photo reviews & ratings', '#4c8bf5', 'J', 'Products read, Orders read', 'Reviews', 'installed'],
  ['ShipStation', 'Multi-carrier shipping labels', '#3b6fb5', 'S', 'Orders read/write, Fulfillments write', 'Shipping', 'installed'],
  ['LoyaltyLion', 'Points & rewards program', '#e8674a', 'L', 'Customers read/write', 'Retention', 'installed'],
  ['Stocky Inventory', 'Purchase orders & forecasting', '#5b6d8f', 'St', 'Inventory read/write', 'Inventory', 'disabled'],
  ['Google & YouTube', 'Free product listings & ads', '#4285f4', 'G', 'Products read, Orders read', 'Sales channel', 'installed'],
  ['Meta Ads', 'Facebook & Instagram ads', '#0866ff', 'M', 'Products read, Customer data', 'Marketing', 'installed'],
  ['Tidio Live Chat', 'Live chat & chatbots', '#2f9cff', 'T', 'Orders read, Customer data', 'Support', 'disabled'],
].map(([name, description, iconBg, iconChar, permissions, category, status]) => ({
  id: `app_${slugify(name as string)}`, name: name as string, description: description as string,
  iconBg: iconBg as string, iconChar: iconChar as string, permissions: (permissions as string).split(', '),
  category: category as string, status: status as AppEntry['status'],
}))

const appSuggestions: AppEntry[] = [
  ['Printful Print on Demand', 'Custom prints, shipped on demand', '#0f3443', 'P', 'Sales', 'print-on-demand'],
  ['Sezzle Pay in 4', 'Buy now, pay later checkout', '#f271a3', 'Se', 'Payments', 'payments'],
  ['SEO Manager', 'Structured data & keyword tools', '#37b37e', 'Se', 'SEO', 'optimization'],
  ['Back in Stock Alerts', 'Notify shoppers when items restock', '#8c6fe8', 'B', 'Alerts', 'retention'],
].map(([name, description, iconBg, iconChar, category, tag]) => ({
  id: `appsug_${slugify(tag as string)}`, name: name as string, description: description as string,
  iconBg: iconBg as string, iconChar: iconChar as string, permissions: [], category: category as string,
  status: 'disabled' as const,
}))

// ─── 13. Settings, notifications, tasks, theme ─────────────────────────────

const settings: StoreSettings = {
  storeName: 'Northstar Goods',
  legalName: 'Northstar Goods LLC',
  email: 'hello@northstargoods.com',
  phone: '(503) 555-0100',
  storeAddress: {
    firstName: 'Ava', lastName: 'Chen', company: 'Northstar Goods LLC',
    address1: '4218 Alder St', city: 'Portland', province: 'OR', country: 'United States', zip: '97201', phone: '(503) 555-0100',
  },
  currency: 'USD',
  timezone: '(GMT-08:00) Pacific Time',
  unitSystem: 'imperial',
  weightUnit: 'lb',
  orderPrefix: '',
  checkout: { customerAccounts: 'optional', emailReceipts: true, tipLine: false, abandonedRecovery: true },
  payments: [
    { id: 'pay_1', provider: 'Shopify Payments', enabled: true, testMode: false },
    { id: 'pay_2', provider: 'PayPal', enabled: true, testMode: false },
    { id: 'pay_3', provider: 'Apple Pay', enabled: true, testMode: false },
    { id: 'pay_4', provider: 'Klarna', enabled: false, testMode: false },
    { id: 'pay_5', provider: 'Manual bank transfer', enabled: false, testMode: false },
  ],
  shipping: [
    { id: 'ship_1', name: 'Standard shipping', regions: 'United States', rate: 6.99, freeOver: 75 },
    { id: 'ship_2', name: 'Express shipping', regions: 'United States', rate: 18.99 },
    { id: 'ship_3', name: 'International tracked', regions: 'Rest of world', rate: 24.99, freeOver: 250 },
    { id: 'ship_4', name: 'Local pickup', regions: 'Portland Flagship', rate: 0 },
  ],
  taxes: { chargeTaxOnShipping: false, includeTaxInPrices: false, taxRate: 8 },
  policies: {
    refund: 'Return any unused item within 60 days for a full refund. Refunds are issued to the original payment method within 5 business days.',
    privacy: 'We collect only what we need to fulfill your order. We never sell personal data. Analytics are anonymized.',
    terms: 'By placing an order you agree to our terms: prices include applicable duties for US orders; international duties are the recipient’s responsibility.',
    shipping: 'Orders ship within 1–2 business days from Portland OR or Brooklyn NY. Free US shipping over $75.',
    subscriber: 'Sign up for our newsletter to hear about new arrivals and restocks. Unsubscribe any time from any email.',
  },
  notifications: { orderConfirmation: true, shippingConfirmation: true, abandonedCheckout: true, customerWelcome: false },
}

const notifications: AdminNotification[] = [
  { id: 'n_1', kind: 'critical', title: '3 products are out of stock', body: 'Restock before the weekend promo.', createdAt: iso(rng.dateWithin(1, true)), read: false, link: '/inventory?stock=0' },
  { id: 'n_2', kind: 'warning', title: 'Abandoned checkouts up 18%', body: 'Recovery email could recover ~$1,200.', createdAt: iso(rng.dateWithin(2, true)), read: false, link: '/orders?tab=abandoned' },
  { id: 'n_3', kind: 'info', title: 'Holiday Gift Guide campaign scheduled', body: 'Launches in 5 days.', createdAt: iso(rng.dateWithin(3, true)), read: false, link: '/marketing' },
  { id: 'n_4', kind: 'info', title: 'Payout of $4,812.40 sent', body: 'Shopify Payments · arrives in 2 days.', createdAt: iso(rng.dateWithin(4, true)), read: true },
  { id: 'n_5', kind: 'warning', title: '2 staff invitations pending', body: 'Elias Warner and Ruby Osei haven’t accepted.', createdAt: iso(rng.dateWithin(5, true)), read: true, link: '/settings/users' },
  { id: 'n_6', kind: 'info', title: 'New app suggestion', body: 'Back in Stock Alerts matches your store.', createdAt: iso(rng.dateWithin(6, true)), read: true, link: '/apps' },
]

const tasks: TaskItem[] = [
  { id: 't_1', title: 'Add your first custom domain', description: 'Point northstargoods.com at your store.', done: false, link: '/settings' },
  { id: 't_2', title: 'Set up abandoned checkout recovery', description: 'Automatically email shoppers who leave items behind.', done: true, link: '/settings/checkout' },
  { id: 't_3', title: 'Publish 3 more collections', description: 'Stores with 8+ collections convert 12% better.', done: false, link: '/collections' },
  { id: 't_4', title: 'Name a backup staff member', description: 'Give an admin fallback fulfillment permissions.', done: false, link: '/settings/users' },
  { id: 't_5', title: 'Review your tax settings', description: 'Confirm rates before the next filing period.', done: false, link: '/settings/taxes' },
]

const theme: ThemeSettings = {
  activeTheme: 'Northstar',
  colors: { primary: '#303030', background: '#ffffff', text: '#303030', accent: '#005bd3' },
  typography: { headingFont: 'Inter', bodyFont: 'Inter', baseSize: 15 },
  productGridColumns: 3,
  showVendor: true,
  showQuantitySelector: true,
}

const themeLibrary = [
  { id: 'th_1', name: 'Northstar', version: '3.2.0', role: 'current', imageSrc: bannerImage('theme-northstar'), updatedDays: 2 },
  { id: 'th_2', name: 'Dawn', version: '9.1.0', role: 'published-mirror', imageSrc: bannerImage('theme-dawn'), updatedDays: 11 },
  { id: 'th_3', name: 'Studio', version: '2.4.1', role: 'library', imageSrc: bannerImage('theme-studio'), updatedDays: 30 },
  { id: 'th_4', name: 'Craft', version: '1.9.0', role: 'library', imageSrc: bannerImage('theme-craft'), updatedDays: 74 },
  { id: 'th_5', name: 'Sense', version: '4.0.2', role: 'library', imageSrc: bannerImage('theme-sense'), updatedDays: 120 },
].map((t) => ({ ...t, imageSrc: t.imageSrc, addedAt: iso(daysAgo(t.updatedDays)) }))

// ─── Write everything ──────────────────────────────────────────────────────

mkdirSync(DATA, { recursive: true })
writeArt()

import { generateParity } from './parity'
const parity = generateParity({ products, customers, orders: orders.filter((o) => !o.isDraft), locations, staff })

function write(name: string, data: unknown): void {
  writeFileSync(join(DATA, `${name}.json`), JSON.stringify(data, null, 1))
}

write('products', products)
write('customers', customers)
write('orders', orders)
write('abandoned-checkouts', abandoned)
write('collections', collections)
write('locations', locations)
write('inventory-levels', inventoryLevels)
write('inventory-history', inventoryHistory)
write('discounts', discounts)
write('campaigns', campaigns)
write('staff', staff)
write('pages', pages)
write('posts', posts)
write('files', files)
write('menus', menus)
write('apps', apps)
write('app-suggestions', appSuggestions)
write('settings', settings)
write('notifications', notifications)
write('tasks', tasks)
write('theme', theme)
write('theme-library', themeLibrary)

// parity expansion
write('companies', parity.companies)
write('segments', parity.segments)
write('transfers', parity.transfers)
write('gift-cards', parity.giftCards)
write('payouts', parity.payouts)
write('balance-transactions', parity.transactions)
write('metafield-definitions', parity.metafieldDefinitions)
write('metafields', parity.metafields)
write('redirects', parity.redirects)
write('locales', parity.locales)
write('markets', parity.markets)
write('staff-activity', parity.staffActivity)
write('returns', parity.returns)
write('order-edits', parity.orderEdits)
write('order-risk', parity.orderRisk)
write('plan', parity.plan)
write('metaobject-definitions', parity.entries)
write('metaobject-entries', parity.entryItems)

console.log(`✔ Wrote seed data to src/data/
  products=${products.length} variants=${allVariants.length} customers=${customers.length}
  orders=${orders.length} (drafts=8) abandoned=${abandoned.length} collections=${collections.length}
  locations=${locations.length} inventoryLevels=${inventoryLevels.length} discounts=${discounts.length}
  campaigns=${campaigns.length} staff=${staff.length} pages=${pages.length} posts=${posts.length} files=${files.length}
  companies=${parity.companies.length} segments=${parity.segments.length} transfers=${parity.transfers.length}
  giftCards=${parity.giftCards.length} payouts=${parity.payouts.length} transactions=${parity.transactions.length}
  redirects=${parity.redirects.length} activity=${parity.staffActivity.length} returns=${parity.returns.length}`)
