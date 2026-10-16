import { useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Badge, Button, EmptyState, PageHeader, useToast } from '@/components/ui'
import { DataTable, type Column } from '@/components/data-table/DataTable'
import { formatMoney, formatRelative, initials } from '@/lib/format'
import { createOrderFromAbandoned, sendRecoveryEmail } from '@/services/ordersService'
import type { AbandonedCheckout } from '@/types'

const recoveryTone = {
  not_recovered: 'warning',
  email_sent: 'info',
  recovered: 'success',
} as const

const recoveryLabel = {
  not_recovered: 'Not recovered',
  email_sent: 'Recovery email sent',
  recovered: 'Recovered',
}

export default function AbandonedCheckoutsPage() {
  const abandoned = useStore((s) => s.abandoned)
  const customers = useStore((s) => s.customers)
  const navigate = useNavigate()
  const { toast } = useToast()

  const nameOf = (c: AbandonedCheckout) => {
    const cust = customers.find((x) => x.id === c.customerId)
    return cust ? `${cust.firstName} ${cust.lastName}` : c.email
  }

  const columns: Column<AbandonedCheckout>[] = [
    {
      key: 'customer', header: 'Customer', sortValue: (c) => nameOf(c),
      render: (c) => {
        const cust = customers.find((x) => x.id === c.customerId)
        return (
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e3e3e3] text-[10px] font-semibold">
              {initials(nameOf(c))}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{nameOf(c)}</span>
              <span className="block truncate text-xs text-text-muted">{c.email}</span>
            </span>
            {cust && (
              <button
                className="ml-1 text-xs text-accent hover:underline"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`/customers/${cust.id}`)
                }}
              >
                View
              </button>
            )}
          </span>
        )
      },
    },
    { key: 'date', header: 'Abandoned', sortValue: (c) => c.createdAt, render: (c) => <span className="text-text-muted">{formatRelative(c.createdAt)}</span> },
    {
      key: 'items', header: 'Items', sortValue: (c) => c.lineItems.reduce((s, li) => s + li.quantity, 0),
      render: (c) => (
        <span className="text-text-muted">
          {c.lineItems.reduce((s, li) => s + li.quantity, 0)} item{c.lineItems.length === 1 && c.lineItems[0]?.quantity === 1 ? '' : 's'}
        </span>
      ),
    },
    { key: 'total', header: 'Total', align: 'right', sortValue: (c) => c.total, render: (c) => <span className="font-medium">{formatMoney(c.total)}</span> },
    {
      key: 'status', header: 'Recovery', sortValue: (c) => c.recoveryStatus,
      render: (c) => <Badge tone={recoveryTone[c.recoveryStatus]} dot>{recoveryLabel[c.recoveryStatus]}</Badge>,
    },
  ]

  return (
    <div>
      <PageHeader title="Abandoned checkouts" subtitle={`${abandoned.filter((a) => a.recoveryStatus !== 'recovered').length} awaiting recovery`} />
      <DataTable
        rows={abandoned}
        columns={columns}
        rowKey={(c) => c.id}
        searchKeys={(c) => [c.email, nameOf(c)]}
        searchPlaceholder="Search abandoned checkouts"
        initialSort={{ key: 'date', dir: 'desc' }}
        hasAnyData={abandoned.length > 0}
        emptyNoData={
          <EmptyState
            heading="No abandoned checkouts"
            message="When a shopper leaves items in the cart without checking out, they appear here."
          />
        }
        rowActions={(c) => (
          <span className="flex justify-end gap-1.5">
            {c.recoveryStatus !== 'recovered' && (
              <>
                <Button
                  size="sm"
                  icon={<Mail size={12} />}
                  onClick={() =>
                    void sendRecoveryEmail(c.id).then((link) => {
                      toast(`Recovery email sent with link: ${link}`, { tone: 'info' })
                    })
                  }
                >
                  Send recovery email
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    void createOrderFromAbandoned(c.id).then((id) => {
                      if (id) {
                        toast('Recovered — order created')
                        navigate(`/orders/${id}`)
                      }
                    })
                  }
                >
                  Create order
                </Button>
              </>
            )}
          </span>
        )}
      />
    </div>
  )
}
