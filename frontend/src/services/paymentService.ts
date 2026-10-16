import { STOREFRONT_API_URL } from './storefrontClient'

export interface PaymentIntentResponse {
  clientSecret: string
  paymentIntentId: string
  amount: number
  currency: string
  isTestMode: boolean
}

export async function createPaymentIntent(
  cartId: string,
  currency = 'usd',
  customerEmail?: string,
): Promise<PaymentIntentResponse> {
  const res = await fetch(`${STOREFRONT_API_URL}/api/payments/create-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartId, currency, customerEmail }),
  })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.error || `Payment Intent creation failed (${res.status})`)
  }

  return res.json()
}
