/**
 * QA API test suite — exercises the full GraphQL surface like an external client.
 * Run: node qa-api.mjs  (backend must be running on :4000)
 */

import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
const URL = 'http://localhost:4000/graphql'
const AUTH_URL = 'http://localhost:4000/auth/login'
let cookieJar = ''
const RUN = Date.now().toString(36)
// Direct DB access is used ONLY to fabricate disposable fixtures (abandoned
// checkout rows have no create mutation); everything else goes through GraphQL.
// Lazily constructed: the fabricated abandoned-checkout row (W6) is the only
// direct DB use in this GraphQL suite; a broken DATABASE_URL must surface at
// that one fixture, not kill the run before C3 can restore a pristine store.
let _prisma = null
function getPrisma() {
  if (!_prisma) _prisma = new PrismaClient()
  return _prisma
}

let pass = 0
let fail = 0
let aborted = false
let locId, loc2Id
const failures = []

async function login() {
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ava@northstargoods.com', password: process.env.STAFF_DEMO_PASSWORD || 'northstar123' }),
  })
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookieJar = setCookie.split(';')[0]
}

async function gql(query, variables) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieJar ? { Cookie: cookieJar } : {}),
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data
}


function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    failures.push(`${name} ${detail}`)
    console.log(`  ✗ ${name} ${detail}`)
  }
}

const GQL = async (q, vars) => {
  try {
    return await gql(q, vars)
  } catch (e) {
    return { __error: e.message }
  }
}

// Payload helper: run mutation, return {entity, userErrors}
async function mut(payloadField, mutation) {
  const data = await GQL(`mutation { ${mutation} }`)
  if (data.__error) return { __error: data.__error }
  return data[payloadField] ?? {}
}

// Pin a TRACKED variant with real stock — products(first: 1) sorts by updatedAt
// and could hand back the untracked digital SKU (no inventory rows → convert
// auto-fulfills and every stock expectation below breaks). Throws, so a pinned
// section can never silently vanish from the pass count. Scans 100 newest
// products (seed store has 54) so newer zero-stock SKUs can't hide the stock.
async function pickStockedProduct(minStock = 2) {
  const p = await GQL(`{ products(first: 100) { edges { node { totalInventory variants { id } } } } }`)
  const cand = (p.products?.edges ?? []).map((e) => e.node).find((n) => n.totalInventory >= minStock && n.variants.length > 0)
  if (!cand) throw new Error(`no tracked product with stock >= ${minStock} found`)
  return cand
}

// C3: resetDemoData really wipes + reseeds. Declared here, invoked from the
// script-level finally so it runs even when an earlier section threw (e.g. the
// W6 Prisma fixture under a broken DATABASE_URL) — sections 1–15 mutate Neon.
async function runC3() {
  const rd = await GQL(`mutation { resetDemoData { storeName } }`)
  check('C3 resetDemoData reseeds via GraphQL', !rd.__error && !!rd.resetDemoData?.storeName, rd.__error ?? '')
  await GQL(`{ bootstrap { settings { storeName } } }`)
  const seedProducts = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../frontend/src/data/products.json'), 'utf8'))
  const seedOrders = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../frontend/src/data/orders.json'), 'utf8'))
  const pc = await GQL(`{ productsCount }`)
  const oc = await GQL(`{ ordersCount }`)
  check('C3 product rows match seed file', pc.productsCount === seedProducts.length, JSON.stringify({ got: pc.productsCount, exp: seedProducts.length }))
  check('C3 order rows match seed file', oc.ordersCount === seedOrders.filter((o) => !o.isDraft).length, JSON.stringify({ got: oc.ordersCount, exp: seedOrders.filter((o) => !o.isDraft).length }))
  const pays16 = await GQL(`{ payouts { id status } }`)
  check('C3 payouts re-materialized after reset', (pays16.payouts ?? []).length > 0, JSON.stringify(pays16).slice(0, 120))
}

