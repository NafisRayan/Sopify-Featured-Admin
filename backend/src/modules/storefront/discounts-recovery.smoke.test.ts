import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSchema } from 'graphql'
import { StorefrontService } from './storefront.service'
import { ReviewsService } from '../products/reviews.service'
import { PrismaService } from '../../prisma/prisma.service'

test('Discounts & Abandoned Cart Recovery Lifecycle: Discounts -> Abandoned Tracking -> Recovery', async () => {
  const storefrontSdl = readFileSync(join(__dirname, 'storefront.graphql'), 'utf8')
  const schema = buildSchema(storefrontSdl)
  assert.ok(schema, 'Storefront schema builds cleanly')

  const discountsDb: any[] = [
    {
      id: 'disc_spring20',
      code: 'SPRING20',
      title: 'Spring 20% Off',
      type: 'percentage',
      value: 20,
      status: 'active',
      usedCount: 0,
      usageLimit: 100,
      minPurchase: 0,
    },
    {
      id: 'disc_expired',
      code: 'EXPIRED10',
      title: 'Expired Promo',
      type: 'fixed_amount',
      value: 10,
      status: 'active',
      endsAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // yesterday
    },
  ]

  const abandonedDb: any[] = []
  const orderDb: any[] = []

  const mockPrisma = {
    discount: {
      findUnique: async ({ where }: any) => {
        return discountsDb.find((d) => d.code.toUpperCase() === where.code?.toUpperCase()) || null
      },
      findFirst: async ({ where }: any) => {
        return discountsDb.find((d) => d.code.toUpperCase() === where.code?.toUpperCase()) || null
      },
      update: async ({ where, data }: any) => {
        const idx = discountsDb.findIndex((d) => d.id === where.id)
        if (idx >= 0) discountsDb[idx] = { ...discountsDb[idx], ...data }
      },
    },
    product: {
      findMany: async () => [
        {
          id: 'prod_1',
          title: 'Camp Mug',
          variants: JSON.stringify([
            { id: 'var_1', title: '12oz', price: 50.0 },
          ]),
          media: '[]',
          options: '[]',
        },
      ],
      findUnique: async () => null,
    },
    inventoryLevel: {
      findMany: async () => [{ available: 100 }],
      findFirst: async () => ({ available: 100, committed: 0, variantId: 'var_1', locationId: 'loc_1' }),
      update: async () => ({}),
    },
    shopCounter: {
      upsert: async () => ({ value: 1030 }),
    },
    order: {
      create: async ({ data }: any) => {
        orderDb.push(data)
        return data
      },
    },
    abandonedCheckout: {
      create: async ({ data }: any) => {
        abandonedDb.push(data)
        return data
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0
        for (const ab of abandonedDb) {
          ab.recoveryStatus = data.recoveryStatus
          count++
        }
        return { count }
      },
    },
  }

  const prismaStub = mockPrisma as unknown as PrismaService // test mock implements only the delegates these flows touch
  const service = new StorefrontService(prismaStub, new ReviewsService(prismaStub))
  service.onModuleInit()

  // 1. Create Cart with 2x $50 item = $100 subtotal
  const createCartMutation = `
    mutation {
      cartCreate(input: { lines: [{ merchandiseId: "gid://shopify/ProductVariant/var_1", quantity: 2 }] }) {
        cart {
          id
          totalQuantity
          cost {
            subtotalAmount { amount }
            totalAmount { amount }
          }
        }
      }
    }
  `
  const createRes = await service.execute(createCartMutation)
  const cart = (createRes.data as any)?.cartCreate?.cart
  assert.ok(cart)
  assert.equal(cart.totalQuantity, 2)
  assert.equal(cart.cost.subtotalAmount.amount, 100.0)

  // 2. Apply SPRING20 discount (20% off $100 -> $80 discounted subtotal + 8% tax = $86.40 total)
  const applyPromoMutation = `
    mutation ApplyPromo($cartId: ID!, $codes: [String!]!) {
      cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $codes) {
        cart {
          id
          cost {
            subtotalAmount { amount }
            totalAmount { amount }
            totalDiscountAmount { amount }
          }
          discountCodes {
            code
            applicable
            amount { amount }
          }
          discountAllocations {
            code
            discountedAmount { amount }
          }
        }
        userErrors {
          message
        }
      }
    }
  `
  const promoRes = await service.execute(applyPromoMutation, {
    cartId: cart.id,
    codes: ['SPRING20'],
  })
  assert.equal(promoRes.errors, undefined)
  const discountedCart = (promoRes.data as any)?.cartDiscountCodesUpdate?.cart
  assert.ok(discountedCart)
  assert.equal(discountedCart.cost.totalDiscountAmount.amount, 20.0)
  assert.equal(discountedCart.cost.subtotalAmount.amount, 80.0)
  assert.equal(discountedCart.cost.totalAmount.amount, 86.4)
  assert.equal(discountedCart.discountCodes[0].applicable, true)

  // 3. Test Invalid / Expired Promo Code userErrors
  const invalidRes = await service.execute(applyPromoMutation, {
    cartId: cart.id,
    codes: ['EXPIRED10'],
  })
  const userErrors = (invalidRes.data as any)?.cartDiscountCodesUpdate?.userErrors
  assert.ok(userErrors.length > 0)
  assert.ok(userErrors[0].message.includes('expired'))
  // Re-apply valid SPRING20 promo code to cart
  await service.execute(applyPromoMutation, {
    cartId: cart.id,
    codes: ['SPRING20'],
  })

  // 4. Simulate Abandoned Checkout Detection
  abandonedDb.push({
    id: `abandoned_${cart.id.replace('gid://shopify/Cart/', '')}`,
    customerId: 'cust_anon',
    email: 'alex.shopper@example.com',
    recoveryStatus: 'not_recovered',
  })
  assert.equal(abandonedDb.length, 1)
  assert.equal(abandonedDb[0].recoveryStatus, 'not_recovered')

  // 5. Complete Checkout & Recover Abandoned Cart
  const completeMutation = `
    mutation Complete($input: CartCheckoutCompleteInput!) {
      cartCheckoutComplete(input: $input) {
        order {
          id
          name
          totalPrice { amount }
        }
        userErrors { message }
      }
    }
  `
  const completeRes = await service.execute(completeMutation, {
    input: {
      cartId: cart.id,
      email: 'alex.shopper@example.com',
      shippingAddress: {
        firstName: 'Alex',
        lastName: 'Shopper',
      },
    },
  })
  const order = (completeRes.data as any)?.cartCheckoutComplete?.order
  assert.ok(order)
  assert.equal(order.name, '#1030')
  assert.equal(order.totalPrice.amount, 86.4)

  // Verify AbandonedCheckout was marked as recovered
  assert.equal(abandonedDb[0].recoveryStatus, 'recovered')
})
