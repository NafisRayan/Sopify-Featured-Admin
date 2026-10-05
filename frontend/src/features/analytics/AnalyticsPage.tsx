import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useStore } from '@/store/useStore'
import {
  coreMetrics, dailySeries, seriesWithComparison, topProducts, channelBreakdown,
  previousRange,
} from '@/lib/analytics'
import { serverCoreMetrics, useAnalyticsSummary } from './useAnalyticsSummary'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { Card, CardHeader, Badge, EmptyState, Toggle } from '@/components/ui'
import { PageHeader } from '@/components/ui/Feedback'
import { DateRangePicker, useDashboardRange } from '@/features/dashboard/DateRangePicker'

function ChartTooltip({
  active, payload, label, moneyKeys = ['sales', 'previous', 'revenue'],
}: {
  active?: boolean
  payload?: { name: string; value: number; dataKey: string | number }[]
  label?: string
  moneyKeys?: string[]
}) {
  if (!active || !payload?.length) return null
  const labels: Record<string, string> = {
    sales: 'Sales', previous: 'Previous period', orders: 'Orders', prevOrders: 'Previous orders',
    aov: 'AOV', count: 'Customers', revenue: 'Revenue',
  }
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-text">{label}</p>
      {payload.map((p) => {
        const isMoney = moneyKeys.includes(String(p.dataKey))
        return (
          <p key={p.dataKey} className="flex items-center justify-between gap-4 text-text-muted">
            <span>{labels[String(p.dataKey)] ?? p.name}</span>
            <span className="font-medium text-text">{isMoney ? formatMoney(p.value) : formatNumber(p.value)}</span>
          </p>
        )
      })}
    </div>
  )
}

type SectionKey = 'overview' | 'sales' | 'customers' | 'products'