await login()
try {

console.log('═══ 1. QUERY ROOT ═══')
{
  const d = await GQL(`{ shop { name email currency plan { name status trialDaysLeft storeId } } }`)
  check('shop', !!d.shop?.name && !!d.shop?.plan?.name, d.__error ?? '')

  const p = await GQL(`{ products(first: 5) { totalCount pageInfo { hasNextPage } edges { cursor node { id title status totalInventory variants { id sku price } media { src } seo { handle } } } } }`)
  check('products connection + pageInfo + aggregates', p.products?.edges?.length > 0 && p.products.edges[0].node.variants.length > 0, p.__error ?? '')
  const cursor = p.products?.edges?.[1]?.cursor
  const p2 = await GQL(`{ products(first: 2, after: "${cursor}") { edges { node { id } } pageInfo { hasPreviousPage } } }`)
  check('products cursor pagination', p2.products?.edges?.length > 0 && p2.products.pageInfo.hasPreviousPage === true)
  const p3 = await GQL(`{ products(first: 10, query: "cotton") { totalCount edges { node { title } } } }`)
  check('products query filter', p3.products?.edges?.every((e) => e.node.title.toLowerCase().includes('cotton')) && p3.products.edges.length > 0)
  const p4 = await GQL(`{ product(id: "${p.products.edges[0].node.id}") { id title } }`)
  check('product single', p4.product?.id === p.products.edges[0].node.id)

  const o = await GQL(`{ orders(first: 3) { totalCount edges { node { name paymentStatus fulfillmentStatus status total timeline { message } lineItems { title quantity } fulfillments { trackingNumber } refunds { amount } riskLevel } } } }`)
  check('orders + nested aggregates', o.orders?.edges?.length > 0 && o.orders.edges[0].node.lineItems.length > 0, o.__error ?? '')
  const o50 = await GQL(`{ orders(first: 50) { edges { node { id name status fulfillmentStatus paymentStatus total } } } }`)
  const open = o50.orders.edges.map((e) => e.node).find((x) => x.status === 'open' && x.fulfillmentStatus === 'unfulfilled')
  check('orders found an open unfulfilled order for workflow tests', !!open)

  const d2 = await GQL(`{ draftOrders(first: 5) { totalCount edges { node { id name isDraft } } } }`)
  check('draftOrders', d2.draftOrders?.edges?.length > 0 && d2.draftOrders.edges.every((e) => e.node.isDraft))

  const ab = await GQL(`{ abandonedCheckouts(first: 5) { id email total recoveryStatus } }`)
  check('abandonedCheckouts', ab.abandonedCheckouts?.length > 0)

  const c = await GQL(`{ customers(first: 5) { totalCount edges { node { id email ordersCount totalSpent defaultAddress { city } tags } } } }`)
  check('customers + derived stats', c.customers?.edges?.length > 0 && typeof c.customers.edges[0].node.totalSpent === 'number', c.__error ?? JSON.stringify({ edges: c.customers?.edges?.length, first: c.customers?.edges?.[0]?.node ?? null }).slice(0, 200))

  const co = await GQL(`{ collections(first: 12) { totalCount edges { node { id title type rules { column } productIds } } } }`)
  check('collections incl. smart rules', co.collections?.edges?.length >= 10)

  const loc = await GQL(`{ locations { id name active } }`)
  check('locations', loc.locations?.length >= 4)
  locId = loc.locations[0].id
  loc2Id = loc.locations[1].id

  const il = await GQL(`{ inventoryLevels(locationId: "${locId}") { variantId locationId available committed onHand } }`)
  check('inventoryLevels + onHand computed', il.inventoryLevels?.length > 0 && il.inventoryLevels.every((l) => typeof l.onHand === 'number'))

  const t = await GQL(`{ transfers(first: 6) { id name status lines { sku quantity receivedQuantity } } }`)
  check('transfers', t.transfers?.length >= 5)

  const disc = await GQL(`{ discounts(first: 16) { totalCount edges { node { code type method combinations { orderDiscounts } bxgy { customerBuysQuantity } } } } }`)
  check('discounts + combinations + bxgy', disc.discounts?.edges?.length >= 15)

  const cam = await GQL(`{ campaigns { id name channel status revenue } }`)
  check('campaigns', cam.campaigns?.length >= 10)

  const pay = await GQL(`{ payouts { id status amount issuedAt bankAccount } balanceTransactions(first: 20) { id type amount fee net orderId } }`)
  check('payouts + balanceTransactions', pay.payouts?.length > 0 && pay.balanceTransactions?.length > 0)

  const gc = await GQL(`{ giftCards(first: 10) { totalCount edges { node { code balance status history { type amount } } } } }`)
  check('giftCards + history', gc.giftCards?.edges?.length >= 9)

  const cust = await GQL(`{ companies(first: 4) { totalCount edges { node { name locations { name } contacts { email } priceListDiscountPercent totalSpent } } } }`)
  check('companies (B2B)', cust.companies?.edges?.length >= 4)

  const seg = await GQL(`{ segments { id name memberCount filters { column relation value } } }`)
  check('segments with live memberCount', seg.segments?.length >= 4 && seg.segments.every((s) => typeof s.memberCount === 'number'))

  const pages = await GQL(`{ pages { id title handle status } blogPosts { id title status } files { id name type } menus { handle items { title children { title } } } redirects { from to } }`)
  check('pages/blog/files/menus/redirects', pages.pages?.length >= 5 && pages.blogPosts?.length >= 7 && pages.files?.length >= 20 && pages.menus?.length >= 2 && pages.redirects?.length >= 7)

  const mf = await GQL(`{ metafieldDefinitions { id name resourceType } metafields(ownerType: "product", ownerId: "${p.products.edges[0].node.id}") { id definitionId value } }`)
  check('metafield definitions + values', mf.metafieldDefinitions?.length >= 5)

  const st = await GQL(`{ staff { id name role status permissions } activity(first: 10) { action staffName } apps { id name status suggested } notifications { id read } tasks { id done } }`)
  check('staff/activity/apps/notifications/tasks', st.staff?.length >= 10 && st.apps?.length >= 10 && st.tasks?.length >= 5)

  const sh = await GQL(`{ settings { storeName } theme { activeTheme } themeLibrary { name role } locales { code } markets { code enabled } plan { name } }`)
  check('settings/theme/locales/markets', !!sh.settings?.storeName && sh.themeLibrary?.length >= 4 && sh.markets?.length >= 5)

  const bs = await GQL(`{ bootstrap { products { id } orders { id } customers { id } } }`)
  check('bootstrap snapshot', bs.bootstrap?.products?.length > 50 && bs.bootstrap?.orders?.length > 100)
}

console.log('═══ 2. MUTATIONS: products ═══')
let testProductId
{
  const r = await mut('productCreate', `productCreate(product: { title: "QA Test Product", vendor: "QA Vendor", status: "active", variants: [{ sku: "QA-${RUN}", price: 9.99, title: "Default Title" }], tags: ["qa"] }) { product { id title variants { sku price } } userErrors { message } }`)
  testProductId = r.product?.id
  check('productCreate', !!testProductId && (r.product.variants[0].sku?.toUpperCase() === `QA-${RUN}`.toUpperCase()), JSON.stringify(r.userErrors))

  const u = await mut('productUpdate', `productUpdate(id: "${testProductId}", product: { title: "QA Test Product v2", status: "draft" }) { product { title status } userErrors { message } }`)
  check('productUpdate', u.product?.title === 'QA Test Product v2' && u.product.status === 'draft')

  const dup = await mut('productDuplicate', `productDuplicate(id: "${testProductId}") { product { id title } userErrors { message } }`)
  check('productDuplicate', dup.product?.title === 'QA Test Product v2 (copy)')
  if (dup.product) await mut('productDelete', `productDelete(ids: ["${dup.product.id}"]) { deletedIds }`)

  const st = await mut('productStatusSet', `productStatusSet(ids: ["${testProductId}"], status: "archived") { updatedIds }`)
  check('productStatusSet', st.updatedIds?.[0] === testProductId)
  const g = await GQL(`{ product(id: "${testProductId}") { status } }`)
  check('productStatusSet persisted', g.product.status === 'archived')
  await mut('productStatusSet', `productStatusSet(ids: ["${testProductId}"], status: "active") { updatedIds }`)

  const tg = await mut('productAddTags', `productAddTags(ids: ["${testProductId}"], tags: ["qa-tag"]) { updatedIds }`)
  check('productAddTags', tg.updatedIds?.length === 1)

  const inventoryBefore = await GQL(`{ product(id: "${testProductId}") { variants { id } } }`)
  const varId = inventoryBefore.product.variants[0].id
  const adj = await mut('inventoryAdjust', `inventoryAdjust(input: { variantId: "${varId}", locationId: "${locId}", availableDelta: 42, reason: "QA" }) { level { available } userErrors { message } }`)
  check('inventoryAdjust', adj.level?.available === 42, JSON.stringify(adj.userErrors))
  await mut('inventoryAdjust', `inventoryAdjust(input: { variantId: "${varId}", locationId: "${locId}", availableDelta: -42, reason: "QA cleanup" }) { level { available } }`)
}

console.log('═══ 3. MUTATIONS: order workflow ═══')
{
  const o = await GQL(`{ orders(first: 250) { edges { node { id name status fulfillmentStatus paymentStatus total } } } }`)
  let target = o.orders.edges.map((e) => e.node).find((x) => x.status === 'open' && x.fulfillmentStatus === 'unfulfilled' && x.paymentStatus === 'paid')
  if (!target?.id) {
    // Drifted state (previous runs consumed the seed candidates): manufacture one.
    const c0 = await GQL(`{ customers(first: 1) { edges { node { id } } } }`)
    const cand0 = await pickStockedProduct()
    const d0 = await mut('draftOrderCreate', `draftOrderCreate(customerId: "${c0.customers.edges[0].node.id}", items: [{ variantId: "${cand0.variants[0].id}", quantity: 1 }]) { order { id } userErrors { message } }`)
    const cv0 = await mut('draftOrderConvert', `draftOrderConvert(id: "${d0.order?.id}") { order { id } userErrors { message } }`)
    await mut('orderMarkAsPaid', `orderMarkAsPaid(id: "${cv0.order?.id}") { order { id } userErrors { message } }`)
    target = { id: cv0.order?.id }
  }
  check('found open unfulfilled order', !!target?.id, target?.id ?? '')

  const f = await GQL(`{ locations { id } }`)
  const ff = await mut('orderFulfill', `orderFulfill(input: { orderId: "${target.id}", lineItemIds: [], locationId: "${f.locations[0].id}", notifyCustomer: false }) { order { id } userErrors { message } }`)
  // empty lineItemIds — we need real ids; fetch them:
  const full = await GQL(`{ order(id: "${target.id}") { lineItems { id variantId quantity } } }`)
  const ids = full.order.lineItems.map((li) => `"${li.id}"`).join(',')
  // Pick the location that holds the reservation (Shopify: fulfill where stock is committed).
  const needByVariant = new Map()
  for (const li of full.order.lineItems) needByVariant.set(li.variantId, (needByVariant.get(li.variantId) ?? 0) + li.quantity)
  const lv = await GQL(`{ inventoryLevels { variantId locationId available committed } }`)
  const locCandidates = (lv.inventoryLevels ?? []).filter((l) =>
    [...needByVariant.entries()].every(([variantId, qty]) => l.variantId !== variantId || l.committed >= qty || (l.committed === 0 && l.available >= qty)),
  )
  const reservedLoc = locCandidates.find((l) => [...needByVariant.keys()].includes(l.variantId) && l.committed > 0)?.locationId
    ?? locCandidates.find((l) => [...needByVariant.keys()].includes(l.variantId))?.locationId
    ?? f.locations[0].id
  const ff2 = await mut('orderFulfill', `orderFulfill(input: { orderId: "${target.id}", lineItemIds: [${ids}], locationId: "${reservedLoc}", trackingNumber: "QA-TRACK-1", carrier: "USPS", notifyCustomer: true }) { order { fulfillmentStatus status } userErrors { message } }`)
  check('orderFulfill → fulfilled+closed', ff2.order?.fulfillmentStatus === 'fulfilled' && ff2.order.status === 'closed', JSON.stringify(ff2.userErrors))

  const rf = await mut('orderRefund', `orderRefund(input: { orderId: "${target.id}", amount: 1.00, reason: "QA", lineItemIds: [${ids}], restock: true }) { order { paymentStatus } userErrors { message } }`)
  check('orderRefund → partially_refunded', rf.order?.paymentStatus === 'partially_refunded', JSON.stringify(rf.userErrors))

  const over = await mut('orderRefund', `orderRefund(input: { orderId: "${target.id}", amount: 999999, reason: "QA", lineItemIds: [${ids}] }) { userErrors { message } }`)
  check('orderRefund over-refund → userError', over.userErrors?.length > 0)

  const ro = await mut('orderReopen', `orderReopen(id: "${target.id}") { order { status } }`)
  check('orderReopen', ro.order?.status === 'open')

  const ed = await mut('orderEdit', `orderEdit(id: "${target.id}", added: [], removed: []) { order { total } userErrors { message } }`)
  check('orderEdit no-op → userError or ok', ed.order || ed.userErrors?.length)

  const cl = await mut('orderClose', `orderClose(id: "${target.id}") { order { status } }`)
  check('orderClose', cl.order?.status === 'closed')

  // restore: reopen
  await mut('orderReopen', `orderReopen(id: "${target.id}") { order { status } }`)
}

console.log('═══ 4. MUTATIONS: drafts ═══')
{
  const c = await GQL(`{ customers(first: 1) { edges { node { id } } } }`)
  const custId = c.customers.edges[0].node.id
  const varId = (await pickStockedProduct()).variants[0].id
  const levels = await GQL(`{ inventoryLevels { variantId locationId available } }`)
  const freeLevel = (levels.inventoryLevels ?? []).find((l) => l.variantId === varId && l.available >= 2)
  if (!freeLevel) {
    // Reservation guard (C1) legitimately blocks conversion on 0 stock — top up first.
    const topLoc = (levels.inventoryLevels ?? []).find((l) => l.variantId === varId)?.locationId
    if (topLoc) {
      const bump = await mut('inventoryAdjust', `inventoryAdjust(input: { variantId: "${varId}", locationId: "${topLoc}", availableDelta: 10, reason: "qa-topup" }) { level { available } userErrors { message } }`)
      check('QA stock top-up for convert test', (bump.level?.available ?? 0) >= 2, JSON.stringify(bump.userErrors))
    } else {
      check('QA stock top-up for convert test (no level row)', false, 'variant has no inventory level')
    }
  }

  const d = await mut('draftOrderCreate', `draftOrderCreate(customerId: "${custId}", items: [{ variantId: "${varId}", quantity: 2 }], note: "QA draft") { order { id name isDraft total } userErrors { message } }`)
  check('draftOrderCreate', d.order?.isDraft === true && d.order.total > 0, JSON.stringify(d.userErrors) + (d.__error ?? ''))
  if (!d.order) { console.log('RESULT (aborted): ' + pass + ' passed, ' + fail + ' failed'); process.exit(1) }
  const draftId = d.order.id

  const conv = await mut('draftOrderConvert', `draftOrderConvert(id: "${draftId}") { order { id isDraft name } userErrors { message } }`)
  check('draftOrderConvert → real order', conv.order?.isDraft === false, JSON.stringify(conv.userErrors))
  if (!conv.order) { console.log('RESULT (aborted): ' + pass + ' passed, ' + fail + ' failed'); process.exit(1) }
  const del = await mut('orderCancel', `orderCancel(id: "${conv.order.id}") { order { status } }`)
  check('cancel converted order', del.order?.status === 'cancelled')
}

console.log('═══ 5. MUTATIONS: customers/companies/segments ═══')
{
  const r = await mut('customerCreate', `customerCreate(customer: { firstName: "QA", lastName: "Tester", email: "qa-tester-${RUN}@example.com", defaultAddress: { address1: "1 QA Way", city: "Portland", province: "OR", country: "United States", zip: "97201" } }) { customer { id email } userErrors { message } }`)
  const cid = r.customer?.id
  check('customerCreate', !!cid)
  const dup = await mut('customerCreate', `customerCreate(customer: { firstName: "QA2", lastName: "T", email: "qa-tester-${RUN}@example.com" }) { userErrors { message } }`)
  check('customerCreate duplicate email → userError', dup.userErrors?.length > 0)
  const u = await mut('customerUpdate', `customerUpdate(id: "${cid}", customer: { note: "QA note", tags: ["qa"] }) { customer { note tags } }`)
  check('customerUpdate', u.customer?.note === 'QA note')
  if (!cid) { console.log('RESULT (aborted): ' + pass + ' passed, ' + fail + ' failed'); process.exit(1) }
  const t = await GQL(`{ customer(id: "${cid}") { ordersCount totalSpent } }`)
  check('customer derived stats on fresh customer', t.customer.ordersCount === 0 && t.customer.totalSpent === 0)

  const co = await mut('companyCreate', `companyCreate(company: { name: "QA Corp ${RUN}", customerId: "${cid}", locationName: "QA HQ", address: { address1: "1 QA Way", city: "Portland", province: "OR", country: "United States", zip: "97201" }, priceListDiscountPercent: 12 }) { company { id name locations { name } } userErrors { message } }`)
  const coid = co.company?.id
  check('companyCreate', !!coid, JSON.stringify(co.userErrors ?? []) + (co.__error ?? ''))
  const ca = await mut('companyContactAdd', `companyContactAdd(id: "${coid}", contact: { name: "QA Contact", email: "contact@qacorp.com" }) { company { contacts { email } } userErrors { message } }`)
  check('companyContactAdd', ca.company.contacts.length === 1)

  const sg = await mut('segmentCreate', `segmentCreate(segment: { name: "QA Segment ${RUN}", filters: [{ column: "tag", relation: "equals", value: "qa" }] }) { segment { id memberCount } userErrors { message } }`)
  check('segmentCreate', !!sg.segment?.id, JSON.stringify(sg.userErrors ?? []) + (sg.__error ?? ''))
  const sm = await GQL(`{ segmentMembers(id: "${sg.segment.id}") { totalCount customers { email } } }`)
  check('segmentMembers evaluates filters', sm.segmentMembers.customers.some((c) => c.email.startsWith('qa-tester-')))
}

console.log('═══ 6. MUTATIONS: discounts/giftcards/content/metafields ═══')
{
  const r = await mut('discountCreate', `discountCreate(discount: { code: "QA10", title: "QA discount", type: "percentage", method: "code", value: 10 }) { discount { id code } userErrors { message } }`)
  const did = r.discount?.id
  check('discountCreate', !!did)
  const dup = await mut('discountCreate', `discountCreate(discount: { code: "QA10", title: "dup", type: "percentage", value: 5 }) { userErrors { message } }`)
  check('discountCreate duplicate code → userError', dup.userErrors?.length > 0)
  const bad = await mut('discountCreate', `discountCreate(discount: { code: "QA-BAD", type: "percentage", value: 150 }) { userErrors { message } }`)
  check('discount >100% → userError', bad.userErrors?.length > 0)
  await mut('discountDelete', `discountDelete(ids: ["${did}"]) { deletedIds }`)

  const g = await mut('giftCardCreate', `giftCardCreate(input: { initialBalance: 25 }) { giftCard { id code balance status } userErrors { message } }`)
  const gid = g.giftCard?.id
  check('giftCardCreate', g.giftCard?.balance === 25)
  const adj = await mut('giftCardBalanceAdjust', `giftCardBalanceAdjust(id: "${gid}", newBalance: 15, note: "QA") { giftCard { balance } }`)
  check('giftCardBalanceAdjust', adj.giftCard.balance === 15)
  const gcNotif = await mut('giftCardSendNotification', `giftCardSendNotification(id: "${gid}") { giftCard { id history { type amount note } } userErrors { message } }`)
  const notifEvent = gcNotif.giftCard?.history?.find((h) => h.type === 'notification_sent')
  check('giftCardSendNotification records notification event with valid amount', notifEvent && notifEvent.amount === 0)
  await mut('giftCardDisable', `giftCardDisable(id: "${gid}") { giftCard { status } }`)
  const disNotif = await mut('giftCardSendNotification', `giftCardSendNotification(id: "${gid}") { giftCard { id } userErrors { message } }`)
  check('giftCardSendNotification rejects disabled gift card', disNotif.userErrors?.length > 0)
  const pg = await mut('pageCreate', `pageCreate(page: { title: "QA Page", contentHtml: "<p>qa</p>" }) { page { id handle } userErrors { message } }`)
  check('pageCreate', !!pg.page?.id)
  await mut('pageDelete', `pageDelete(ids: ["${pg.page.id}"]) { updatedIds }`)

  const po = await mut('blogPostCreate', `blogPostCreate(post: { title: "QA Post" }) { post { id } }`)
  check('blogPostCreate', !!po.post?.id)
  await mut('blogPostDelete', `blogPostDelete(ids: ["${po.post.id}"]) { updatedIds }`)

  const fr = await mut('fileCreate', `fileCreate(input: { url: "/images/products/qa.svg", name: "qa.svg" }) { file { id name } }`)
  check('fileCreate', !!fr.file?.id)
  await mut('fileDelete', `fileDelete(ids: ["${fr.file.id}"]) { updatedIds }`)

  const rd = await mut('redirectCreate', `redirectCreate(redirect: { from: "/qa-test", to: "/pages/about" }) { redirect { id from } userErrors { message } }`)
  check('redirectCreate', !!rd.redirect?.id)
  await mut('redirectDelete', `redirectDelete(id: "${rd.redirect.id}") { updatedIds }`)

  const def = await mut('metafieldDefinitionCreate', `metafieldDefinitionCreate(definition: { name: "QA Field", key: "qa_field", type: "single_line_text", resourceType: "product" }) { definition { id } }`)
  check('metafieldDefinitionCreate', !!def.definition?.id)
  const ms = await mut('metafieldsSet', `metafieldsSet(metafields: [{ ownerType: "product", ownerId: "${testProductId}", definitionId: "${def.definition.id}", value: "qa-value" }]) { metafields { value } }`)
  check('metafieldsSet', ms.metafields?.[0]?.value === 'qa-value')
  const mfr = await GQL(`{ metafields(ownerType: "product", ownerId: "${testProductId}") { definitionId value } }`)
  check('metafields persisted + readable', mfr.metafields.some((m) => m.value === 'qa-value'))
}

console.log('═══ 7. MUTATIONS: staff/settings/system ═══')
{
  const s = await mut('staffMemberCreate', `staffMemberCreate(input: { name: "QA Staff", email: "qa-staff@northstargoods.com" }) { staffMember { id status permissions } userErrors { message } }`)
  const sid = s.staffMember?.id
  check('staffMemberCreate (invited + default perms)', s.staffMember?.status === 'invited')
  const ps = await mut('staffMemberPermissionSet', `staffMemberPermissionSet(id: "${sid}", resource: "products", actions: ["view", "edit", "delete"]) { staffMember { permissions } }`)
  check('staffMemberPermissionSet', JSON.stringify(ps.staffMember.permissions).includes('delete'))
  await mut('staffMemberDelete', `staffMemberDelete(id: "${sid}") { updatedIds }`)

  const su = await mut('settingsUpdate', `settingsUpdate(value: { storeName: "Northstar Goods", email: "hello@northstargoods.com" }) { storeName }`)
  check('settingsUpdate', !!su.storeName)

  const tu = await mut('themeUpdate', `themeUpdate(value: { activeTheme: "Northstar" }) { activeTheme }`)
  check('themeUpdate', !!tu.activeTheme)

  const mk = await mut('marketUpdate', `marketUpdate(code: "GB", priceAdjustmentPercent: 9) { priceAdjustmentPercent }`)
  check('marketUpdate', mk.priceAdjustmentPercent === 9)

  const tt = await mut('taskToggle', `taskToggle(id: "t_2") { storeName }`)
  check('taskToggle', !!tt.storeName)

  const nr = await mut('notificationMarkAllRead', `notificationMarkAllRead { storeName }`)
  check('notificationMarkAllRead', !!nr.storeName)
}

console.log('═══ 8. TRANSFER WORKFLOW (two-step stock move) ═══')
{
  const levelsAll = await GQL(`{ inventoryLevels { variantId locationId available } }`)
  const stocked = levelsAll.inventoryLevels.find((l) => l.locationId === locId && l.available >= 5)
  const varId = stocked.variantId
  const before = await GQL(`{ inventoryLevels { variantId locationId available } }`)
  const b1 = before.inventoryLevels.find((l) => l.variantId === varId && l.locationId === locId)?.available ?? 0
  const b2 = before.inventoryLevels.find((l) => l.variantId === varId && l.locationId === loc2Id)?.available ?? 0

  const created = await mut('inventoryTransferCreate', `inventoryTransferCreate(input: { fromLocationId: "${locId}", toLocationId: "${loc2Id}", note: "QA transfer", lines: [{ variantId: "${varId}", quantity: 3 }] }) { transfer { id name status } userErrors { message } }`)
  const tid = created.transfer?.id
  check('inventoryTransferCreate (draft)', created.transfer?.status === 'draft')
  const sent = await mut('inventoryTransferSend', `inventoryTransferSend(id: "${tid}") { transfer { status } userErrors { message } }`)
  check('inventoryTransferSend → in_transit', sent.transfer?.status === 'in_transit', JSON.stringify(sent.userErrors))
  const afterSend = await GQL(`{ inventoryLevels { variantId locationId available } }`)
  const a1 = afterSend.inventoryLevels.find((l) => l.variantId === varId && l.locationId === locId)?.available ?? 0
  check('send decrements source', a1 === b1 - 3, `b1=${b1} a1=${a1}`)
  await mut('inventoryTransferReceive', `inventoryTransferReceive(id: "${tid}") { transfer { status } }`)
  const afterRecv = await GQL(`{ inventoryLevels { variantId locationId available } }`)
  const a2 = afterRecv.inventoryLevels.find((l) => l.variantId === varId && l.locationId === loc2Id)?.available ?? 0
  check('receive increments destination', a2 === b2 + 3, `b2=${b2} a2=${a2}`)

  // insufficient-stock guard: request more than available
  const big = await mut('inventoryTransferCreate', `inventoryTransferCreate(input: { fromLocationId: "${locId}", toLocationId: "${loc2Id}", lines: [{ variantId: "${varId}", quantity: 999999 }] }) { transfer { id } }`)
  const bigSend = await mut('inventoryTransferSend', `inventoryTransferSend(id: "${big.transfer.id}") { transfer { status } userErrors { message } }`)
  check('send insufficient stock → userError', bigSend.transfer === null && bigSend.userErrors?.length > 0, JSON.stringify(bigSend.userErrors))
}

console.log('═══ 9. ERROR HANDLING ═══')
{
  const bad = await GQL(`{ product(id: "nonexistent") { id } }`)
  check('missing product → null, not error', bad.product === null)
  const nf = await mut('orderMarkAsPaid', `orderMarkAsPaid(id: "nonexistent") { userErrors { message } }`)
  check('missing order mutation → userError', nf.userErrors?.length > 0)
  const gqlErr = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieJar }, body: '{"query":"{ nosuchfield }"}' }).then((r) => r.json())
  check('invalid field → GraphQL error', gqlErr.errors?.length > 0)
}

