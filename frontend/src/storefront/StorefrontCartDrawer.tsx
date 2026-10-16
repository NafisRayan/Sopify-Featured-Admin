import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X, Trash2, ShoppingBag, ArrowRight, Tag } from 'lucide-react'
import { useStorefrontCart } from '@/store/useStorefrontCart'
export function StorefrontCartDrawer() {
  const { cart, isOpen, closeCart, updateQuantity, removeItem, applyDiscount, removeDiscount, isLoading, error } =
    useStorefrontCart()
  const [discountInput, setDiscountInput] = useState('')
  const [discountError, setDiscountError] = useState<string | null>(null)
  if (!isOpen) return null

  const lines = cart?.lines.edges.map((e) => e.node) || []
  const subtotal = cart?.cost.subtotalAmount.amount ?? 0
  const currency = cart?.cost.subtotalAmount.currencyCode ?? 'USD'

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={closeCart}
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} className="text-neutral-900" />
              <h2 className="text-base font-semibold text-neutral-900">Your Cart</h2>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                {cart?.totalQuantity ?? 0}
              </span>
            </div>
            <button
              type="button"
              onClick={closeCart}
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition"
              aria-label="Close cart"
            >
              <X size={18} />
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="bg-red-50 border-b border-red-100 px-6 py-2.5 text-xs text-red-600">
              {error}
            </div>
          )}

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {lines.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 mb-4">
                  <ShoppingBag size={24} />
                </div>
                <h3 className="text-base font-medium text-neutral-900 mb-1">Your cart is empty</h3>
                <p className="text-sm text-neutral-500 mb-6 max-w-[220px]">
                  Explore our collection of everyday essentials and add items to your cart.
                </p>
                <button
                  type="button"
                  onClick={closeCart}
                  className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition"
                >
                  Continue Shopping
                </button>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {lines.map((line) => {
                  const merchandise = line.merchandise
                  const imgSrc = merchandise.image?.url || '/images/products/classic-cotton-t-shirt.svg'

                  return (
                    <div key={line.id} className="py-4 flex gap-4 items-start">
                      <img
                        src={imgSrc}
                        alt={merchandise.title}
                        className="w-18 h-18 rounded-lg object-cover bg-neutral-50 border border-neutral-150 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/store/products/${merchandise.product?.handle}`}
                          onClick={closeCart}
                          className="text-sm font-medium text-neutral-900 hover:underline truncate block"
                        >
                          {merchandise.product?.title || merchandise.title}
                        </Link>
                        {merchandise.title && merchandise.title !== 'Default Title' && (
                          <p className="text-xs text-neutral-500 mt-0.5">{merchandise.title}</p>
                        )}
                        <p className="text-sm font-semibold text-neutral-900 mt-1">
                          ${line.cost.totalAmount.amount.toFixed(2)}
                        </p>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-3 mt-2.5">
                          <div className="flex items-center border border-neutral-200 rounded-md">
                            <button
                              type="button"
                              onClick={() => updateQuantity(line.id, line.quantity - 1)}
                              disabled={isLoading}
                              className="px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                            >
                              -
                            </button>
                            <span className="px-2 py-1 text-xs font-medium text-neutral-800 min-w-[24px] text-center">
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(line.id, line.quantity + 1)}
                              disabled={isLoading}
                              className="px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(line.id)}
                            disabled={isLoading}
                            className="text-neutral-400 hover:text-red-500 p-1 transition"
                            title="Remove item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer / Subtotal & Checkout */}
          {/* Footer / Discounts & Checkout */}
          {lines.length > 0 && (
            <div className="border-t border-neutral-200 px-6 py-5 bg-neutral-50/60 space-y-3">
              {/* Applied discount pills */}
              {cart?.discountCodes && cart.discountCodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
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
                        title="Remove discount"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Discount Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={discountInput}
                  onChange={(e) => {
                    setDiscountInput(e.target.value)
                    setDiscountError(null)
                  }}
                  placeholder="Discount code (e.g. SPRING20)"
                  className="flex-1 bg-white border border-neutral-200 rounded-lg px-3 py-1.5 text-xs uppercase focus:border-neutral-900 outline-none"
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
                      setDiscountError(error || 'Invalid discount code')
                    }
                  }}
                  disabled={isLoading || !discountInput.trim()}
                  className="bg-neutral-900 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-neutral-800 disabled:opacity-40 transition"
                >
                  Apply
                </button>
              </div>

              {discountError && (
                <p className="text-[11px] text-red-600 bg-red-50 p-2 rounded border border-red-100">
                  {discountError}
                </p>
              )}

              <div className="flex justify-between items-baseline pt-2">
                <span className="text-sm text-neutral-600">Subtotal</span>
                <div className="text-right">
                  {cart?.cost.totalDiscountAmount?.amount ? (
                    <span className="text-xs text-neutral-400 line-through mr-2">
                      ${(subtotal + cart.cost.totalDiscountAmount.amount).toFixed(2)}
                    </span>
                  ) : null}
                  <span className="text-base font-semibold text-neutral-900">
                    ${subtotal.toFixed(2)} {currency}
                  </span>
                </div>
              </div>
              <p className="text-xs text-neutral-400">
                Taxes and shipping calculated at checkout.
              </p>
              <Link
                to="/store/checkout"
                onClick={closeCart}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 transition active:scale-[0.99]"
              >
                Proceed to Checkout
                <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
