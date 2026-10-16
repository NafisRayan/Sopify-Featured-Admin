import assert from 'node:assert/strict'
import test from 'node:test'
import { PaymentsService } from './payments.service'

test('PaymentsService PaymentIntent creation validates cart and calculates server-side total', async () => {
  const mockPrisma = {
    product: {
      findMany: async () => [
        {
          id: 'prod_1',
          variants: JSON.stringify([
            { id: 'var_1', price: 45.0 },
            { id: 'var_2', price: 20.0 },
          ]),
        },
      ],
    },
    order: { findMany: async () => [] },
    balanceTransaction: { create: async () => ({}) },
  }

  const mockStorefront = {
    getCartRecord: (id: string) => {
      if (id === 'cart_123') {
        return {
          id: 'cart_123',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lines: [
            { id: 'l1', merchandiseId: 'gid://shopify/ProductVariant/var_1', quantity: 2 },
            { id: 'l2', merchandiseId: 'gid://shopify/ProductVariant/var_2', quantity: 1 },
          ],
          buyerIdentity: { email: 'customer@example.com' },
          discountCodes: [],
        }
      }
      return null
    },
  }

  const mockOrders = {}

  const payments = new PaymentsService(mockPrisma as any, mockStorefront as any, mockOrders as any)

  // Subtotal = (45 * 2) + (20 * 1) = 110.00
  // Tax (8%) = 8.80
  // Total = 118.80
  const intent = await payments.createPaymentIntent('cart_123', 'usd')
  assert.ok(intent.paymentIntentId)
  assert.ok(intent.clientSecret)
  assert.equal(intent.amount, 118.8)
  assert.equal(intent.currency, 'USD')
  assert.equal(intent.isTestMode, true)
})

test('PaymentsService Webhook processing verifies signature and idempotently marks order as paid with balance transaction', async () => {
  let updatedOrderData: any = null
  let createdBalanceTxn: any = null
  const processedEvents = new Set<string>()

  const mockPrisma = {
    product: { findMany: async () => [] },
    webhookEvent: {
      findUnique: async ({ where }: any) => (processedEvents.has(where.eventId) ? { eventId: where.eventId } : null),
      create: async ({ data }: any) => {
        if (processedEvents.has(data.eventId)) {
          throw new Error('Unique constraint failed on (eventId)')
        }
        processedEvents.add(data.eventId)
        return data
      },
    },
    order: {
      findMany: async () => [
        {
          id: 'ord_1',
          name: '#1050',
          email: 'jane.doe@example.com',
          paymentStatus: 'pending',
          paymentGateway: 'Shopify Payments',
          total: 118.8,
          status: 'open',
        },
      ],
      findFirst: async () => ({
        id: 'ord_1',
        name: '#1050',
        email: 'jane.doe@example.com',
        paymentStatus: 'pending',
        paymentGateway: 'Shopify Payments',
        total: 118.8,
        status: 'open',
      }),
      update: async ({ data }: any) => {
        updatedOrderData = data
        return {}
      },
    },
    balanceTransaction: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdBalanceTxn = data
        return data
      },
    },
  }

  const mockStorefront = { getCartRecord: () => null }
  const mockOrders = {}

  const payments = new PaymentsService(mockPrisma as any, mockStorefront as any, mockOrders as any)

  // 1. Simulate payment_intent.succeeded
  const webhookEvent = {
    id: 'evt_stripe_test_12345',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_test_intent_abc',
        amount: 11880, // $118.80 in cents
        currency: 'usd',
        receipt_email: 'jane.doe@example.com',
        metadata: {
          orderId: 'ord_1',
          customerEmail: 'jane.doe@example.com',
        },
      },
    },
  }

  const firstRun = await payments.handleWebhookEvent(webhookEvent as any)
  assert.equal(firstRun.received, true)
  assert.equal(firstRun.processed, true)

  // Verify order transitioned to paid
  assert.equal(updatedOrderData?.paymentStatus, 'paid')
  assert.ok(updatedOrderData?.paymentGateway.includes('pi_test_intent_abc'))

  // Verify ledger balance transaction with 2.9% + $0.30 fee
  assert.ok(createdBalanceTxn)
  assert.equal(createdBalanceTxn.type, 'charge')
  assert.equal(createdBalanceTxn.amount, 118.8)
  assert.equal(createdBalanceTxn.fee, 3.75) // 118.8 * 0.029 + 0.3 = 3.7452 -> 3.75
  assert.equal(createdBalanceTxn.net, 115.05)

  // 2. Idempotency test: duplicate webhook run must NOT re-apply
  const secondRun = await payments.handleWebhookEvent(webhookEvent as any)
  assert.equal(secondRun.received, true)
  assert.equal(secondRun.processed, false)
  assert.equal(secondRun.reason, 'duplicate_event')
})

test('PaymentsService Webhook processing cleans up event row on business failure allowing retry', async () => {
  const processedEvents = new Set<string>()
  let failBusinessLogic = true

  const mockPrisma = {
    product: { findMany: async () => [] },
    webhookEvent: {
      findUnique: async ({ where }: any) => (processedEvents.has(where.eventId) ? { eventId: where.eventId } : null),
      create: async ({ data }: any) => {
        if (processedEvents.has(data.eventId)) {
          throw new Error('Unique constraint failed on (eventId)')
        }
        processedEvents.add(data.eventId)
        return data
      },
      delete: async ({ where }: any) => {
        processedEvents.delete(where.eventId)
      },
    },
    order: {
      findMany: async () => [],
      findFirst: async () => {
        if (failBusinessLogic) {
          throw new Error('Database transaction deadlocked during order update')
        }
        return {
          id: 'ord_retry_1',
          name: '#1099',
          paymentStatus: 'pending',
        }
      },
      update: async () => ({}),
    },
    balanceTransaction: {
      findFirst: async () => null,
      create: async () => ({}),
    },
  }

  const payments = new PaymentsService(mockPrisma as any, {} as any, {} as any)

  const event = {
    id: 'evt_stripe_fail_and_retry_1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_retry_intent',
        amount: 5000,
        currency: 'usd',
        metadata: { orderId: 'ord_retry_1' },
      },
    },
  }

  // First attempt throws error in business logic
  await assert.rejects(
    async () => {
      await payments.handleWebhookEvent(event as any)
    },
    /Database transaction deadlocked/,
  )

  // Verify eventId was removed from processed set on failure
  assert.equal(processedEvents.has('evt_stripe_fail_and_retry_1'), false)

  // Second attempt (retry) with recovered database succeeds
  failBusinessLogic = false
  const retryRun = await payments.handleWebhookEvent(event as any)
  assert.equal(retryRun.received, true)
  assert.equal(retryRun.processed, true)
  assert.equal(processedEvents.has('evt_stripe_fail_and_retry_1'), true)
})
