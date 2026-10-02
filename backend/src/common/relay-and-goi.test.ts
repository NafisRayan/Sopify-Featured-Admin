import assert from 'node:assert/strict'
import test from 'node:test'
import { toConnection, encodeCursor, parseJson, toJson } from './helpers'
import { StoreContentService } from '../modules/store-content/store-content.module'
import { AuthorizationService } from '../auth/authorization.service'
import { ProductsService } from '../modules/products/products.service'
import { OrdersService } from '../modules/orders/orders.service'
import { CommerceService } from '../modules/commerce/commerce.module'
import { PrismaService } from '../prisma/prisma.service'
import { uid } from './ids'

test('Relay toConnection handles forward, backward, and boundary cases', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `item_${i + 1}`, val: i + 1 }))

  // 1. Empty list
  const empty = toConnection([], 5)
  assert.equal(empty.edges.length, 0)
  assert.equal(empty.pageInfo.startCursor, null)
  assert.equal(empty.pageInfo.endCursor, null)
  assert.equal(empty.pageInfo.hasNextPage, false)
  assert.equal(empty.pageInfo.hasPreviousPage, false)

  // 2. Forward pagination
  const first3 = toConnection(items, 3)
  assert.equal(first3.edges.length, 3)
  assert.equal(first3.pageInfo.startCursor, encodeCursor(0))
  assert.equal(first3.pageInfo.endCursor, encodeCursor(2))
  assert.equal(first3.pageInfo.hasNextPage, true)
  assert.equal(first3.pageInfo.hasPreviousPage, false)

  // 3. Backward pagination
  // Cursor for index 6 -> items before index 6 are indices 0..5
  const cursor6 = encodeCursor(6)
  const backward2 = toConnection(items, 25, null, 2, cursor6) // note default first: 25 alongside last: 2
  assert.equal(backward2.edges.length, 2)
  assert.equal(backward2.edges[0].node.id, 'item_5')
  assert.equal(backward2.edges[1].node.id, 'item_6')
  assert.equal(backward2.pageInfo.startCursor, encodeCursor(4))
  assert.equal(backward2.pageInfo.endCursor, encodeCursor(5))
  assert.equal(backward2.pageInfo.hasPreviousPage, true)
  assert.equal(backward2.pageInfo.hasNextPage, true)

  // 4. Backward boundary (last takes everything before cursor)
  const cursor2 = encodeCursor(2)
  const backwardBoundary = toConnection(items, null, null, 5, cursor2)
  assert.equal(backwardBoundary.edges.length, 2)
  assert.equal(backwardBoundary.edges[0].node.id, 'item_1')
  assert.equal(backwardBoundary.edges[1].node.id, 'item_2')
  assert.equal(backwardBoundary.pageInfo.hasPreviousPage, false)
})

