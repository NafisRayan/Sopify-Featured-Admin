import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Package, MapPin, LogOut, ArrowRight, Clock, ShieldCheck, ShoppingBag } from 'lucide-react'
import { useStorefrontCustomer } from '@/store/useStorefrontCustomer'

export function CustomerAccountDashboardPage() {
  const navigate = useNavigate()
  const { customer, isAuthenticated, isLoading, logout, refreshProfile } = useStorefrontCustomer()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/store/account/login')
    } else {
      refreshProfile()
    }
  }, [isAuthenticated, navigate, refreshProfile])

  if (isLoading && !customer) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center animate-pulse">
        <p className="text-neutral-500">Loading your account...</p>
      </div>
    )
  }

  const orders = customer?.orders.edges.map((e) => e.node) || []
  const defaultAddress = customer?.defaultAddress

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
      {/* Top Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-neutral-200">
        <div>
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Customer Portal
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight mt-1">
            Welcome back, {customer?.firstName || customer?.displayName || 'Friend'}
          </h1>
          <p className="text-xs text-neutral-500 mt-1">{customer?.email}</p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/store/account/addresses"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 transition shadow-2xs"
          >
            <MapPin size={14} /> Address Book
          </Link>
          <button
            type="button"
            onClick={async () => {
              await logout()
              navigate('/store')
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-neutral-200 text-neutral-500 hover:text-red-600 hover:bg-red-50 transition"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mt-10">
        {/* Orders Column */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
              <Package size={18} /> Order History
            </h2>
            <span className="text-xs font-medium text-neutral-400">
              {orders.length} {orders.length === 1 ? 'order' : 'orders'} placed
            </span>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200/90 bg-neutral-50/60 p-8 text-center">
              <ShoppingBag size={28} className="text-neutral-400 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-neutral-900 mb-1">No orders placed yet</h3>
              <p className="text-xs text-neutral-500 mb-4 max-w-xs mx-auto">
                Once you complete checkout, your order receipt and tracking updates will appear here.
              </p>
              <Link
                to="/store"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-neutral-900 px-4 py-2 rounded-lg hover:bg-neutral-800 transition"
              >
                Browse Catalog <ArrowRight size={13} />
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200/90 bg-white overflow-hidden shadow-2xs divide-y divide-neutral-100">
              {orders.map((order) => {
                const date = new Date(order.processedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
                const isPaid = order.financialStatus === 'PAID'
                const isFulfilled = order.fulfillmentStatus === 'FULFILLED'

                return (
                  <div key={order.id} className="p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-neutral-50/50 transition">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <Link
                          to={`/store/account/orders/${order.id.replace('gid://shopify/Order/', '')}`}
                          className="text-sm font-bold text-neutral-900 hover:underline"
                        >
                          {order.name}
                        </Link>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {order.financialStatus}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isFulfilled
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {order.fulfillmentStatus}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <Clock size={12} />
                        <span>Placed on {date}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-neutral-900">
                        ${order.totalPrice.amount.toFixed(2)} {order.totalPrice.currencyCode}
                      </span>
                      <Link
                        to={`/store/account/orders/${order.id.replace('gid://shopify/Order/', '')}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 px-3 py-1.5 rounded-lg hover:bg-neutral-200/80 transition"
                      >
                        Track <ArrowRight size={12} />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Saved Default Address Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
              <MapPin size={18} /> Primary Address
            </h2>
            <Link
              to="/store/account/addresses"
              className="text-xs font-semibold text-neutral-600 hover:text-neutral-900"
            >
              Manage ({customer?.addresses.edges.length || 0})
            </Link>
          </div>

          <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-2xs space-y-4">
            {defaultAddress ? (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 mb-3 inline-block">
                  Default Shipping
                </span>
                <p className="text-sm font-bold text-neutral-900">
                  {defaultAddress.firstName} {defaultAddress.lastName}
                </p>
                <div className="text-xs text-neutral-600 mt-1 space-y-0.5 leading-relaxed">
                  <p>{defaultAddress.address1}</p>
                  {defaultAddress.address2 && <p>{defaultAddress.address2}</p>}
                  <p>
                    {defaultAddress.city}, {defaultAddress.province} {defaultAddress.zip}
                  </p>
                  <p>{defaultAddress.country}</p>
                  {defaultAddress.phone && <p className="text-neutral-400 mt-1">{defaultAddress.phone}</p>}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-neutral-500 mb-3">No default address on file.</p>
                <Link
                  to="/store/account/addresses"
                  className="text-xs font-semibold text-neutral-900 hover:underline"
                >
                  + Add shipping address
                </Link>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-800">
              <ShieldCheck size={16} className="text-emerald-600" />
              <span>Direct Merchant Fulfillment</span>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              All orders are synchronized directly with the Northstar merchant backoffice for immediate fulfillment and dispatch.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
