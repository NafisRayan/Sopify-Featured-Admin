import { useEffect, useMemo, useState } from 'react'
import { IS_REMOTE, fetchAnalytics } from '@/services/api'
import { previousRange, type CoreMetrics, type DateRange } from '@/lib/analytics'

/** Server AnalyticsSummary (SDL `analytics(from, to)`) — mirrored here because the
 * GraphQL schema is final; assignment from `fetchAnalytics` is structural. */
export interface AnalyticsSummaryData {
  from: string
  to: string
  grossSales: number
  discounts: number
  refunds: number
  netSales: number
  shipping: number
  taxes: number
  giftCardSales: number
  ordersCount: number
  avgOrderValue: number
  returningCustomerRate: number
  topProducts: { productId: string; title: string; units: number; revenue: number }[]
}

export interface AnalyticsPair {
  current: AnalyticsSummaryData
  previous: AnalyticsSummaryData | null
}

/**
 * Server-side analytics for the selected range (+ its previous window for deltas).
 * Returns null offline / on failure — callers fall back to local order rollups.
 */
export function useAnalyticsSummary(range: DateRange): AnalyticsPair | null {
  const [pair, setPair] = useState<AnalyticsPair | null>(null)
  const rangeKey = `${range.start.toISOString()}..${range.end.toISOString()}`
  // previousRange only reads start/days — rangeKey (start..end ISO) captures its identity
  const prevRange = useMemo(() => previousRange(range), [rangeKey])

  useEffect(() => {
    if (!IS_REMOTE) {
      setPair(null)
      return
    }
    let alive = true
    const [from, to] = rangeKey.split('..')
    void (async () => {
      const [cur, before] = await Promise.all([
        fetchAnalytics(from!, to!),
        fetchAnalytics(prevRange.start.toISOString(), prevRange.end.toISOString()),
      ])
      if (!alive) return
      setPair(cur ? { current: cur, previous: before } : null)
    })()
    return () => {
      alive = false
    }
  }, [rangeKey, prevRange])

  return pair
}

const delta = (now: number, before: number): number =>
  before === 0 ? (now > 0 ? 100 : 0) : ((now - before) / before) * 100

/**
 * CoreMetrics from the server summary (server is source of truth in remote mode).
 * `unitsSold` is not part of AnalyticsSummary — the caller passes the local count
 * (orders are server-hydrated in remote mode, so the count is real data).
 */
export function serverCoreMetrics(pair: AnalyticsPair, localUnitsSold: number): CoreMetrics {
  const { current: c, previous: p } = pair
  // Shopify total sales = net sales + shipping + taxes
  const totalSales = c.netSales + c.shipping + c.taxes
  const prevTotal = p ? p.netSales + p.shipping + p.taxes : 0
  const aov = c.avgOrderValue
  const prevAov = p?.avgOrderValue ?? 0
  // Backend already returns a percentage (0–100).
  const returningRate = c.returningCustomerRate
  const prevReturningRate = p?.returningCustomerRate ?? 0
  return {
    totalSales,
    netSales: c.netSales,
    netSalesDelta: delta(c.netSales, p?.netSales ?? 0),
    ordersCount: c.ordersCount,
    unitsSold: localUnitsSold,
    aov,
    returningRate,
    salesDelta: delta(totalSales, prevTotal),
    ordersDelta: delta(c.ordersCount, p?.ordersCount ?? 0),
    aovDelta: delta(aov, prevAov),
    returningDelta: returningRate - prevReturningRate,
  }
}
