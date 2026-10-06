import assert from 'node:assert/strict'
import test from 'node:test'
import { PrismaService } from '../../prisma/prisma.service'
import { CustomersService, b2bPricing } from './customers.module'
import { toJson } from '../../common/helpers'

// Disposable-fixture tests for two money-adjacent behaviors that were previously
// live-only (qa-api.mjs): the b2bPricing location preference rule and the
// customerMerge transaction. Runs against the seeded DB like the rest of the
// suite; every fixture row is removed in finally.

test('b2bPricing: scoped list wins on location match, ignored without order location', async () => {
  const prisma = new PrismaService()
  await prisma.$connect()
  const stamp = Date.now()
  const custId = `cus_qa_b2b_${stamp}`
  const companyId = `com_qa_b2b_${stamp}`
  const variantId = 'p_kids-organic-tee_v1'
  try {
    await prisma.customer.create({
      data: { id: custId, firstName: 'QA', lastName: 'B2B', email: `qa-b2b-${stamp}@example.com`, addresses: toJson([]), tags: toJson([]) },
    })
    await prisma.company.create({
      data: {
        id: companyId,
        name: `QA B2B Co ${stamp}`,
        customerId: custId,
        locations: toJson([]),
        contacts: toJson([]),
        priceListDiscountPercent: 12,
      },
    })
    // Catalog-level list (no location) + a location-scoped list on the first location.
    await prisma.priceList.create({
      data: { name: `QA Catalog ${stamp}`, companyId, entries: { create: [{ variantId, price: 10 }] } },
    })
    const loc = await prisma.location.findFirst()
    assert.ok(loc, 'no location row in DB — the scoped-list preference is untestable')
    await prisma.priceList.create({
      data: { name: `QA Scoped ${stamp}`, companyId, locationId: loc.id, entries: { create: [{ variantId, price: 20 }] } },
    })
    // Matching location: the scoped entry wins.
    const atLoc = await b2bPricing(prisma, custId, variantId, loc.id)
    assert.equal(atLoc.fixedPrice, 20)
    // Different location falls back to the catalog-level list.
    const elsewhere = await b2bPricing(prisma, custId, variantId, 'loc_nonexistent')
    assert.equal(elsewhere.fixedPrice, 10)
    // THE RULE: unknown order location (drafts, unfulfilled order edits) must
    // never apply a location-scoped list — catalog-level only.
    const noLoc = await b2bPricing(prisma, custId, variantId, null)
    assert.equal(noLoc.fixedPrice, 10)
    // No entry for the variant → no fixed price, company percent passes through.
    const other = await b2bPricing(prisma, custId, 'p_nonexistent_v1')
    assert.equal(other.fixedPrice, null)
    assert.equal(other.discountPercent, 12)
  } finally {
    await prisma.priceList.deleteMany({ where: { companyId } }) // entries cascade
    await prisma.company.deleteMany({ where: { id: companyId } })
    await prisma.customer.deleteMany({ where: { id: custId } })
    await prisma.$disconnect()
  }
})

test('mergeCustomers re-points orders, gift cards, abandoned checkouts and companies in one transaction', async () => {
  const prisma = new PrismaService()
  await prisma.$connect()
  const svc = new CustomersService(prisma)
  const stamp = Date.now()
  const primaryId = `cus_qa_mg_a_${stamp}`
  const secondaryId = `cus_qa_mg_b_${stamp}`
  const companyId = `com_qa_mg_${stamp}`
  const orderId = `ord_qa_mg_${stamp}`
  const giftCardId = `gc_qa_mg_${stamp}`
  const checkoutId = `ab_qa_mg_${stamp}`
  try {
    for (const c of [
      { id: primaryId, email: `qa-mg-a-${stamp}@example.com` },
      { id: secondaryId, email: `qa-mg-b-${stamp}@example.com` },
    ]) {
      await prisma.customer.create({ data: { id: c.id, firstName: 'QA', lastName: 'Merge', email: c.email, addresses: toJson([]), tags: toJson([]) } })
    }
    // Everything owned by the SECONDARY — the merge must re-point it all.
    await prisma.company.create({
      data: { id: companyId, name: `QA Merge Txn Co ${stamp}`, customerId: secondaryId, locations: toJson([]), contacts: toJson([]) },
    })
    await prisma.order.create({
      data: {
        id: orderId,
        name: `#QA${stamp}`,
        customerId: secondaryId,
        email: `qa-mg-b-${stamp}@example.com`,
        paymentStatus: 'paid',
        fulfillmentStatus: 'unfulfilled',
        status: 'open',
        lineItems: toJson([]),
        shippingAddress: toJson({}),
        billingAddress: toJson({}),
        tags: toJson([]),
        timeline: toJson([]),
        fulfillments: toJson([]),
        refunds: toJson([]),
      },
    })
    await prisma.giftCard.create({
      data: { id: giftCardId, code: `FIXTURE-MG-${stamp}`, customerId: secondaryId, initialBalance: 25, balance: 25, history: toJson([]) },
    })
    await prisma.abandonedCheckout.create({
      data: { id: checkoutId, customerId: secondaryId, email: `qa-mg-b-${stamp}@example.com`, lineItems: toJson([]), total: 12.34 },
    })

    const merged = await svc.mergeCustomers(primaryId, secondaryId)
    assert.equal(merged?.id, primaryId)

    const order = await prisma.order.findUnique({ where: { id: orderId } })
    assert.equal(order?.customerId, primaryId)
    const giftCard = await prisma.giftCard.findUnique({ where: { id: giftCardId } })
    assert.equal(giftCard?.customerId, primaryId)
    const checkout = await prisma.abandonedCheckout.findUnique({ where: { id: checkoutId } })
    assert.equal(checkout?.customerId, primaryId)
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    assert.equal(company?.customerId, primaryId)
    // Secondary customer must be gone (deleted inside the same transaction).
    const secondary = await prisma.customer.findUnique({ where: { id: secondaryId } })
    assert.equal(secondary, null)
  } finally {
    await prisma.abandonedCheckout.deleteMany({ where: { id: checkoutId } })
    await prisma.giftCard.deleteMany({ where: { id: giftCardId } })
    await prisma.order.deleteMany({ where: { id: orderId } })
    await prisma.priceList.deleteMany({ where: { companyId } })
    await prisma.company.deleteMany({ where: { id: companyId } })
    await prisma.customer.deleteMany({ where: { id: { in: [primaryId, secondaryId] } } })
    await prisma.$disconnect()
  }
})