console.log('═══ 10. RELAY & GRAPHQL PARITY FEATURES ═══')
{
  // 1. PageInfo cursors & backward pagination
  const p1 = await GQL(`{ products(first: 3) { pageInfo { startCursor endCursor hasNextPage hasPreviousPage } edges { cursor node { id } } } }`)
  check('pageInfo has startCursor and endCursor', !!p1.products?.pageInfo?.startCursor && !!p1.products?.pageInfo?.endCursor)
  const lastCursor = p1.products?.pageInfo?.endCursor
  const pBack = await GQL(`{ products(last: 2, before: "${lastCursor}") { pageInfo { hasNextPage hasPreviousPage } edges { node { id } } } }`)
  check('backward pagination with last/before', (pBack.products?.edges?.length ?? 0) > 0)

  // 2. Node & nodes queries with GID
  const nodeProduct = await GQL(`{ node(id: "gid://shopify/Product/${testProductId}") { id ... on Product { title } } }`)
  check('node query by GID resolves Product', nodeProduct.node?.id === testProductId && !!nodeProduct.node?.title)

  const nodeMiss = await GQL(`{ node(id: "gid://shopify/Order/${testProductId}") { id } }`)
  check('typed GID miss returns null', nodeMiss.node === null)

  const nodesRes = await GQL(`{ nodes(ids: ["${testProductId}", "gid://shopify/Product/${testProductId}"]) { id } }`)
  check('nodes bulk query returns array', Array.isArray(nodesRes.nodes) && nodesRes.nodes.length === 2)

  // 3. Variant CRUD mutations & options sync
  const varCreate = await mut('productVariantCreate', `productVariantCreate(input: { productId: "${testProductId}", title: "QA Variant", price: 19.99, inventoryQuantity: 10 }) { productVariant { id title price } userErrors { message } }`)
  const createdVarId = varCreate.productVariant?.id
  check('productVariantCreate succeeds', !!createdVarId)

  const prodWithVariant = await GQL(`{ product(id: "${testProductId}") { variants { id title } } }`)
  const hasVariant = prodWithVariant.product?.variants?.some((v) => v.id === createdVarId)
  check('productVariantCreate persisted on product', !!hasVariant)

  const varUpdate = await mut('productVariantUpdate', `productVariantUpdate(id: "${createdVarId}", input: { price: 24.99, inventoryQuantity: 30 }) { productVariant { price } userErrors { message } }`)
  check('productVariantUpdate updates price', varUpdate.productVariant?.price === 24.99)

  const varDelete = await mut('productVariantDelete', `productVariantDelete(id: "${createdVarId}") { deletedProductVariantId userErrors { message } }`)
  check('productVariantDelete succeeds', varDelete.deletedProductVariantId === createdVarId)

  // 4. draftOrderCalculate
  const customerList = await GQL(`{ customers(first: 1) { edges { node { id } } } }`)
  const testCustomerId = customerList.customers?.edges?.[0]?.node?.id
  const calcVarId = (await pickStockedProduct()).variants[0].id
  if (testCustomerId && calcVarId) {
    const draftCalc = await mut('draftOrderCalculate', `draftOrderCalculate(input: { customerId: "${testCustomerId}", items: [{ variantId: "${calcVarId}", quantity: 2 }], shippingPrice: 5, discountAmount: 2 }) { calculatedDraftOrder { total subtotal taxTotal shippingPrice totalDiscount } userErrors { message } }`)
    check('draftOrderCalculate computes totals without writing order', typeof draftCalc.calculatedDraftOrder?.total === 'number' && draftCalc.calculatedDraftOrder?.total > 0)
  }
  // 5. Variant node resolution
  const nodeVariant = await GQL(`{ node(id: "gid://shopify/ProductVariant/${calcVarId}") { id ... on ProductVariant { title } } }`)
  check('node query by GID resolves ProductVariant', nodeVariant.node?.id === calcVarId)
}