test('Relay Node lookup respects GID authority and prefix tables', async () => {
  const prisma = new PrismaService()
  await prisma.$connect()
  const storeService = new StoreContentService(prisma, {} as unknown as AuthorizationService)

  try {
    // 1. Typed GID miss MUST return null (no fallthrough to unrelated tables)
    const orderMiss = await storeService.node('gid://shopify/Order/non_existent_order_id_12345')
    assert.equal(orderMiss, null)

    const productMiss = await storeService.node('gid://shopify/Product/non_existent_product_id_12345')
    assert.equal(productMiss, null)

    // 2. Read-only lookups of seeded entities verify type resolution & rich decoration
    const product = await prisma.product.findFirst()
    if (product) {
      const byLocal = await storeService.node(product.id)
      assert.ok(byLocal)
      assert.equal(byLocal.__typename, 'Product')
      assert.equal(typeof byLocal.totalInventory, 'number') // enriched with total inventory

      const byGid = await storeService.node(`gid://shopify/Product/${product.id}`)
      assert.ok(byGid)
      assert.equal(byGid.__typename, 'Product')
      assert.equal(byGid.id, product.id)
    }

    const customer = await prisma.customer.findFirst()
    if (customer) {
      const byGid = await storeService.node(`gid://shopify/Customer/${customer.id}`)
      assert.ok(byGid)
      assert.equal(byGid.__typename, 'Customer')
      assert.equal(byGid.id, customer.id)
      assert.equal(typeof byGid.ordersCount, 'number') // enriched with customer stats
      assert.equal(typeof byGid.totalSpent, 'number')
    }

    const segment = await prisma.segment.findFirst()
    if (segment) {
      const byGid = await storeService.node(`gid://shopify/Segment/${segment.id}`)
      assert.ok(byGid)
      assert.equal(byGid.__typename, 'Segment')
      assert.equal(typeof byGid.memberCount, 'number')
    }

    const transfer = await prisma.transfer.findFirst()
    if (transfer) {
      const byGid = await storeService.node(`gid://shopify/Transfer/${transfer.id}`)
      assert.ok(byGid)
      assert.equal(byGid.__typename, 'Transfer')
    }

    // 3. nodes query parallel array contract: rejects when > 50 ids requested
    const excessiveIds = Array.from({ length: 51 }, (_, i) => `id_${i}`)
    await assert.rejects(
      storeService.nodes(excessiveIds),
      /nodes query supports up to 50 ids per request/,
    )

    // Allowed count <= 50 succeeds
    const validIds = ['non_existent_1', 'non_existent_2']
    const nodes = await storeService.nodes(validIds)
    assert.equal(nodes.length, 2)
    assert.equal(nodes[0], null)
    assert.equal(nodes[1], null)
  } finally {
    await prisma.$disconnect()
  }
})

test('ProductsService variant CRUD synchronizes options and inventoryQuantity on disposable fixture', async () => {
  const prisma = new PrismaService()
  await prisma.$connect()
  const productsService = new ProductsService(prisma)

  const fixtureProdId = uid('p_fixture')
  const fixtureSku = `SKU-FIX-${Date.now()}`
  let createdVariantId: string | null = null
  try {
    // Create a temporary isolated product so seed data is NEVER modified
    await prisma.product.create({
      data: {
        id: fixtureProdId,
        title: 'Disposable Test Product',
        options: toJson([{ name: 'Color', values: ['Navy'] }]),
        variants: toJson([
          {
            id: `${fixtureProdId}_v1`,
            productId: fixtureProdId,
            title: 'Navy / S',
            sku: fixtureSku,
            price: 25,
            optionValues: { Color: 'Navy' },
            inventoryQuantity: 5,
          },
        ]),
        tags: toJson(['test']),
        collectionIds: toJson([]),
        channels: toJson(['Online Store']),
        media: toJson([]),
        seo: toJson({}),
      },
    })

    const uniqueOptionValue = `Val-${Date.now()}`

    // 1. Create variant with new option name & value
    const variant = await productsService.createVariant({
      productId: fixtureProdId,
      title: 'Fixture Variant',
      sku: `SKU-VAR-${Date.now()}`,
      price: 35.0,
      inventoryQuantity: 20,
      optionValues: {
        Material: uniqueOptionValue,
      },
    })

    assert.ok(variant.id)
    createdVariantId = variant.id as string
    assert.equal(variant.inventoryQuantity, 20)

    // Verify product.options was synchronized with new option name & value
    const reloaded = await prisma.product.findUnique({ where: { id: fixtureProdId } })
    const updatedOptions = parseJson<{ name: string; values: string[] }[]>(reloaded!.options, [])
    const materialOpt = updatedOptions.find((o) => o.name === 'Material')
    assert.ok(materialOpt, 'product.options should contain new option name "Material"')
    assert.ok(materialOpt.values.includes(uniqueOptionValue), 'product.options should contain new value')

    // Verify ProductVariant GOI resolution (both local ID and GID)
    const storeService = new StoreContentService(prisma, {} as unknown as AuthorizationService)
    const nodeVarLocal = await storeService.node(variant.id as string)
    assert.ok(nodeVarLocal)
    assert.equal(nodeVarLocal.__typename, 'ProductVariant')
    const nodeVarGid = await storeService.node(`gid://shopify/ProductVariant/${variant.id}`)
    assert.ok(nodeVarGid)
    assert.equal(nodeVarGid.__typename, 'ProductVariant')

    // 2. Update variant with updated optionValues and inventoryQuantity
    const updatedVal = `Val-Updated-${Date.now()}`
    await productsService.updateVariant(variant.id as string, {
      inventoryQuantity: 45,
      optionValues: {
        Material: updatedVal,
      },
    })

    // Verify inventory level updated
    const loc = await prisma.location.findFirst({ where: { active: true } })
    if (loc) {
      const level = await prisma.inventoryLevel.findUnique({
        where: { variantId_locationId: { variantId: variant.id as string, locationId: loc.id } },
      })
      assert.equal(level?.available, 45)
    }

    // Verify options synchronized on update
    const reloaded2 = await prisma.product.findUnique({ where: { id: fixtureProdId } })
    const updatedOptions2 = parseJson<{ name: string; values: string[] }[]>(reloaded2!.options, [])
    const mat2 = updatedOptions2.find((o) => o.name === 'Material')
    assert.ok(mat2?.values.includes(updatedVal))

    // 3. Delete variant
    const deletedId = await productsService.deleteVariant(variant.id as string)
    assert.equal(deletedId, variant.id)

    // Guard: cannot delete last variant
    await assert.rejects(
      productsService.deleteVariant(`${fixtureProdId}_v1`),
      /Cannot delete the only variant of a product/,
    )
  } finally {
    // Teardown: clean up all fixture data including both variant IDs
    const variantIdsToDelete = [`${fixtureProdId}_v1`]
    if (createdVariantId) variantIdsToDelete.push(createdVariantId)
    await prisma.inventoryLevel.deleteMany({ where: { variantId: { in: variantIdsToDelete } } })
    await prisma.product.deleteMany({ where: { id: fixtureProdId } })
    await prisma.$disconnect()
  }
})

