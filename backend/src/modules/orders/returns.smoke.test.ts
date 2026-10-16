import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSchema } from 'graphql'
import { StorefrontService } from '../storefront/storefront.service'
import { OrdersService } from './orders.service'

test('Returns & Reverse Logistics Lifecycle: Customer Request -> Merchant Approval -> Return Close & Restock', async () => {
  const storefrontSdl = readFileSync(join(__dirname, '..', 'storefront', 'storefront.graphql'), 'utf8')
  const schema = buildSchema(storefrontSdl)
  assert.ok(schema, 'Storefront schema builds cleanly')

  const returnRecordsDb: any[] = []
  const inventoryLevelsDb = [
    { variantId: 'var_item_a', locationId: 'loc_main', available: 5, committed: 0, unavailable: 0 },
  ]

  const mockOrder = {
    id: 'ord_return_1',
    name: '#1060',
    customerId: 'cust_returner',
    email: 'customer.return@example.com',
    paymentStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    status: 'closed',
    total: 100.0,
    subtotal: 100.0,
    shippingPrice: 0,
    taxTotal: 0,
    currency: 'USD',
    isDraft: false,
    lineItems: JSON.stringify([
      { id: 'li_item_a', variantId: 'var_item_a', title: 'Everyday Wool Scarf', quantity: 2, price: 50.0 },
    ]),
    fulfillments: JSON.stringify([
      {
        id: 'ff_1',
        locationId: 'loc_main',
        lineItemIds: ['li_item_a'],
        trackingNumber: '9400100000000000000000',
        carrier: 'USPS',
        status: 'success',
      },
    ]),
    refunds: JSON.stringify([]),
    timeline: JSON.stringify([]),
  }

  const mockPrisma = {
    order: {
      findUnique: async () => mockOrder,
      findFirst: async () => mockOrder,
      update: async ({ data }: any) => {
        Object.assign(mockOrder, data)
        return mockOrder
      },
    },
    returnRecord: {
      create: async ({ data }: any) => {
        returnRecordsDb.push(data)
        return data
      },
      findUnique: async ({ where }: any) => {
        return returnRecordsDb.find((r) => r.id === where.id) || null
      },
      findMany: async () => returnRecordsDb,
      update: async ({ where, data }: any) => {
        const item = returnRecordsDb.find((r) => r.id === where.id)
        if (item) Object.assign(item, data)
        return item
      },
    },
    inventoryLevel: {
      findUnique: async ({ where }: any) => {
        return (
          inventoryLevelsDb.find(
            (l) =>
              l.variantId === where.variantId_locationId?.variantId &&
              l.locationId === where.variantId_locationId?.locationId,
          ) || null
        )
      },
      update: async ({ where, data }: any) => {
        const item = inventoryLevelsDb.find(
          (l) =>
            l.variantId === where.variantId_locationId?.variantId &&
            l.locationId === where.variantId_locationId?.locationId,
        )
        if (item) {
          if (data.available !== undefined) item.available = data.available
          if (data.committed !== undefined) item.committed = data.committed
        }
      },
    },
    inventoryHistory: { create: async () => ({}) },
    balanceTransaction: {
      create: async () => ({}),
      findMany: async () => [{ type: 'charge', amount: 100.0 }],
    },
    activityEntry: { create: async () => ({}) },
    location: { findUnique: async () => ({ id: 'loc_main', name: 'Main Distribution Hub' }) },
    orderRisk: { findMany: async () => [] },
    product: { findMany: async () => [] },
  }

  const storefrontService = new StorefrontService(mockPrisma as any)
  storefrontService.onModuleInit()

  const ordersService = new OrdersService(mockPrisma as any)

  // Step 1: Customer submits self-service return request on Storefront API
  const requestMutation = `
    mutation RequestReturn($orderId: ID!, $items: [ReturnLineItemInput!]!) {
      returnRequest(orderId: $orderId, returnLineItems: $items) {
        return {
          id
          status
          reason
          refundAmount {
            amount
          }
          returnLineItems {
            id
            quantity
          }
        }
        userErrors {
          message
        }
      }
    }
  `

  const reqRes = await storefrontService.execute(requestMutation, {
    orderId: 'gid://shopify/Order/ord_return_1',
    items: [
      {
        lineItemId: 'li_item_a',
        quantity: 1,
        reason: 'WRONG_SIZE',
      },
    ],
  })

  assert.equal(reqRes.errors, undefined)
  const createdReturn = (reqRes.data as any)?.returnRequest?.return
  assert.ok(createdReturn)
  assert.equal(createdReturn.status, 'REQUESTED')
  assert.equal(createdReturn.reason, 'WRONG_SIZE')
  assert.equal(createdReturn.refundAmount.amount, 50.0) // 1 unit @ $50
  assert.equal(returnRecordsDb.length, 1)

  const returnRecordId = returnRecordsDb[0].id

  // Step 2: Merchant reviews and approves return in Admin Backoffice
  const approved = await ordersService.approveReturn(returnRecordId)
  assert.equal(approved.status, 'approved')

  // Step 3: Merchant receives items at warehouse & closes return with restock
  // Starting available stock was 5. Restocking 1 unit should raise stock to 6.
  const closed = await ordersService.closeReturn(returnRecordId, true)
  assert.equal(closed.status, 'complete')

  // Verify inventory level was restored
  assert.equal(inventoryLevelsDb[0].available, 6, 'Available stock should increment by 1 on return restock')

  // Verify order payment status reflects refund
  assert.equal(mockOrder.paymentStatus, 'partially_refunded')
})