console.log('═══ 11. PARITY ADDITIONS — counts, currentStaffMember, domains, policies ═══')
{
  const counts = await GQL(`{ productsCount customersCount ordersCount draftOrdersCount discountsCount giftCardsCount segmentsCount pagesCount blogPostsCount redirectsCount locationsCount collectionsCount }`)
  check('all count queries return integers', Object.values(counts).every((v) => typeof v === 'number' && v >= 0), JSON.stringify(counts))
  const me = await GQL(`{ currentStaffMember { id email } }`)
  check('currentStaffMember resolves', !!me.currentStaffMember?.email)
  const domains = await GQL(`{ domains { host primary sslEnabled verificationStatus } }`)
  check('domains list has exactly one primary', (domains.domains ?? []).length > 0 && domains.domains.filter((d) => d.primary).length === 1)
  const domAdd = await GQL(`mutation { domainAdd(host: "qa-test.example.com") { host primary } }`)
  check('domainAdd returns list incl. new host', domAdd.domainAdd?.some((d) => d.host === 'qa-test.example.com'))
  const domDel = await GQL(`mutation { domainDelete(host: "qa-test.example.com") { host } }`)
  check('domainDelete removes host', !(domDel.domainDelete ?? []).some((d) => d.host === 'qa-test.example.com'))
  const pol = await GQL(`{ shopPolicies }`)
  check('shopPolicies returns JSON object', pol.shopPolicies && typeof pol.shopPolicies === 'object')
  const polUpd = await GQL(`mutation { shopPolicyUpdate(policy: "shipping", body: "QA shipping policy") { value } }`)
  check('shopPolicyUpdate persists into settings', JSON.stringify(polUpd.shopPolicyUpdate?.value ?? '').includes('QA shipping policy'))
  await GQL(`mutation { shopPolicyUpdate(policy: "shipping", body: "Orders ship within 1-2 business days from Portland OR or Brooklyn NY. Free US shipping over $75.") { value } }`)
}

console.log('═══ 12. PARITY ADDITIONS — customer consent / invite / merge ═══')
{
  const c1 = await GQL(`{ customers(first: 1, query: "a") { edges { node { id email } } } }`)
  const cid = c1.customers?.edges?.[0]?.node?.id
  if (cid) {
    const consent = await mut('customerEmailMarketingConsentUpdate', `customerEmailMarketingConsentUpdate(ids: ["${cid}"], consentState: "unsubscribed") { customers { id emailMarketingConsent } userErrors { message } }`)
    const custBack = await GQL(`{ customer(id: "${cid}") { emailMarketingConsent } }`)
    check('email consent updated', JSON.stringify(custBack.customer?.emailMarketingConsent ?? '').includes('unsubscribed') || consent.customers?.length > 0)
    await mut('customerEmailMarketingConsentUpdate', `customerEmailMarketingConsentUpdate(ids: ["${cid}"], consentState: "subscribed") { customers { id } userErrors { message } }`)
    const invite = await mut('customerSendAccountInviteEmail', `customerSendAccountInviteEmail(id: "${cid}") { customer { id } userErrors { message } }`)
    check('account invite returns customer', !!invite.customer?.id)
  }
  const two = await GQL(`mutation { c1: customerCreate(customer: { email: "qa-merge-a@example.com", firstName: "QA", lastName: "A" }) { customer { id } } c2: customerCreate(customer: { email: "qa-merge-b@example.com", firstName: "QA", lastName: "B" }) { customer { id } } }`)
  const a = two.c1?.customer?.id, b = two.c2?.customer?.id
  if (a && b) {
    const merged = await mut('customerMerge', `customerMerge(primaryId: "${a}", secondaryId: "${b}") { customer { id } userErrors { message } }`)
    check('customerMerge returns primary', merged.customer?.id === a)
    const gone = await GQL(`{ customer(id: "${b}") { id } }`)
    check('secondary deleted after merge', gone.customer === null)
    await mut('customerDelete', `customerDelete(ids: ["${a}"]) { deletedIds userErrors { message } }`)
  }
}

