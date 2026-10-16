import assert from 'node:assert/strict'
import test from 'node:test'
import { generateCarrierTrackingUrl } from '../../common/carrier'
import { OrdersService } from './orders.service'

test('Carrier Tracking URL formatting strictly matches official carrier syntaxes', () => {
  // USPS
  const uspsUrl = generateCarrierTrackingUrl('USPS', '9400100000000000000000')
  assert.equal(
    uspsUrl,
    'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000000000000000',
  )

  // UPS
  const upsUrl = generateCarrierTrackingUrl('UPS', '1Z9999999999999999')
  assert.equal(upsUrl, 'https://www.ups.com/track?tracknum=1Z9999999999999999')

  // FedEx
  const fedexUrl = generateCarrierTrackingUrl('FedEx', '123456789012')
  assert.equal(fedexUrl, 'https://www.fedex.com/fedextrack/?trknbr=123456789012')

  // DHL
  const dhlUrl = generateCarrierTrackingUrl('DHL Express', '1234567890')
  assert.equal(dhlUrl, 'https://www.dhl.com/en/express/tracking.html?AWB=1234567890')
})

test('Multi-Location Split Fulfillment Engine: Partial vs Fulfilled status and stock deduction', async () => {
  const inventoryLevelsDb = [
    { variantId: 'var_a', locationId: 'loc_east', available: 10, committed: 2, unavailable: 0 },
    { variantId: 'var_b', locationId: 'loc_west', available: 10, committed: 1, unavailable: 0 },
  ]

  const mockOrder = {
    id: 'ord_split_1',
    name: '#1055',
    isDraft: false,
    status: 'open',
    paymentStatus: 'paid',
    fulfillmentStatus: 'unfulfilled',
    lineItems: JSON.stringify([
      { id: 'li_a', variantId: 'var_a', title: 'Flannel Shirt', quantity: 2, price: 60.0 },
      { id: 'li_b', variantId: 'var_b', title: 'Camp Mug', quantity: 1, price: 20.0 },
    ]),
    fulfillments: JSON.stringify([]),
    timeline: JSON.stringify([]),
    total: 140.0,
    subtotal: 140.0,
  }

  let updatedOrderPayload: any = null

  const mockPrisma = {
    order: {
      findUnique: async () => mockOrder,
      findFirst: async () => mockOrder,
      update: async ({ data }: any) => {
        updatedOrderPayload = data
        if (data.fulfillments) mockOrder.fulfillments = data.fulfillments
        if (data.fulfillmentStatus) mockOrder.fulfillmentStatus = data.fulfillmentStatus
        if (data.status) mockOrder.status = data.status
        return mockOrder
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
          if (data.committed !== undefined) item.committed = data.committed
          if (data.available !== undefined) item.available = data.available
        }
      },
      aggregate: async () => ({ _sum: { committed: 1 } }),
      findMany: async () => [],
    },
    inventoryHistory: { create: async () => ({}) },
    location: { findUnique: async () => ({ id: 'loc_east', name: 'East Coast Warehouse' }) },
    activityEntry: { create: async () => ({}) },
    orderRisk: { findMany: async () => [] },
    balanceTransaction: { findMany: async () => [] },
    product: {
      findMany: async () => [],
      findFirst: async () => ({ trackQuantity: true }),
    },
  }

  const ordersService = new OrdersService(mockPrisma as any)

  // Step 1: Fulfill Item A (Qty: 2) from East Warehouse with UPS tracking
  const { order: partialOrder, fulfillment: f1 } = await ordersService.fulfill({
    orderId: 'ord_split_1',
    lineItemIds: ['li_a'],
    quantities: [2],
    locationId: 'loc_east',
    carrier: 'UPS',
    trackingNumber: '1Z9999999999999999',
  })

  assert.equal(mockOrder.fulfillmentStatus, 'partial')
  assert.equal(f1.carrier, 'UPS')
  assert.equal(f1.trackingUrl, 'https://www.ups.com/track?tracknum=1Z9999999999999999')
  assert.equal(inventoryLevelsDb[0].committed, 0, 'Committed stock should be consumed on fulfillment')

  // Step 2: Fulfill Item B (Qty: 1) from West Warehouse with FedEx tracking
  const { order: fullOrder, fulfillment: f2 } = await ordersService.fulfill({
    orderId: 'ord_split_1',
    lineItemIds: ['li_b'],
    quantities: [1],
    locationId: 'loc_west',
    carrier: 'FedEx',
    trackingNumber: '123456789012',
  })

  assert.equal(mockOrder.fulfillmentStatus, 'fulfilled')
  assert.equal(mockOrder.status, 'closed')
  assert.equal(f2.carrier, 'FedEx')
  assert.equal(f2.trackingUrl, 'https://www.fedex.com/fedextrack/?trknbr=123456789012')
  assert.equal(inventoryLevelsDb[1].committed, 0)
})
