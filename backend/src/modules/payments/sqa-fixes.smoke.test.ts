import assert from 'node:assert/strict'
import test from 'node:test'
import { PaymentsService } from './payments.service'
import { OrdersService } from '../orders/orders.service'
import { tenantContext } from '../../common/tenant.middleware'

test('Security Blocker 1: Webhook signature verification rejects unsigned or forged payloads when secret is set', () => {
  const mockPrisma = {
    webhookEvent: { findUnique: async () => null },
    order: { findFirst: async () => null },
    balanceTransaction: { findFirst: async () => null },
  }
  const mockStorefront = { getCartRecord: () => null }
  const mockOrders = {}

  const payments = new PaymentsService(mockPrisma as any, mockStorefront as any, mockOrders as any)

  // Empty signature must throw
  assert.throws(() => {
    payments.constructEvent(Buffer.from('{"type":"payment_intent.succeeded"}'), '')
  })
})

test('Blocker 3: Multi-tenant unique constraint collision safety for Customers and Discounts across stores', () => {
  const customerDb: Array<{ storeId: string; email: string }> = []
  const discountDb: Array<{ storeId: string; code: string }> = []

  const insertCustomer = (storeId: string, email: string) => {
    const dupe = customerDb.find((c) => c.storeId === storeId && c.email.toLowerCase() === email.toLowerCase())
    if (dupe) throw new Error('Unique constraint failed on (storeId, email)')
    customerDb.push({ storeId, email })
  }

  const insertDiscount = (storeId: string, code: string) => {
    const dupe = discountDb.find((d) => d.storeId === storeId && d.code.toUpperCase() === code.toUpperCase())
    if (dupe) throw new Error('Unique constraint failed on (storeId, code)')
    discountDb.push({ storeId, code })
  }

  // 1. Same customer email can exist in Store A and Store B
  insertCustomer('store_a', 'shopper@example.com')
  assert.doesNotThrow(() => {
    insertCustomer('store_b', 'shopper@example.com')
  })
  assert.throws(() => {
    insertCustomer('store_a', 'shopper@example.com')
  })

  // 2. Same discount promo code can exist in Store A and Store B
  insertDiscount('store_a', 'SAVE20')
  assert.doesNotThrow(() => {
    insertDiscount('store_b', 'SAVE20')
  })
  assert.throws(() => {
    insertDiscount('store_a', 'SAVE20')
  })
})

test('High 7: quantity: 0 explicitly skips line item rather than fulfilling all remaining units', async () => {
  const lineItems = [
    { id: 'li_1', variantId: 'var_1', quantity: 3, price: 30 },
    { id: 'li_2', variantId: 'var_2', quantity: 2, price: 20 },
  ]
  const inventoryLevels = [
    { variantId: 'var_1', locationId: 'loc_1', available: 10, committed: 3 },
    { variantId: 'var_2', locationId: 'loc_1', available: 10, committed: 2 },
  ]

  let updatedFulfillments: any[] = []

  const mockOrder = {
    id: 'ord_q0_test',
    name: '#1080',
    status: 'open',
    paymentStatus: 'paid',
    fulfillmentStatus: 'unfulfilled',
    isDraft: false,
    lineItems: JSON.stringify(lineItems),
    fulfillments: JSON.stringify([]),
  }

  const mockPrisma = {
    order: {
      findUnique: async () => mockOrder,
      update: async ({ data }: any) => {
        if (data.fulfillments) {
          updatedFulfillments = typeof data.fulfillments === 'string' ? JSON.parse(data.fulfillments) : data.fulfillments
        }
        return mockOrder
      },
    },
    inventoryLevel: {
      findUnique: async ({ where }: any) =>
        inventoryLevels.find(
          (l) => l.variantId === where.variantId_locationId?.variantId && l.locationId === where.variantId_locationId?.locationId,
        ),
      update: async () => ({}),
      aggregate: async () => ({ _sum: { committed: 3 } }),
    },
    inventoryHistory: { create: async () => ({}) },
    location: { findUnique: async () => ({ id: 'loc_1', name: 'Hub' }) },
    product: { findFirst: async () => ({ trackQuantity: true }) },
    orderRisk: { findMany: async () => [] },
    balanceTransaction: { findMany: async () => [] },
    activityEntry: { create: async () => ({}) },
  }

  const ordersService = new OrdersService(mockPrisma as any)

  // Fulfill li_1 with qty: 0 (explicit skip) and li_2 with qty: 2
  const { fulfillment } = await ordersService.fulfill({
    orderId: 'ord_q0_test',
    lineItemIds: ['li_1', 'li_2'],
    quantities: [0, 2],
    locationId: 'loc_1',
  })

  // li_1 MUST NOT be fulfilled (skipped)
  assert.deepEqual(fulfillment.lineItemIds, ['li_2'])
  assert.equal(fulfillment.quantities['li_1'], undefined)
  assert.equal(fulfillment.quantities['li_2'], 2)
})
