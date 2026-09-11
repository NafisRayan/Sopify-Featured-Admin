import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, Copy, FileUp, MoreVertical, PenLine, Plus, TagIcon, Trash2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { DataTable, type Column, type FilterDef, type BulkActionDef } from '@/components/data-table/DataTable'
import {
  Badge, Button, Drawer, EmptyState, PortalMenu, TagInput, useConfirm, useToast,
  type MenuItemDef,
} from '@/components/ui'
import { formatMoney, formatRelative } from '@/lib/format'
import { STATUS_LABELS } from '@/lib/constants'
import { variantAvailable } from '@/store/selectors'
import {
  addTags, deleteProducts, duplicateProduct, removeTags, setProductsStatus,
} from '@/services/productsService'
import { useCan } from '@/lib/permissions'
import { ProductImportModal } from './ProductImportModal'
import { ExportButton } from '@/components/ExportButton'
import type { Product, ProductStatus, SalesChannel } from '@/types'

function statusTone(status: ProductStatus) {
  return status === 'active' ? 'success' : status === 'draft' ? 'info' : 'neutral'
}

function InventoryBadge({ product }: { product: Product }) {
  if (!product.trackQuantity) return <Badge tone="info">Not tracked</Badge>
  const total = product.variants.reduce((s, v) => s + variantAvailable(v.id), 0)
  const hasVariants = product.variants.length > 1
  if (total === 0) return <Badge tone="critical">Out of stock{hasVariants ? ` · ${product.variants.length} variants` : ''}</Badge>
  if (total <= 10) return <Badge tone="warning">{total} in stock{hasVariants ? ` · ${product.variants.length} variants` : ''}</Badge>
  return (
    <span className="text-[13px]">
      {total} in stock{hasVariants ? ` · ${product.variants.length} variants` : ''}
    </span>
  )
}

interface TagDrawerState {
  ids: string[]
  mode: 'add' | 'remove'
}

