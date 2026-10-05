/**
 * Shared demo-data reseed core — used by `prisma/seed.ts` (CLI) and the
 * `resetDemoData` GraphQL mutation. Wipes all tables and reloads from
 * frontend/src/data/*.json (documented demo-data source of truth).
 *
 * Inserts are batched with createMany: per-row round trips over the Neon
 * pooler made a full reseed take ~5.5 minutes; batching brings it to seconds.
 */
import { PrismaClient } from '@prisma/client'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hashPassword } from '../auth/password.util'

type Row = Record<string, unknown>

const date = (v: string | Date | undefined | null): Date | null => (v ? new Date(v) : null)
const at = (v: unknown): Date => new Date(v as string)
const strip = (row: Row, ...keys: string[]): Row => {
  const out: Row = { ...row }
  for (const k of keys) delete out[k]
  return out
}

export function resolveDataDir(): string {
  const candidates = [
    process.env.DEMO_DATA_DIR,
    join(process.cwd(), '..', 'frontend', 'src', 'data'),
    join(process.cwd(), 'frontend', 'src', 'data'),
    join(__dirname, '..', '..', '..', 'frontend', 'src', 'data'),
    join(__dirname, '..', '..', '..', '..', 'frontend', 'src', 'data'),
  ].filter((p): p is string => Boolean(p))
  for (const dir of candidates) {
    if (existsSync(join(dir, 'products.json'))) return dir
  }
  throw new Error(`Demo data dir not found; tried: ${candidates.join(' | ')}`)
}