console.log('═══ 13. PARITY ADDITIONS — price lists + B2B pricing ═══')
{
  const company = await GQL(`{ companies(first: 1) { edges { node { id customerId } } } }`)
  const comp = company.companies?.edges?.[0]?.node
  const varId = (await pickStockedProduct()).variants[0].id
  if (comp && varId) {
    const pl = await mut('priceListCreate', `priceListCreate(input: { name: "QA List", companyId: "${comp.id}", entries: [{ variantId: "${varId}", price: 1.5 }] }) { priceList { id entries { variantId price } } userErrors { message } }`)
    check('priceListCreate with fixed price', pl.priceList?.entries?.some((e) => e.variantId === varId && e.price === 1.5))
    const calc = await mut('draftOrderCalculate', `draftOrderCalculate(input: { customerId: "${comp.customerId}", items: [{ variantId: "${varId}", quantity: 1 }] }) { calculatedDraftOrder { subtotal lineItems { price } } userErrors { message } }`)
    const linePrice = calc.calculatedDraftOrder?.lineItems?.[0]?.price
    check('B2B fixed price applied to draft line', linePrice === 1.5, `expected 1.5 got ${linePrice}`)
    const del = await mut('priceListDelete', `priceListDelete(id: "${pl.priceList?.id}") { deletedId userErrors { message } }`)
    check('priceListDelete', del.deletedId === pl.priceList?.id)
    const calcAfter = await mut('draftOrderCalculate', `draftOrderCalculate(input: { customerId: "${comp.customerId}", items: [{ variantId: "${varId}", quantity: 1 }] }) { calculatedDraftOrder { lineItems { price } } }`)
    check('price reverts after list deletion', calcAfter.calculatedDraftOrder?.lineItems?.[0]?.price !== 1.5)
  }
  // Location-scoped price lists are opt-in per order location: orderEdit on an
  // order with NO fulfillments has orderLocationId null → the scoped price must
  // never apply (regression guard for the b2bPricing location rule).
  if (comp && varId) {
    const scoped = await mut('priceListCreate', `priceListCreate(input: { name: "QA Scoped ${RUN}", companyId: "${comp.id}", locationId: "${locId}", entries: [{ variantId: "${varId}", price: 0.01 }] }) { priceList { id } userErrors { message } }`)
    const scopedId = scoped.priceList?.id
    const custSc = comp.customerId
    // A second variant that exists ONLY on the scoped list: orderEdit must PUSH
    // a new line for it (editing an existing variant only bumps quantity and
    // never rewrites unit price — the pushed line is what exercises b2bPricing).
    const prodsSc = await GQL(`{ products(first: 100) { edges { node { totalInventory variants { id } } } } }`)
    const varSc2 = (prodsSc.products?.edges ?? []).map((e) => e.node).filter((n) => n.totalInventory >= 2 && n.variants.length > 0).map((n) => n.variants[0].id).find((v) => v !== varId)
    if (scopedId && custSc && varSc2) {
      // If this silently failed, varSc2 would never be on the scoped list, the
      // pushed line would price at catalog and the check below could not fail.
      const updSc = await mut('priceListUpdate', `priceListUpdate(id: "${scopedId}", input: { name: "QA Scoped ${RUN}", companyId: "${comp.id}", locationId: "${locId}", entries: [{ variantId: "${varId}", price: 0.01 }, { variantId: "${varSc2}", price: 0.01 }] }) { priceList { id } userErrors { message } }`)
      check('priceListUpdate added varSc2 to the scoped list', !!updSc.priceList?.id && !(updSc.userErrors?.length), JSON.stringify(updSc.userErrors))
      const dSc = await mut('draftOrderCreate', `draftOrderCreate(customerId: "${custSc}", items: [{ variantId: "${varId}", quantity: 1 }]) { order { id } userErrors { message } }`)
      const cvSc = await mut('draftOrderConvert', `draftOrderConvert(id: "${dSc.order?.id}") { order { id lineItems { id } } userErrors { message } }`)
      const beforeSc = (cvSc.order?.lineItems ?? []).length
      const oeSc = await mut('orderEdit', `orderEdit(id: "${cvSc.order?.id}", added: [{ variantId: "${varSc2}", quantity: 1 }], removed: []) { order { lineItems { variantId price } } userErrors { message } }`)
      const linesSc = oeSc.order?.lineItems ?? []
      const pushed = linesSc.find((l) => l.variantId === varSc2)
      check('b2b location-scoped list ignored without order location', oeSc.userErrors?.length === 0 && linesSc.length === beforeSc + 1 && pushed != null && pushed.price !== 0.01 && linesSc.every((l) => l.price !== 0.01), JSON.stringify(oeSc.order ?? oeSc.userErrors))
      await mut('orderCancel', `orderCancel(id: "${cvSc.order?.id}") { order { status } }`)
    } else {
      check('b2b scoped fixtures present', false, JSON.stringify({ list: !!scopedId, cust: !!custSc, var2: !!varSc2 }))
    }
    if (scopedId) await mut('priceListDelete', `priceListDelete(id: "${scopedId}") { deletedId userErrors { message } }`)
  }
}

console.log('═══ 14. PARITY ADDITIONS — returns lifecycle, fulfillment events, inventory extras ═══')
{
  // create a fresh paid order via draft to test returns + fulfillment lifecycle
  const cust = await GQL(`{ customers(first: 1) { edges { node { id } } } }`)
  const custId = cust.customers?.edges?.[0]?.node?.id
  const vId = (await pickStockedProduct()).variants[0].id
  if (custId && vId) {
    const lvls = await GQL(`{ inventoryLevels { variantId locationId available } }`)
    if (!(lvls.inventoryLevels ?? []).some((l) => l.variantId === vId && l.available >= 2)) {
      const anyLoc = (lvls.inventoryLevels ?? []).find((l) => l.variantId === vId)?.locationId
      if (anyLoc) await mut('inventoryAdjust', `inventoryAdjust(input: { variantId: "${vId}", locationId: "${anyLoc}", availableDelta: 10, reason: "qa-topup" }) { level { available } userErrors { message } }`)
    }
    const d = await mut('draftOrderCreate', `draftOrderCreate(customerId: "${custId}", items: [{ variantId: "${vId}", quantity: 2 }]) { order { id } userErrors { message } }`)
    const draftId = d.order?.id
    const conv = await mut('draftOrderConvert', `draftOrderConvert(id: "${draftId}") { order { id name } userErrors { message } }`)
    const orderId = conv.order?.id
    await mut('orderMarkAsPaid', `orderMarkAsPaid(id: "${orderId}") { order { id } userErrors { message } }`)
    const preLines = await GQL(`{ order(id: "${orderId}") { lineItems { id } } }`)
    const realLineId = preLines.order?.lineItems?.[0]?.id
    const ret = await mut('returnCreate', `returnCreate(orderId: "${orderId}", lines: [{ lineItemId: "${realLineId}", quantity: 1 }], reason: "QA") { return { id status } userErrors { message } }`)
    const retId = ret.return?.id
    check('returnCreate → requested status', retId && (ret.return.status === 'requested' || ret.return.status === 'open'))
    const appr = await mut('returnApprove', `returnApprove(id: "${retId}") { return { id status } userErrors { message } }`)
    check('returnApprove → approved', appr.return?.status === 'approved')
    const decAfterApprove = await mut('returnDecline', `returnDecline(id: "${retId}") { return { status } userErrors { message } }`)
    check('decline after approve → declined (decline is allowed from approved)', decAfterApprove.return?.status === 'declined', JSON.stringify(decAfterApprove.userErrors))
    const canceled = await mut('returnCancel', `returnCancel(id: "${retId}") { return { status } userErrors { message } }`)
    check('returnCancel from declined → canceled', canceled.return?.status === 'canceled', JSON.stringify(canceled.userErrors))
    // fulfillment event + cancel on a new fulfillment
    const ful = await mut('orderFulfill', `orderFulfill(input: { orderId: "${orderId}", lineItemIds: [], locationId: "any" }) { order { id } userErrors { message } }`)
    check('fulfill with no lines → userError', ful.userErrors?.length > 0)
    const ordLines = await GQL(`{ order(id: "${orderId}") { lineItems { id } fulfillments { id } } }`)
    const lineIds = (ordLines.order?.lineItems ?? []).map((l) => `"${l.id}"`).join(',')
    // Fulfill from the location where conversion reserved the stock (Shopify semantics).
    const reservedLv = await GQL(`{ inventoryLevels { variantId locationId available committed } }`)
    const fulfillLoc = (reservedLv.inventoryLevels ?? []).find((l) => l.variantId === vId && l.committed >= 2)?.locationId
    const ok = await mut('orderFulfill', `orderFulfill(input: { orderId: "${orderId}", lineItemIds: [${lineIds}], locationId: "${fulfillLoc ?? ''}", trackingNumber: "QA-TRK-1", carrier: "UPS" }) { order { id fulfillments { id trackingNumber events { status } } } userErrors { message } }`)
    const fId = ok.order?.fulfillments?.[0]?.id
    check('orderFulfill creates fulfillment', !!fId, JSON.stringify(ok.userErrors) + (ok.__error ?? ''))
    const ev = await mut('fulfillmentEventCreate', `fulfillmentEventCreate(fulfillmentId: "${fId}", status: "IN_TRANSIT", message: "QA scan") { order { fulfillments { events { status } } } userErrors { message } }`)
    check('fulfillmentEventCreate appends event', ev.order?.fulfillments?.[0]?.events?.some((e) => e.status === 'IN_TRANSIT'))
    const fcancel = await mut('fulfillmentCancel', `fulfillmentCancel(fulfillmentId: "${fId}") { order { fulfillmentStatus fulfillments { id } } userErrors { message } }`)
    check('fulfillmentCancel removes fulfillment', (fcancel.order?.fulfillments ?? []).length === 0 && fcancel.order?.fulfillmentStatus !== 'fulfilled')
    await mut('orderCancel', `orderCancel(id: "${orderId}") { order { id } userErrors { message } }`)
  }
  // inventory extras: set on hand + move
  const locs = await GQL(`{ locations { id } }`)
  if (locs.locations?.length >= 2 && vId) {
    const [l1, l2] = locs.locations
    const set = await mut('inventorySetOnHandQuantities', `inventorySetOnHandQuantities(input: { variantId: "${vId}", locationId: "${l1.id}", setQuantity: 7, reason: "count" }) { level { available committed } userErrors { message } }`)
    check('setOnHandQuantities sets available', set.level?.available === 7 - (set.level?.committed ?? 0), JSON.stringify(set.userErrors))
    const moved = await mut('inventoryMoveQuantities', `inventoryMoveQuantities(input: { variantId: "${vId}", fromLocationId: "${l1.id}", toLocationId: "${l2.id}", quantity: 3 }) { levels { locationId available } userErrors { message } }`)
    check('moveQuantities returns both levels', (moved.levels ?? []).length === 2, JSON.stringify(moved.userErrors))
  }
  const item = await mut('inventoryItemUpdate', `inventoryItemUpdate(variantId: "${vId}", tracked: false) { productVariant { id } userErrors { message } }`)
  check('inventoryItemUpdate tracked toggle', !!item.productVariant?.id)
  await mut('inventoryItemUpdate', `inventoryItemUpdate(variantId: "${vId}", tracked: true) { productVariant { id } }`)
}

