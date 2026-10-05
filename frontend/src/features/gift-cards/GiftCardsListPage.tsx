import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, MoreVertical, Plus, Ticket } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { DataTable, type Column, type FilterDef } from '@/components/data-table/DataTable'
import {
  Badge, Button, Card, Drawer, EmptyState, Input, Modal, PageHeader, PortalMenu, Select, Textarea,
  useConfirm, useToast,
} from '@/components/ui'
import { formatDate, formatMoney, formatRelative } from '@/lib/format'
import { adjustGiftCardBalance, issueGiftCard, setGiftCardStatus } from '@/services/parityService'
import { useCan } from '@/lib/permissions'
import type { GiftCard } from '@/types/parity'

const statusTone = { enabled: 'success', disabled: 'neutral', expired: 'critical' } as const

export default function GiftCardsListPage() {
  const giftCards = useStore((s) => s.giftCards)
  const customers = useStore((s) => s.customers)
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm, confirmElement } = useConfirm()
  const [issueOpen, setIssueOpen] = useState(false)
  const [detail, setDetail] = useState<GiftCard | null>(null)
  const [adjustOpen, setAdjustOpen] = useState<GiftCard | null>(null)
  const [adjustValue, setAdjustValue] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [form, setForm] = useState({ customerId: '', balance: '50', note: '', expiresAt: '' })
  const canEdit = useCan('customers', 'edit')

  const ownerName = (g: GiftCard) => {
    if (!g.customerId) return '—'
    const c = customers.find((x) => x.id === g.customerId)
    return c ? `${c.firstName} ${c.lastName}` : '—'
  }

  const filters: FilterDef<GiftCard>[] = [
    {
      key: 'status', label: 'Status', type: 'multiselect',
      options: [
        { label: 'Enabled', value: 'enabled' },
        { label: 'Disabled', value: 'disabled' },
        { label: 'Expired', value: 'expired' },
      ],
      predicate: (g, v) => Array.isArray(v) && v.includes(g.status),
    },
  ]

  const columns: Column<GiftCard>[] = [
    {
      key: 'code', header: 'Gift card', sortValue: (g) => g.code,
      render: (g) => (
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-highlight text-[#5b3ba8]">
            <Ticket size={14} />
          </span>
          <span className="min-w-0">
            <span className="block font-mono text-[13px] font-medium">{maskCode(g.code)}</span>
            <span className="block text-xs text-text-muted">Created {formatDate(g.createdAt)}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'customer', header: 'Issued to', sortValue: (g) => ownerName(g),
      render: (g) => <span className="text-text-muted">{ownerName(g)}</span>,
    },
    {
      key: 'balance', header: 'Balance', align: 'right', sortValue: (g) => g.balance,
      render: (g) => (
        <span>
          <span className="font-medium">{formatMoney(g.balance)}</span>
          <span className="block text-xs text-text-muted">of {formatMoney(g.initialBalance)}</span>
        </span>
      ),
    },
    {
      key: 'expires', header: 'Expires', sortValue: (g) => g.expiresAt ?? '',
      render: (g) => <span className="text-text-muted">{g.expiresAt ? formatDate(g.expiresAt) : 'Never'}</span>,
    },
    {
      key: 'status', header: 'Status', sortValue: (g) => g.status,
      render: (g) => <Badge tone={statusTone[g.status]} dot>{g.status.charAt(0).toUpperCase() + g.status.slice(1)}</Badge>,
    },
  ]

  const submitIssue = async () => {
    try {
      const card = await issueGiftCard({
        customerId: form.customerId || undefined,
        initialBalance: Number(form.balance),
        note: form.note || undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      })
      toast(`Gift card ${maskCode(card.code)} issued`)
      setIssueOpen(false)
      setForm({ customerId: '', balance: '50', note: '', expiresAt: '' })
      setDetail(card)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to issue gift card', { tone: 'critical' })
    }
  }

  const totalOutstanding = giftCards.filter((g) => g.status === 'enabled').reduce((s, g) => s + g.balance, 0)

  return (
    <div>
      {confirmElement}
      <PageHeader
        title="Gift cards"
        subtitle={`${formatMoney(totalOutstanding)} outstanding balance across ${giftCards.filter((g) => g.status === 'enabled').length} active cards`}
        primaryAction={
          canEdit ? (
            <Button variant="primary" icon={<Plus size={13} />} onClick={() => setIssueOpen(true)}>
              Issue gift card
            </Button>
          ) : undefined
        }
      />

      <DataTable
        rows={giftCards}
        columns={columns}
        rowKey={(g) => g.id}
        searchKeys={(g) => [g.code, ownerName(g)]}
        searchPlaceholder="Search gift cards"
        filters={filters}
        initialSort={{ key: 'code', dir: 'desc' }}
        onRowClick={(g) => setDetail(g)}
        hasAnyData={giftCards.length > 0}
        emptyNoData={
          <EmptyState
            icon={Ticket}
            heading="No gift cards yet"
            message="Issue gift cards that customers can redeem at checkout."
            primaryAction={canEdit ? { label: 'Issue gift card', onClick: () => setIssueOpen(true) } : undefined}
          />
        }
        rowActions={(g) => (
          <PortalMenu
            align="right"
            trigger={
              <button aria-label={`Actions for ${maskCode(g.code)}`} className="rounded-md p-1.5 text-text-muted hover:bg-[#e3e3e3] hover:text-text">
                <MoreVertical size={15} />
              </button>
            }
            items={[
              { label: 'View', onClick: () => setDetail(g) },
              ...(canEdit && g.status === 'enabled'
                ? [
                    { label: 'Adjust balance', onClick: () => { setAdjustValue(String(g.balance)); setAdjustNote(''); setAdjustOpen(g) } },
                    {
                      label: 'Disable', destructive: true,
                      onClick: () =>
                        confirm({
                          title: `Disable ${maskCode(g.code)}?`,
                          body: 'The remaining balance is frozen until the card is re-enabled.',
                          confirmLabel: 'Disable',
                          destructive: true,
                          onConfirm: async () => {
                            await setGiftCardStatus(g.id, 'disabled')
                            toast('Gift card disabled', { tone: 'warning' })
                          },
                        }),
                    },
                  ]
                : []),
              ...(canEdit && g.status === 'disabled'
                ? [{ label: 'Enable', onClick: () => void setGiftCardStatus(g.id, 'enabled').then(() => toast('Gift card enabled')) }]
                : []),
            ]}
          />
        )}
      />

      {/* Issue modal */}
      <Modal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="Issue gift card"
        footer={
          <>
            <Button onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void submitIssue()}>Issue</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="Send to customer (optional)"
            value={form.customerId}
            onChange={(e) => setForm({ ...form, customerId: e.target.value })}
            options={[{ label: 'No customer — issue manually', value: '' }, ...customers.map((c) => ({ label: `${c.firstName} ${c.lastName} (${c.email})`, value: c.id }))]}
          />
          <Input label="Initial value" type="number" step="0.01" min="0.01" prefix="$" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} />
          <Input label="Expires on (optional)" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          <Textarea label="Note (internal)" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </Modal>

      {/* Detail drawer */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `Gift card ${maskCode(detail.code)}` : ''}
        subtitle={detail ? `Created ${formatRelative(detail.createdAt)}` : undefined}
        footer={
          detail && canEdit && detail.status === 'enabled' ? (
            <>
              <Button onClick={() => { setAdjustValue(String(detail.balance)); setAdjustNote(''); setAdjustOpen(detail) }}>
                Adjust balance
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  confirm({
                    title: 'Disable this gift card?',
                    body: 'The remaining balance is frozen until re-enabled.',
                    confirmLabel: 'Disable',
                    destructive: true,
                    onConfirm: async () => {
                      await setGiftCardStatus(detail.id, 'disabled')
                      toast('Gift card disabled', { tone: 'warning' })
                      setDetail(null)
                    },
                  })
                }
              >
                Disable
              </Button>
            </>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-4">
            <Card className="bg-gradient-to-br from-[#2b2140] to-[#4a3b73] text-white" padding={false}>
              <div className="p-4">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/70">
                  <CreditCard size={13} /> Northstar Goods gift card
                </p>
                <p className="mt-2 font-mono text-lg font-semibold tracking-wider">{detail.code}</p>
                <p className="mt-2 text-2xl font-bold">{formatMoney(detail.balance)}</p>
                <p className="text-xs text-white/70">of {formatMoney(detail.initialBalance)} initial</p>
              </div>
            </Card>
            <div>
              <h3 className="mb-2 text-[13px] font-semibold">History</h3>
              <ol className="space-y-2.5">
                {[...detail.history].reverse().map((h) => (
                  <li key={h.id} className="flex gap-2.5">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${h.amount > 0 ? 'bg-success' : h.amount < 0 ? 'bg-critical-strong' : 'bg-[#8a8a8a]'}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[13px]">
                        {h.type.charAt(0).toUpperCase() + h.type.slice(1)}
                        {h.amount !== 0 && ` · ${h.amount > 0 ? '+' : '−'}${formatMoney(Math.abs(h.amount))}`}
                      </span>
                      <span className="block text-xs text-text-muted">{h.note}</span>
                      <span className="block text-xs text-text-subdued">{formatRelative(h.at)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Drawer>

      {/* Adjust drawer */}
      <Drawer
        open={!!adjustOpen}
        onClose={() => setAdjustOpen(null)}
        title="Adjust balance"
        subtitle={adjustOpen ? maskCode(adjustOpen.code) : undefined}
        footer={
          <>
            <Button onClick={() => setAdjustOpen(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!adjustOpen) return
                try {
                  await adjustGiftCardBalance(adjustOpen.id, Number(adjustValue), adjustNote)
                  toast('Balance adjusted')
                  setAdjustOpen(null)
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'Failed', { tone: 'critical' })
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="New balance" type="number" step="0.01" min="0" prefix="$" value={adjustValue} onChange={(e) => setAdjustValue(e.target.value)} helpText={adjustOpen ? `Current balance ${formatMoney(adjustOpen.balance)}` : undefined} />
          <Input label="Reason" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="e.g. Service makeup" />
        </div>
      </Drawer>

      {giftCards.length > 0 && (
        <button className="mt-2 text-xs text-accent hover:underline" onClick={() => navigate('/products/new')}>
          Sell gift cards as products →
        </button>
      )}
    </div>
  )
}

function maskCode(code: string): string {
  const parts = code.split('-')
  return parts.length === 4 ? `${parts[0]}-••••-••••-${parts[3]}` : code
}