export default function AnalyticsPage() {
  const orders = useStore((s) => s.orders)
  const products = useStore((s) => s.products)
  const customers = useStore((s) => s.customers)
  const range = useDashboardRange()
  const [params, setParams] = useSearchParams()
  const section = (params.get('section') ?? 'overview') as SectionKey
  const compare = (params.get('compare') ?? '') === 'on'

  const localMetrics = coreMetrics(orders, range)
  // remote: server analytics win; offline/failed fetch: local rollups (labeled below)
  const summaryPair = useAnalyticsSummary(range)
  const metrics = summaryPair ? serverCoreMetrics(summaryPair, localMetrics.unitsSold) : localMetrics
  const series = useMemo(
    () =>
      compare
        ? seriesWithComparison(orders, range)
        : dailySeries(orders, range).map((p) => ({
            ...p,
            label: new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          })),
    [orders, range, compare],
  )
  const prevRange = previousRange(range)
  const channels = channelBreakdown(orders, range)
  const prevChannels = channelBreakdown(orders, prevRange)
  const top = topProducts(orders, products, range, 10)
  const topPrev = topProducts(orders, products, prevRange, 10)

  // customers: first order in range = new, else returning
  const customerRows = useMemo(() => {
    const before = orders.filter((o) => o.status !== 'draft' && o.status !== 'cancelled' && new Date(o.createdAt) < range.start)
    const seen = new Set(before.map((o) => o.customerId))
    const inRangeOrders = orders
      .filter((o) => o.status !== 'draft' && o.status !== 'cancelled' && new Date(o.createdAt) >= range.start && new Date(o.createdAt) <= range.end)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    let newCount = 0
    let returning = 0
    const byDay = new Map<string, { count: number; newCount: number }>()
    for (const o of inRangeOrders) {
      const day = new Date(o.createdAt).toISOString().slice(0, 10)
      const e = byDay.get(day) ?? { count: 0, newCount: 0 }
      if (seen.has(o.customerId)) returning++
      else {
        newCount++
        seen.add(o.customerId)
      }
      e.count++
      e.newCount++
      byDay.set(day, e)
    }
    const points: { label: string; count: number }[] = []
    for (let d = new Date(range.start); d <= range.end; d = new Date(d.getTime() + 86400_000)) {
      const day = d.toISOString().slice(0, 10)
      points.push({
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: byDay.get(day)?.count ?? 0,
      })
    }
    return { points, newCount, returning }
  }, [orders, range])

  // AOV series
  const aovSeries = useMemo(() => {
    const byDay = new Map<string, { sales: number; orders: number }>()
    for (const o of orders) {
      if (o.status === 'draft' || o.status === 'cancelled') continue
      const t = new Date(o.createdAt).getTime()
      if (t < range.start.getTime() || t > range.end.getTime()) continue
      const day = new Date(o.createdAt).toISOString().slice(0, 10)
      const e = byDay.get(day) ?? { sales: 0, orders: 0 }
      e.sales += o.total
      e.orders += 1
      byDay.set(day, e)
    }
    const points: { label: string; aov: number }[] = []
    for (let d = new Date(range.start); d <= range.end; d = new Date(d.getTime() + 86400_000)) {
      const day = d.toISOString().slice(0, 10)
      const e = byDay.get(day)
      points.push({
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        aov: e && e.orders ? Math.round((e.sales / e.orders) * 100) / 100 : 0,
      })
    }
    return points
  }, [orders, range])

  const sections: { key: SectionKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'sales', label: 'Sales' },
    { key: 'customers', label: 'Customers' },
    { key: 'products', label: 'Products' },
  ]

  const setSection = (s: SectionKey) => {
    const next = new URLSearchParams(params)
    next.set('section', s)
    setParams(next, { replace: true })
  }
  const setCompare = (on: boolean) => {
    const next = new URLSearchParams(params)
    if (on) next.set('compare', 'on')
    else next.delete('compare')
    setParams(next, { replace: true })
  }

  const rangeOrders = orders.filter(
    (o) => o.status !== 'draft' && o.status !== 'cancelled' && new Date(o.createdAt) >= range.start && new Date(o.createdAt) <= range.end,
  )
  const totalChannelSales = channels.reduce((s, c) => s + c.sales, 0)

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle={`${range.label} · ${formatNumber(metrics.ordersCount)} orders · ${formatMoney(metrics.totalSales)} total sales`}
        primaryAction={<DateRangePicker range={range} />}
        secondaryActions={<Toggle label="Compare to previous period" checked={compare} onChange={setCompare} />}
      />

      <div className="mb-4 flex flex-wrap gap-1">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            aria-pressed={section === s.key}
            className={`h-8 rounded-lg px-3 text-[13px] font-medium ${section === s.key ? 'bg-[#e3e3e3] text-text' : 'text-text-muted hover:bg-surface-hover'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="mb-4 flex flex-wrap gap-3">
        <Card className="min-w-[140px] flex-1">
          <p className="text-xs text-text-muted">Total sales</p>
          <p className="mt-1 text-lg font-semibold">{formatMoney(metrics.totalSales)}</p>
          <Badge tone={metrics.salesDelta >= 0 ? 'success' : 'critical'}>{metrics.salesDelta >= 0 ? '+' : ''}{metrics.salesDelta.toFixed(1)}%</Badge>
        </Card>
        <Card className="min-w-[140px] flex-1">
          <p className="text-xs text-text-muted">Net sales</p>
          <p className="mt-1 text-lg font-semibold">{formatMoney(metrics.netSales)}</p>
          <Badge tone={metrics.netSalesDelta >= 0 ? 'success' : 'critical'}>{metrics.netSalesDelta >= 0 ? '+' : ''}{metrics.netSalesDelta.toFixed(1)}%</Badge>
        </Card>
        <Card className="min-w-[140px] flex-1">
          <p className="text-xs text-text-muted">Orders</p>
          <p className="mt-1 text-lg font-semibold">{formatNumber(metrics.ordersCount)}</p>
          <Badge tone={metrics.ordersDelta >= 0 ? 'success' : 'critical'}>{metrics.ordersDelta >= 0 ? '+' : ''}{metrics.ordersDelta.toFixed(1)}%</Badge>
        </Card>
        <Card className="min-w-[140px] flex-1">
          <p className="text-xs text-text-muted">Average order value</p>
          <p className="mt-1 text-lg font-semibold">{formatMoney(metrics.aov)}</p>
          <Badge tone={metrics.aovDelta >= 0 ? 'success' : 'critical'}>{metrics.aovDelta >= 0 ? '+' : ''}{metrics.aovDelta.toFixed(1)}%</Badge>
        </Card>
        <Card className="min-w-[140px] flex-1">
          <p className="text-xs text-text-muted">Returning customer rate</p>
          <p className="mt-1 text-lg font-semibold">{formatPercent(metrics.returningRate)}</p>
          <Badge tone="neutral">{metrics.returningDelta >= 0 ? '+' : ''}{metrics.returningDelta.toFixed(1)}pp</Badge>
        </Card>
        <Card className="min-w-[140px] flex-1">
          <p className="text-xs text-text-muted">Units sold</p>
          <p className="mt-1 text-lg font-semibold">{formatNumber(metrics.unitsSold)}</p>
        </Card>
      </div>
      {!summaryPair && (
        <p className="-mt-2 mb-4 text-xs text-text-muted">
          Offline — figures are local rollups over synced orders.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sales over time with optional comparison */}
        <Card padding={false} className="lg:col-span-2">
          <CardHeader title="Sales over time" subtitle={compare ? `vs ${prevRange.label}` : range.label} />
          <div className="h-72 px-3 py-4">
            <ResponsiveContainer width="100%" height="100%">
              {compare ? (
                <ComposedChart data={series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cmpFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#005bd3" stopOpacity={0.16} />
                      <stop offset="100%" stopColor="#005bd3" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eee" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8a8a8a' }} tickLine={false} axisLine={{ stroke: '#e3e3e3' }} minTickGap={30} />
                  <YAxis tick={{ fontSize: 11, fill: '#8a8a8a' }} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="sales" stroke="#005bd3" strokeWidth={2} fill="url(#cmpFill)" name="Sales" />
                  <Line type="monotone" dataKey="previous" stroke="#c9c9c9" strokeWidth={2} strokeDasharray="4 3" dot={false} name="previous" />
                </ComposedChart>
              ) : (
                <AreaChart data={series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="aFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#005bd3" stopOpacity={0.16} />
                      <stop offset="100%" stopColor="#005bd3" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eee" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8a8a8a' }} tickLine={false} axisLine={{ stroke: '#e3e3e3' }} minTickGap={30} />
                  <YAxis tick={{ fontSize: 11, fill: '#8a8a8a' }} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="sales" stroke="#005bd3" strokeWidth={2} fill="url(#aFill)" name="Sales" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card>

        {section === 'overview' && (
          <>
            <Card padding={false}>
              <CardHeader title="Sales by channel" />
              <div className="space-y-3 px-4 py-4 md:px-5">
                {channels.map((c) => {
                  const prev = prevChannels.find((p) => p.channel === c.channel)
                  const delta = prev && prev.sales > 0 ? ((c.sales - prev.sales) / prev.sales) * 100 : c.sales > 0 ? 100 : 0
                  return (
                    <div key={c.channel} className="flex items-center justify-between text-[13px]">
                      <span>{c.channel}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{formatMoney(c.sales)}</span>
                        <Badge tone={delta >= 0 ? 'success' : 'critical'}>{delta >= 0 ? '+' : ''}{delta.toFixed(0)}%</Badge>
                      </span>
                    </div>
                  )
                })}
                <p className="text-xs text-text-muted">{formatPercent(totalChannelSales ? (channels[0]?.sales ?? 0) / totalChannelSales * 100 : 0, 0)} of sales come from {channels[0]?.channel ?? '—'}.</p>
              </div>
            </Card>

            <Card padding={false}>
              <CardHeader title="Orders over time" />
              <div className="h-56 px-3 py-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#eee" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8a8a8a' }} tickLine={false} axisLine={{ stroke: '#e3e3e3' }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11, fill: '#8a8a8a' }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip moneyKeys={[]} />} />
                    <Bar dataKey="orders" fill="#005bd3" radius={[3, 3, 0, 0]} name="orders" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </>
        )}

        {section === 'sales' && (
          <>
            <Card padding={false}>
              <CardHeader title="Average order value over time" />
              <div className="h-60 px-3 py-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={aovSeries} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#eee" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8a8a8a' }} tickLine={false} axisLine={{ stroke: '#e3e3e3' }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11, fill: '#8a8a8a' }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="aov" stroke="#005bd3" strokeWidth={2} dot={false} name="aov" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card padding={false}>
              <CardHeader title="Payment status mix" />
              <ul className="divide-y divide-border">
                {Object.entries(
                  rangeOrders.reduce<Record<string, number>>((acc, o) => {
                    acc[o.paymentStatus] = (acc[o.paymentStatus] ?? 0) + 1
                    return acc
                  }, {}),
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between px-4 py-2 text-[13px]">
                      <span className="capitalize">{status.replace(/_/g, ' ')}</span>
                      <span className="text-text-muted">
                        {count} order{count === 1 ? '' : 's'} · {formatPercent((count / Math.max(1, rangeOrders.length)) * 100, 0)}
                      </span>
                    </li>
                  ))}
                {rangeOrders.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-text-muted">No orders in this period.</li>}
              </ul>
            </Card>
          </>
        )}

        {section === 'customers' && (
          <>
            <Card padding={false}>
              <CardHeader title="Customer acquisition" subtitle={`${customerRows.newCount} new · ${customerRows.returning} returning`} />
              <div className="h-60 px-3 py-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={customerRows.points} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#eee" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8a8a8a' }} tickLine={false} axisLine={{ stroke: '#e3e3e3' }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11, fill: '#8a8a8a' }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip moneyKeys={[]} />} />
                    <Bar dataKey="count" fill="#7a52c7" radius={[3, 3, 0, 0]} name="count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card padding={false}>
              <CardHeader title="Returning customers" />
              <div className="px-4 py-4 md:px-5">
                <p className="text-2xl font-semibold">{formatPercent(metrics.returningRate)}</p>
                <p className="mt-1 text-[13px] text-text-muted">
                  {customerRows.returning} of {customerRows.newCount + customerRows.returning} orders came from returning customers in this period.
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f1f1f1]">
                  <div className="h-full rounded-full bg-[#7a52c7]" style={{ width: `${Math.min(100, metrics.returningRate)}%` }} />
                </div>
                <p className="mt-3 text-xs text-text-muted">
                  {customers.length} customers total ·{' '}
                  <Link to="/customers" className="text-accent hover:underline">open customer directory</Link>
                </p>
              </div>
            </Card>
          </>
        )}

        {section === 'products' && (
          <Card padding={false} className="lg:col-span-2">
            <CardHeader title="Products by sales" subtitle="Ranked by sales in period, with previous-period rank movement" />
            {top.length === 0 ? (
              <EmptyState compact heading="No product sales in this period" />
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-[#fafafa] text-left text-xs text-text-muted">
                      <th className="px-4 py-2 font-medium">#</th>
                      <th className="px-4 py-2 font-medium">Product</th>
                      <th className="px-4 py-2 text-right font-medium">Units</th>
                      <th className="px-4 py-2 text-right font-medium">Sales</th>
                      <th className="px-4 py-2 text-right font-medium">Rank change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {top.map((p, i) => {
                      const prevIndex = topPrev.findIndex((x) => x.productId === p.productId)
                      const movement = prevIndex === -1 ? 'new' : prevIndex - i
                      return (
                        <tr key={p.productId}>
                          <td className="px-4 py-2 text-text-muted">{i + 1}</td>
                          <td className="px-4 py-2">
                            <Link to={`/products/${p.productId}`} className="font-medium hover:text-accent hover:underline">{p.title}</Link>
                          </td>
                          <td className="px-4 py-2 text-right">{p.units}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatMoney(p.sales)}</td>
                          <td className="px-4 py-2 text-right">
                            {movement === 'new' ? (
                              <Badge tone="highlight">New</Badge>
                            ) : movement === 0 ? (
                              <span className="text-text-muted">—</span>
                            ) : movement > 0 ? (
                              <Badge tone="success">↑ {movement}</Badge>
                            ) : (
                              <Badge tone="critical">↓ {Math.abs(movement)}</Badge>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {(section === 'overview' || section === 'sales') && (
          <Card padding={false} className={section === 'overview' ? 'lg:col-span-2' : 'lg:col-span-2'}>
            <CardHeader title="Top products" actions={<button className="text-xs text-accent hover:underline" onClick={() => setSection('products')}>Full ranking</button>} />
            <ul className="divide-y divide-border">
              {top.slice(0, 5).map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-4 text-xs text-text-subdued">{i + 1}</span>
                  {p.imageSrc && <img src={p.imageSrc} alt="" className="h-8 w-8 rounded-md border border-border object-cover" />}
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <span className="text-xs text-text-muted">{p.units} units</span>
                  <span className="w-20 text-right font-medium">{formatMoney(p.sales)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
