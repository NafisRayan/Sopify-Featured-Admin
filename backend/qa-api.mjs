/**
 * QA API test suite — exercises the full GraphQL surface like an external client.
 * Run: node qa-api.mjs  (backend must be running on :4000)
 */
const URL = 'http://localhost:4000/graphql'
const AUTH_URL = 'http://localhost:4000/auth/login'
let cookieJar = ''
const RUN = Date.now().toString(36)

let pass = 0
let fail = 0
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

await login()

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
  check('customers + derived stats', c.customers?.edges?.length > 0 && typeof c.customers.edges[0].node.totalSpent === 'number')

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
  const o = await GQL(`{ orders(first: 50) { edges { node { id name status fulfillmentStatus paymentStatus total } } } }`)
  const target = o.orders.edges.map((e) => e.node).find((x) => x.status === 'open' && x.fulfillmentStatus === 'unfulfilled' && x.paymentStatus === 'paid')
  check('found open unfulfilled order', !!target)

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
  const prod = await GQL(`{ products(first: 1) { edges { node { variants { id } } } } }`)
  const varId = prod.products.edges[0].node.variants[0].id
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
  const productList = await GQL(`{ products(first: 1) { edges { node { variants { id } } } } }`)
  const calcVarId = productList.products?.edges?.[0]?.node?.variants?.[0]?.id
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
  const prod = await GQL(`{ products(first: 1) { edges { node { id variants { id price } } } } }`)
  const varId = prod.products?.edges?.[0]?.node?.variants?.[0]?.id
  const listPrice = prod.products?.edges?.[0]?.node?.variants?.[0]?.price
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
}

console.log('═══ 14. PARITY ADDITIONS — returns lifecycle, fulfillment events, inventory extras ═══')
{
  // create a fresh paid order via draft to test returns + fulfillment lifecycle
  const cust = await GQL(`{ customers(first: 1) { edges { node { id } } } }`)
  const custId = cust.customers?.edges?.[0]?.node?.id
  const pv = await GQL(`{ products(first: 1) { edges { node { variants { id } } } } }`)
  const vId = pv.products?.edges?.[0]?.node?.variants?.[0]?.id
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
    check('decline after approve blocked or allowed per guard', decAfterApprove.userErrors?.length > 0 || decAfterApprove.return?.status === 'declined')
    const canceled = await mut('returnCancel', `returnCancel(id: "${retId}") { return { status } userErrors { message } }`)
    check('returnCancel → canceled', canceled.return?.status === 'canceled' || canceled.userErrors?.length > 0)
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

console.log('\n════════════════════════════════════')
console.log(`RESULT: ${pass} passed, ${fail} failed`)
if (failures.length) {
  console.log('FAILURES:')
  failures.forEach((f) => console.log('  ✗ ' + f))
}
process.exit(fail > 0 ? 1 : 0)
