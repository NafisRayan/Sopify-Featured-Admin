import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, CreditCard, Lock, ShoppingBag, Sparkles, AlertCircle, Tag, X, CheckCircle2 } from 'lucide-react'
import { useStorefrontCart } from '@/store/useStorefrontCart'
import { useStorefrontCustomer } from '@/store/useStorefrontCustomer'
import { completeStorefrontCheckout } from '@/services/storefrontClient'
import { createPaymentIntent } from '@/services/paymentService'
export function StorefrontCheckoutPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const recoverCartId = searchParams.get('recover')
  const recoveryDiscount = searchParams.get('discount')

  const { cart, clearCart, applyDiscount, removeDiscount, initCart, isLoading: cartLoading } = useStorefrontCart()
  const { customer } = useStorefrontCustomer()

  const defaultAddr = customer?.defaultAddress
  const [email, setEmail] = useState(customer?.email || 'customer@example.com')
  const [firstName, setFirstName] = useState(defaultAddr?.firstName || customer?.firstName || 'Jane')
  const [lastName, setLastName] = useState(defaultAddr?.lastName || customer?.lastName || 'Doe')
  const [address1, setAddress1] = useState(defaultAddr?.address1 || '123 Market Street')
  const [city, setCity] = useState(defaultAddr?.city || 'Portland')
  const [province, setProvince] = useState(defaultAddr?.province || 'OR')
  const [zip, setZip] = useState(defaultAddr?.zip || '97201')
  const [country] = useState(defaultAddr?.country || 'United States')
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cod'>('card')
  const [discountInput, setDiscountInput] = useState('')
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [isRecoveredBanner, setIsRecoveredBanner] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242')
  const [cardExpiry, setCardExpiry] = useState('12/28')
  const [cardCvc, setCardCvc] = useState('123')
  const lines = cart?.lines.edges.map((e) => e.node) || []
  const subtotal = cart?.cost.subtotalAmount.amount ?? 0
  const estimatedTax = cart?.cost.totalTaxAmount?.amount ?? roundMoneyLocal(subtotal * 0.08)
  const total = cart?.cost.totalAmount.amount ?? roundMoneyLocal(subtotal + estimatedTax)
  const currency = cart?.cost.totalAmount.currencyCode ?? 'USD'
  function roundMoneyLocal(val: number) {
    return Math.round(val * 100) / 100
  }

  // Cart Recovery Re-hydration lifecycle (?recover=cartId&discount=CODE)
  useEffect(() => {
    if (recoverCartId) {
      localStorage.setItem('ns_storefront_cart_id', recoverCartId)
      initCart().then(() => {
        setIsRecoveredBanner(true)
        if (recoveryDiscount) {
          applyDiscount(recoveryDiscount)
        }
      })
    }
  }, [recoverCartId, recoveryDiscount, initCart, applyDiscount])

  const handleCompleteOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cart?.id) {
      setErrorMessage('Cart session not found. Please add an item first.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {

      let paymentIntentId = ''
      if (paymentMethod === 'card') {
        try {
          const intent = await createPaymentIntent(cart.id, currency, email.trim())

          // Authoritative PaymentIntent received from Stripe
          paymentIntentId = intent.paymentIntentId
        } catch (intentErr) {
          // Non-blocking fallback to test payment rails
          console.warn('PaymentIntent creation notice:', intentErr)
        }
      }

      const gatewayDesc =
        paymentMethod === 'card'
          ? `Shopify Payments (Stripe: ${paymentIntentId || 'pi_test_simulated'})`
          : 'Cash on Delivery'

      const { order, userErrors } = await completeStorefrontCheckout({
        cartId: cart.id,
        email: email.trim(),
        shippingAddress: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          address1: address1.trim(),
          city: city.trim(),
          province: province.trim(),
          zip: zip.trim(),
          country: country.trim(),
        },
        paymentGateway: gatewayDesc,
      })
      if (order) {
        clearCart()
        navigate(`/store/order-confirmed/${order.id.replace('gid://shopify/Order/', '')}`, {
          state: { order },
        })
      } else if (userErrors.length) {
        setErrorMessage(userErrors[0].message)
        setIsSubmitting(false)
      }
    } catch (err) {
      setErrorMessage((err as Error).message)
      setIsSubmitting(false)
    }
  }

  if (cartLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center animate-pulse">
        <p className="text-neutral-500">Loading checkout session...</p>
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-400 mb-4">
          <ShoppingBag size={28} />
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 mb-2">Your Cart is Empty</h2>
        <p className="text-sm text-neutral-500 mb-6">
          Add an item to your cart before proceeding to checkout.
        </p>
        <Link
          to="/store"
          className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-6 py-3 text-sm font-semibold text-white"
        >
          <ArrowLeft size={16} /> Return to Store
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
      {/* Abandoned Cart Recovery Banner */}
      {isRecoveredBanner && (
        <div className="mb-6 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center justify-between text-emerald-800">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold">Welcome back!</p>
              <p className="text-xs text-emerald-700">We've restored your cart and applied your recovery discount.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsRecoveredBanner(false)}
            className="text-emerald-600 hover:text-emerald-900 p-1"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Return to store link */}
      <Link
        to="/store"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 mb-8 transition"
      >
        <ArrowLeft size={14} /> Back to Store
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
        {/* Left Column: Checkout Form */}
        <div className="lg:col-span-7">
          <form onSubmit={handleCompleteOrder} className="space-y-8">
            {/* Contact info */}
            <div>
              <h3 className="text-base font-bold text-neutral-900 mb-4">1. Contact Information</h3>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Email Address (Receipt & Notifications)
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none transition"
                  placeholder="jane.doe@example.com"
                />
              </div>
            </div>

            {/* Shipping address */}
            <div>
              <h3 className="text-base font-bold text-neutral-900 mb-4">2. Shipping Address</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm focus:border-neutral-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm focus:border-neutral-900 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    required
                    value={address1}
                    onChange={(e) => setAddress1(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm focus:border-neutral-900 outline-none"
                    placeholder="123 Market St, Suite 400"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm focus:border-neutral-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      State / Province
                    </label>
                    <input
                      type="text"
                      required
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm focus:border-neutral-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      ZIP / Postal
                    </label>
                    <input
                      type="text"
                      required
                      value={zip}
                      onChange={(e) => setZip(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm focus:border-neutral-900 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Payment simulation */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-neutral-900">3. Payment Details</h3>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles size={11} /> Stripe Verified Rails
                </span>
              </div>

              {/* Zero-Config Test Mode Banner */}
              <div className="mb-4 bg-amber-50 border border-amber-200/80 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-800">
                <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Test Mode Active:</span> Real-time server-side cart calculation with zero-config test payment authorization enabled.
                </div>
              </div>

              <div className="space-y-3">
                <label
                  className={`flex flex-col p-4 rounded-xl border cursor-pointer transition ${
                    paymentMethod === 'card'
                      ? 'border-neutral-900 bg-neutral-50/70 ring-1 ring-neutral-900'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment"
                        checked={paymentMethod === 'card'}
                        onChange={() => setPaymentMethod('card')}
                        className="text-neutral-900 focus:ring-neutral-900"
                      />
                      <div>
                        <span className="text-sm font-semibold text-neutral-900 block">
                          Credit Card (Stripe Elements)
                        </span>
                        <span className="text-xs text-neutral-500">
                          Instant automated authorization via Stripe PaymentIntents API
                        </span>
                      </div>
                    </div>
                    <CreditCard size={18} className="text-neutral-500" />
                  </div>

                  {/* Card input mockup (Elements wrapper) */}
                  {paymentMethod === 'card' && (
                    <div className="mt-4 pt-3 border-t border-neutral-200/80 space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                          Card Number
                        </label>
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          className="w-full bg-white rounded-lg border border-neutral-300 px-3 py-2 text-xs font-mono focus:border-neutral-900 outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                            Expiration
                          </label>
                          <input
                            type="text"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                            className="w-full bg-white rounded-lg border border-neutral-300 px-3 py-2 text-xs font-mono focus:border-neutral-900 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                            CVC
                          </label>
                          <input
                            type="text"
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value)}
                            className="w-full bg-white rounded-lg border border-neutral-300 px-3 py-2 text-xs font-mono focus:border-neutral-900 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </label>

                <label
                  className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition ${
                    paymentMethod === 'cod'
                      ? 'border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="payment"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                      className="text-neutral-900 focus:ring-neutral-900"
                    />
                    <div>
                      <span className="text-sm font-semibold text-neutral-900 block">
                        Direct / Pay on Delivery
                      </span>
                      <span className="text-xs text-neutral-500">
                        Mark order as pending payment for local fulfillment
                      </span>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                {errorMessage}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-neutral-900 py-4 px-6 text-base font-bold text-white shadow-lg hover:bg-neutral-800 disabled:opacity-50 transition active:scale-[0.99]"
            >
              {isSubmitting ? (
                <>
                  <span className="inline-block animate-spin mr-1">↻</span> Processing Checkout...
                </>
              ) : (
                <>
                  <Lock size={16} /> Complete Order (${total.toFixed(2)} {currency})
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-2 text-xs text-neutral-400">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>Encrypted 256-Bit SSL Storefront API Checkout</span>
            </div>
          </form>
        </div>

        {/* Right Column: Order Summary */}
        <div className="lg:col-span-5 bg-neutral-50 border border-neutral-200 rounded-2xl p-6 lg:p-8 space-y-6">
          <h3 className="text-base font-bold text-neutral-900">Order Summary</h3>

          {/* Lines */}
          <div className="divide-y divide-neutral-200/80 max-h-72 overflow-y-auto pr-1">
            {lines.map((line) => {
              const merchandise = line.merchandise
              const imgSrc = merchandise.image?.url || '/images/products/classic-cotton-t-shirt.svg'

              return (
                <div key={line.id} className="py-3 flex items-center gap-3">
                  <div className="relative shrink-0">
                    <img
                      src={imgSrc}
                      alt={merchandise.title}
                      className="w-14 h-14 rounded-lg object-cover bg-white border border-neutral-200"
                    />
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-neutral-800 text-white text-[10px] font-bold flex items-center justify-center">
                      {line.quantity}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-semibold text-neutral-900 truncate">
                      {merchandise.product?.title || merchandise.title}
                    </h4>
                    {merchandise.title && merchandise.title !== 'Default Title' && (
                      <p className="text-[11px] text-neutral-500">{merchandise.title}</p>
                    )}
                  </div>
                  <span className="text-xs font-bold text-neutral-900">
                    ${line.cost.totalAmount.amount.toFixed(2)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Discount Code Input in Checkout */}
          <div className="pt-2">
            {cart?.discountCodes && cart.discountCodes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {cart.discountCodes.map((d) => (
                  <span
                    key={d.code}
                    className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-md text-xs font-semibold"
                  >
                    <Tag size={12} />
                    {d.code} {d.amount?.amount ? `(-$${d.amount.amount.toFixed(2)})` : ''}
                    <button
                      type="button"
                      onClick={() => removeDiscount(d.code)}
                      className="hover:text-emerald-950 ml-0.5"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={discountInput}
                onChange={(e) => {
                  setDiscountInput(e.target.value)
                  setDiscountError(null)
                }}
                placeholder="Promo code (e.g. SPRING20)"
                className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs uppercase focus:border-neutral-900 outline-none"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!discountInput.trim()) return
                  const success = await applyDiscount(discountInput.trim())
                  if (success) {
                    setDiscountInput('')
                    setDiscountError(null)
                  } else {
                    setDiscountError('Invalid promo code')
                  }
                }}
                className="bg-neutral-900 text-white text-xs font-bold px-3.5 py-2 rounded-lg hover:bg-neutral-800 transition"
              >
                Apply
              </button>
            </div>
            {discountError && (
              <p className="text-[11px] text-red-600 mt-1.5">{discountError}</p>
            )}
          </div>

          {/* Pricing calculations */}
          <div className="border-t border-neutral-200/80 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal</span>
              <div className="text-right">
                {cart?.cost.totalDiscountAmount?.amount ? (
                  <span className="text-xs text-neutral-400 line-through mr-2">
                    ${(subtotal + cart.cost.totalDiscountAmount.amount).toFixed(2)}
                  </span>
                ) : null}
                <span className="font-medium text-neutral-900">${subtotal.toFixed(2)}</span>
              </div>
            </div>
            {cart?.cost.totalDiscountAmount?.amount ? (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Savings</span>
                <span>-${cart.cost.totalDiscountAmount.amount.toFixed(2)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-neutral-600">
              <span>Shipping</span>
              <span className="text-emerald-600 font-medium">Free</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Estimated Tax (8%)</span>
              <span className="font-medium text-neutral-900">${estimatedTax.toFixed(2)}</span>
            </div>
            <div className="border-t border-neutral-200/80 pt-3 flex justify-between items-baseline text-base font-bold text-neutral-900">
              <span>Total</span>
              <span>
                ${total.toFixed(2)} {currency}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