console.log('═══ 15. PARITY ADDITIONS — payouts, analytics, saved searches, metaobjects ═══')
{
  const pays = await GQL(`{ payouts { id status amount issuedAt } }`)
  check('payouts materialized with statuses', (pays.payouts ?? []).length > 0 && pays.payouts.every((p) => ['scheduled', 'in_transit', 'paid'].includes(p.status)))
  const withPayout = await GQL(`{ balanceTransactions(first: 200) { payoutId type } }`)
  check('balance transactions linked to payouts', (withPayout.balanceTransactions ?? []).some((t) => t.payoutId))
  const now = new Date(), then = new Date(now.getTime() - 30 * 864e5)
  const an = await GQL(`query($f: DateTime!, $t: DateTime!) { analytics(from: $f, to: $t) { grossSales netSales refunds ordersCount avgOrderValue topProducts { productId units } } }`, { f: then.toISOString(), t: now.toISOString() })
  check('analytics computes summary', an.analytics?.ordersCount >= 0 && typeof an.analytics?.netSales === 'number', JSON.stringify(an).slice(0, 200))
  const ss = await mut('savedSearchCreate', `savedSearchCreate(search: { name: "QA Search", resourceType: "orders", query: "status:open" }) { savedSearch { id name } userErrors { message } }`)
  check('savedSearchCreate', !!ss.savedSearch?.id)
  const ssList = await GQL(`{ savedSearches(resourceType: "orders") { id name resourceType query } }`)
  check('savedSearches filter by resource', (ssList.savedSearches ?? []).length >= 1 && ssList.savedSearches.every((s) => s.resourceType === 'orders'))
  await mut('savedSearchDelete', `savedSearchDelete(id: "${ss.savedSearch?.id}") { userErrors { message } }`)
  const snap = await GQL(`{ bootstrap { metaobjectDefinitions { id } metaobjectEntries { id } priceLists { id } savedSearches { id } } }`)
  check('bootstrap carries metaobjects + priceLists + savedSearches', (snap.bootstrap?.metaobjectDefinitions ?? []).length > 0 && Array.isArray(snap.bootstrap?.priceLists))
  const mods = await GQL(`{ metaobjectDefinitions { id name fields { key label type } } }`)
  const defId = mods.metaobjectDefinitions?.[0]?.id
  if (defId) {
    const defFields = mods.metaobjectDefinitions?.[0]
    const defUpd = await mut('metaobjectDefinitionUpdate', `metaobjectDefinitionUpdate(id: "${defId}", definition: { name: "QA Renamed", fields: [{ key: "k", label: "K", type: "single_line_text_field" }] }) { definition { id name } userErrors { message } }`)
    check('metaobjectDefinitionUpdate', defUpd.definition?.name === 'QA Renamed')
    const fieldsLiteral = (defFields?.fields ?? []).map((f) => `{ key: "${f.key}", label: "${f.label}", type: "${f.type}" }`).join(', ')
    await mut('metaobjectDefinitionUpdate', `metaobjectDefinitionUpdate(id: "${defId}", definition: { name: "${defFields?.name ?? 'Metaobject'}", fields: [${fieldsLiteral}] }) { definition { id } userErrors { message } }`)
  }
}

