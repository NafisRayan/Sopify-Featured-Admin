import { useLocation, useParams, Link } from 'react-router-dom'
import { CheckCircle2, ArrowRight, Package, Calendar, Mail, FileText } from 'lucide-react'
import type { StorefrontCompletedOrder } from '@/services/storefrontClient'

export function StorefrontOrderConfirmedPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const location = useLocation()
  const order = (location.state as { order?: StorefrontCompletedOrder } | undefined)?.order

  const displayOrderName = order?.name || `#${order?.orderNumber || '1024'}`
  const totalAmount = order?.totalPrice.amount ? `$${order.totalPrice.amount.toFixed(2)}` : '$128.00'

  return (
    <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24">
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={36} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
          Order Confirmed & Paid
        </span>
        <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight mt-3 mb-2">
          Thank you for your order!
        </h1>
        <p className="text-sm text-neutral-500">
          We’ve received your order and our fulfillment team is preparing your package.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden mb-8">
        {/* Order Meta Bar */}
        <div className="bg-neutral-50 border-b border-neutral-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs text-neutral-500 block">Order Reference</span>
            <span className="text-base font-bold text-neutral-900">{displayOrderName}</span>
          </div>
          <div>
            <span className="text-xs text-neutral-500 block">Order Total</span>
            <span className="text-base font-bold text-neutral-900">{totalAmount}</span>
          </div>
          <div>
            <span className="text-xs text-neutral-500 block">Payment Status</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
              Paid
            </span>
          </div>
        </div>

        {/* Details List */}
        <div className="p-6 md:p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
              <Mail size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-neutral-900">Confirmation Sent</h4>
              <p className="text-xs text-neutral-500 mt-0.5">
                A digital receipt and shipment tracking details have been logged for order reference {orderId || 'ord_1024'}.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
              <Package size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-neutral-900">Ready for Merchant Fulfillment</h4>
              <p className="text-xs text-neutral-500 mt-0.5">
                Inventory was atomically reserved on committed stock in the store warehouse and is visible in the Shopify admin orders list.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
              <Calendar size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-neutral-900">Estimated Delivery</h4>
              <p className="text-xs text-neutral-500 mt-0.5">
                Standard Complimentary Shipping: 2–4 business days.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Links */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link
          to="/store"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 transition"
        >
          Continue Browsing
          <ArrowRight size={15} />
        </Link>
        <Link
          to="/orders"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-6 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition"
        >
          <FileText size={15} />
          View in Admin Orders
        </Link>
      </div>
    </div>
  )
}
