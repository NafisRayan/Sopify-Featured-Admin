import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Package,
  Truck,
  CreditCard,
  MapPin,
  ExternalLink,
  RotateCcw,
  Clock,
  Check,
} from 'lucide-react'
import { storefrontRequest } from '@/services/storefrontClient'
import { requestReturnOrder, type CustomerOrderSummary } from '@/services/storefrontCustomerService'

export function CustomerOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<CustomerOrderSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [returnModalOpen, setReturnModalOpen] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({})
  const [returnReason, setReturnReason] = useState('DEFECTIVE')
  const [returnNote, setReturnNote] = useState('')
  const [submittingReturn, setSubmittingReturn] = useState(false)
  const [returnSuccess, setReturnSuccess] = useState(false)
  useEffect(() => {
    if (!id) return
    const query = `
      query GetOrder($id: ID!) {
        order(id: $id) {
          id
          name
          orderNumber
          processedAt
          financialStatus
          fulfillmentStatus
          totalPrice {
            amount
            currencyCode
          }
          subtotalPrice {
            amount
            currencyCode
          }
          totalTax {
            amount
            currencyCode
          }
          totalShippingPrice {
            amount
            currencyCode
          }
          shippingAddress {
            address1
            address2
            city
            province
            zip
            country
            firstName
            lastName
          }
          lineItems(first: 50) {
            id
            title
            variantTitle
            quantity
            originalTotalPrice {
              amount
              currencyCode
            }
          }
          fulfillments {
            status
            trackingCompany
            trackingInfo {
              number
              url
              company
            }
          }
          returns {
            id
            status
            reason
            createdAt
            refundAmount {
              amount
              currencyCode
            }
            returnLineItems {
              id
              quantity
            }
          }
        }
      }
    `
    storefrontRequest<{ order: CustomerOrderSummary }>(query, {
      id: id.startsWith('gid://') ? id : `gid://shopify/Order/${id}`,
    })
      .then((res) => {
        if (res.data?.order) {
          setOrder(res.data.order)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center animate-pulse">
        <p className="text-neutral-500">Loading order tracking details...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <h2 className="text-xl font-bold text-neutral-900 mb-2">Order Not Found</h2>
        <p className="text-xs text-neutral-500 mb-6">We couldn't retrieve the specified order.</p>
        <Link
          to="/store/account"
          className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-xs font-semibold text-white"
        >
          <ArrowLeft size={14} /> Back to Dashboard
        </Link>
      </div>
    )
  }

  const isPaid = order.financialStatus === 'PAID'
  const isFulfilled = order.fulfillmentStatus === 'FULFILLED'
  const fulfillment = order.fulfillments?.[0]
  const trackingNumber = fulfillment?.trackingInfo?.[0]?.number || 'NS-TRACK-1024'
  const carrier = fulfillment?.trackingCompany || 'USPS Express'
  const dateStr = new Date(order.processedAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-16 space-y-8">
      {/* Return to account link */}
      <Link
        to="/store/account"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition"
      >
        <ArrowLeft size={14} /> Back to Orders
      </Link>

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">
              Order {order.name}
            </h1>
            <span
              className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                isPaid
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {order.financialStatus}
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">Placed on {dateStr}</p>
        </div>

        <div className="flex items-center gap-3">
          {['FULFILLED', 'PARTIAL'].includes(order.fulfillmentStatus) && !order.returns?.length && (
            <button
              type="button"
              onClick={() => {
                const initial: Record<string, number> = {}
                order.lineItems?.forEach((li) => {
                  initial[li.id] = li.quantity
                })
                setSelectedItems(initial)
                setReturnModalOpen(true)
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 transition shadow-2xs"
            >
              <RotateCcw size={13} /> Request Return
            </button>
          )}
          <span className="text-xl font-bold text-neutral-900">
            ${order.totalPrice.amount.toFixed(2)} {order.totalPrice.currencyCode}
          </span>
        </div>
      </div>

      {/* Active Return Status Stepper Banner */}
      {order.returns && order.returns.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200/90 shadow-sm p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <RotateCcw size={18} className="text-amber-600" />
              <h2 className="text-base font-bold text-neutral-900">Return & Reverse Logistics</h2>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full">
              Status: {order.returns[0].status}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Check size={16} />
              </div>
              <div>
                <span className="text-xs font-bold text-neutral-900 block">1. Return Requested</span>
                <span className="text-[11px] text-neutral-500">Reason: {order.returns[0].reason}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  ['OPEN', 'APPROVED', 'CLOSED'].includes(order.returns[0].status)
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-neutral-100 text-neutral-400'
                }`}
              >
                <Clock size={16} />
              </div>
              <div>
                <span className="text-xs font-bold text-neutral-900 block">2. Merchant Review</span>
                <span className="text-[11px] text-neutral-500">
                  {['OPEN', 'APPROVED', 'CLOSED'].includes(order.returns[0].status)
                    ? 'Return approved'
                    : 'Awaiting moderation'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  order.returns[0].status === 'CLOSED'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-neutral-100 text-neutral-400'
                }`}
              >
                <Package size={16} />
              </div>
              <div>
                <span className="text-xs font-bold text-neutral-900 block">3. Received & Restocked</span>
                <span className="text-[11px] text-neutral-500">
                  {order.returns[0].refundAmount?.amount
                    ? `Refund: $${order.returns[0].refundAmount.amount.toFixed(2)}`
                    : 'Pending warehouse delivery'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Fulfillment Timeline Visualizer */}
      <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-sm p-6 sm:p-8">
        <h2 className="text-base font-bold text-neutral-900 mb-6 flex items-center gap-2">
          <Truck size={18} className="text-neutral-700" /> Fulfillment Status
        </h2>

        <div className="relative flex flex-col md:flex-row justify-between gap-6 md:gap-0">
          {/* Step 1 */}
          <div className="flex md:flex-col items-center gap-3 md:gap-2 text-left md:text-center z-10">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <span className="text-xs font-bold text-neutral-900 block">Order Confirmed</span>
              <span className="text-[11px] text-neutral-400">Inventory Reserved</span>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex md:flex-col items-center gap-3 md:gap-2 text-left md:text-center z-10">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${
                isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-neutral-100 text-neutral-400'
              }`}
            >
              <CreditCard size={18} />
            </div>
            <div>
              <span className="text-xs font-bold text-neutral-900 block">Payment Authorized</span>
              <span className="text-[11px] text-neutral-400">Verified via Stripe Rails</span>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex md:flex-col items-center gap-3 md:gap-2 text-left md:text-center z-10">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${
                isFulfilled ? 'bg-emerald-100 text-emerald-600' : 'bg-neutral-100 text-neutral-400'
              }`}
            >
              <Package size={18} />
            </div>
            <div>
              <span className="text-xs font-bold text-neutral-900 block">
                {isFulfilled ? 'Shipped & En Route' : 'Preparing for Dispatch'}
              </span>
              <span className="text-[11px] text-neutral-400">
                {isFulfilled ? `${carrier} · ${trackingNumber}` : 'Merchant Warehouse'}
              </span>
            </div>
          </div>
        </div>
        {/* Multi-package Shipments List */}
        {order.fulfillments?.length > 0 && (
          <div className="mt-8 pt-6 border-t border-neutral-100 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Shipment Packages ({order.fulfillments.length})
            </h4>
            <div className="space-y-3">
              {order.fulfillments.map((f, pkgIdx) => {
                const tInfo = f.trackingInfo?.[0]
                const trackNum = tInfo?.number || f.trackingCompany || 'Pending'
                const trackUrl = tInfo?.url || `https://track.northstargoods.com/${trackNum}`
                const company = tInfo?.company || f.trackingCompany || 'Express Carrier'

                return (
                  <div
                    key={pkgIdx}
                    className="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 border border-neutral-200/80 p-4 rounded-xl"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-neutral-900">
                          Package #{pkgIdx + 1}
                        </span>
                        <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {f.status || 'Fulfilled'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {company}: <span className="font-mono text-neutral-800">{trackNum}</span>
                      </p>
                    </div>
                    {tInfo?.number && (
                      <a
                        href={trackUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-neutral-900 px-3.5 py-2 rounded-lg hover:bg-neutral-800 transition"
                      >
                        Track Package <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Items & Receipt Summary */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8 bg-white rounded-2xl border border-neutral-200/90 shadow-sm p-6 sm:p-8 space-y-4">
          <h3 className="text-base font-bold text-neutral-900 mb-2">Itemized Order Receipt</h3>
          <div className="divide-y divide-neutral-100">
            {order.lineItems?.map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <h4 className="font-semibold text-neutral-900">{item.title}</h4>
                  {item.variantTitle && (
                    <p className="text-xs text-neutral-500">{item.variantTitle}</p>
                  )}
                  <span className="text-xs text-neutral-400">Qty: {item.quantity}</span>
                </div>
                <span className="font-semibold text-neutral-900">
                  ${item.originalTotalPrice.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-200/80 pt-4 space-y-2 text-xs">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal</span>
              <span className="font-semibold text-neutral-900">
                ${order.subtotalPrice.amount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Shipping</span>
              <span className="text-emerald-600 font-semibold">Free Express</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Taxes</span>
              <span className="font-semibold text-neutral-900">
                ${order.totalTax.amount.toFixed(2)}
              </span>
            </div>
            <div className="border-t border-neutral-200/80 pt-3 flex justify-between items-baseline text-sm font-bold text-neutral-900">
              <span>Total Paid</span>
              <span>
                ${order.totalPrice.amount.toFixed(2)} {order.totalPrice.currencyCode}
              </span>
            </div>
          </div>
        </div>

        {/* Shipping Address Summary */}
        <div className="md:col-span-4 bg-white rounded-2xl border border-neutral-200/90 shadow-sm p-6 space-y-4">
          <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
            <MapPin size={16} /> Delivery Address
          </h3>
          {order.shippingAddress ? (
            <div className="text-xs text-neutral-600 space-y-1 leading-relaxed">
              <p className="font-bold text-neutral-900">
                {order.shippingAddress.firstName} {order.shippingAddress.lastName}
              </p>
              <p>{order.shippingAddress.address1}</p>
              {order.shippingAddress.address2 && <p>{order.shippingAddress.address2}</p>}
              <p>
                {order.shippingAddress.city}, {order.shippingAddress.province}{' '}
                {order.shippingAddress.zip}
              </p>
              <p>{order.shippingAddress.country}</p>
            </div>
          ) : (
            <p className="text-xs text-neutral-400">Digital / Service Delivery</p>
          )}
        </div>
      </div>
      {/* Return Request Modal */}
      {returnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <RotateCcw size={16} /> Request Return for Order {order.name}
              </h3>
              <button
                type="button"
                onClick={() => setReturnModalOpen(false)}
                className="text-xs text-neutral-400 hover:text-neutral-700"
              >
                Cancel
              </button>
            </div>

            {returnSuccess ? (
              <div className="py-6 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={24} />
                </div>
                <h4 className="text-sm font-bold text-neutral-900">Return Request Submitted</h4>
                <p className="text-xs text-neutral-500">
                  The store merchant has been notified and will review your return shortly.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setReturnModalOpen(false)
                    window.location.reload()
                  }}
                  className="mt-4 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-semibold"
                >
                  Done
                </button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  const itemsToReturn = Object.entries(selectedItems)
                    .filter(([, qty]) => qty > 0)
                    .map(([lineItemId, quantity]) => ({
                      lineItemId,
                      quantity,
                      reason: returnReason,
                      note: returnNote,
                    }))
                  if (itemsToReturn.length === 0) return

                  setSubmittingReturn(true)
                  try {
                    const { return: res, userErrors } = await requestReturnOrder(order.id, itemsToReturn)
                    if (res) {
                      setReturnSuccess(true)
                    } else if (userErrors.length) {
                      alert(userErrors[0].message)
                    }
                  } finally {
                    setSubmittingReturn(false)
                  }
                }}
                className="space-y-4 text-xs"
              >
                <div>
                  <label className="block font-semibold text-neutral-700 mb-2">Select Items to Return</label>
                  <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl p-2 max-h-48 overflow-y-auto">
                    {order.lineItems?.map((li) => (
                      <div key={li.id} className="py-2.5 px-2 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1 truncate">
                          <span className="font-semibold text-neutral-900 block truncate">{li.title}</span>
                          <span className="text-[11px] text-neutral-400">Purchased: {li.quantity}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-neutral-500">Return:</span>
                          <input
                            type="number"
                            min="0"
                            max={li.quantity}
                            value={selectedItems[li.id] ?? 0}
                            onChange={(e) =>
                              setSelectedItems({
                                ...selectedItems,
                                [li.id]: Math.min(li.quantity, Math.max(0, Number(e.target.value))),
                              })
                            }
                            className="w-14 rounded border border-neutral-300 px-2 py-1 text-center font-bold"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Reason for Return</label>
                  <select
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full bg-white rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                  >
                    <option value="DEFECTIVE">Item defective or damaged</option>
                    <option value="WRONG_SIZE">Size too small / too large</option>
                    <option value="NOT_AS_DESCRIBED">Item did not match description</option>
                    <option value="CHANGED_MIND">Customer changed mind</option>
                    <option value="STYLE">Did not like color/style</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Customer Note (Optional)</label>
                  <textarea
                    rows={2}
                    value={returnNote}
                    onChange={(e) => setReturnNote(e.target.value)}
                    placeholder="Provide additional details regarding the item condition..."
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                  />
                </div>

                <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnModalOpen(false)}
                    className="px-4 py-2 font-semibold text-neutral-600 hover:text-neutral-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReturn || Object.values(selectedItems).every((q) => q === 0)}
                    className="px-5 py-2 font-bold text-white bg-neutral-900 rounded-xl hover:bg-neutral-800 disabled:opacity-40 transition"
                  >
                    {submittingReturn ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
