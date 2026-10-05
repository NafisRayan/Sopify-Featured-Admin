import type { Order, Product, Campaign } from '@/types'
import { roundMoney } from './money'

// ─── Date ranges ───────────────────────────────────────────────────────────

export interface DateRange {
  start: Date
  end: Date
  label: string
  /** number of days, used to build comparison windows */
  days: number
}

export type PresetKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'last90' | 'year' | 'custom'

export const DATE_PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last90', label: 'Last 90 days' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom' },
]

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function presetRange(key: PresetKey, custom?: { from: string; to: string }): DateRange {
  const now = new Date()
  const today = startOfDay(now)
  const mk = (days: number, label: string): DateRange => ({
    start: new Date(today.getTime() - (days - 1) * 86400_000),
    end: now,
    label,
    days,
  })
  switch (key) {
    case 'today': return mk(1, 'Today')
    case 'yesterday': {
      const y = new Date(today.getTime() - 86400_000)
      return { start: y, end: new Date(y.getTime() + 86399_000), label: 'Yesterday', days: 1 }
    }
    case 'last7': return mk(7, 'Last 7 days')
    case 'last30': return mk(30, 'Last 30 days')
    case 'last90': return mk(90, 'Last 90 days')
    case 'year': {
      const jan1 = new Date(now.getFullYear(), 0, 1)
      const days = Math.max(1, Math.round((now.getTime() - jan1.getTime()) / 86400_000))
      return { start: jan1, end: now, label: 'This year', days }
    }
    case 'custom': {
      const from = custom?.from ? startOfDay(new Date(custom.from)) : new Date(today.getTime() - 29 * 86400_000)
      const to = custom?.to ? new Date(custom.to + 'T23:59:59') : now
      const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400_000))
      return { start: from, end: to, label: 'Custom range', days }
    }
  }
}

/** The equally-long window immediately before `range` */
export function previousRange(range: DateRange): DateRange {
  const end = new Date(range.start.getTime() - 1)
  const start = new Date(end.getTime() - (range.days - 1) * 86400_000)
  return { start, end, label: 'Previous period', days: range.days }
}

export const inRange = (iso: string, r: DateRange): boolean => {
  const t = new Date(iso).getTime()
  return t >= r.start.getTime() && t <= r.end.getTime()
}

// ─── Metrics ───────────────────────────────────────────────────────────────

export interface CoreMetrics {
  totalSales: number
  netSales: number
  ordersCount: number
  unitsSold: number
  aov: number
  returningRate: number
  salesDelta: number // % change vs previous period
  netSalesDelta: number
  ordersDelta: number
  aovDelta: number
  returningDelta: number
}
const countableOrders = (orders: Order[]) =>
  orders.filter((o) => o.status !== 'draft' && o.status !== 'cancelled')

export function coreMetrics(allOrders: Order[], range: DateRange): CoreMetrics {
  const cur = countableOrders(allOrders.filter((o) => inRange(o.createdAt, range)))
  const prev = countableOrders(allOrders.filter((o) => inRange(o.createdAt, previousRange(range))))

  const totalSales = roundMoney(cur.reduce((s, o) => s + o.total, 0))
  const prevSales = roundMoney(prev.reduce((s, o) => s + o.total, 0))
  // local rollup: gross − discounts − refunds (mirrors server analytics; remote
  // mode prefers api.fetchAnalytics netSales over this offline fallback)
  const discounts = roundMoney(cur.reduce((s, o) => s + (o.discountCode?.amount ?? 0), 0))
  const refunded = roundMoney(cur.reduce((s, o) => s + o.refunds.reduce((x, r) => x + r.amount, 0), 0))
  const netSales = roundMoney(Math.max(0, totalSales - discounts - refunded))
  const prevDiscounts = roundMoney(prev.reduce((s, o) => s + (o.discountCode?.amount ?? 0), 0))
  const prevRefunded = roundMoney(prev.reduce((s, o) => s + o.refunds.reduce((x, r) => x + r.amount, 0), 0))
  const prevNetSales = roundMoney(Math.max(0, prevSales - prevDiscounts - prevRefunded))
  const ordersCount = cur.length
  const prevOrders = prev.length
  const aov = ordersCount ? totalSales / ordersCount : 0
  const prevAov = prevOrders ? prevSales / prevOrders : 0

  // returning = customer had a countable order before this order
  const history = countableOrders(allOrders.filter((o) => new Date(o.createdAt) < range.start))
  const customersWithPrior = new Set(history.map((o) => o.customerId))
  const returning = cur.filter((o) => customersWithPrior.has(o.customerId)).length
  const prevHistory = countableOrders(allOrders)
    .filter((o) => new Date(o.createdAt) < previousRange(range).start)
  const prevReturning = prev.filter((o) => prevHistory.some((h) => h.customerId === o.customerId && h.createdAt < o.createdAt)).length

  const returningRate = ordersCount ? (returning / ordersCount) * 100 : 0
  const prevReturningRate = prevOrders ? (prevReturning / prevOrders) * 100 : 0

  const delta = (nowV: number, before: number): number =>
    before === 0 ? (nowV > 0 ? 100 : 0) : ((nowV - before) / before) * 100

  return {
    totalSales,
    netSales,
    netSalesDelta: delta(netSales, prevNetSales),
    ordersCount,
    unitsSold: cur.reduce((s, o) => s + o.lineItems.reduce((q, li) => q + li.quantity, 0), 0),
    aov,
    returningRate,
    salesDelta: delta(totalSales, prevSales),
    ordersDelta: delta(ordersCount, prevOrders),
    aovDelta: delta(aov, prevAov),
    returningDelta: returningRate - prevReturningRate,
  }
}

