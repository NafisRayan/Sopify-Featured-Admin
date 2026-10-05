import { useMemo, useState } from 'react'
import { Banknote } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { DataTable, type Column } from '@/components/data-table/DataTable'
import { Badge, Card, CardHeader, Drawer, PageHeader } from '@/components/ui'
import { formatDate, formatMoney, formatRelative } from '@/lib/format'
import type { BalanceTransaction, Payout } from '@/types/parity'

const typeLabel: Record<BalanceTransaction['type'], string> = {
  charge: 'Charge',
  refund: 'Refund',
  fee: 'Fee',
  payout: 'Payout',
  adjustment: 'Adjustment',
  dispute: 'Dispute',
}

export default function PayoutsPage() {
  const payouts = useStore((s) => s.payouts)
  const transactions = useStore((s) => s.balanceTransactions)
  const [detail, setDetail] = useState<Payout | null>(null)
  const [txnFilter, setTxnFilter] = useState<'all' | BalanceTransaction['type']>('all')

  const sortedPayouts = useMemo(() => [...payouts].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)), [payouts])
  const scheduled = sortedPayouts.filter((p) => p.status === 'scheduled')
  const upcomingBalance = scheduled.reduce((s, p) => s + p.amount, 0)

  const filteredTxns = useMemo(
    () =>
      transactions
        .filter((t) => txnFilter === 'all' || t.type === txnFilter)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 100),
    [transactions, txnFilter],
  )

  const detailTxns = useMemo(
    () => (detail ? transactions.filter((t) => t.payoutId === detail.id).sort((a, b) => b.at.localeCompare(a.at)) : []),
    [transactions, detail],
  )

  const payoutColumns: Column<Payout>[] = [
    {
      key: 'issued', header: 'Payout date', sortValue: (p) => p.issuedAt,
      render: (p) => (
        <span>
          <span className="block font-medium">{formatDate(p.issuedAt)}</span>
          <span className="block text-xs text-text-muted">{p.bankAccount}</span>
        </span>
      ),
    },
    {
      key: 'status', header: 'Status', sortValue: (p) => p.status,
      render: (p) => (
        <Badge tone={p.status === 'paid' ? 'success' : p.status === 'in_transit' ? 'info' : 'warning'} dot>
          {p.status === 'in_transit' ? 'In transit' : p.status.charAt(0).toUpperCase() + p.status.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'amount', header: 'Amount', align: 'right', sortValue: (p) => p.amount,
      render: (p) => <span className={`font-medium ${p.amount < 0 ? 'text-critical-strong' : ''}`}>{formatMoney(p.amount)}</span>,
    },
  ]

  const txnColumns: Column<BalanceTransaction>[] = [
    {
      key: 'at', header: 'Date', sortValue: (t) => t.at,
      render: (t) => <span className="text-text-muted">{formatRelative(t.at)}</span>,
    },
    { key: 'type', header: 'Type', sortValue: (t) => t.type, render: (t) => <Badge tone={t.type === 'charge' ? 'success' : t.type === 'refund' ? 'critical' : 'neutral'}>{typeLabel[t.type]}</Badge> },
    {
      key: 'description', header: 'Description',
      render: (t) => <span className="text-text-muted">{t.description}</span>,
    },
    {
      key: 'amount', header: 'Amount', align: 'right', sortValue: (t) => t.amount,
      render: (t) => <span className={t.amount < 0 ? 'text-critical-strong' : ''}>{formatMoney(t.amount)}</span>,
    },
    {
      key: 'fee', header: 'Fee', align: 'right', sortValue: (t) => t.fee,
      render: (t) => <span className="text-text-muted">{t.fee ? formatMoney(t.fee) : '—'}</span>,
    },
    {
      key: 'net', header: 'Net', align: 'right', sortValue: (t) => t.net,
      render: (t) => <span className="font-medium">{formatMoney(t.net)}</span>,
    },
  ]

  return (
    <div>
      <PageHeader title="Payouts" subtitle="Shopify Payments balance and payout history" />

      <div className="mb-4 flex flex-wrap gap-3">
        <Card className="min-w-[160px] flex-1">
          <p className="text-xs text-text-muted">Upcoming payout</p>
          <p className="mt-1 text-lg font-semibold">{formatMoney(upcomingBalance)}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {scheduled.length > 0 ? `Scheduled ${formatDate(scheduled[0]!.issuedAt)}` : 'No payout scheduled'}
          </p>
        </Card>
        <Card className="min-w-[160px] flex-1">
          <p className="text-xs text-text-muted">Paid to bank</p>
          <p className="mt-1 text-lg font-semibold">
            {formatMoney(sortedPayouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0))}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">Lifetime · •••• 4821</p>
        </Card>
        <Card className="min-w-[160px] flex-1">
          <p className="text-xs text-text-muted">Processing fees</p>
          <p className="mt-1 text-lg font-semibold">
            {formatMoney(transactions.reduce((s, t) => s + t.fee, 0))}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">2.9% + 30¢ per charge</p>
        </Card>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <CardHeader title="Payouts" subtitle={`${payouts.length} payouts · weekly schedule`} />
        <DataTable
          rows={sortedPayouts}
          columns={payoutColumns}
          rowKey={(p) => p.id}
          hideControls
          onRowClick={(p) => setDetail(p)}
          initialSort={{ key: 'issued', dir: 'desc' }}
          pageSize={8}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
        <CardHeader
          title="Balance transactions"
          subtitle="Charges, refunds and fees from Shopify Payments"
          actions={
            <select
              value={txnFilter}
              onChange={(e) => setTxnFilter(e.target.value as typeof txnFilter)}
              aria-label="Filter transactions"
              className="h-8 cursor-pointer rounded-lg border border-[#c9c9c9] bg-surface px-2 text-[13px]"
            >
              <option value="all">All types</option>
              <option value="charge">Charges</option>
              <option value="refund">Refunds</option>
            </select>
          }
        />
        <DataTable
          rows={filteredTxns}
          columns={txnColumns}
          rowKey={(t) => t.id}
          hideControls
          initialSort={{ key: 'at', dir: 'desc' }}
          pageSize={10}
        />
      </div>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `Payout · ${formatDate(detail.issuedAt)}` : ''}
        subtitle={detail ? `${detail.status === 'paid' ? `Arrived ${formatDate(detail.arrivedAt ?? detail.issuedAt)}` : detail.status === 'in_transit' ? 'In transit to your bank' : 'Scheduled'} · ${detail.bankAccount}` : undefined}
      >
        {detail && (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#1a1a1a] p-4 text-white">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/70">
                <Banknote size={13} /> Payout amount
              </p>
              <p className="mt-1 text-3xl font-bold">{formatMoney(detail.amount)}</p>
            </div>
            <div>
              <h3 className="mb-2 text-[13px] font-semibold">Included transactions ({detailTxns.length})</h3>
              <ul className="divide-y divide-border rounded-lg border border-border text-[13px]">
                {detailTxns.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate">{t.description}</span>
                    <span className={`font-medium ${t.net < 0 ? 'text-critical-strong' : ''}`}>{formatMoney(t.net)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
