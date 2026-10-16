import { Controller, Post, Body, Headers, Req, Res, HttpStatus, Logger } from '@nestjs/common'
import type { Request, Response } from 'express'
import { PaymentsService } from './payments.service'

@Controller('api')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name)

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payments/create-intent')
  async createIntent(
    @Body() body: { cartId: string; currency?: string; customerEmail?: string },
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!body.cartId) {
        res.status(HttpStatus.BAD_REQUEST).json({ error: 'cartId is required' })
        return
      }

      const result = await this.paymentsService.createPaymentIntent(
        body.cartId,
        body.currency || 'usd',
        body.customerEmail,
      )

      res.status(HttpStatus.OK).json(result)
    } catch (err) {
      this.logger.error(`Failed to create payment intent: ${err}`)
      res.status(HttpStatus.BAD_REQUEST).json({ error: (err as Error).message })
    }
  }

  @Post('webhooks/stripe')
  async handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body))

    if (!signature) {
      this.logger.warn('Webhook rejected: missing stripe-signature header')
      res.status(HttpStatus.UNAUTHORIZED).json({ error: 'Missing stripe-signature header' })
      return
    }

    try {
      const event = this.paymentsService.constructEvent(rawBody, signature)
      const outcome = await this.paymentsService.handleWebhookEvent(event)
      res.status(HttpStatus.OK).json(outcome)
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err}`)
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Webhook verification failed' })
    }
  }
}