export async function reseed(prisma: PrismaClient, dataDir?: string): Promise<Record<string, number>> {
  const DATA = dataDir ?? resolveDataDir()
  const load = <T>(name: string): T => JSON.parse(readFileSync(join(DATA, `${name}.json`), 'utf8')) as T

  const products = load<Row[]>('products')
  const customers = load<Row[]>('customers')
  const orders = load<Row[]>('orders')
  const abandoned = load<Row[]>('abandoned-checkouts')
  const collections = load<Row[]>('collections')
  const locations = load<Row[]>('locations')
  const inventoryLevels = load<Row[]>('inventory-levels')
  const inventoryHistory = load<Row[]>('inventory-history')
  const discounts = load<Row[]>('discounts')
  const campaigns = load<Row[]>('campaigns')
  const staff = load<Row[]>('staff')
  const pages = load<Row[]>('pages')
  const posts = load<Row[]>('posts')
  const files = load<Row[]>('files')
  const menus = load<Row[]>('menus')
  const apps = load<Row[]>('apps')
  const appSuggestions = load<Row[]>('app-suggestions')
  const settings = load<unknown>('settings')
  const notifications = load<Row[]>('notifications')
  const tasks = load<Row[]>('tasks')
  const theme = load<unknown>('theme')
  const themeLibrary = load<Row[]>('theme-library')
  const companies = load<Row[]>('companies')
  const segments = load<Row[]>('segments')
  const transfers = load<Row[]>('transfers')
  const giftCards = load<Row[]>('gift-cards')
  const payouts = load<Row[]>('payouts')
  const balanceTransactions = load<Row[]>('balance-transactions')
  const metafieldDefinitions = load<Row[]>('metafield-definitions')
  const metafieldsMap = load<Record<string, { id: string; definitionId: string; value: string }[]>>('metafields')
  const redirects = load<Row[]>('redirects')
  const locales = load<Row[]>('locales')
  const markets = load<Row[]>('markets')
  const staffActivity = load<Row[]>('staff-activity')
  const returns = load<Row[]>('returns')
  const orderEdits = load<Row[]>('order-edits')
  const orderRisk = load<Record<string, { level: string; signals: string[] }>>('order-risk')
  const plan = load<Record<string, unknown>>('plan')
  const metaobjectDefinitions = load<Row[]>('metaobject-definitions')
  const metaobjectEntries = load<Row[]>('metaobject-entries')
  const priceLists = load<Row[]>('price-lists')
  const savedSearches = load<Row[]>('saved-searches')

  await prisma.$transaction([
    prisma.savedSearch.deleteMany(),
    prisma.priceListEntry.deleteMany(),
    prisma.priceList.deleteMany(),
    prisma.metafield.deleteMany(),
    prisma.metafieldDefinition.deleteMany(),
    prisma.metaobjectEntry.deleteMany(),
    prisma.metaobjectDefinition.deleteMany(),
    prisma.balanceTransaction.deleteMany(),
    prisma.payout.deleteMany(),
    prisma.giftCard.deleteMany(),
    prisma.transfer.deleteMany(),
    prisma.inventoryHistory.deleteMany(),
    prisma.inventoryLevel.deleteMany(),
    prisma.orderEdit.deleteMany(),
    prisma.orderRisk.deleteMany(),
    prisma.returnRecord.deleteMany(),
    prisma.activityEntry.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.task.deleteMany(),
    prisma.abandonedCheckout.deleteMany(),
    prisma.order.deleteMany(),
    prisma.company.deleteMany(),
    prisma.segment.deleteMany(),
    prisma.redirect.deleteMany(),
    prisma.locale.deleteMany(),
    prisma.marketCountry.deleteMany(),
    prisma.appEntry.deleteMany(),
    prisma.staffMember.deleteMany(),
    prisma.themeLibraryEntry.deleteMany(),
    prisma.storePage.deleteMany(),
    prisma.blogPost.deleteMany(),
    prisma.fileAsset.deleteMany(),
    prisma.navMenu.deleteMany(),
    prisma.discount.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.collection.deleteMany(),
    prisma.location.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.product.deleteMany(),
    prisma.storeSettings.deleteMany(),
    prisma.shopCounter.deleteMany(),
    prisma.theme.deleteMany(),
    prisma.plan.deleteMany(),
  ])

  // Loosely typed batch writer: row payloads come from trusted demo JSON.
  const tx = prisma as unknown as {
    [model: string]: { createMany(a: { data: unknown }): Promise<unknown>; create(a: { data: unknown }): Promise<unknown> }
  }
  const many = (model: string, data: unknown[]) => tx[model].createMany({ data })

  await many('product', products.map((p) => ({ ...strip(p, 'createdAt', 'updatedAt'), createdAt: at(p.createdAt), updatedAt: at(p.updatedAt) })))
  await many('customer', customers.map((c) => ({ ...strip(c, 'createdAt'), createdAt: at(c.createdAt) })))
  await many('order', orders.map((o) => ({ ...strip(o, 'createdAt', 'cancelledAt', 'closedAt'), createdAt: at(o.createdAt), cancelledAt: date(o.cancelledAt as string), closedAt: date(o.closedAt as string) })))
  await many('abandonedCheckout', abandoned.map((a) => ({ ...strip(a, 'createdAt'), createdAt: at(a.createdAt) })))
  await many('collection', collections.map((c) => ({ ...strip(c, 'createdAt', 'publishedAt'), createdAt: at(c.createdAt), publishedAt: date(c.publishedAt as string) })))
  await many('location', locations.map((l) => ({ ...strip(l, 'createdAt'), createdAt: at(l.createdAt) })))

  // Source demo data can contain repeated (variantId, locationId) rows.
  // Keep the last occurrence so seeding remains idempotent.
  const inventoryLevelByKey = new Map<string, Row>()
  for (const l of inventoryLevels) {
    inventoryLevelByKey.set(`${l.variantId}::${l.locationId}`, l)
  }
  await many(
    'inventoryLevel',
    [...inventoryLevelByKey.values()].map((l) => ({
      variantId: String(l.variantId),
      locationId: String(l.locationId),
      available: Number(l.available ?? 0),
      committed: Number(l.committed ?? 0),
      unavailable: Number(l.unavailable ?? 0),
    })),
  )
  await many('inventoryHistory', inventoryHistory.map((h) => ({ ...strip(h, 'createdAt'), createdAt: at(h.createdAt) })))
  await many(
    'discount',
    discounts.map((d) => ({
      ...strip(d, 'startsAt', 'endsAt', 'combinations'),
      combinations: d.combinations ?? { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
      startsAt: at(d.startsAt),
      endsAt: date(d.endsAt as string),
    })),
  )
  await many('campaign', campaigns.map((c) => ({ ...strip(c, 'sentAt'), sentAt: date(c.sentAt as string) })))

  const demoPassword = process.env.STAFF_DEMO_PASSWORD || 'northstar123'
  const demoHash = hashPassword(demoPassword)
  await many(
    'staffMember',
    staff.map((s) => ({
      ...strip(s, 'lastActiveAt', 'passwordHash'),
      lastActiveAt: date(s.lastActiveAt as string),
      passwordHash: s.status === 'active' ? demoHash : null,
    })),
  )

  await many('storePage', pages.map((p) => ({ ...strip(p, 'createdAt', 'updatedAt'), createdAt: at(p.createdAt), updatedAt: at(p.updatedAt) })))
  await many('blogPost', posts.map((b) => ({ ...strip(b, 'publishedAt'), publishedAt: date(b.publishedAt as string) })))
  await many('fileAsset', files.map((f) => ({ ...strip(f, 'uploadedAt'), uploadedAt: at(f.uploadedAt) })))
  await many('navMenu', menus)
  await many('appEntry', [...apps.map((a) => ({ ...a, suggested: false })), ...appSuggestions.map((a) => ({ ...a, suggested: true }))])
  await tx.storeSettings.create({ data: { id: 'singleton', value: settings } })
  await tx.theme.create({ data: { id: 'singleton', value: theme } })
  await many('themeLibraryEntry', themeLibrary.map((t) => ({ ...strip(t, 'addedAt', 'updatedDays'), addedAt: at(t.addedAt) })))
  await many('notification', notifications.map((n) => ({ ...strip(n, 'createdAt'), createdAt: at(n.createdAt) })))
  await many('task', tasks)
  await many('company', companies.map((c) => ({ ...strip(c, 'createdAt'), createdAt: at(c.createdAt) })))
  await many('segment', segments)
  await many(
    'transfer',
    transfers.map((t) => ({ ...strip(t, 'createdAt', 'sentAt', 'receivedAt'), createdAt: at(t.createdAt), sentAt: date(t.sentAt as string), receivedAt: date(t.receivedAt as string) })),
  )
  await many('giftCard', giftCards.map((g) => ({ ...strip(g, 'createdAt', 'expiresAt'), createdAt: at(g.createdAt), expiresAt: date(g.expiresAt as string) })))
  await many('payout', payouts.map((p) => ({ ...strip(p, 'issuedAt', 'arrivedAt'), issuedAt: at(p.issuedAt), arrivedAt: date(p.arrivedAt as string) })))
  await many('balanceTransaction', balanceTransactions.map((t) => ({ ...strip(t, 'at'), at: at(t.at) })))
  await many('metafieldDefinition', metafieldDefinitions)
  const metafieldRows = Object.entries(metafieldsMap).flatMap(([ownerKey, list]) => {
    const [ownerType, ownerId] = ownerKey.split(':')
    return list.map((m) => ({ id: m.id, ownerType: ownerType!, ownerId: ownerId!, definitionId: m.definitionId, value: m.value }))
  })
  await many('metafield', metafieldRows)
  await many('redirect', redirects.map((r) => ({ ...strip(r, 'createdAt'), createdAt: at(r.createdAt) })))
  await many('locale', locales)
  await many('marketCountry', markets)
  await many('activityEntry', staffActivity.map((a) => ({ ...strip(a, 'at'), at: at(a.at) })))
  await many('returnRecord', returns.map((r) => ({ ...strip(r, 'createdAt', 'closedAt'), createdAt: at(r.createdAt), closedAt: date(r.closedAt as string) })))
  await many('orderEdit', orderEdits.map((e) => ({ ...strip(e, 'at'), at: at(e.at) })))
  await many(
    'orderRisk',
    Object.entries(orderRisk).map(([orderId, risk]) => ({ orderId, level: risk.level, signals: risk.signals })),
  )
  await tx.plan.create({
    data: {
      id: 'singleton',
      name: plan.name as string,
      status: plan.status as string,
      trialDaysLeft: plan.trialDaysLeft as number,
      storeId: plan.storeId as string,
    },
  })
  await many('metaobjectDefinition', metaobjectDefinitions)
  await many('metaobjectEntry', metaobjectEntries.map((e) => ({ ...strip(e, 'updatedAt'), updatedAt: at(e.updatedAt) })))
  // parentCompanyId is a GraphQL-decorated alias of companyId; updatedAt is server-managed.
  await many('priceList', priceLists.map((p) => strip(p, 'entries', 'createdAt', 'parentCompanyId', 'updatedAt')))
  await many(
    'priceListEntry',
    priceLists.flatMap((p) =>
      ((p.entries as { id: string; variantId: string; price: number }[] | undefined) ?? []).map((e) => ({
        id: e.id,
        priceListId: String(p.id),
        variantId: e.variantId,
        price: e.price,
      })),
    ),
  )
  await many('savedSearch', savedSearches.map((s) => ({ ...strip(s, 'createdAt'), createdAt: at(s.createdAt) })))

  const orderRows = await prisma.order.findMany({ where: { isDraft: false }, select: { name: true } })
  let maxOrderNum = 1000
  for (const o of orderRows) {
    const n = Number(String(o.name).replace('#', ''))
    if (Number.isFinite(n) && n < 900000) maxOrderNum = Math.max(maxOrderNum, n)
  }
  await prisma.shopCounter.upsert({
    where: { id: 'order_number' },
    create: { id: 'order_number', value: maxOrderNum },
    update: { value: maxOrderNum },
  })

  return {
    products: await prisma.product.count(),
    customers: await prisma.customer.count(),
    orders: await prisma.order.count(),
    collections: await prisma.collection.count(),
    priceLists: await prisma.priceList.count(),
    savedSearches: await prisma.savedSearch.count(),
  }
}
