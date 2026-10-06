import { Injectable, Module } from '@nestjs/common'
import { Resolver, Query, Args } from '@nestjs/graphql'
import { PrismaService } from '../../prisma/prisma.service'
import { PrismaModule } from '../../prisma/prisma.module'
import { uid, roundMoney } from '../../common/ids'
import { parseJson } from '../../common/helpers'

const DAY_MS = 24 * 60 * 60 * 1000
const PAYOUT_STATUS_RANK: Record<string, number> = { scheduled: 0, in_transit: 1, paid: 2 }
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Next occurrence of the scheduled weekday strictly after `from` (midnight-normalized). */
function nextWeekdayAfter(from: Date, dayOfWeek: string): Date {
  const target = Math.min(Math.max(WEEKDAYS.indexOf(dayOfWeek.toLowerCase()), 0), 6)
  const d = new Date(from)
  d.setUTCHours(0, 0, 0, 0)
  let add = (target - d.getUTCDay() + 7) % 7
  if (add === 0) add = 7
  return new Date(d.getTime() + add * DAY_MS)
}

/** Payout date for a balance transaction under the given schedule (always midnight-normalized). */
function payoutDateFor(at: Date, schedule: string, dayOfWeek: string): Date {
  if (schedule === 'daily') {
    const d = new Date(at)
    d.setUTCHours(0, 0, 0, 0)
    return new Date(d.getTime() + DAY_MS)
  }
  if (schedule === 'biweekly') {
    return new Date(nextWeekdayAfter(at, dayOfWeek).getTime() + 7 * DAY_MS)
  }
  if (schedule === 'monthly') {
    // Simplification (per spec): a same-weekday-of-month pattern is overkill — use the end of the
    // transaction's month, then the first Friday strictly after it.
    const endOfMonth = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0))
    let add = (5 - endOfMonth.getUTCDay() + 7) % 7
    if (add === 0) add = 7
    return new Date(endOfMonth.getTime() + add * DAY_MS)
  }
  return nextWeekdayAfter(at, dayOfWeek) // weekly (default)
}

/**
 * Idempotent payout materializer: buckets every unlinked BalanceTransaction into scheduled
 * payout periods from the store's payout settings, upserts one Payout per payout date and
 * links the transactions to it. Safe to run repeatedly; existing paid/in_transit payouts are
 * never downgraded.
 */
/** Process-local guard keyed by payout schedule: a schedule change forces a re-bucket. */
let materializedKey: string | null = null
export async function ensurePayouts(prisma: PrismaService): Promise<void> {
  const settingsRow = await prisma.storeSettings.findFirst()
  const settingsVal = settingsRow
    ? parseJson<{ payouts?: { schedule?: string; dayOfWeek?: string } }>(settingsRow.value as string, {})
    : {}
  const payoutsCfg = settingsVal.payouts ?? {}
  const schedule = payoutsCfg.schedule ?? 'weekly'
  const dayOfWeek = payoutsCfg.dayOfWeek ?? 'friday'

  // Schedule changed since the last pass → release every not-yet-paid payout so its
  // transactions re-bucket under the new schedule (paid payouts are immutable).
  if (materializedKey !== null && materializedKey !== `${schedule}:${dayOfWeek}`) {
    const stale = await prisma.payout.findMany({ where: { status: { not: 'paid' } } })
    if (stale.length > 0) {
      await prisma.balanceTransaction.updateMany({
        where: { payoutId: { in: stale.map((p) => p.id) } },
        data: { payoutId: null },
      })
      await prisma.payout.deleteMany({ where: { id: { in: stale.map((p) => p.id) } } })
    }
  }
  const txns = await prisma.balanceTransaction.findMany({ where: { payoutId: null }, orderBy: { at: 'asc' } })
  // Nothing new since the last pass under this schedule → no-op.
  if (txns.length === 0 && materializedKey === `${schedule}:${dayOfWeek}`) return

  const buckets = new Map<string, { date: Date; txns: typeof txns }>()
  for (const t of txns) {
    const date = payoutDateFor(t.at, schedule, dayOfWeek)
    const key = date.toISOString().slice(0, 10)
    const bucket = buckets.get(key) ?? { date, txns: [] }
    bucket.txns.push(t)
    buckets.set(key, bucket)
  }

  for (const { date, txns: bucketTxns } of buckets.values()) {
    let payout = await prisma.payout.findFirst({ where: { issuedAt: date } })
    if (!payout) {
      payout = await prisma.payout.create({
        data: {
          id: uid('po'),
          status: 'scheduled',
          amount: 0,
          currency: 'USD',
          issuedAt: date,
          bankAccount: 'Primary bank account',
        },
      })
    }
    await prisma.balanceTransaction.updateMany({
      where: { id: { in: bucketTxns.map((t) => t.id) } },
      data: { payoutId: payout.id },
    })
  }

  // The ledger is the single source of truth: recompute payout amounts from
  // linked transactions and delete fictional rows that back nothing (static
  // seed payouts can carry made-up — even negative — amounts). One grouped
  // read + writes only for rows that actually changed.
  const allPayouts = await prisma.payout.findMany()
  const allTxns = await prisma.balanceTransaction.findMany({ select: { payoutId: true, amount: true, fee: true } })
  const sums = new Map<string, number>()
  for (const t of allTxns) {
    if (t.payoutId) sums.set(t.payoutId, (sums.get(t.payoutId) ?? 0) + t.amount - t.fee)
  }
  const now = Date.now()
  for (const payout of allPayouts) {
    const sum = sums.get(payout.id)
    if (sum === undefined) {
      await prisma.payout.delete({ where: { id: payout.id } })
      continue
    }
    const amount = roundMoney(sum)
    const date = payout.issuedAt
    const arrival = new Date(date.getTime() + 2 * DAY_MS)
    let status: string
    if (now >= arrival.getTime()) status = 'paid'
    else if (now >= date.getTime()) status = 'in_transit'
    else status = 'scheduled'
    // Never downgrade a payout that already moved to in_transit/paid.
    const merged = (PAYOUT_STATUS_RANK[status] ?? 0) > (PAYOUT_STATUS_RANK[payout.status] ?? 0) ? status : payout.status
    const arrivedAt = merged === 'paid' ? (payout.arrivedAt ?? arrival) : payout.arrivedAt
    if (amount !== payout.amount || merged !== payout.status || arrivedAt?.getTime() !== payout.arrivedAt?.getTime()) {
      await prisma.payout.update({ where: { id: payout.id }, data: { amount, status: merged, arrivedAt } })
    }
  }
  materializedKey = `${schedule}:${dayOfWeek}`
}

@Injectable()
export class FinancesService {
  constructor(private prisma: PrismaService) {}

  async payouts() {
    await ensurePayouts(this.prisma)
    return this.prisma.payout.findMany({ orderBy: { issuedAt: 'desc' } })
  }

  async balanceTransactions(type?: string, first = 100) {
    await ensurePayouts(this.prisma)
    return this.prisma.balanceTransaction.findMany({
      where: type ? { type } : undefined,
      orderBy: { at: 'desc' },
      take: first,
    })
  }
}

@Resolver('Payout')
export class FinancesResolver {
  constructor(private readonly service: FinancesService) {}

  @Query()
  payouts() {
    return this.service.payouts()
  }

  @Query()
  balanceTransactions(@Args('type', { nullable: true }) type?: string, @Args('first', { nullable: true }) first?: number) {
    return this.service.balanceTransactions(type, first ?? 100)
  }
}

@Module({
  imports: [PrismaModule],
  providers: [FinancesResolver, FinancesService],
})
export class FinancesModule {}