export default function ProductsListPage() {
  const products = useStore((s) => s.products)
  const collections = useStore((s) => s.collections)
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm, confirmElement } = useConfirm()
  const [tagDrawer, setTagDrawer] = useState<TagDrawerState | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [tagDraft, setTagDraft] = useState<string[]>([])

  const can = {
    create: useCan('products', 'create'),
    edit: useCan('products', 'edit'),
    remove: useCan('products', 'delete'),
  }

  const collectionOptions = useMemo(
    () => collections.map((c) => ({ label: c.title, value: c.id })),
    [collections],
  )
  const tagOptions = useMemo(
    () => [...new Set(products.flatMap((p) => p.tags))].sort().map((t) => ({ label: t, value: t })),
    [products],
  )

  const filters: FilterDef<Product>[] = [
    {
      key: 'status', label: 'Status', type: 'select',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Draft', value: 'draft' },
        { label: 'Archived', value: 'archived' },
      ],
      predicate: (p, v) => p.status === v,
    },
    {
      key: 'inventory', label: 'Inventory', type: 'select',
      options: [
        { label: 'In stock', value: 'in' },
        { label: 'Low (≤10)', value: 'low' },
        { label: 'Out of stock', value: 'out' },
        { label: 'Not tracked', value: 'untracked' },
      ],
      predicate: (p, v) => {
        if (!p.trackQuantity) return v === 'untracked'
        const total = p.variants.reduce((s, x) => s + variantAvailable(x.id), 0)
        if (v === 'in') return total > 10
        if (v === 'low') return total > 0 && total <= 10
        if (v === 'out') return total === 0
        return false
      },
    },
    {
      key: 'vendor', label: 'Vendor', type: 'select',
      optionsFrom: (rows) => [...new Set(rows.map((p) => p.vendor))].sort().map((x) => ({ label: x, value: x })),
      predicate: (p, v) => p.vendor === v,
    },
    {
      key: 'type', label: 'Product type', type: 'select',
      optionsFrom: (rows) =>
        [...new Set(rows.map((p) => p.productType).filter(Boolean))].sort().map((x) => ({ label: x, value: x })),
      predicate: (p, v) => p.productType === v,
    },
    {
      key: 'collection', label: 'Collection', type: 'select',
      options: collectionOptions,
      predicate: (p, v) => p.collectionIds.includes(v as string),
    },
    {
      key: 'tag', label: 'Tag', type: 'select',
      optionsFrom: (rows) => [...new Set(rows.flatMap((p) => p.tags))].sort().map((t) => ({ label: t, value: t })),
      predicate: (p, v) => p.tags.includes(v as string),
    },
    {
      key: 'channel', label: 'Sales channel', type: 'select',
      options: [
        { label: 'Online Store', value: 'online_store' },
        { label: 'Point of Sale', value: 'point_of_sale' },
      ],
      predicate: (p, v) => p.channels.includes(v as SalesChannel),
    },
  ]

  const runBulkStatus = async (ids: string[], status: ProductStatus) => {
    await setProductsStatus(ids, status)
    toast(`${ids.length} product${ids.length === 1 ? '' : 's'} ${status === 'archived' ? 'archived' : `set to ${status}`}`)
  }

  const bulkActions: BulkActionDef[] = [
    ...(can.edit
      ? [
          { label: 'Set active', onRun: (ids: string[]) => void runBulkStatus(ids, 'active') },
          { label: 'Set draft', onRun: (ids: string[]) => void runBulkStatus(ids, 'draft') },
          { label: 'Archive', onRun: (ids: string[]) => void runBulkStatus(ids, 'archived') },
          {
            label: 'Add tags',
            onRun: (ids: string[]) => {
              setTagDraft([])
              setTagDrawer({ ids, mode: 'add' })
            },
          },
          {
            label: 'Remove tags',
            onRun: (ids: string[]) => {
              setTagDraft([])
              setTagDrawer({ ids, mode: 'remove' })
            },
          },
        ]
      : []),
    ...(can.remove
      ? [
          {
            label: 'Delete',
            destructive: true,
            onRun: (ids: string[]) =>
              confirm({
                title: `Delete ${ids.length} product${ids.length === 1 ? '' : 's'}?`,
                body: 'This also removes the products from their collections. This action cannot be undone.',
                confirmLabel: 'Delete',
                destructive: true,
                onConfirm: async () => {
                  await deleteProducts(ids)
                  toast(`${ids.length} product${ids.length === 1 ? '' : 's'} deleted`, { tone: 'critical' })
                },
              }),
          },
        ]
      : []),
  ]

  const columns: Column<Product>[] = [
    {
      key: 'title',
      header: 'Product',
      sortValue: (p) => p.title.toLowerCase(),
      render: (p) => (
        <div className="flex items-center gap-3">
          {p.media[0] ? (
            <img src={p.media[0].src} alt="" className="h-8 w-8 shrink-0 rounded-md border border-border object-cover" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-[#f1f1f1] text-[10px] text-text-subdued">
              IMG
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{p.title || 'Untitled'}</p>
            <p className="truncate text-xs text-text-muted">
              {p.variants.length > 1 ? `${p.variants.length} variants` : p.variants[0]?.sku || '—'}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <Badge tone={statusTone(p.status)} dot>{STATUS_LABELS[p.status]}</Badge> },
    { key: 'inventory', header: 'Inventory', render: (p) => <InventoryBadge product={p} /> },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sortValue: (p) => p.variants[0]?.price ?? 0,
      render: (p) => {
        const v = p.variants[0]
        if (!v) return '—'
        const range = p.variants.length > 1 && p.variants.some((x) => x.price !== v.price)
        if (range) {
          const prices = p.variants.map((x) => x.price)
          return <span>{formatMoney(Math.min(...prices))} – {formatMoney(Math.max(...prices))}</span>
        }
        return (
          <span>
            {p.variants[0]!.compareAtPrice && (
              <span className="mr-1.5 text-xs text-text-muted line-through">{formatMoney(p.variants[0]!.compareAtPrice!)}</span>
            )}
            {formatMoney(v.price)}
          </span>
        )
      },
    },
    { key: 'type', header: 'Type', sortValue: (p) => p.productType, render: (p) => p.productType || '—' },
    { key: 'vendor', header: 'Vendor', sortValue: (p) => p.vendor, render: (p) => p.vendor },
    {
      key: 'channel',
      header: 'Channels',
      render: (p) => (
        <span className="flex gap-1">
          {p.channels.map((c) => (
            <Badge key={c} tone="info">{c === 'online_store' ? 'Online' : 'POS'}</Badge>
          ))}
        </span>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      sortValue: (p) => p.updatedAt,
      render: (p) => <span className="text-text-muted">{formatRelative(p.updatedAt)}</span>,
    },
  ]

  const rowActions = (p: Product): React.ReactNode => (
    <PortalMenu
      align="right"
      trigger={
        <button
          aria-label={`Actions for ${p.title || 'product'}`}
          className="rounded-md p-1.5 text-text-muted hover:bg-[#e3e3e3] hover:text-text"
        >
          <MoreVertical size={15} />
        </button>
      }
      items={[
        { label: 'Edit', icon: <PenLine size={13} />, onClick: () => navigate(`/products/${p.id}/edit`), disabled: !can.edit },
        { label: 'View', onClick: () => navigate(`/products/${p.id}`) },
        { label: 'Duplicate', icon: <Copy size={13} />, onClick: () => void duplicateProduct(p.id).then(() => toast('Product duplicated')), disabled: !can.create },
        p.status === 'archived'
          ? { label: 'Unarchive', onClick: () => void runBulkStatus([p.id], 'active'), disabled: !can.edit }
          : { label: 'Archive', icon: <Archive size={13} />, onClick: () => void runBulkStatus([p.id], 'archived'), disabled: !can.edit },
        {
          label: 'Delete', icon: <Trash2 size={13} />, destructive: true, separatorBefore: true,
          disabled: !can.remove,
          onClick: () =>
            confirm({
              title: `Delete ${p.title || 'this product'}?`,
              body: 'The product will be removed from all collections. This action cannot be undone.',
              confirmLabel: 'Delete',
              destructive: true,
              onConfirm: async () => {
                await deleteProducts([p.id])
                toast('Product deleted', { tone: 'critical' })
              },
            }),
        } as MenuItemDef,
      ]}
    />
  )

  return (
    <div>
      {confirmElement}
      <ProductImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => {/* store already updated */}} />
      {tagDrawer && (
        <Drawer
          open
          onClose={() => setTagDrawer(null)}
          title={`${tagDrawer.mode === 'add' ? 'Add' : 'Remove'} tags`}
          subtitle={`${tagDrawer.ids.length} product${tagDrawer.ids.length === 1 ? '' : 's'} selected`}
          footer={
            <>
              <Button onClick={() => setTagDrawer(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (tagDraft.length === 0) return
                  if (tagDrawer.mode === 'add') await addTags(tagDrawer.ids, tagDraft)
                  else await removeTags(tagDrawer.ids, tagDraft)
                  toast(
                    `${tagDrawer.mode === 'add' ? 'Added' : 'Removed'} ${tagDraft.length} tag${tagDraft.length === 1 ? '' : 's'} on ${tagDrawer.ids.length} product${tagDrawer.ids.length === 1 ? '' : 's'}`,
                  )
                  setTagDrawer(null)
                }}
                disabled={tagDraft.length === 0}
              >
                Save
              </Button>
            </>
          }
        >
          {tagDrawer.mode === 'add' ? (
            <div className="space-y-3">
              <TagInput value={tagDraft} onChange={setTagDraft} suggestions={tagOptions.map((t) => t.value)} />
              <p className="text-xs text-text-muted">Press Enter or comma to add a tag.</p>
            </div>
          ) : (
            <RemoveTagsPicker products={products.filter((p) => tagDrawer.ids.includes(p.id))} onConfirm={(tags) => { setTagDraft(tags) }} tagDraft={tagDraft} />
          )}
        </Drawer>
      )}

      <DataTable
        rows={products}
        columns={columns}
        rowKey={(p) => p.id}
        searchKeys={(p) => [p.title, p.vendor, p.productType, p.seo.handle, ...p.tags, ...p.variants.map((v) => v.sku)]}
        searchPlaceholder="Search products"
        filters={filters}
        selectable
        bulkActions={bulkActions}
        rowActions={rowActions}
        initialSort={{ key: 'updated', dir: 'desc' }}
        onRowClick={(p) => navigate(`/products/${p.id}`)}
        hasAnyData={products.length > 0}
        toolbarExtra={
          <>
            <Button size="sm" icon={<FileUp size={13} />} onClick={() => setImportOpen(true)} disabled={!can.create}>
              Import
            </Button>
            <ExportButton
              filename="products"
              rows={products}
              columns={[
                { header: 'Title', value: (p) => p.title },
                { header: 'Status', value: (p) => p.status },
                { header: 'Vendor', value: (p) => p.vendor },
                { header: 'Type', value: (p) => p.productType },
                { header: 'Variants', value: (p) => p.variants.length },
                { header: 'Tags', value: (p) => p.tags.join('|') },
              ]}
            />
            <Button
              size="sm"
              variant="primary"
              icon={<Plus size={13} />}
              onClick={() => navigate('/products/new')}
              disabled={!can.create}
            >
              Add product
            </Button>
          </>
        }
        emptyNoData={
          <EmptyState
            heading="No products yet"
            message="Add your first product so customers can start shopping."
            primaryAction={can.create ? { label: 'Add product', onClick: () => navigate('/products/new') } : undefined}
          />
        }
      />
    </div>
  )
}

/** Pick which existing tags to remove from the selection */
function RemoveTagsPicker({
  products,
  tagDraft,
  onConfirm,
}: {
  products: Product[]
  tagDraft: string[]
  onConfirm: (tags: string[]) => void
}) {
  const available = [...new Set(products.flatMap((p) => p.tags))].sort()
  return (
    <div className="space-y-2">
      {available.length === 0 && <p className="text-[13px] text-text-muted">The selected products have no tags.</p>}
      {available.map((tag) => {
        const checked = tagDraft.includes(tag)
        return (
          <label key={tag} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] hover:bg-surface-hover">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#303030]"
              checked={checked}
              onChange={() => onConfirm(checked ? tagDraft.filter((t) => t !== tag) : [...tagDraft, tag])}
            />
            <TagIcon size={13} className="text-text-muted" />
            {tag}
          </label>
        )
      })}
    </div>
  )
}

// rendered at page level via fragment swap
