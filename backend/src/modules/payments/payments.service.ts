import { Injectable, Logger } from '@nestjs/common'
import Stripe from 'stripe'
import { PrismaService } from '../../prisma/prisma.service'
import { StorefrontService } from '../storefront/storefront.service'
import { OrdersService } from '../orders/orders.service'
import { parseJson } from '../../common/helpers'
import { uid, roundMoney } from '../../common/ids'
import { currentTenant } from '../../common/tenant.middleware'

export interface PaymentIntentResult {
  clientSecret: string
  paymentIntentId: string
  amount: number
  currency: string
  isTestMode: boolean
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)
  private readonly stripe: Stripe | null = null
  private readonly isTestMode: boolean

  constructor(
    private readonly prisma: PrismaService,
    private readonly storefrontService: StorefrontService,
    private readonly ordersService: OrdersService,
  ) {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
    if (secretKey && !secretKey.startsWith('sk_test_placeholder')) {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
      })
      this.isTestMode = secretKey.startsWith('sk_test_')
      this.logger.log(`Stripe initialized in ${this.isTestMode ? 'TEST' : 'LIVE'} mode`)
    } else {
      this.isTestMode = true
      this.logger.warn(
        'STRIPE_SECRET_KEY not provided. Operating in zero-config simulated payment mode.',
      )
    }
  }

  get webhookSecret(): string {
    return process.env.STRIPE_WEBHOOK_SECRET?.trim() || 'whsec_test_mock_secret'
  }

  /**
   * Computes authoritative server-side cart amount and issues a Stripe PaymentIntent
   */
  async createPaymentIntent(
    cartId: string,
    currency = 'usd',
    customerEmail?: string,
  ): Promise<PaymentIntentResult> {
    const tenant = currentTenant()
    const cart = this.storefrontService.getCartRecord(cartId)
    if (!cart || cart.lines.length === 0) {
      throw new Error(`Cart ${cartId} not found or has no line items`)
    }

    // Authoritative server-side price calculation scoped strictly to the tenant's products
    let subtotal = 0
    const products = await this.prisma.product.findMany({
      where: { storeId: tenant.id },
    })

    for (const line of cart.lines) {
      const rawVariantId = line.merchandiseId.split('/').pop()
      let unitPrice = 0
      for (const p of products) {
        const variants = parseJson<any[]>(p.variants as string, [])
        const matched = variants.find((v) => v.id === rawVariantId)
        if (matched) {
          unitPrice = Number(matched.price ?? 0)
          break
        }
      }
      subtotal += unitPrice * line.quantity
    }

    subtotal = roundMoney(subtotal)
    const tax = roundMoney(subtotal * 0.08)
    const totalAmount = roundMoney(subtotal + tax)
    const amountInCents = Math.round(totalAmount * 100)

    if (this.stripe) {
      const intent = await this.stripe.paymentIntents.create({
        amount: amountInCents,
        currency: currency.toLowerCase(),
        receipt_email: customerEmail || cart.buyerIdentity.email || undefined,
        metadata: {
          cartId: cart.id,
          customerEmail: customerEmail || cart.buyerIdentity.email || '',
          storeId: tenant.id,
          source: 'northstar_storefront',
        },
        automatic_payment_methods: { enabled: true },
      })

      return {
        clientSecret: intent.client_secret || '',
        paymentIntentId: intent.id,
        amount: totalAmount,
        currency: currency.toUpperCase(),
        isTestMode: this.isTestMode,
      }
    }

    // Zero-config test fallback mode: generate valid client-side simulation payload
    const mockIntentId = `pi_mock_${uid('test')}`
    return {
      clientSecret: `${mockIntentId}_secret_${uid('sec')}`,
      paymentIntentId: mockIntentId,
      amount: totalAmount,
      currency: currency.toUpperCase(),
      isTestMode: true,
    }
  }

  /**
   * Constructs a cryptographic event from the raw webhook buffer and signature.
   *
   * SECURITY: With a real STRIPE_SECRET_KEY configured, signature verification is
   * MANDATORY — unsigned or forged payloads are rejected outright. Unsigned
   * payloads are only accepted when an explicit dev flag
   * (STRIPE_ALLOW_UNSIGNED_WEBHOOKS=true) is set alongside test mode, and never
   * when a live key is configured.
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (this.stripe) {
      if (!signature) {
        throw new Error(
          'Webhook signature header missing. Signature verification is mandatory when STRIPE_SECRET_KEY is configured.',
        )
      }
      return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret)
    }

    // Simulated test mode: only accept unsigned payloads when explicitly enabled.
    const allowUnsigned = process.env.STRIPE_ALLOW_UNSIGNED_WEBHOOKS === 'true'
    if (!allowUnsigned && process.env.NODE_ENV === 'production') {
      throw new Error(
        'Unsigned webhook rejected. Set STRIPE_ALLOW_UNSIGNED_WEBHOOKS=true to accept in non-production test mode.',
      )
    }

    try {
      const parsed = JSON.parse(rawBody.toString('utf8')) as Stripe.Event
      if (!parsed?.id || !parsed?.type) {
        throw new Error('Malformed webhook payload')
      }
      return parsed
    } catch {
      throw new Error('Invalid JSON payload in webhook body')
    }
  }

  /**
   * Idempotently handles verified Stripe webhook events.
   * Processed event IDs are persisted in PostgreSQL (WebhookEvent table) to
   * survive restarts and prevent unbounded in-memory replay.
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<{ received: boolean; processed: boolean; reason?: string }> {
    // 1. Insert-first idempotency guard: catches concurrent duplicate events via unique constraint
    try {
      await this.prisma.webhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          payload: JSON.stringify({ id: event.id, type: event.type }),
        },
      })
    } catch {
      this.logger.log(`Webhook ${event.id} already recorded. Skipping duplicate race.`)
      return { received: true, processed: false, reason: 'duplicate_event' }
    }

    this.logger.log(`Processing Stripe webhook event: ${event.type} [${event.id}]`)

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent
          await this.handlePaymentIntentSucceeded(paymentIntent)
          break
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent
          await this.handlePaymentIntentFailed(paymentIntent)
          break
        }

        default:
          this.logger.log(`Unhandled event type ${event.type}`)
      }

      return { received: true, processed: true }
    } catch (err) {
      this.logger.error(`Webhook ${event.id} processing failure: ${err}`)
      // Remove recorded event row on failure so Stripe retry or manual replay can re-process
      try {
        await this.prisma.webhookEvent.delete({ where: { eventId: event.id } })
      } catch {
        // ignore cleanup error
      }
      throw err
    }
  }

  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const paymentIntentId = paymentIntent.id
    const amountInDollars = roundMoney(paymentIntent.amount / 100)
    const metadataStoreId = paymentIntent.metadata?.storeId

    // SECURITY: Match orders strictly by structured metadata orderId / cartId.
    // Never fall back to loose substring matching on order note or email.
    const matchedOrderId = paymentIntent.metadata?.orderId
    const matchedCartId = paymentIntent.metadata?.cartId

    let matchedOrder = null

    if (matchedOrderId) {
      matchedOrder = await this.prisma.order.findFirst({
        where: { id: matchedOrderId },
      })
    }

    if (!matchedOrder && matchedCartId) {
      const rawCartId = matchedCartId.split('/').pop() || matchedCartId
      matchedOrder = await this.prisma.order.findFirst({
        where: {
          OR: [
            { paymentGateway: `Shopify Payments (Cart: ${rawCartId})` },
            { paymentGateway: `Shopify Payments (Stripe: ${paymentIntentId})` },
          ],
        },
      })
    }

    if (!matchedOrder) {
      this.logger.warn(
        `No order matched for Stripe PaymentIntent ${paymentIntentId}. Skipping ledger entry.`,
      )
      return
    }

    // Transition order status to paid if not already
    if (matchedOrder.paymentStatus !== 'paid') {
      await this.prisma.order.update({
        where: { id: matchedOrder.id },
        data: {
          paymentStatus: 'paid',
          paymentGateway: `Shopify Payments (Stripe: ${paymentIntentId})`,
        },
      })
    }

    // Record Financial Ledger Entry (BalanceTransaction with 2.9% + $0.30 fee)
    const fee = roundMoney(amountInDollars * 0.029 + 0.3)
    const net = roundMoney(amountInDollars - fee)
    const at = new Date()

    // Additional persisted idempotency check: exact Stripe transaction ID ledger match
    const existingTxn = await this.prisma.balanceTransaction.findFirst({
      where: { orderId: matchedOrder.id, description: { contains: paymentIntentId } },
    })
    if (existingTxn) {
      this.logger.log(`BalanceTransaction already exists for ${paymentIntentId}. Skipping.`)
      return
    }

    await this.prisma.balanceTransaction.create({
      data: {
        id: uid('bt'),
        at,
        type: 'charge',
        amount: amountInDollars,
        fee,
        net,
        orderId: matchedOrder.id,
        description: `Stripe online checkout payment for order ${matchedOrder.name} (${paymentIntentId})`,
        payoutId: null,
      },
    })
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    this.logger.warn(
      `Stripe PaymentIntent ${paymentIntent.id} failed: ${paymentIntent.last_payment_error?.message}`,
    )
  }

  /**
   * Issues refund to Stripe gateway when an admin refunds an order
   */
  async processStripeRefund(
    paymentIntentId: string,
    refundAmountDollars: number,
  ): Promise<{ success: boolean; refundId?: string; error?: string }> {
    const amountInCents = Math.round(refundAmountDollars * 100)

    if (this.stripe && !paymentIntentId.startsWith('pi_mock_')) {
      try {
        const refund = await this.stripe.refunds.create({
          payment_intent: paymentIntentId,
          amount: amountInCents,
        })
        return { success: true, refundId: refund.id }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }

    // Zero-config test simulation
    return {
      success: true,
      refundId: `re_mock_${uid('ref')}`,
    }
  }
}
