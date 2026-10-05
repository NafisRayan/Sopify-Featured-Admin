import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, PackageOpen, TriangleAlert,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { coreMetrics, dailySeries, channelBreakdown, topProducts } from '@/lib/analytics'
import { serverCoreMetrics, useAnalyticsSummary } from '@/features/analytics/useAnalyticsSummary'
import { formatMoney, formatNumber, formatPercent, formatRelative } from '@/lib/format'
import { lowStockVariants } from '@/store/selectors'
import { Card, CardHeader, Badge, Toggle, EmptyState } from '@/components/ui'
import { PageHeader } from '@/components/ui/Feedback'
import { DateRangePicker, useDashboardRange } from './DateRangePicker'
import { toggleTask } from '@/services/settingsService'
import { PAYMENT_STATUS_LABELS, FULFILLMENT_STATUS_LABELS } from '@/lib/constants'
import type { PaymentStatus, FulfillmentStatus } from '@/types'

function Delta({ value, invert = false, suffix = '%' }: { value: number; invert?: boolean; suffix?: string }) {
  const positive = invert ? value < 0 : value > 0
  const flat = Math.abs(value) < 0.05
  const Icon = flat ? ArrowRight : positive ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        flat ? 'text-text-muted' : positive ? 'text-success' : 'text-critical-strong'
      }`}
    >
      <Icon size={12} />
      {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  )
}

function MetricCard({
  label,
  value,
  delta,
  deltaInvert,
  deltaSuffix,
}: {
  label: string
  value: string
  delta: number
  deltaInvert?: boolean
  deltaSuffix?: string
}) {
  return (
    <Card className="min-w-[150px] flex-1">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-text-muted">
        <Delta value={delta} invert={deltaInvert} suffix={deltaSuffix} />
        <span className="text-[11px]">vs previous period</span>
      </p>
    </Card>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number; name: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-text">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center justify-between gap-4 text-text-muted">
          <span>Sales</span>
          <span className="font-medium text-text">{formatMoney(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const orders = useStore((s) => s.orders)
  const products = useStore((s) => s.products)
  const customers = useStore((s) => s.customers)
  const tasks = useStore((s) => s.tasks)
  const range = useDashboardRange()

  const localMetrics = useMemo(() => coreMetrics(orders, range), [orders, range])
  // remote: server analytics win; offline: local rollups (labeled below)
  const summaryPair = useAnalyticsSummary(range)
  const metrics = summaryPair ? serverCoreMetrics(summaryPair, localMetrics.unitsSold) : localMetrics
  const series = useMemo(() => dailySeries(orders, range), [orders, range])
  const channels = useMemo(() => channelBreakdown(orders, range), [orders, range])
  const top = useMemo(() => topProducts(orders, products, range, 6), [orders, products, range])
  const recentOrders = useMemo(
    () =>
      [...orders]
        .filter((o) => !o.isDraft)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
    [orders],
  )
  const lowStock = useMemo(() => lowStockVariants(8).slice(0, 6), [orders, products])
  const chartData = series.map((p) => ({
    ...p,
    label: new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))
  const channelTotal = channels.reduce((s, c) => s + c.sales, 0)

  // simulated baseline — no session tracking in this admin; label reflects that
  const conversion = 2.4

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back — here's how ${range.label.toLowerCase()} compares with the previous period.`}
        primaryAction={<DateRangePicker range={range} />}
      />

      {/* KPI row */}
      <div className="mb-4 flex flex-wrap gap-3">
        <MetricCard label="Total sales" value={formatMoney(metrics.totalSales)} delta={metrics.salesDelta} />
        <MetricCard label="Net sales" value={formatMoney(metrics.netSales)} delta={metrics.netSalesDelta} />
        <MetricCard label="Orders" value={formatNumber(metrics.ordersCount)} delta={metrics.ordersDelta} />
        <MetricCard label="Average order value" value={formatMoney(metrics.aov)} delta={metrics.aovDelta} />
        <MetricCard
          label="Returning customer rate"
          value={formatPercent(metrics.returningRate)}
          delta={metrics.returningDelta}
          deltaSuffix="pp"
        />
      </div>
      {!summaryPair && (
        <p className="-mt-1 mb-4 text-xs text-text-muted">
          Offline — sales figures are local rollups over synced orders.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sales over time */}
        <div className="lg:col-span-2">
          <Card padding={false}>
            <CardHeader title="Sales over time" subtitle={`${range.label} · ${metrics.unitsSold} units sold`} />
            <div className="h-64 px-3 py-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#005bd3" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#005bd3" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eee" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#8a8a8a' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e3e3e3' }}
                    interval="preserveStartEnd"
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#8a8a8a' }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v: number) => formatMoney(v, { compact: true })}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="sales" stroke="#005bd3" strokeWidth={2} fill="url(#salesFill)" name="Sales" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Sales by channel */}
        <Card padding={false}>
          <CardHeader title="Sales by channel" />
          <div className="space-y-4 px-4 py-4 md:px-5">
            {channels.length === 0 && <p className="text-[13px] text-text-muted">No sales in this period.</p>}
            {channels.map((c) => (
              <div key={c.channel}>
                <div className="mb-1 flex items-baseline justify-between text-[13px]">
                  <span className="font-medium">{c.channel}</span>
                  <span className="text-text-muted">{formatMoney(c.sales)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#f1f1f1]">
                  <div
                    className="h-full rounded-full bg-[#303030]"
                    style={{ width: `${channelTotal ? (c.sales / channelTotal) * 100 : 0}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {c.orders} order{c.orders === 1 ? '' : 's'} ·{' '}
                  {channelTotal ? formatPercent((c.sales / channelTotal) * 100, 0) : '0%'} of sales
                </p>
              </div>
            ))}
            <div className="border-t border-border pt-3 text-xs text-text-muted">
              <div className="flex justify-between">
                <span>Conversion rate</span>
                <span className="font-medium text-text">{formatPercent(conversion, 1)}</span>
              </div>
              <p className="mt-1">Sessions are simulated; conversion is indicative only.</p>
            </div>
          </div>
        </Card>

        {/* Top products */}
        <Card padding={false}>
          <CardHeader
            title="Top products"
            subtitle="By sales in period"
            actions={
              <Link to="/products" className="text-xs text-accent hover:underline">
                View all
              </Link>
            }
          />
          <ul className="divide-y divide-border">
            {top.length === 0 && (
              <li className="px-4 py-8 text-center text-[13px] text-text-muted">No product sales in this period.</li>
            )}
            {top.map((p, i) => (
              <li key={p.productId}>
                <Link to={`/products/${p.productId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover">
                  <span className="w-4 text-xs text-text-subdued">{i + 1}</span>
                  {p.imageSrc ? (
                    <img src={p.imageSrc} alt="" className="h-8 w-8 rounded-md border border-border object-cover" />
                  ) : (
                    <span className="h-8 w-8 rounded-md bg-[#f1f1f1]" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{p.title}</span>
                  <span className="text-right text-xs text-text-muted">
                    <span className="block font-medium text-text">{formatMoney(p.sales)}</span>
                    {p.units} units
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        {/* Recent orders */}
        <Card padding={false}>
          <CardHeader
            title="Recent orders"
            actions={
              <Link to="/orders" className="text-xs text-accent hover:underline">
                View all
              </Link>
            }
          />
          <ul className="divide-y divide-border">
            {recentOrders.map((o) => {
              const customer = customers.find((c) => c.id === o.customerId)
              return (
                <li key={o.id}>
                  <Link to={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover">
                    <span className="w-14 shrink-0 text-[13px] font-medium">{o.name}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text-muted">
                      {customer ? `${customer.firstName} ${customer.lastName}` : o.email}
                      <span className="ml-1.5 text-xs text-text-subdued">{formatRelative(o.createdAt)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge
                        tone={
                          o.paymentStatus === 'paid'
                            ? 'success'
                            : o.paymentStatus === 'refunded' || o.paymentStatus === 'voided'
                              ? 'critical'
                              : 'warning'
                        }
                      >
                        {PAYMENT_STATUS_LABELS[o.paymentStatus as PaymentStatus]}
                      </Badge>
                      <span className="hidden w-16 text-right text-xs text-text-muted sm:block">
                        {FULFILLMENT_STATUS_LABELS[o.fulfillmentStatus as FulfillmentStatus]}
                      </span>
                      <span className="w-16 text-right text-[13px] font-medium">{formatMoney(o.total)}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>

        {/* Inventory alerts */}
        <Card padding={false}>
          <CardHeader
            title="Inventory alerts"
            subtitle="8 units or fewer available"
            actions={
              <Link to="/inventory" className="text-xs text-accent hover:underline">
                Inventory
              </Link>
            }
          />
          {lowStock.length === 0 ? (
            <EmptyState icon={PackageOpen} compact heading="Stock levels look healthy" message="No variants are at or below 8 units." />
          ) : (
            <ul className="divide-y divide-border">
              {lowStock.map((v) => (
                <li key={v.variantId}>
                  <Link to={`/inventory?q=${encodeURIComponent(v.sku)}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover">
                    <TriangleAlert size={15} className={v.available === 0 ? 'text-critical-strong' : 'text-[#c47f00]'} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{v.title}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {v.variantTitle ? `${v.variantTitle} · ` : ''}
                        {v.sku}
                      </span>
                    </span>
                    <Badge tone={v.available === 0 ? 'critical' : 'warning'}>
                      {v.available === 0 ? 'Out of stock' : `${v.available} left`}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Tasks */}
        <Card padding={false}>
          <CardHeader title="Setup guide" subtitle={`${tasks.filter((t) => !t.done).length} remaining`} />
          <ul className="divide-y divide-border">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                <Toggle checked={t.done} onChange={() => void toggleTask(t.id)} />
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] font-medium ${t.done ? 'text-text-muted line-through' : 'text-text'}`}>{t.title}</p>
                  <p className="text-xs text-text-muted">{t.description}</p>
                  {t.link && (
                    <Link to={t.link} className="mt-0.5 inline-block text-xs text-accent hover:underline">
                      Open
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