test('OrdersService calculateDraft and CommerceService sendNotification with proper event amount', async () => {
  const prisma = new PrismaService()
  await prisma.$connect()
  const ordersService = new OrdersService(prisma)
  const commerceService = new CommerceService(prisma)

  const fixtureGcId = uid('gc_fixture')

  try {
    // 1. calculateDraft preview computation (read-only)
    const customer = await prisma.customer.findFirst()
    const product = await prisma.product.findFirst()
    if (customer && product) {
      const variants = parseJson<Record<string, unknown>[]>(product.variants, [])
      if (variants.length > 0) {
        const calc = await ordersService.calculateDraft({
          customerId: customer.id,
          items: [{ variantId: variants[0].id, quantity: 2 }],
          shippingPrice: 15,
          discountAmount: 10,
        })
        assert.ok(typeof calc.total === 'number')
        assert.ok(calc.total > 0)
        assert.equal(calc.shippingPrice, 15)
        assert.equal(calc.totalDiscount, 10)
      }
    }

    // 2. sendNotification on disposable gift card
    await prisma.giftCard.create({
      data: {
        id: fixtureGcId,
        code: `FIXTURE-${Date.now()}`,
        initialBalance: 100,
        balance: 100,
        status: 'enabled',
        history: toJson([]),
      },
    })

    const notifiedCard = await commerceService.sendNotification(fixtureGcId)
    const history = notifiedCard.history as Record<string, unknown>[]
    const notifEvent = history.find((h) => h.type === 'notification_sent')
    assert.ok(notifEvent, 'History should contain notification_sent event')
    assert.equal(notifEvent.amount, 0, 'History amount must be 0 to satisfy GraphQL Float! requirement')

    // 3. sendNotification rejects disabled card
    await prisma.giftCard.update({ where: { id: fixtureGcId }, data: { status: 'disabled' } })
    await assert.rejects(
      commerceService.sendNotification(fixtureGcId),
      /Cannot send notification for a disabled gift card/,
    )
  } finally {
    // Teardown: clean up fixture gift card & notifications
    await prisma.giftCard.deleteMany({ where: { id: fixtureGcId } })
    await prisma.notification.deleteMany({ where: { link: `/gift-cards/${fixtureGcId}` } })
    await prisma.$disconnect()
  }
})