export interface SeriesPoint {
  date: string // yyyy-mm-dd
  sales: number
  orders: number
}

export function dailySeries(allOrders: Order[], range: DateRange): SeriesPoint[] {
  const byDay = new Map<string, { sales: number; orders: number }>()
  for (let d = new Date(range.start); d <= range.end; d = new Date(d.getTime() + 86400_000)) {
    const key = d.toISOString().slice(0, 10)
    byDay.set(key, { sales: 0, orders: 0 })
  }
  for (const o of countableOrders(allOrders.filter((x) => inRange(x.createdAt, range)))) {
    const key = new Date(o.createdAt).toISOString().slice(0, 10)
    const entry = byDay.get(key)
    if (entry) {
      entry.sales = roundMoney(entry.sales + o.total)
      entry.orders += 1
    }
  }
  return [...byDay.entries()].map(([date, v]) => ({ date, ...v }))
}

export function channelBreakdown(allOrders: Order[], range: DateRange): { channel: string; sales: number; orders: number }[] {
  const map = new Map<string, { sales: number; orders: number }>()
  for (const o of countableOrders(allOrders.filter((x) => inRange(x.createdAt, range)))) {
    const e = map.get(o.channel) ?? { sales: 0, orders: 0 }
    e.sales = roundMoney(e.sales + o.total)
    e.orders += 1
    map.set(o.channel, e)
  }
  return [...map.entries()].map(([channel, v]) => ({ channel, ...v })).sort((a, b) => b.sales - a.sales)
}

export function topProducts(allOrders: Order[], products: Product[], range: DateRange, limit = 8) {
  const map = new Map<string, { productId: string; title: string; units: number; sales: number; imageSrc?: string }>()
  for (const o of countableOrders(allOrders.filter((x) => inRange(x.createdAt, range)))) {
    for (const li of o.lineItems) {
      const e = map.get(li.productId) ?? {
        productId: li.productId, title: li.title,
        units: 0, sales: 0,
        imageSrc: products.find((p) => p.id === li.productId)?.media[0]?.src,
      }
      e.units += li.quantity
      e.sales = roundMoney(e.sales + li.price * li.quantity - li.totalDiscount)
      map.set(li.productId, e)
    }
  }
  return [...map.values()].sort((a, b) => b.sales - a.sales).slice(0, limit)
}

export function salesByChannelSeries(allOrders: Order[], range: DateRange) {
  return channelBreakdown(allOrders, range)
}

// ─── Marketing rollups ─────────────────────────────────────────────────────

export interface MarketingTotals {
  reach: number
  sessions: number
  orders: number
  revenue: number
  cost: number
  conversion: number
  roas: number
}

export function marketingTotals(campaigns: Campaign[]): MarketingTotals {
  const reach = campaigns.reduce((s, c) => s + c.reached, 0)
  const sessions = campaigns.reduce((s, c) => s + c.sessions, 0)
  const orders = campaigns.reduce((s, c) => s + c.orders, 0)
  const revenue = campaigns.reduce((s, c) => s + c.revenue, 0)
  const cost = campaigns.reduce((s, c) => s + c.cost, 0)
  return {
    reach,
    sessions,
    orders,
    revenue,
    cost,
    conversion: sessions ? (orders / sessions) * 100 : 0,
    roas: cost ? revenue / cost : 0,
  }
}

// ─── Comparison helper for analytics views ─────────────────────────────────

export function seriesWithComparison(orders: Order[], range: DateRange) {
  const cur = dailySeries(orders, range)
  const prev = dailySeries(orders, previousRange(range))
  return cur.map((point, i) => ({
    ...point,
    label: new Date(point.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    previous: prev[i]?.sales ?? 0,
    prevOrders: prev[i]?.orders ?? 0,
  }))
}