console.log('═══ 16. REVIEW REGRESSIONS — inventory invariant, analytics funnel, domains, price lists, merge, returns gate, reset ═══')
{
  // ── C1: convert → fulfill → fulfillmentCancel keeps the stock ledger balanced ──
  const cand16 = await pickStockedProduct(6)
  const cust16 = await GQL(`{ customers(first: 1) { edges { node { id } } } }`)
  const cid16 = cust16.customers?.edges?.[0]?.node?.id
  if (!cid16) throw new Error('no customers found for C1')
  { // cid16 is non-null — guaranteed by the throw above; cand16 by pickStockedProduct
    const vid16 = cand16.variants[0].id
    const levels = async () => {
      const d = await GQL(`{ inventoryLevels { variantId available committed } }`)
      return (d.inventoryLevels ?? []).filter((l) => l.variantId === vid16).reduce((s, l) => ({ a: s.a + l.available, c: s.c + l.committed }), { a: 0, c: 0 })
    }
    const lv0 = await GQL(`{ inventoryLevels { variantId locationId available } }`)
    const stock16 = (lv0.inventoryLevels ?? []).filter((l) => l.variantId === vid16).reduce((s, l) => s + l.available, 0)
    if (stock16 < 4) {
      const anyLoc = (lv0.inventoryLevels ?? []).find((l) => l.variantId === vid16)?.locationId
      await mut('inventoryAdjust', `inventoryAdjust(input: { variantId: "${vid16}", locationId: "${anyLoc}", availableDelta: 8, reason: "qa-topup-16" }) { level { available } userErrors { message } }`)
    }
    const s0 = await levels()
    const d16 = await mut('draftOrderCreate', `draftOrderCreate(customerId: "${cid16}", items: [{ variantId: "${vid16}", quantity: 2 }]) { order { id } userErrors { message } }`)
    const conv16 = await mut('draftOrderConvert', `draftOrderConvert(id: "${d16.order?.id}") { order { id } userErrors { message } }`)
    const oid16 = conv16.order?.id
    await mut('orderMarkAsPaid', `orderMarkAsPaid(id: "${oid16}") { order { id } userErrors { message } }`)
    const s1 = await levels()
    check('C1 convert reserves (available −2, committed +2)', s1.a === s0.a - 2 && s1.c === s0.c + 2, JSON.stringify({ s0, s1 }))
    const lv16 = await GQL(`{ inventoryLevels { variantId locationId committed } }`)
    const fulLoc16 = (lv16.inventoryLevels ?? []).find((l) => l.variantId === vid16 && l.committed >= 2)?.locationId
    const guard16 = await mut('orderFulfill', `orderFulfill(input: { orderId: "${oid16}", lineItemIds: [], locationId: "${fulLoc16 ?? ''}" }) { order { id } userErrors { message } }`)
    check('C1 empty fulfill guard still holds', guard16.userErrors?.length > 0)
    const lines16 = await GQL(`{ order(id: "${oid16}") { lineItems { id } } }`)
    const ids16 = (lines16.order?.lineItems ?? []).map((l) => `"${l.id}"`).join(',')
    const ok16 = await mut('orderFulfill', `orderFulfill(input: { orderId: "${oid16}", lineItemIds: [${ids16}], locationId: "${fulLoc16 ?? ''}" }) { order { id fulfillments { id restockMap } } userErrors { message } }`)
    const s2 = await levels()
    check('C1 fulfill consumes committed only', s2.a === s1.a && s2.c === s1.c - 2, JSON.stringify({ s1, s2 }))
    const mapRaw = ok16.order?.fulfillments?.[0]?.restockMap
    let mapOk = false
    try { mapOk = !!mapRaw && Object.values(typeof mapRaw === 'string' ? JSON.parse(mapRaw) : mapRaw).every((k) => k === 'committed') } catch {}
    check('C1 fulfillment records committed restockMap', mapOk, mapRaw ?? '')
    const fc16 = await mut('fulfillmentCancel', `fulfillmentCancel(fulfillmentId: "${ok16.order?.fulfillments?.[0]?.id}") { order { id } userErrors { message } }`)
    const s3 = await levels()
    check('C1 cancel restores committed, does NOT inflate available', s3.a === s2.a && s3.c === s2.c + 2, JSON.stringify({ s2, s3 }))
    await mut('orderCancel', `orderCancel(id: "${oid16}") { order { id } userErrors { message } }`)
    const s4 = await levels()
    check('C1 order cancel releases the reservation', s4.a === s0.a && s4.c === s0.c, JSON.stringify({ s0, s4 }))
  }

  // ── C4: server analytics = Shopify funnel (gross = merch, cancelled excluded) ──
  {
    const win = await GQL(`{ orders(first: 250) { edges { node { status createdAt subtotal discountCode { amount } refunds { amount } } } } }`)
    const now16 = new Date()
    const from16 = new Date(now16.getTime() - 60 * 864e5)
    const rows16 = (win.orders?.edges ?? []).map((e) => e.node).filter((o) => o.status !== 'cancelled' && new Date(o.createdAt) >= from16)
    const r2 = (x) => Math.round(x * 100) / 100
    const expGross = r2(rows16.reduce((s, o) => s + o.subtotal, 0))
    const expDisc = r2(rows16.reduce((s, o) => s + (o.discountCode?.amount ?? 0), 0))
    const expRef = r2(rows16.reduce((s, o) => s + o.refunds.reduce((x, r) => x + r.amount, 0), 0))
    const an16 = await GQL(`query($f: DateTime!, $t: DateTime!) { analytics(from: $f, to: $t) { grossSales discounts refunds netSales shipping taxes ordersCount } }`, { f: from16.toISOString(), t: now16.toISOString() })
    const a16 = an16.analytics
    check('C4 gross = merchandise subtotal, cancelled excluded', a16 && Math.abs(a16.grossSales - expGross) < 0.011, JSON.stringify({ got: a16?.grossSales, exp: expGross }))
    check('C4 discounts/refunds sum line up', a16 && Math.abs(a16.discounts - expDisc) < 0.011 && Math.abs(a16.refunds - expRef) < 0.011, JSON.stringify({ discounts: a16?.discounts, expDisc, refunds: a16?.refunds, expRef }))
    check('C4 net = gross − discounts − refunds (shipping NOT in net)', a16 && Math.abs(a16.netSales - (expGross - expDisc - expRef)) < 0.011, JSON.stringify({ net: a16?.netSales, exp: r2(expGross - expDisc - expRef) }))
    check('C4 ordersCount excludes cancelled', a16?.ordersCount === rows16.length, JSON.stringify({ got: a16?.ordersCount, exp: rows16.length }))
  }

  // ── W9: domain host normalization end-to-end ──
  {
    const up = await GQL(`mutation { domainAdd(host: "QA-Mixed.EXAMPLE.com") { host primary } }`)
    check('W9 domainAdd stores lowercase host', (up.domainAdd ?? []).some((d) => d.host === 'qa-mixed.example.com'), JSON.stringify(up.domainAdd))
    const prim = await GQL(`mutation { domainSetPrimary(host: "QA-Mixed.example.COM") { host primary } }`)
    check('W9 setPrimary matches normalized host', (prim.domainSetPrimary ?? []).find((d) => d.host === 'qa-mixed.example.com')?.primary === true, JSON.stringify(prim))
    const bad = await GQL(`mutation { domainAdd(host: "not a host") { host } }`)
    check('W9 invalid host rejected', !!bad.__error || (bad.domainAdd ?? []).every((d) => d.host !== 'not a host'), bad.__error ?? '')
    const del16 = await GQL(`mutation { domainDelete(host: "qa-mixed.example.com") { host } }`)
    check('W9 domainDelete removes normalized host', !(del16.domainDelete ?? []).some((d) => d.host === 'qa-mixed.example.com'), JSON.stringify(del16))
  }

  // ── W8: price list parentCompanyId survives GraphQL ──
  {
    const pl16 = await GQL(`{ priceLists { id companyId parentCompanyId } }`)
    const scoped = (pl16.priceLists ?? []).find((l) => l.companyId)
    check('W8 company-scoped list keeps parentCompanyId', !!scoped && scoped.parentCompanyId === scoped.companyId, JSON.stringify(pl16.priceLists))
  }

  // ── W6: merge moves orders + abandoned checkout + company (disposable fixtures) ──
  {
    const cb = await mut('customerCreate', `customerCreate(customer: { firstName: "QA", lastName: "MergeB", email: "qa-merge-b-${RUN}@example.com" }) { customer { id } userErrors { message } }`)
    const ca = await mut('customerCreate', `customerCreate(customer: { firstName: "QA", lastName: "MergeA", email: "qa-merge-a-${RUN}@example.com" }) { customer { id } userErrors { message } }`)
    // No abandonedCheckoutCreate mutation — fabricate the row directly, delete it after.
    const abRow = await getPrisma().abandonedCheckout.create({
      data: { id: `qa_ab_${RUN}`, customerId: cb.customer?.id ?? '', email: `qa-merge-b-${RUN}@example.com`, lineItems: [], total: 12.34 },
    })
    const mg = await mut('customerMerge', `customerMerge(primaryId: "${ca.customer?.id}", secondaryId: "${cb.customer?.id}") { customer { id } userErrors { message } }`)
    check('W6 customerMerge succeeds', !!mg.customer?.id, JSON.stringify(mg.userErrors))
    // Wide page: the moved-row assertion must never be eaten by pagination.
    const abAfter = await GQL(`{ abandonedCheckouts(first: 250) { id customerId } }`)
    check('W6 abandoned checkout moved to primary', (abAfter.abandonedCheckouts ?? []).find((c) => c.id === abRow.id)?.customerId === ca.customer?.id)
    const sec = await GQL(`{ customer(id: "${cb.customer?.id}") { id } }`)
    check('W6 secondary customer deleted', sec.customer == null)
    await getPrisma().abandonedCheckout.delete({ where: { id: abRow.id } }).catch(() => {})

    const cb2 = await mut('customerCreate', `customerCreate(customer: { firstName: "QA", lastName: "MergeB2", email: "qa-merge-b2-${RUN}@example.com" }) { customer { id } userErrors { message } }`)
    // Company must be owned by the SECONDARY so the merge has to re-point it;
    // owning it by the primary makes the assertion a false green.
    const co = await mut('companyCreate', `companyCreate(company: { name: "QA Merge Co ${RUN}", customerId: "${cb2.customer?.id}" }) { company { id } userErrors { message } }`)
    const mg2 = await mut('customerMerge', `customerMerge(primaryId: "${ca.customer?.id}", secondaryId: "${cb2.customer?.id}") { customer { id } userErrors { message } }`)
    check('W6 merge with owned company succeeds', !!mg2.customer?.id, JSON.stringify(mg2.userErrors))
    const coAfter = await GQL(`{ company(id: "${co.company?.id}") { id customerId } }`)
    check('W6 company re-pointed to primary', coAfter.company?.customerId === ca.customer?.id, JSON.stringify(coAfter))
  }

  // ── W10a: returnClose requires approval ──
  {
    const candC = await pickStockedProduct(4)
    const custC = await GQL(`{ customers(first: 1) { edges { node { id } } } }`)
    if (!custC.customers?.edges?.length) throw new Error('no customers found for W10')
    { // non-empty — guaranteed by the throw above; candC by pickStockedProduct
      const vidC = candC.variants[0].id
      const cidC = custC.customers.edges[0].node.id
      const dC = await mut('draftOrderCreate', `draftOrderCreate(customerId: "${cidC}", items: [{ variantId: "${vidC}", quantity: 1 }]) { order { id } userErrors { message } }`)
      const convC = await mut('draftOrderConvert', `draftOrderConvert(id: "${dC.order?.id}") { order { id } userErrors { message } }`)
      const oidC = convC.order?.id
      await mut('orderMarkAsPaid', `orderMarkAsPaid(id: "${oidC}") { order { id } userErrors { message } }`)
      const liC = await GQL(`{ order(id: "${oidC}") { lineItems { id } } }`)
      const retC = await mut('returnCreate', `returnCreate(orderId: "${oidC}", lines: [{ lineItemId: "${liC.order?.lineItems?.[0]?.id}", quantity: 1 }], reason: "QA16") { return { id status } userErrors { message } }`)
      const closeEarly = await mut('returnClose', `returnClose(id: "${retC.return?.id}", markRefunded: false) { return { id status } userErrors { message } }`)
      check('W10 closeReturn from requested blocked', closeEarly.userErrors?.length > 0, JSON.stringify(closeEarly))
      await mut('returnApprove', `returnApprove(id: "${retC.return?.id}") { return { id status } userErrors { message } }`)
      const closeOk = await mut('returnClose', `returnClose(id: "${retC.return?.id}", markRefunded: false) { return { id status } userErrors { message } }`)
      check('W10 closeReturn after approve → complete', closeOk.return?.status === 'complete', JSON.stringify(closeOk))
    }
  }


  // ── W6: digital (untracked) lines fulfill with zero stock ──
  {
    const digProd = await GQL(`{ product(id: "p_yoga-program-video") { variants { id sku } } }`)
    const digVar = digProd.product?.variants?.find((v) => v.sku === 'YPV63')
    const digCust = await GQL(`{ customers(first: 1) { edges { node { id } } } }`)
    const digCid = digCust.customers?.edges?.[0]?.node?.id
    if (digVar && digCid) {
      const stockBefore = await GQL(`{ inventoryLevels { variantId available } }`)
      const yogaBefore = (stockBefore.inventoryLevels ?? []).filter((l) => l.variantId === digVar.id).reduce((s, l) => s + l.available, 0)
      const dd = await mut('draftOrderCreate', `draftOrderCreate(customerId: "${digCid}", items: [{ variantId: "${digVar.id}", quantity: 1 }]) { order { id } userErrors { message } }`)
      const dc = await mut('draftOrderConvert', `draftOrderConvert(id: "${dd.order?.id}") { order { id lineItems { id variantId requiresShipping } } userErrors { message } }`)
      const digLine = dc.order?.lineItems?.find((l) => l.variantId === digVar.id)
      check('W6 digital line is untracked + non-shipping', digLine?.requiresShipping === false, JSON.stringify(dc.userErrors ?? dc.__error ?? 'no line'))
      await mut('orderMarkAsPaid', `orderMarkAsPaid(id: "${dc.order?.id}") { order { id } userErrors { message } }`)
      const digAfter = await GQL(`{ order(id: "${dc.order?.id}") { fulfillmentStatus fulfillments { id } } }`)
      check('W6 digital-only convert auto-fulfills with zero fulfillments', digAfter.order?.fulfillmentStatus === 'fulfilled' && (digAfter.order?.fulfillments ?? []).length === 0, JSON.stringify(digAfter.order ?? digAfter.__error))
      const stockAfter = await GQL(`{ inventoryLevels { variantId available } }`)
      const yogaAfter = (stockAfter.inventoryLevels ?? []).filter((l) => l.variantId === digVar.id).reduce((s, l) => s + l.available, 0)
      check('W6 digital fulfill moves no inventory', yogaAfter === yogaBefore, JSON.stringify({ before: yogaBefore, after: yogaAfter }))
    } else {
      check('W6 digital seed variant present', false, JSON.stringify({ variant: digVar ? 'ok' : 'none' }))
    }
  }
  // ── M5: mixed digital + physical — fulfilling only the shippable line closes the order ──
  {
    const digProd5 = await GQL(`{ product(id: "p_yoga-program-video") { variants { id sku } } }`)
    const digVar5 = digProd5.product?.variants?.find((v) => v.sku === 'YPV63')
    const mugProd5 = await GQL(`{ product(id: "p_ceramic-coffee-mug") { variants { id } } }`)
    const mugVar5 = mugProd5.product?.variants?.[0]
    const cust5 = await GQL(`{ customers(first: 1) { edges { node { id } } } }`)
    const cid5 = cust5.customers?.edges?.[0]?.node?.id
    if (digVar5 && mugVar5 && cid5) {
      const d5 = await mut('draftOrderCreate', `draftOrderCreate(customerId: "${cid5}", items: [{ variantId: "${mugVar5.id}", quantity: 1 }, { variantId: "${digVar5.id}", quantity: 1 }]) { order { id } userErrors { message } }`)
      const conv5 = await mut('draftOrderConvert', `draftOrderConvert(id: "${d5.order?.id}") { order { id fulfillmentStatus lineItems { id variantId requiresShipping } } userErrors { message } }`)
      check('M5 mixed convert stays unfulfilled (shippable line remains)', conv5.order?.fulfillmentStatus === 'unfulfilled', JSON.stringify(conv5.userErrors))
      await mut('orderMarkAsPaid', `orderMarkAsPaid(id: "${conv5.order?.id}") { order { id } userErrors { message } }`)
      const mugLine5 = conv5.order?.lineItems?.find((l) => l.variantId === mugVar5.id)
      const yogaLine5 = conv5.order?.lineItems?.find((l) => l.variantId === digVar5.id)
      const lv5 = await GQL(`{ locations { id } inventoryLevels { variantId locationId available committed } }`)
      // Fulfill must happen where the CONVERT reservation sits — committed, not
      // merely available. A location with available-only stock rejects the fulfill
      // ("reserved 0, needs 1"); pick the highest-committed location deterministically.
      const loc5 = ((lv5.inventoryLevels ?? []).filter((l) => l.variantId === mugVar5.id).sort((a, b) => b.committed - a.committed)[0])?.locationId ?? lv5.locations[0].id
      const fu5 = await mut('orderFulfill', `orderFulfill(input: { orderId: "${conv5.order?.id}", lineItemIds: ["${mugLine5?.id}"], locationId: "${loc5}", notifyCustomer: false }) { order { fulfillmentStatus status fulfillments { lineItemIds } } userErrors { message } }`)
      check('M5 mug-only fulfill → order fulfilled + closed', fu5.order?.fulfillmentStatus === 'fulfilled' && fu5.order?.status === 'closed', JSON.stringify(fu5.userErrors))
      check('M5 digital line never appears on a fulfillment', (fu5.order?.fulfillments ?? []).every((f) => !(f.lineItemIds ?? []).includes(yogaLine5?.id)), JSON.stringify(fu5.order?.fulfillments))
    } else {
      check('M5 mixed seed variants present', false, JSON.stringify({ dig: !!digVar5, mug: !!mugVar5, cust: !!cid5 }))
    }
  }

  // ── M7: duplicate collection; order → draft chain carries shipping/discount/gift card ──
  {
    const col7 = await GQL(`{ collections(first: 5) { edges { node { id title productIds } } } }`)
    const srcCol = (col7.collections?.edges ?? []).map((e) => e.node).find((c) => (c.productIds ?? []).length > 0)
    if (srcCol) {
      const dup7 = await mut('collectionDuplicate', `collectionDuplicate(id: "${srcCol.id}") { collection { id title productIds } userErrors { message } }`)
      check('M7 collectionDuplicate → new id, productIds preserved', !!dup7.collection?.id && dup7.collection.id !== srcCol.id && JSON.stringify([...(dup7.collection?.productIds ?? [])].sort()) === JSON.stringify([...srcCol.productIds].sort()), JSON.stringify(dup7.userErrors))
    } else {
      check('M7 source collection with products present', false, JSON.stringify(col7).slice(0, 100))
    }

    const gc7 = await mut('giftCardCreate', `giftCardCreate(input: { initialBalance: 25 }) { giftCard { id code balance } userErrors { message } }`)
    const gcCode7 = gc7.giftCard?.code
    const cust7 = await GQL(`{ customers(first: 1) { edges { node { id } } } }`)
    const cid7 = cust7.customers?.edges?.[0]?.node?.id
    const disc7 = await mut('discountCreate', `discountCreate(discount: { code: "QA7-${RUN}", title: "QA7 ${RUN}", type: "fixed_amount", method: "code", value: 2, minPurchase: 0 }) { discount { id code status } userErrors { message } }`)
    const activeCode7 = disc7.discount?.code
    const mug7 = await GQL(`{ product(id: "p_ceramic-coffee-mug") { variants { id } } }`)
    const mugVar7 = mug7.product?.variants?.[0]?.id
    if (gcCode7 && cid7 && mugVar7 && activeCode7) {
      const d7 = await mut('draftOrderCreate', `draftOrderCreate(customerId: "${cid7}", items: [{ variantId: "${mugVar7}", quantity: 1 }], shippingPrice: 8.5, discountAmount: 2, discountCode: "${activeCode7}", giftCardCode: "${gcCode7}") { order { id } userErrors { message } }`)
      const conv7 = await mut('draftOrderConvert', `draftOrderConvert(id: "${d7.order?.id}") { order { id shippingTitle shippingPrice discountCode { code amount } giftCardCode giftCardApplied } userErrors { message } }`)
      const from7 = await mut('draftOrderCreateFromOrder', `draftOrderCreateFromOrder(orderId: "${conv7.order?.id}") { order { id shippingPrice discountCode { code amount } giftCardCode giftCardApplied } userErrors { message } }`)
      check('M7 draft-from-order carries shipping + discount', from7.order?.shippingPrice === 8.5 && from7.order?.discountCode?.code === activeCode7, JSON.stringify(from7.userErrors ?? from7.order))
      check('M7 draft-from-order carries gift card', from7.order?.giftCardCode === gcCode7 && from7.order?.giftCardApplied > 0, JSON.stringify({ giftCardCode: from7.order?.giftCardCode, giftCardApplied: from7.order?.giftCardApplied }))
      const dupO7 = await mut('draftOrderDuplicate', `draftOrderDuplicate(id: "${from7.order?.id}") { order { id shippingPrice discountCode { code amount } giftCardCode giftCardApplied } userErrors { message } }`)
      check('M7 draftOrderDuplicate carries the same tenders', dupO7.order?.shippingPrice === 8.5 && dupO7.order?.discountCode?.code === activeCode7 && dupO7.order?.giftCardCode === gcCode7, JSON.stringify(dupO7.userErrors ?? dupO7.order))
    } else {
      check('M7 fixtures present', false, JSON.stringify({ gc: !!gcCode7, cust: !!cid7, mug: !!mugVar7, disc: !!activeCode7 }))
    }

    // Payout rebucket on schedule change: settings.payouts = { schedule, dayOfWeek };
    // ensurePayouts releases every unpaid payout so its transactions re-bucket under
    // the new schedule. (The materialized key is process-local — single-server
    // deployment; a multi-server deployment needs a shared cache, documented tradeoff.)
    const st7 = await GQL(`{ settings { value } }`)
    const rawVal7 = st7.settings?.value ?? {}
    const val7 = typeof rawVal7 === 'string' ? JSON.parse(rawVal7) : rawVal7
    const curPayouts7 = val7.payouts ?? { schedule: 'weekly', dayOfWeek: 'friday' }
    const nextDay7 = curPayouts7.dayOfWeek === 'friday' ? 'monday' : 'friday'
    const p7a = await GQL(`{ payouts { id status issuedAt } }`)
    const schedA = (p7a.payouts ?? []).filter((p) => p.status === 'scheduled').map((p) => p.issuedAt).sort()
    const up7 = await GQL(`mutation($v: JSON!) { settingsUpdate(value: $v) { value } }`, { v: { ...val7, payouts: { schedule: curPayouts7.schedule, dayOfWeek: nextDay7 } } })
    check('M7 payout schedule day switches', !up7.__error, JSON.stringify(up7).slice(0, 140))
    const p7b = await GQL(`{ payouts { id status issuedAt } }`)
    const schedB = (p7b.payouts ?? []).filter((p) => p.status === 'scheduled').map((p) => p.issuedAt).sort()
    check('M7 scheduled payouts re-bucket on schedule change', schedB.length > 0 && JSON.stringify(schedA) !== JSON.stringify(schedB), JSON.stringify({ schedA: schedA.slice(0, 3), schedB: schedB.slice(0, 3) }))
    await GQL(`mutation($v: JSON!) { settingsUpdate(value: $v) { value } }`, { v: { ...val7, payouts: curPayouts7 } })
  }

}
} catch (e) {
  aborted = true
  console.log('\nABORTED: ' + String(e?.message ?? e).slice(0, 300))
} finally {
  await runC3()
  if (_prisma) await _prisma.$disconnect().catch(() => {})
}

console.log('\n════════════════════════════════════')
console.log(`RESULT: ${pass} passed, ${fail} failed`)
if (failures.length) {
  console.log('FAILURES:')
  failures.forEach((f) => console.log('  ✗ ' + f))
}
process.exit(fail > 0 || aborted ? 1 : 0)
