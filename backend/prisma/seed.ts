/**
 * Seeds the Neon database from the frontend demo data (frontend/src/data/*.json).
 * Usage:
 *   npm run seed            # upsert-like: clears + inserts demo data
 *   npm run seed:reset      # identical (kept for symmetry)
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hashPassword } from '../src/auth/password.util'

const prisma = new PrismaClient()
const DATA = join(__dirname, '..', '..', 'frontend', 'src', 'data')

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA, `${name}.json`), 'utf8')) as T
}

const date = (v: string | undefined | null): Date | null => (v ? new Date(v) : null)

async function main(): Promise<void> {
  const products = load<unknown[]>('products')
  const customers = load<unknown[]>('customers')
  const orders = load<unknown[]>('orders')
  const abandoned = load<unknown[]>('abandoned-checkouts')
  const collections = load<unknown[]>('collections')
  const locations = load<unknown[]>('locations')
  const inventoryLevels = load<unknown[]>('inventory-levels')
  const inventoryHistory = load<unknown[]>('inventory-history')
  const discounts = load<unknown[]>('discounts')
  const campaigns = load<unknown[]>('campaigns')
  const staff = load<unknown[]>('staff')
  const pages = load<unknown[]>('pages')
  const posts = load<unknown[]>('posts')
  const files = load<unknown[]>('files')
  const menus = load<unknown[]>('menus')
  const apps = load<unknown[]>('apps')
  const appSuggestions = load<unknown[]>('app-suggestions')
  const settings = load<unknown>('settings')
  const notifications = load<unknown[]>('notifications')
  const tasks = load<unknown[]>('tasks')
  const theme = load<unknown>('theme')
  const themeLibrary = load<unknown[]>('theme-library')
  const companies = load<unknown[]>('companies')
  const segments = load<unknown[]>('segments')
  const transfers = load<unknown[]>('transfers')
  const giftCards = load<unknown[]>('gift-cards')
  const payouts = load<unknown[]>('payouts')
  const balanceTransactions = load<unknown[]>('balance-transactions')
  const metafieldDefinitions = load<unknown[]>('metafield-definitions')
  const metafieldsMap = load<Record<string, { id: string; definitionId: string; value: string }[]>>('metafields')
  const redirects = load<unknown[]>('redirects')
  const locales = load<unknown[]>('locales')
  const markets = load<unknown[]>('markets')
  const staffActivity = load<unknown[]>('staff-activity')
  const returns = load<unknown[]>('returns')
  const orderEdits = load<unknown[]>('order-edits')
  const orderRisk = load<Record<string, { level: string; signals: string[] }>>('order-risk')
  const plan = load<Record<string, unknown>>('plan')
  const metaobjectDefinitions = load<unknown[]>('metaobject-definitions')
  const metaobjectEntries = load<unknown[]>('metaobject-entries')

  console.log('Clearing existing rows…')
  await prisma.$transaction([
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

  console.log('Inserting demo data…')
  {
    // Sequential writes: Neon pooler (transaction mode) breaks interactive
    // transactions (P2028). The deleteMany pass above makes this idempotent.
    const tx = prisma
    for (const p of products as Record<string, unknown>[]) {
      const { createdAt, updatedAt, ...rest } = p
      await tx.product.create({ data: { ...(rest as object), createdAt: new Date(createdAt as string), updatedAt: new Date(updatedAt as string) } })
    }
    for (const c of customers as Record<string, unknown>[]) {
      const { createdAt, ...rest } = c
      await tx.customer.create({ data: { ...(rest as object), createdAt: new Date(createdAt as string) } })
    }
    for (const o of orders as Record<string, unknown>[]) {
      const { createdAt, cancelledAt, closedAt, ...rest } = o
      await tx.order.create({
        data: {
          ...(rest as object),
          createdAt: new Date(createdAt as string),
          cancelledAt: date(cancelledAt as string),
          closedAt: date(closedAt as string),
        },
      })
    }
    for (const a of abandoned as Record<string, unknown>[]) {
      const { createdAt, ...rest } = a
      await tx.abandonedCheckout.create({ data: { ...(rest as object), createdAt: new Date(createdAt as string) } })
    }
    for (const c of collections as Record<string, unknown>[]) {
      const { createdAt, publishedAt, ...rest } = c
      await tx.collection.create({ data: { ...(rest as object), createdAt: new Date(createdAt as string), publishedAt: date(publishedAt as string) } })
    }
    for (const l of locations as Record<string, unknown>[]) {
      const { createdAt, ...rest } = l
      await tx.location.create({ data: { ...(rest as object), createdAt: new Date(createdAt as string) } })
    }
    for (const l of inventoryLevels as Record<string, unknown>[]) {
      await tx.inventoryLevel.create({ data: l as object })
    }
    for (const h of inventoryHistory as Record<string, unknown>[]) {
      const { createdAt, ...rest } = h
      await tx.inventoryHistory.create({ data: { ...(rest as object), createdAt: new Date(createdAt as string) } })
    }
    for (const d of discounts as Record<string, unknown>[]) {
      const { startsAt, endsAt, combinations, ...rest } = d
      await tx.discount.create({
        data: {
          ...(rest as object),
          combinations: combinations ?? { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
          startsAt: new Date(startsAt as string),
          endsAt: date(endsAt as string),
        },
      })
    }
    for (const c of campaigns as Record<string, unknown>[]) {
      const { sentAt, ...rest } = c
      await tx.campaign.create({ data: { ...(rest as object), sentAt: date(sentAt as string) } })
    }
    const demoPassword = process.env.STAFF_DEMO_PASSWORD || 'northstar123'
    const demoHash = hashPassword(demoPassword)
    for (const s of staff as Record<string, unknown>[]) {
      const { lastActiveAt, ...rest } = s
      const status = rest.status as string
      await tx.staffMember.create({
        data: {
          ...(rest as object),
          lastActiveAt: date(lastActiveAt as string),
          passwordHash: status === 'active' ? demoHash : null,
        },
      })
    }
    for (const p of pages as Record<string, unknown>[]) {
      const { createdAt, updatedAt, ...rest } = p
      await tx.storePage.create({ data: { ...(rest as object), createdAt: new Date(createdAt as string), updatedAt: new Date(updatedAt as string) } })
    }
    for (const b of posts as Record<string, unknown>[]) {
      const { publishedAt, ...rest } = b
      await tx.blogPost.create({ data: { ...(rest as object), publishedAt: date(publishedAt as string) } })
    }
    for (const f of files as Record<string, unknown>[]) {
      const { uploadedAt, ...rest } = f
      await tx.fileAsset.create({ data: { ...(rest as object), uploadedAt: new Date(uploadedAt as string) } })
    }
    for (const m of menus as Record<string, unknown>[]) {
      await tx.navMenu.create({ data: m as object })
    }
    for (const a of apps as Record<string, unknown>[]) {
      await tx.appEntry.create({ data: { ...(a as object), suggested: false } })
    }
    for (const a of appSuggestions as Record<string, unknown>[]) {
      await tx.appEntry.create({ data: { ...(a as object), suggested: true } })
    }
    await tx.storeSettings.create({ data: { id: 'singleton', value: settings } })
    await tx.theme.create({ data: { id: 'singleton', value: theme } })
    for (const t of themeLibrary as Record<string, unknown>[]) {
      const { addedAt, updatedDays, ...rest } = t
      await tx.themeLibraryEntry.create({ data: { ...(rest as object), addedAt: new Date(addedAt as string) } })
    }
    for (const n of notifications as Record<string, unknown>[]) {
      const { createdAt, ...rest } = n
      await tx.notification.create({ data: { ...(rest as object), createdAt: new Date(createdAt as string) } })
    }
    for (const t of tasks as unknown[]) {
      await tx.task.create({ data: t as object })
    }
    for (const c of companies as Record<string, unknown>[]) {
      const { createdAt, ...rest } = c
      await tx.company.create({ data: { ...(rest as object), createdAt: new Date(createdAt as string) } })
    }
    for (const s of segments as unknown[]) {
      await tx.segment.create({ data: s as object })
    }
    for (const t of transfers as Record<string, unknown>[]) {
      const { createdAt, sentAt, receivedAt, ...rest } = t
      await tx.transfer.create({
        data: { ...(rest as object), createdAt: new Date(createdAt as string), sentAt: date(sentAt as string), receivedAt: date(receivedAt as string) },
      })
    }
    for (const g of giftCards as Record<string, unknown>[]) {
      const { createdAt, expiresAt, ...rest } = g
      await tx.giftCard.create({ data: { ...(rest as object), createdAt: new Date(createdAt as string), expiresAt: date(expiresAt as string) } })
    }
    for (const p of payouts as Record<string, unknown>[]) {
      const { issuedAt, arrivedAt, ...rest } = p
      await tx.payout.create({ data: { ...(rest as object), issuedAt: new Date(issuedAt as string), arrivedAt: date(arrivedAt as string) } })
    }
    for (const t of balanceTransactions as Record<string, unknown>[]) {
      const { at, ...rest } = t
      await tx.balanceTransaction.create({ data: { ...(rest as object), at: new Date(at as string) } })
    }
    for (const d of metafieldDefinitions as unknown[]) {
      await tx.metafieldDefinition.create({ data: d as object })
    }
    const metafieldRows: { ownerType: string; ownerId: string; definitionId: string; value: string; id: string }[] = []
    for (const [ownerKey, list] of Object.entries(metafieldsMap)) {
      const [ownerType, ownerId] = ownerKey.split(':')
      for (const m of list) {
        metafieldRows.push({ id: m.id, ownerType: ownerType!, ownerId: ownerId!, definitionId: m.definitionId, value: m.value })
      }
    }
    for (const row of metafieldRows) {
      await tx.metafield.create({ data: row })
    }
    for (const r of redirects as Record<string, unknown>[]) {
      const { createdAt, ...rest } = r
      await tx.redirect.create({ data: { ...(rest as object), createdAt: new Date(createdAt as string) } })
    }
    for (const l of locales as unknown[]) {
      await tx.locale.create({ data: l as object })
    }
    for (const m of markets as unknown[]) {
      await tx.marketCountry.create({ data: m as object })
    }
    for (const a of staffActivity as Record<string, unknown>[]) {
      const { at, ...rest } = a
      await tx.activityEntry.create({ data: { ...(rest as object), at: new Date(at as string) } })
    }
    for (const r of returns as Record<string, unknown>[]) {
      const { createdAt, closedAt, ...rest } = r
      await tx.returnRecord.create({ data: { ...(rest as object), createdAt: new Date(createdAt as string), closedAt: date(closedAt as string) } })
    }
    for (const e of orderEdits as Record<string, unknown>[]) {
      const { at, ...rest } = e
      await tx.orderEdit.create({ data: { ...(rest as object), at: new Date(at as string) } })
    }
    for (const [orderId, risk] of Object.entries(orderRisk)) {
      await tx.orderRisk.create({ data: { orderId, level: risk.level, signals: risk.signals } })
    }
    const planRow = plan as Record<string, unknown>
    await tx.plan.create({
      data: {
        id: 'singleton',
        name: planRow.name as string,
        status: planRow.status as string,
        trialDaysLeft: planRow.trialDaysLeft as number,
        storeId: planRow.storeId as string,
      },
    })
    for (const d of metaobjectDefinitions as unknown[]) {
      await tx.metaobjectDefinition.create({ data: d as object })
    }
    for (const e of metaobjectEntries as Record<string, unknown>[]) {
      const { updatedAt, ...rest } = e
      await tx.metaobjectEntry.create({ data: { ...(rest as object), updatedAt: new Date(updatedAt as string) } })
    }
    const orderRows = await tx.order.findMany({ where: { isDraft: false }, select: { name: true } })
    let maxOrderNum = 1000
    for (const o of orderRows) {
      const n = Number(String(o.name).replace('#', ''))
      if (Number.isFinite(n) && n < 900000) maxOrderNum = Math.max(maxOrderNum, n)
    }
    await tx.shopCounter.upsert({
      where: { id: 'order_number' },
      create: { id: 'order_number', value: maxOrderNum },
      update: { value: maxOrderNum },
    })
  }

  const counts = {
    products: await prisma.product.count(),
    customers: await prisma.customer.count(),
    orders: await prisma.order.count(),
    inventoryLevels: await prisma.inventoryLevel.count(),
    metafields: await prisma.metafield.count(),
  }
  console.log('✔ Seed complete:', counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
