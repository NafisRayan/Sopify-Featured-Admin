import assert from 'node:assert/strict'
import test from 'node:test'
import { tenantContext } from '../../common/tenant.middleware'
import { OrdersService } from '../orders/orders.service'

test('Authoritative Analytics Calculation: Gross, Discounts, Returns, Net Sales, Taxes, and AOV', async () => {
  const from = new Date('2026-10-01T00:00:00Z')
  const to = new Date('2026-10-31T23:59:59Z')

  const ordersDb = [
    // Order 1: Subtotal $100, Discount $10, Refund $20, Shipping $10, Tax $8
    // Net = 100 - 10 - 20 = $70. Total = 70 + 10 + 8 = $88
    {
      id: 'o1',
      storeId: 'store_northstar',
      customerId: 'cust_1',
      name: '#1001',
      subtotal: 100.0,
      total: 88.0,
      shippingPrice: 10.0,
      taxTotal: 8.0,
      discountCode: JSON.stringify({ amount: 10.0 }),
      refunds: JSON.stringify([{ amount: 20.0 }]),
      lineItems: JSON.stringify([
        { productId: 'p_mug', title: 'Camp Mug', quantity: 2, price: 50.0 },
      ]),
      createdAt: new Date('2026-10-10T12:00:00Z'),
      isDraft: false,
      status: 'open',
      channel: 'Online Store',
    },
    // Order 2: Repeat customer cust_1 placed another order
    {
      id: 'o2',
      storeId: 'store_northstar',
      customerId: 'cust_1',
      name: '#1002',
      subtotal: 50.0,
      total: 54.0,
      shippingPrice: 0,
      taxTotal: 4.0,
      discountCode: null,
      refunds: '[]',
      lineItems: JSON.stringify([
        { productId: 'p_beanie', title: 'Wool Beanie', quantity: 1, price: 50.0 },
      ]),
      createdAt: new Date('2026-10-15T12:00:00Z'),
      isDraft: false,
      status: 'open',
      channel: 'Online Store',
    },
    // Order 3: Different tenant (Store B) order -> must be isolated
    {
      id: 'o3',
      storeId: 'store_other',
      customerId: 'cust_9',
      name: '#9999',
      subtotal: 500.0,
      total: 550.0,
      shippingPrice: 0,
      taxTotal: 50.0,
      discountCode: null,
      refunds: '[]',
      lineItems: JSON.stringify([]),
      createdAt: new Date('2026-10-12T12:00:00Z'),
      isDraft: false,
      status: 'open',
      channel: 'Online Store',
    },
  ]

  const mockPrisma = {
    order: {
      findMany: async (args?: any) => {
        let res = ordersDb
        if (args?.where?.storeId) {
          res = res.filter((o) => o.storeId === args.where.storeId)
        }
        if (args?.where?.createdAt?.gte && args?.where?.createdAt?.lte) {
          res = res.filter(
            (o) => o.createdAt >= args.where.createdAt.gte && o.createdAt <= args.where.createdAt.lte,
          )
        }
        return res
      },
    },
  }

  const service = new OrdersService(mockPrisma as any)

  await tenantContext.run({ id: 'store_northstar', name: 'Northstar Goods', slug: 'northstar', currency: 'USD' }, async () => {
    const summary = await service.analytics(from, to)

    // Verify Financial Math
    // Gross = 100 + 50 = $150.00
    assert.equal(summary.grossSales, 150.0)
    // Discounts = $10.00
    assert.equal(summary.discounts, 10.0)
    // Returns = $20.00
    assert.equal(summary.returns, 20.0)
    // Net Sales = 150 - 10 - 20 = $120.00
    assert.equal(summary.netSales, 120.0)
    // Total Sales = Net ($120) + Shipping ($10) + Taxes ($12) = $142.00
    assert.equal(summary.totalSales, 142.0)
    assert.equal(summary.ordersCount, 2)
    assert.equal(summary.unitsSold, 3)
    assert.equal(summary.avgOrderValue, 71.0) // 142 / 2 = 71.0

    // Verify Returning Customer Rate: 1 unique customer (cust_1) who placed 2 orders -> 100%
    assert.equal(summary.returningCustomerRate, 100.0)

    // Verify Store B's $500 order was excluded (tenant isolation)
    assert.ok(summary.totalSales < 500)

    // Verify Top Products
    assert.equal(summary.topProducts.length, 2)
    assert.equal(summary.topProducts[0].productId, 'p_mug')
    assert.equal(summary.topProducts[0].revenue, 100.0)

    // Verify Channel Breakdown
    assert.equal(summary.salesByChannel.length, 1)
    assert.equal(summary.salesByChannel[0].channel, 'Online Store')
  })
})
