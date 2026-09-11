import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui'
import { formatDate, formatMoney } from '@/lib/format'

/** Chrome-free printable order documents (Shopify order printer parity) */
export default function OrderPrintPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const order = useStore((s) => s.orders.find((o) => o.id === id))
  const settings = useStore((s) => s.settings)
  const type = params.get('type') === 'invoice' ? 'invoice' : 'packing-slip'
  const refundedTotal = order?.refunds.reduce((s, r) => s + r.amount, 0) ?? 0

  if (!order) {
    return <div className="p-8 text-[13px]">Order not found. <button className="text-accent underline" onClick={() => navigate('/orders')}>Back to orders</button></div>
  }

  return (
    <div id="print-root" className="mx-auto max-w-2xl bg-white p-8 text-[13px] text-black" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{settings.storeName}</h1>
          <p className="mt-1 text-xs text-gray-600">
            {settings.storeAddress?.address1}, {settings.storeAddress?.city} {settings.storeAddress?.province} {settings.storeAddress?.zip}
            <br />
            {settings.email}
          </p>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-semibold">{type === 'invoice' ? 'Invoice' : 'Packing slip'}</h2>
          <p className="text-xs text-gray-600">{order.name} · {formatDate(order.createdAt)}</p>
        </div>
      </div>

      <div className="mb-6 flex gap-8">
        <div className="flex-1">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Ship to</h3>
          <p>
            {order.shippingAddress.firstName} {order.shippingAddress.lastName}
            <br />
            {order.shippingAddress.address1}
            {order.shippingAddress.address2 && <>, {order.shippingAddress.address2}</>}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.zip}
            <br />
            {order.shippingAddress.country}
          </p>
        </div>
        {type === 'invoice' && (
          <div className="flex-1">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Bill to</h3>
            <p>
              {order.billingAddress.firstName} {order.billingAddress.lastName}
              <br />
              {order.email}
            </p>
          </div>
        )}
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left text-xs uppercase tracking-wide">
            <th className="py-2">Item</th>
            <th className="py-2 text-center">Qty</th>
            {type === 'invoice' && <th className="py-2 text-right">Price</th>}
            {type === 'invoice' && <th className="py-2 text-right">Total</th>}
          </tr>
        </thead>
        <tbody>
          {order.lineItems.map((li) => (
            <tr key={li.id} className="border-b border-gray-300">
              <td className="py-2">
                {li.title}
                {li.variantTitle && <span className="text-gray-600"> — {li.variantTitle}</span>}
                <span className="block text-xs text-gray-500">SKU: {li.sku || '—'}</span>
              </td>
              <td className="py-2 text-center">{li.quantity}</td>
              {type === 'invoice' && <td className="py-2 text-right">{formatMoney(li.price)}</td>}
              {type === 'invoice' && <td className="py-2 text-right">{formatMoney(li.price * li.quantity)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {type === 'invoice' && (
        <div className="mt-4 flex justify-end">
          <dl className="w-56 space-y-1 text-[13px]">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(order.subtotal)}</dd></div>
            {order.discountCode && <div className="flex justify-between"><dt>Discount ({order.discountCode.code})</dt><dd>−{formatMoney(order.discountCode.amount)}</dd></div>}
            <div className="flex justify-between"><dt>Shipping</dt><dd>{order.shippingPrice === 0 ? 'Free' : formatMoney(order.shippingPrice)}</dd></div>
            <div className="flex justify-between"><dt>Tax</dt><dd>{formatMoney(order.taxTotal)}</dd></div>
            <div className="flex justify-between border-t-2 border-black pt-1 text-[15px] font-bold"><dt>Total</dt><dd>{formatMoney(order.total)}</dd></div>
            {refundedTotal > 0 && <div className="flex justify-between text-red-700"><dt>Refunded</dt><dd>−{formatMoney(refundedTotal)}</dd></div>}
          </dl>
        </div>
      )}

      <p className="mt-10 text-center text-xs text-gray-500">Thank you for shopping with {settings.storeName}!</p>

      <div className="mt-6 flex justify-end gap-2 print:hidden">
        <Button onClick={() => navigate(`/orders/${order.id}`)}>Back to order</Button>
        <Button variant="primary" icon={<Printer size={13} />} onClick={() => window.print()}>Print</Button>
      </div>

      <style>{`@media print { body * { visibility: hidden } .print\\:hidden, nav, header { display: none !important } #print-root, #print-root * { visibility: visible } #print-root { position: absolute; inset: 0; padding: 24px; background: white } }`}</style>
    </div>
  )
}
