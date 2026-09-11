import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Ban, CheckCheck, DollarSign, Plus, Archive, TagIcon, MoreVertical } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { DataTable, type Column, type FilterDef, type BulkActionDef } from '@/components/data-table/DataTable'
import {
  Badge, Button, Drawer, EmptyState, Modal, PageHeader, PortalMenu, Select, TagInput,
  Tabs, useConfirm, useToast,
} from '@/components/ui'
import { formatDate, formatMoney } from '@/lib/format'
import { FULFILLMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/constants'
import { bulkAddTags, bulkCancel, bulkFulfill, bulkMarkPaid, bulkArchive, createDraft, convertDraft } from '@/services/ordersService'
import { useCan } from '@/lib/permissions'
import type { FulfillmentStatus, Order, PaymentStatus } from '@/types'

export function paymentTone(s: PaymentStatus) {
  return s === 'paid' ? 'success' : s === 'pending' || s === 'authorized' ? 'warning' : s === 'partially_refunded' ? 'attention' : s === 'refunded' || s === 'voided' ? 'critical' : 'neutral'
}
export function fulfillmentTone(s: FulfillmentStatus) {
  return s === 'fulfilled' ? 'success' : s === 'partial' ? 'warning' : s === 'returned' ? 'info' : 'attention'
}

export function customerName(order: Order, customers: { id: string; firstName: string; lastName: string }[]): string {
  const c = customers.find((x) => x.id === order.customerId)
  return c ? `${c.firstName} ${c.lastName}` : order.email
}

export function OrdersTable({ mode, statusFilter }: { mode: 'all' | 'drafts'; statusFilter?: 'open' | 'closed' | 'cancelled' }) {
  const orders = useStore((s) => s.orders)
  const customers = useStore((s) => s.customers)
  const allLocations = useStore((s) => s.locations)
  const locations = allLocations.filter((l) => l.active)
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm, confirmElement } = useConfirm()
  const [bulkFulfillOpen, setBulkFulfillOpen] = useState<string[] | null>(null)
  const [bulkLocation, setBulkLocation] = useState(locations[0]?.id ?? '')
  const [tagDrawerIds, setTagDrawerIds] = useState<string[] | null>(null)
  const [tagDraft, setTagDraft] = useState<string[]>([])

  const can = {
    edit: useCan('orders', 'edit'),
    refund: useCan('orders', 'refund'),
    cancel: useCan('orders', 'cancel'),
  }

  const rows = useMemo(() => {
    if (mode === 'drafts') return orders.filter((o) => o.isDraft)
    const live = orders.filter((o) => !o.isDraft)
    return statusFilter ? live.filter((o) => o.status === statusFilter) : live
  }, [orders, mode, statusFilter])

  const filters: FilterDef<Order>[] = [
    {
      key: 'payment', label: 'Payment status', type: 'multiselect',
      options: (Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((k) => ({ label: PAYMENT_STATUS_LABELS[k], value: k })),
      predicate: (o, v) => Array.isArray(v) && v.includes(o.paymentStatus),
    },
    {
      key: 'fulfillment', label: 'Fulfillment status', type: 'multiselect',
      options: (Object.keys(FULFILLMENT_STATUS_LABELS) as FulfillmentStatus[]).map((k) => ({ label: FULFILLMENT_STATUS_LABELS[k], value: k })),
      predicate: (o, v) => Array.isArray(v) && v.includes(o.fulfillmentStatus),
    },
    {
      key: 'date', label: 'Date', type: 'date-range',
      predicate: (o, v) => {
        const t = new Date(o.createdAt).getTime()
        const { from, to } = v as { from?: string; to?: string }
        if (from && t < new Date(from + 'T00:00:00').getTime()) return false
        if (to && t > new Date(to + 'T23:59:59').getTime()) return false
        return true
      },
    },
    {
      key: 'channel', label: 'Channel', type: 'select',
      options: [
        { label: 'Online Store', value: 'Online Store' },
        { label: 'Point of Sale', value: 'Point of Sale' },
      ],
      predicate: (o, v) => o.channel === v,
    },
    {
      key: 'total', label: 'Total', type: 'number-range',
      predicate: (o, v) => {
        const { min, max } = v as { min?: number; max?: number }
        if (min !== undefined && o.total < min) return false
        if (max !== undefined && o.total > max) return false
        return true
      },
    },
    {
      key: 'tag', label: 'Tag', type: 'select',
      optionsFrom: (rws) => [...new Set(rws.flatMap((o) => o.tags))].sort().map((t) => ({ label: t, value: t })),
      predicate: (o, v) => o.tags.includes(v as string),
    },
    {
      key: 'status', label: 'Order status', type: 'select',
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Archived', value: 'closed' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      predicate: (o, v) => o.status === v,
    },
  ]

  const fulfillBulk = async (ids: string[]) => {
    if (!bulkLocation) {
      toast('Add an active location first', { tone: 'warning' })
      return
    }
    const count = await bulkFulfill(ids, bulkLocation)
    toast(`${count} order${count === 1 ? '' : 's'} fulfilled`)
    setBulkFulfillOpen(null)
  }

  const bulkActions: BulkActionDef[] = mode === 'drafts'
    ? [
        ...(can.edit
          ? [
              {
                label: 'Mark as paid',
                icon: <DollarSign size={12} />,
                onRun: async (ids: string[]) => {
                  // drafts convert to real orders with pending payment, then get marked paid
                  for (const id of ids) {
                    const newId = await convertDraft(id)
                    await import('@/services/ordersService').then((svc) => svc.markAsPaid(newId))
                  }
                  toast(`${ids.length} draft${ids.length === 1 ? '' : 's'} converted & marked paid`)
                },
              },
              {
                label: 'Convert to order',
                onRun: async (ids: string[]) => {
                  for (const id of ids) await convertDraft(id)
                  toast(`${ids.length} draft${ids.length === 1 ? '' : 's'} converted to orders`)
                },
              },
            ]
          : []),
        {
          label: 'Delete drafts',
          destructive: true,
          onRun: (ids: string[]) =>
            confirm({
              title: `Delete ${ids.length} draft order${ids.length === 1 ? '' : 's'}?`,
              body: 'Draft orders are permanently deleted. This action cannot be undone.',
              confirmLabel: 'Delete drafts',
              destructive: true,
              onConfirm: async () => {
                await import('@/services/ordersService').then((svc) => svc.deleteDrafts(ids))
                toast('Draft orders deleted', { tone: 'critical' })
              },
            }),
        },
      ]
    : [
        ...(can.edit
          ? [
              {
                label: 'Mark as paid',
                icon: <DollarSign size={12} />,
                onRun: async (ids: string[]) => {
                  const n = await bulkMarkPaid(ids)
                  toast(`${n} order${n === 1 ? '' : 's'} marked as paid`)
                },
              },
              {
                label: 'Fulfill',
                icon: <CheckCheck size={12} />,
                onRun: (ids: string[]) => setBulkFulfillOpen(ids),
              },
              {
                label: 'Archive',
                icon: <Archive size={12} />,
                onRun: async (ids: string[]) => {
                  await bulkArchive(ids)
                  toast(`${ids.length} order${ids.length === 1 ? '' : 's'} archived`)
                },
              },
              {
                label: 'Add tags',
                icon: <TagIcon size={12} />,
                onRun: (ids: string[]) => {
                  setTagDraft([])
                  setTagDrawerIds(ids)
                },
              },
            ]
          : []),
        ...(can.cancel
          ? [
              {
                label: 'Cancel orders',
                icon: <Ban size={12} />,
                destructive: true,
                onRun: (ids: string[]) =>
                  confirm({
                    title: `Cancel ${ids.length} order${ids.length === 1 ? '' : 's'}?`,
                    body: 'Unfulfilled items will be restocked. Paid orders are refunded.',
                    confirmLabel: 'Cancel orders',
                    destructive: true,
                    onConfirm: async () => {
                      await bulkCancel(ids)
                      toast(`${ids.length} order${ids.length === 1 ? '' : 's'} cancelled`, { tone: 'critical' })
                    },
                  }),
              },
            ]
          : []),
      ]

  const columns: Column<Order>[] = [
    { key: 'order', header: 'Order', sortValue: (o) => o.name, render: (o) => <span className="font-medium">{o.name}</span> },
    { key: 'date', header: 'Date', sortValue: (o) => o.createdAt, render: (o) => <span className="text-text-muted">{formatDate(o.createdAt)}</span> },
    {
      key: 'customer', header: 'Customer', sortValue: (o) => customerName(o, customers),
      render: (o) => (
        <button
          className="text-left hover:text-accent hover:underline"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/customers/${o.customerId}`)
          }}
        >
          {customerName(o, customers)}
        </button>
      ),
    },
    { key: 'channel', header: 'Channel', sortValue: (o) => o.channel, render: (o) => <span className="text-text-muted">{o.channel}</span> },
    {
      key: 'payment', header: 'Payment', sortValue: (o) => o.paymentStatus,
      render: (o) => <Badge tone={paymentTone(o.paymentStatus)} dot>{PAYMENT_STATUS_LABELS[o.paymentStatus]}</Badge>,
    },
    {
      key: 'items', header: 'Items', align: 'right', sortValue: (o) => o.lineItems.reduce((s, li) => s + li.quantity, 0),
      render: (o) => (
        <span className="text-text-muted">
          {o.lineItems.reduce((s, li) => s + li.quantity, 0)} item{o.lineItems.length === 1 && o.lineItems[0]?.quantity === 1 ? '' : 's'}
        </span>
      ),
    },
    {
      key: 'total', header: 'Total', align: 'right', sortValue: (o) => o.total,
      render: (o) => <span className="font-medium">{formatMoney(o.total)}</span>,
    },
  ]

  return (
    <>
      {confirmElement}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(o) => o.id}
        searchKeys={(o) => [o.name, o.email, customerName(o, customers), ...o.tags, ...o.lineItems.map((li) => li.sku)]}
        searchPlaceholder={mode === 'drafts' ? 'Search drafts' : 'Search orders'}
        filters={filters}
        selectable
        bulkActions={bulkActions}
        initialSort={{ key: 'date', dir: 'desc' }}
        onRowClick={(o) => navigate(mode === 'drafts' ? `/draft-orders/${o.id}` : `/orders/${o.id}`)}
        hasAnyData={rows.length > 0}
        toolbarExtra={
          mode === 'all' ? (
            <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/orders/new')}>
              Create order
            </Button>
          ) : mode === 'drafts' ? (
            <Button
              size="sm"
              variant="primary"
              icon={<Plus size={13} />}
              onClick={() => {
                // quick draft: opens prompt-less flow → create with the newest customer, then edit
                const c = customers[0]
                if (!c) return
                void createDraft({ customerId: c.id, lineItems: [] })
                  .then(() => toast('Add items from the draft detail page', { tone: 'info' }))
                  .catch(() => toast('Create a draft from the detail page (items required)', { tone: 'warning' }))
              }}
            >
              Create draft
            </Button>
          ) : undefined
        }
        emptyNoData={
          mode === 'drafts' ? (
            <EmptyState heading="No draft orders" message="Draft orders let you record orders received outside the online store." />
          ) : (
            <EmptyState heading="No orders yet" message="Orders will appear here as customers check out." />
          )
        }
        rowActions={(o) => (
          <PortalMenu
            align="right"
            trigger={
              <button aria-label={`Actions for order ${o.name}`} className="rounded-md p-1.5 text-text-muted hover:bg-[#e3e3e3] hover:text-text">
                <MoreVertical size={15} />
              </button>
            }
            items={[
              { label: 'Open', onClick: () => navigate(mode === 'drafts' ? `/draft-orders/${o.id}` : `/orders/${o.id}`) },
              ...(mode === 'drafts'
                ? [{ label: 'Convert to order', onClick: () => void convertDraft(o.id).then(() => toast('Draft converted')) }]
                : can.edit
                  ? [
                      { label: 'Mark as paid', onClick: () => void bulkMarkPaid([o.id]).then((n) => n && toast('Marked as paid')), disabled: o.paymentStatus === 'paid' },
                      { label: 'Archive', onClick: () => void bulkArchive([o.id]).then(() => toast('Order archived')) },
                    ]
                  : []),
              ...(can.cancel && mode !== 'drafts' && o.status !== 'cancelled'
                ? [{
                    label: 'Cancel order', destructive: true, separatorBefore: true,
                    onClick: () =>
                      confirm({
                        title: `Cancel ${o.name}?`,
                        body: 'Unfulfilled items will be restocked.',
                        confirmLabel: 'Cancel order',
                        destructive: true,
                        onConfirm: async () => {
                          await bulkCancel([o.id])
                          toast('Order cancelled', { tone: 'critical' })
                        },
                      }),
                  }]
                : []),
            ]}
          />
        )}
      />

      {/* Bulk fulfill drawer */}
      <Modal
        open={!!bulkFulfillOpen}
        onClose={() => setBulkFulfillOpen(null)}
        title={`Fulfill ${bulkFulfillOpen?.length ?? 0} orders`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setBulkFulfillOpen(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => bulkFulfillOpen && void fulfillBulk(bulkFulfillOpen)}>
              Fulfill all
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[13px] text-text-muted">
            All unfulfilled items in the selected orders will be fulfilled from the location below. Customers are notified.
          </p>
          <Select
            label="Fulfill from location"
            value={bulkLocation}
            onChange={(e) => setBulkLocation(e.target.value)}
            options={locations.map((l) => ({ label: l.name, value: l.id }))}
          />
        </div>
      </Modal>

      {/* Bulk tag drawer */}
      <Drawer
        open={!!tagDrawerIds}
        onClose={() => setTagDrawerIds(null)}
        title="Add tags"
        subtitle={`${tagDrawerIds?.length ?? 0} orders selected`}
        footer={
          <>
            <Button onClick={() => setTagDrawerIds(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={tagDraft.length === 0}
              onClick={async () => {
                await bulkAddTags(tagDrawerIds!, tagDraft)
                toast(`Added ${tagDraft.length} tag${tagDraft.length === 1 ? '' : 's'}`)
                setTagDrawerIds(null)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <TagInput value={tagDraft} onChange={setTagDraft} suggestions={['priority', 'wholesale', 'gift', 'subscription', 'holiday-2025']} />
      </Drawer>
    </>
  )
}

export default function OrdersListPage() {
  const orders = useStore((s) => s.orders)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'all'

  const openCount = orders.filter((o) => !o.isDraft && o.status === 'open').length
  const archivedCount = orders.filter((o) => !o.isDraft && o.status === 'closed').length
  const cancelledCount = orders.filter((o) => !o.isDraft && o.status === 'cancelled').length

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={`${openCount} open order${openCount === 1 ? '' : 's'}`}
      />
      <div className="mb-3">
        <Tabs
          tabs={[
            { key: 'all', label: 'All', count: orders.filter((o) => !o.isDraft).length },
            { key: 'open', label: 'Open', count: openCount },
            { key: 'archived', label: 'Archived', count: archivedCount },
            { key: 'cancelled', label: 'Cancelled', count: cancelledCount },
          ]}
          value={tab}
          onChange={(k) => setParams(k === 'all' ? {} : { tab: k }, { replace: true })}
        />
      </div>
      {tab === 'all' ? (
        <OrdersTable mode="all" />
      ) : (
        <OrdersTable
          mode="all"
          statusFilter={tab === 'archived' ? 'closed' : (tab as 'open' | 'cancelled')}
          key={tab}
        />
      )}
    </div>
  )
}
