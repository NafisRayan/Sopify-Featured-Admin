import { useState } from 'react'
import { Plus, Building2, AlertCircle } from 'lucide-react'
import { Modal, Input, Select, Button, useToast } from '@/components/ui'
import { gqlRequest, setActiveStoreId } from '@/services/api'

function toSlug(str: string): string {
  return str.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
}
interface StoreCreateModalProps {
  open: boolean
  onClose: () => void
  onCreated: (store: { id: string; name: string; slug: string }) => void
}

export function StoreCreateModal({ open, onClose, onCreated }: StoreCreateModalProps) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNameChange = (val: string) => {
    setName(val)
    setSlug(toSlug(val))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)

    try {
      const data = await gqlRequest<{
        storeCreate: {
          store: { id: string; name: string; slug: string } | null
          userErrors: Array<{ message: string }>
        }
      }>(`
        mutation CreateStore($input: StoreCreateInput!) {
          storeCreate(input: $input) {
            store {
              id
              name
              slug
              currency
            }
            userErrors {
              message
            }
          }
        }
      `, {
        input: {
          name: name.trim(),
          slug: slug.trim() || toSlug(name),
          currency,
        },
      })

      if (data?.storeCreate?.store) {
        const newStore = data.storeCreate.store
        setActiveStoreId(newStore.id)
        toast(`Store "${newStore.name}" created! Switched to new store.`, { tone: 'info' })
        onCreated(newStore)
        onClose()
      } else if (data?.storeCreate?.userErrors?.length) {
        setError(data.storeCreate.userErrors[0].message)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create new store"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={13} />}
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
          >
            {loading ? 'Creating...' : 'Create store'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-text mb-1">Store Name</label>
          <Input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Apex Outdoor Co"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-text mb-1">Store URL Handle (Slug)</label>
          <div className="flex items-center gap-1.5">
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="e.g. apex-outdoor"
            />
            <span className="text-xs text-text-muted font-mono whitespace-nowrap">.platform.com</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-text mb-1">Store Currency</label>
          <Select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={[
              { label: 'USD ($) - United States Dollar', value: 'USD' },
              { label: 'CAD ($) - Canadian Dollar', value: 'CAD' },
              { label: 'EUR (€) - Euro', value: 'EUR' },
              { label: 'GBP (£) - British Pound', value: 'GBP' },
              { label: 'AUD ($) - Australian Dollar', value: 'AUD' },
            ]}
          />
        </div>

        <div className="p-3 bg-surface-hover rounded-xl border border-border text-xs text-text-muted flex items-start gap-2.5">
          <Building2 size={16} className="text-accent shrink-0 mt-0.5" />
          <span>
            Every store operates under its own isolated multi-tenant partition with separate catalogs,
            orders, themes, and customer sessions.
          </span>
        </div>
      </form>
    </Modal>
  )
}
