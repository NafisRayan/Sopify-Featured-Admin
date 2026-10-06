import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, MoreVertical, Plus, Trash2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { DataTable, type Column, type FilterDef } from '@/components/data-table/DataTable'
import {
  Badge, Button, Drawer, EmptyState, Input, PortalMenu, Select, Textarea, useConfirm, useToast,
} from '@/components/ui'
import { formatDate } from '@/lib/format'
import { createCollection, deleteCollections, duplicateCollection } from '@/services/collectionsService'
import { useCan } from '@/lib/permissions'
import type { Collection } from '@/types'

export default function CollectionsListPage() {
  const collections = useStore((s) => s.collections)
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm, confirmElement } = useConfirm()
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', type: 'manual' as 'manual' | 'smart' })
  const canEdit = useCan('products', 'edit')

  const filters: FilterDef<Collection>[] = [
    {
      key: 'type', label: 'Type', type: 'select',
      options: [
        { label: 'Manual', value: 'manual' },
        { label: 'Automated (smart)', value: 'smart' },
      ],
      predicate: (c, v) => c.type === v,
    },
    {
      key: 'status', label: 'Status', type: 'select',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Draft', value: 'draft' },
      ],
      predicate: (c, v) => c.status === v,
    },
  ]

  const columns: Column<Collection>[] = [
    {
      key: 'title', header: 'Collection', sortValue: (c) => c.title.toLowerCase(),
      render: (c) => (
        <span className="flex items-center gap-3">
          {c.imageSrc ? (
            <img src={c.imageSrc} alt="" className="h-8 w-8 shrink-0 rounded-md border border-border object-cover" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#f1f1f1]">
              <Layers size={14} className="text-text-muted" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium">{c.title}</span>
            <span className="block truncate text-xs text-text-muted">/{c.handle}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'type', header: 'Type', sortValue: (c) => c.type,
      render: (c) => <Badge tone={c.type === 'smart' ? 'highlight' : 'info'}>{c.type === 'smart' ? 'Automated' : 'Manual'}</Badge>,
    },
    {
      key: 'products', header: 'Products', align: 'right', sortValue: (c) => c.productIds.length,
      render: (c) => c.productIds.length,
    },
    {
      key: 'status', header: 'Status', sortValue: (c) => c.status,
      render: (c) => <Badge tone={c.status === 'active' ? 'success' : 'neutral'} dot>{c.status === 'active' ? 'Active' : 'Draft'}</Badge>,
    },
    {
      key: 'published', header: 'Published', sortValue: (c) => c.publishedAt ?? '',
      render: (c) => <span className="text-text-muted">{c.publishedAt ? formatDate(c.publishedAt) : '—'}</span>,
    },
  ]

  const submitCreate = async () => {
    if (!form.title.trim()) {
      toast('Give the collection a title', { tone: 'critical' })
      return
    }
    try {
      const created = await createCollection({
        title: form.title.trim(),
        descriptionHtml: `<p>${form.description}</p>`,
        type: form.type,
      })
      toast('Collection created')
      setCreateOpen(false)
      setForm({ title: '', description: '', type: 'manual' })
      navigate(`/collections/${created.id}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create', { tone: 'critical' })
    }
  }

  const totalProducts = useMemo(() => collections.reduce((s, c) => s + c.productIds.length, 0), [collections])

  return (
    <div>
      {confirmElement}
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create collection"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void submitCreate()}>Create</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Summer Essentials" />
          <Select
            label="Collection type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as 'manual' | 'smart' })}
            options={[
              { label: 'Manual — pick products yourself', value: 'manual' },
              { label: 'Automated — define rules that match products', value: 'smart' },
            ]}
          />
          <Textarea label="Description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </Drawer>

      <DataTable
        rows={collections}
        columns={columns}
        rowKey={(c) => c.id}
        searchKeys={(c) => [c.title, c.handle, c.descriptionHtml]}
        searchPlaceholder="Search collections"
        filters={filters}
        initialSort={{ key: 'title', dir: 'asc' }}
        onRowClick={(c) => navigate(`/collections/${c.id}`)}
        hasAnyData={collections.length > 0}
        toolbarExtra={
          <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)} disabled={!canEdit}>
            Create collection
          </Button>
        }
        emptyNoData={
          <EmptyState
            icon={Layers}
            heading="No collections yet"
            message="Collections group products for your storefront menus and merchandising."
            primaryAction={canEdit ? { label: 'Create collection', onClick: () => setCreateOpen(true) } : undefined}
          />
        }
        rowActions={(c) => (
          <PortalMenu
            align="right"
            trigger={
              <button aria-label={`Actions for ${c.title}`} className="rounded-md p-1.5 text-text-muted hover:bg-[#e3e3e3] hover:text-text">
                <MoreVertical size={15} />
              </button>
            }
            items={[
              { label: 'Open', onClick: () => navigate(`/collections/${c.id}`) },
              ...(canEdit
                ? [{
                    label: 'Duplicate',
                    onClick: () =>
                      void duplicateCollection(c.id)
                        .then((copy) => {
                          toast('Collection duplicated')
                          navigate(`/collections/${copy.id}`)
                        })
                        .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Failed to duplicate', { tone: 'critical' })),
                  }]
                : []),
              ...(canEdit
                ? [{
                    label: 'Delete', icon: <Trash2 size={13} />, destructive: true,
                    onClick: () =>
                      confirm({
                        title: `Delete ${c.title}?`,
                        body: `${c.productIds.length} products will be removed from this collection. Products themselves are not deleted.`,
                        confirmLabel: 'Delete',
                        destructive: true,
                        onConfirm: async () => {
                          await deleteCollections([c.id])
                          toast('Collection deleted', { tone: 'critical' })
                        },
                      }),
                  }]
                : []),
            ]}
          />
        )}
      />
      <p className="mt-2 text-xs text-text-muted">
        {collections.length} collections holding {totalProducts} product placements in total.
      </p>
    </div>
  )
}
