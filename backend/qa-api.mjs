/**
 * QA API test suite — exercises the full GraphQL surface like an external client.
 * Run: node qa-api.mjs  (backend must be running on :4000)
 */
const URL = 'http://localhost:4000/graphql'
const RUN = Date.now().toString(36)

let pass = 0
let fail = 0
let locId, loc2Id
const failures = []

async function gql(query, variables) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

const GQL = async (q) => {
  try {
    return await gql(q)
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
  const r = await mut('productCreate', `productCreate(product: { title: "QA Test Product", vendor: "QA Vendor", status: "active", variants: [{ sku: "QA-1", price: 9.99, title: "Default Title" }], tags: ["qa"] }) { product { id title variants { sku price } } userErrors { message } }`)
  testProductId = r.product?.id
  check('productCreate', !!testProductId && r.product.variants[0].sku === 'QA-1', JSON.stringify(r.userErrors))

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
  const target = o.orders.edges.map((e) => e.node).find((x) => x.status === 'open' && x.fulfillmentStatus === 'unfulfilled')
  check('found open unfulfilled order', !!target)

  const f = await GQL(`{ locations { id } }`)
  const ff = await mut('orderFulfill', `orderFulfill(input: { orderId: "${target.id}", lineItemIds: [], locationId: "${f.locations[0].id}", notifyCustomer: false }) { order { id } userErrors { message } }`)
  // empty lineItemIds — we need real ids; fetch them:
  const full = await GQL(`{ order(id: "${target.id}") { lineItems { id } } }`)
  const ids = full.order.lineItems.map((li) => `"${li.id}"`).join(',')
  const ff2 = await mut('orderFulfill', `orderFulfill(input: { orderId: "${target.id}", lineItemIds: [${ids}], locationId: "${f.locations[0].id}", trackingNumber: "QA-TRACK-1", carrier: "USPS", notifyCustomer: true }) { order { fulfillmentStatus status } userErrors { message } }`)
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

  const d = await mut('draftOrderCreate', `draftOrderCreate(customerId: "${custId}", items: [{ variantId: "${varId}", quantity: 2 }], note: "QA draft") { order { id name isDraft total } userErrors { message } }`)
  check('draftOrderCreate', d.order?.isDraft === true && d.order.total > 0, JSON.stringify(d.userErrors) + (d.__error ?? ''))
  if (!d.order) { console.log('RESULT (aborted): ' + pass + ' passed, ' + fail + ' failed'); process.exit(1) }
  const draftId = d.order.id

  const conv = await mut('draftOrderConvert', `draftOrderConvert(id: "${draftId}") { order { id isDraft name } userErrors { message } }`)
  check('draftOrderConvert → real order', conv.order?.isDraft === false, JSON.stringify(conv.userErrors))
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
  await mut('giftCardDisable', `giftCardDisable(id: "${gid}") { giftCard { status } }`)

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
  const gqlErr = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"query":"{ nosuchfield }"}' }).then((r) => r.json())
  check('invalid field → GraphQL error', gqlErr.errors?.length > 0)
}

console.log('\n════════════════════════════════════')
console.log(`RESULT: ${pass} passed, ${fail} failed`)
if (failures.length) {
  console.log('FAILURES:')
  failures.forEach((f) => console.log('  ✗ ' + f))
}
process.exit(fail > 0 ? 1 : 0)
