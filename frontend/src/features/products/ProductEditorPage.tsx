import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Archive, ArrowDown, ArrowUp, Bold, Copy, Eye, Italic, Link2, Plus,
  Star, Trash2, TriangleAlert, ImageIcon, Upload,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import {
  Badge, Button, Card, CardHeader, CardSection, Drawer, EmptyState, Input, Modal,
  PageHeader, Radio, Select, TagInput, Textarea, Toggle, useConfirm, useToast,
} from '@/components/ui'
import { formatMoney, formatWeight } from '@/lib/format'
import { slugify } from '@/lib/validation'
import { variantAvailable } from '@/store/selectors'
import {
  addMedia, createProduct, deleteProducts, getProduct, removeMedia, reorderMedia,
  setFeaturedMedia, updateProduct, updateVariants, duplicateProduct,
} from '@/services/productsService'
import { adjustInventory } from '@/services/inventoryService'
import { useCan } from '@/lib/permissions'
import type { Product, ProductOption, ProductVariant, ProductStatus, SalesChannel } from '@/types'

// ── Rich-lite description editor (contentEditable, spec §12) ───────────────

function DescriptionEditor({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const cmd = (command: string, value?: string) => {
    ref.current?.focus()
    document.execCommand(command, false, value)
    onChange(ref.current?.innerHTML ?? '')
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[#c9c9c9] focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
      <div className="flex gap-0.5 border-b border-border bg-[#fafafa] px-1.5 py-1">
        <button type="button" aria-label="Bold" onClick={() => cmd('bold')} className="rounded p-1.5 hover:bg-surface-hover"><Bold size={13} /></button>
        <button type="button" aria-label="Italic" onClick={() => cmd('italic')} className="rounded p-1.5 hover:bg-surface-hover"><Italic size={13} /></button>
        <button type="button" aria-label="Bulleted list" onClick={() => cmd('insertUnorderedList')} className="rounded p-1.5 text-[13px] hover:bg-surface-hover">• List</button>
        <button type="button" aria-label="Numbered list" onClick={() => cmd('insertOrderedList')} className="rounded p-1.5 text-[13px] hover:bg-surface-hover">1. List</button>
        <button
          type="button"
          aria-label="Insert link"
          onClick={() => {
            const url = window.prompt('Link URL')
            if (url) cmd('createLink', url)
          }}
          className="rounded p-1.5 hover:bg-surface-hover"
        >
          <Link2 size={13} />
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onBlur={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="min-h-28 px-3 py-2 text-[13px] outline-none [&_a]:text-accent [&_a]:underline [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-[13px] [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

// ── Variants editor ────────────────────────────────────────────────────────

function OptionEditor({
  options,
  onChange,
}: {
  options: ProductOption[]
  onChange: (o: ProductOption[]) => void
}) {
  return (
    <div className="space-y-3">
      {options.map((opt, i) => (
        <div key={i} className="rounded-lg border border-border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              label="Option name"
              value={opt.name}
              onChange={(e) => onChange(options.map((o, ix) => (ix === i ? { ...o, name: e.target.value } : o)))}
              placeholder="e.g. Color"
            />
            <Input
              label={`Values (comma-separated)`}
              value={opt.values.join(', ')}
              onChange={(e) =>
                onChange(
                  options.map((o, ix) =>
                    ix === i
                      ? { ...o, values: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) }
                      : o,
                  ),
                )
              }
              placeholder="e.g. Black, White"
            />
          </div>
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="tertiary" icon={<Trash2 size={12} />} onClick={() => onChange(options.filter((_, ix) => ix !== i))}>
              Remove option
            </Button>
          </div>
        </div>
      ))}
      {options.length < 3 && (
        <Button
          size="sm"
          icon={<Plus size={13} />}
          onClick={() => onChange([...options, { name: `Option ${options.length + 1}`, values: [] }])}
        >
          Add option {options.length > 0 && `(like Size)`}
        </Button>
      )}
    </div>
  )
}

function VariantRow({
  variant,
  onChange,
  onOpenInventory,
}: {
  variant: ProductVariant
  onChange: (patch: Partial<ProductVariant>) => void
  onOpenInventory: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr>
        <td className="px-3 py-2">
          <button className="flex items-center gap-2 text-left" onClick={() => setOpen(true)} title="Edit variant">
            {variant.title || <span className="text-text-muted">Default Title</span>}
          </button>
        </td>
        <td className="px-3 py-2">
          <input
            value={variant.sku}
            onChange={(e) => onChange({ sku: e.target.value })}
            placeholder="SKU"
            aria-label="SKU"
            className="w-28 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] hover:border-[#c9c9c9] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            step="0.01"
            min="0"
            value={variant.price}
            onChange={(e) => onChange({ price: Number(e.target.value) })}
            aria-label="Price"
            className="w-20 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-[13px] hover:border-[#c9c9c9] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </td>
        <td className="px-3 py-2">
          <button onClick={onOpenInventory} className="text-[13px] text-accent hover:underline">
            {variantAvailable(variant.id)}
          </button>
        </td>
        <td className="px-3 py-2 text-right">
          <Toggle checked={variant.available} onChange={(v) => onChange({ available: v })} />
        </td>
      </tr>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Edit ${variant.title || 'variant'}`}
        footer={
          <Button variant="primary" onClick={() => setOpen(false)}>Done</Button>
        }
      >
        <div className="space-y-3">
          <Input label="SKU" value={variant.sku} onChange={(e) => onChange({ sku: e.target.value })} />
          <Input label="Barcode" value={variant.barcode ?? ''} onChange={(e) => onChange({ barcode: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Price" type="number" step="0.01" min="0" prefix="$" value={variant.price} onChange={(e) => onChange({ price: Number(e.target.value) })} />
            <Input label="Compare-at price" type="number" step="0.01" min="0" prefix="$" value={variant.compareAtPrice ?? ''} onChange={(e) => onChange({ compareAtPrice: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cost per item" type="number" step="0.01" min="0" prefix="$" value={variant.costPerItem ?? ''} onChange={(e) => onChange({ costPerItem: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <Input label="Weight (grams)" type="number" min="0" value={variant.weightGrams ?? ''} onChange={(e) => onChange({ weightGrams: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
          <Toggle label="Available for sale" checked={variant.available} onChange={(v) => onChange({ available: v })} />
          <Button size="sm" onClick={onOpenInventory}>
            Adjust inventory ({variantAvailable(variant.id)} available)
          </Button>
        </div>
      </Drawer>
    </>
  )
}

/** Per-location inventory adjuster drawer */
function InventoryDrawer({
  variantId,
  title,
  onClose,
  onSaved,
}: {
  variantId: string
  title: string
  onClose: () => void
  onSaved: () => void
}) {
  const allLocations = useStore((s) => s.locations)
  const locations = allLocations.filter((l) => l.active)
  const levels = useStore((s) => s.inventoryLevels)
  const { toast } = useToast()
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      locations.map((l) => [l.id, String(levels.find((x) => x.variantId === variantId && x.locationId === l.id)?.available ?? 0)]),
    ),
  )
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      for (const l of locations) {
        const next = Number(drafts[l.id] ?? '0')
        const current = levels.find((x) => x.variantId === variantId && x.locationId === l.id)?.available ?? 0
        if (next !== current && !Number.isNaN(next)) {
          await adjustInventory(variantId, l.id, next, 'Manual adjustment from product editor')
        }
      }
      toast('Inventory adjusted')
      onSaved()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to adjust inventory', { tone: 'critical' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Adjust inventory"
      subtitle={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        {locations.map((l) => (
          <Input
            key={l.id}
            label={`${l.name} · ${l.city}`}
            type="number"
            min="0"
            value={drafts[l.id] ?? '0'}
            onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
          />
        ))}
        <p className="text-xs text-text-muted">Committed and unavailable units are managed by orders.</p>
      </div>
    </Drawer>
  )
}

// ── Media manager ──────────────────────────────────────────────────────────

function MediaManager({ media, onChange }: { media: Product['media']; onChange: () => void }) {
  const productId = media[0]?.productId
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [uploading, setUploading] = useState(false)
  const uploadResult = async (file: File) => {
    setUploading(true)
    try {
      const { uploadMedia } = await import('@/services/api')
      const { url: uploadedUrl } = await uploadMedia(file)
      await addMedia(productId!, uploadedUrl, file.name)
      onChange()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e)
    } finally {
      setUploading(false)
    }
  }

  const move = async (id: string, dir: -1 | 1) => {
    const ids = media.map((m) => m.id)
    const i = ids.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
    await reorderMedia(media[0]!.productId, ids)
    onChange()
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {media.map((m, i) => (
          <div key={m.id} className="group relative">
            <img src={m.src} alt={m.alt} className="h-20 w-20 rounded-lg border border-border object-cover" />
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white"><Star size={9} className="inline" /> Featured</span>
            )}
            <div className="absolute inset-x-0 bottom-0 hidden justify-center gap-0.5 rounded-b-lg bg-black/60 p-0.5 group-hover:flex">
              <button aria-label="Move up" disabled={i === 0} onClick={() => void move(m.id, -1)} className="rounded p-1 text-white disabled:opacity-30 hover:bg-white/20"><ArrowUp size={11} /></button>
              <button aria-label="Remove image" onClick={() => void removeMedia(m.productId, m.id).then(onChange)} className="rounded p-1 text-white hover:bg-white/20"><Trash2 size={11} /></button>
              <button aria-label="Move down" disabled={i === media.length - 1} onClick={() => void move(m.id, 1)} className="rounded p-1 text-white disabled:opacity-30 hover:bg-white/20"><ArrowDown size={11} /></button>
            </div>
          </div>
        ))}
        <button
          onClick={() => setAdding(true)}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#c9c9c9] text-xs text-text-muted hover:border-accent hover:text-accent"
        >
          <ImageIcon size={16} />
          Add via URL
        </button>
        <label
          className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#c9c9c9] text-xs text-text-muted hover:border-accent hover:text-accent"
        >
          <Upload size={16} />
          {uploading ? 'Uploading…' : 'Upload file'}
          <input
            type="file"
            accept="image/*,video/mp4,video/webm,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f && productId) void uploadResult(f)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add image by URL"
        size="sm"
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!url.trim()}
              onClick={async () => {
                await addMedia(productId!, url.trim(), '')
                setUrl('')
                setAdding(false)
                onChange()
              }}
            >
              Add
            </Button>
          </>
        }
      >
        <Input label="Image URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" helpText="Tip: use /images/products/classic-cotton-t-shirt.svg from the demo library." />
        <div className="mt-3 flex flex-wrap gap-2">
          {['/images/products/classic-cotton-t-shirt.svg', '/images/products/canvas-backpack.svg', '/images/products/ceramic-coffee-mug.svg', '/images/products/everyday-hoodie.svg'].map((src) => (
            <button key={src} onClick={() => setUrl(src)} className="text-xs text-accent hover:underline">
              {src.split('/').pop()}
            </button>
          ))}
        </div>
      </Modal>
      {media.length > 1 && (
        <Button
          size="sm"
          variant="tertiary"
          className="mt-2"
          onClick={() => void setFeaturedMedia(media[0]!.productId, media[1]!.id).then(onChange)}
        >
          Make second image featured
        </Button>
      )}
    </div>
  )
}

// ── Editor page ────────────────────────────────────────────────────────────

export default function ProductEditorPage({ createMode = false }: { createMode?: boolean }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm, confirmElement } = useConfirm()
  const collections = useStore((s) => s.collections)
  const storeProduct = useStore((s) => s.products.find((p) => p.id === (createMode ? undefined : id)))

  const [draft, setDraft] = useState<Product | null>(null)
  const [loading, setLoading] = useState(!createMode)
  const [saving, setSaving] = useState(false)
  const [variantInvDrawer, setVariantInvDrawer] = useState<ProductVariant | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const canRemove = useCan('products', 'delete')
  const canEdit = useCan('products', 'edit')

  useEffect(() => {
    if (createMode) {
      // local draft that only becomes real on Save
      setDraft({
        id: 'new',
        title: '',
        descriptionHtml: '<p></p>',
        vendor: 'Northstar Goods',
        productType: '',
        category: undefined,
        status: 'draft',
        tags: [],
        collectionIds: [],
        channels: ['online_store'],
        options: [],
        variants: [
          {
            id: 'new_v1',
            productId: 'new',
            title: 'Default Title',
            sku: '',
            price: 0,
            optionValues: {},
            available: true,
          },
        ],
        media: [],
        seo: { title: '', description: '', handle: '' },
        requiresShipping: true,
        trackQuantity: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setLoading(false)
    } else if (id) {
      void getProduct(id).then((p) => {
        setDraft(p ?? null)
        setLoading(false)
      })
    }
  }, [createMode, id])

  // warn on unsaved navigation (spec §42)
  const dirtyRef = useRef(false)
  const setDraftDirty = useCallback((updater: (prev: Product) => Product) => {
    dirtyRef.current = true
    setDraft((prev) => (prev ? updater(prev) : prev))
  }, [])
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const patch = useCallback((p: Partial<Product>) => setDraftDirty((prev) => ({ ...prev, ...p })), [setDraftDirty])

  const patchVariant = useCallback(
    (variantId: string, vp: Partial<ProductVariant>) =>
      setDraftDirty((prev) => ({
        ...prev,
        variants: prev.variants.map((v) => (v.id === variantId ? { ...v, ...vp } : v)),
      })),
    [setDraftDirty],
  )

  const margin = useMemo(() => {
    const v = draft?.variants[0]
    if (!v || !v.price || v.costPerItem === undefined) return undefined
    return ((v.price - v.costPerItem) / v.price) * 100
  }, [draft])

  const handleSave = async (): Promise<string | undefined> => {
    if (!draft) return
    if (!draft.title.trim()) {
      toast('Give the product a title before saving', { tone: 'critical' })
      return
    }
    setSaving(true)
    try {
      if (createMode) {
        const created = await createProduct({
          ...draft,
          title: draft.title.trim(),
          seo: { ...draft.seo, handle: draft.seo.handle || slugify(draft.title) },
        })
        dirtyRef.current = false
        toast('Product created')
        navigate(`/products/${created.id}/edit`, { replace: true })
        return created.id
      }
      await updateProduct(draft.id, { ...draft, title: draft.title.trim() })
      await updateVariants(draft.id, draft.variants)
      dirtyRef.current = false
      toast('Product saved')
      return draft.id
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save product', { tone: 'critical' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-40 animate-pulse rounded bg-[#ededed]" />
        <div className="h-64 animate-pulse rounded-xl bg-[#ededed]" />
      </div>
    )
  }

  if (!draft || (!createMode && !storeProduct)) {
    return (
      <div>
        <PageHeader title="Product not found" backTo="/products" backLabel="Products" />
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState heading="Product not found" message="It may have been deleted." primaryAction={{ label: 'Back to products', onClick: () => navigate('/products') }} />
        </div>
      </div>
    )
  }

  return (
    <div className="pb-24">
      {confirmElement}
      <PageHeader
        title={createMode ? 'Add product' : 'Edit product'}
        backTo={`/products/${draft.id}`}
        backLabel={draft.title || 'Product'}
        primaryAction={
          <span className="flex items-center gap-2">
            {!createMode && (
              <Button icon={<Eye size={13} />} onClick={() => setPreviewOpen(true)}>
                Preview
              </Button>
            )}
            <Button variant="primary" loading={saving} onClick={() => void handleSave()} disabled={!canEdit}>
              Save
            </Button>
          </span>
        }
        secondaryActions={
          !createMode ? (
            <>
              <Button
                icon={<Copy size={13} />}
                onClick={async () => {
                  const copy = await duplicateProduct(draft.id)
                  if (copy) {
                    dirtyRef.current = false
                    toast('Product duplicated')
                    navigate(`/products/${copy.id}/edit`)
                  }
                }}
              >
                Duplicate
              </Button>
              <Button
                icon={<Archive size={13} />}
                onClick={async () => {
                  const nextStatus: ProductStatus = draft.status === 'archived' ? 'draft' : 'archived'
                  await updateProduct(draft.id, { status: nextStatus })
                  setDraft((prev) => (prev ? { ...prev, status: nextStatus } : prev))
                  dirtyRef.current = false
                  toast(nextStatus === 'archived' ? 'Product archived' : 'Product unarchived')
                }}
              >
                {draft.status === 'archived' ? 'Unarchive' : 'Archive'}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardSection title="Title">
              <Input
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="e.g. Classic Cotton T-Shirt"
                aria-label="Product title"
              />
            </CardSection>
            <CardSection title="Description">
              <DescriptionEditor html={draft.descriptionHtml} onChange={(html) => patch({ descriptionHtml: html })} />
            </CardSection>
            <CardSection title="Media" subtitle="First image is the featured image.">
              <MediaManager
                media={draft.media}
                onChange={() => {
                  // re-read from store after media ops
                  setDraft((prev) => {
                    const fresh = useStore.getState().products.find((p) => p.id === prev!.id)
                    return fresh ? { ...fresh } : prev
                  })
                }}
              />
            </CardSection>
          </Card>

          {/* Pricing */}
          <Card padding={false}>
            <CardHeader title="Pricing" />
            <CardSection>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="Price"
                  type="number"
                  step="0.01"
                  min="0"
                  prefix="$"
                  value={draft.variants[0]?.price ?? 0}
                  onChange={(e) => patchVariant(draft.variants[0]!.id, { price: Number(e.target.value) })}
                />
                <Input
                  label="Compare-at price"
                  type="number"
                  step="0.01"
                  min="0"
                  prefix="$"
                  value={draft.variants[0]?.compareAtPrice ?? ''}
                  onChange={(e) =>
                    patchVariant(draft.variants[0]!.id, {
                      compareAtPrice: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  helpText="Shown struck-through"
                />
                <Input
                  label="Cost per item"
                  type="number"
                  step="0.01"
                  min="0"
                  prefix="$"
                  value={draft.variants[0]?.costPerItem ?? ''}
                  onChange={(e) =>
                    patchVariant(draft.variants[0]!.id, {
                      costPerItem: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  helpText={margin !== undefined ? `Margin ${margin.toFixed(1)}%` : 'Used to calculate margin'}
                />
              </div>
            </CardSection>
          </Card>

          {/* Inventory */}
          <Card padding={false}>
            <CardHeader title="Inventory" />
            <CardSection>
              <div className="space-y-3">
                <Toggle
                  label="Track quantity"
                  checked={draft.trackQuantity}
                  onChange={(v) => patch({ trackQuantity: v })}
                  helpText="When off, the product is always sellable."
                />
                {draft.trackQuantity && draft.variants.length === 1 && (
                  <Input
                    label="SKU"
                    value={draft.variants[0]?.sku ?? ''}
                    onChange={(e) => patchVariant(draft.variants[0]!.id, { sku: e.target.value })}
                    helpText="Stockkeeping unit"
                  />
                )}
                {draft.trackQuantity && draft.variants.length === 1 && (
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="text-text-muted">Available:</span>
                    <button className="font-medium text-accent hover:underline" onClick={() => setVariantInvDrawer(draft.variants[0]!)}>
                      {variantAvailable(draft.id === 'new' ? '' : draft.variants[0]!.id)} units
                    </button>
                    <span className="text-xs text-text-muted">across all locations</span>
                  </div>
                )}
                <Input
                  label="Barcode (ISBN, UPC, GTIN)"
                  value={draft.variants[0]?.barcode ?? ''}
                  onChange={(e) => patchVariant(draft.variants[0]!.id, { barcode: e.target.value })}
                />
              </div>
            </CardSection>
          </Card>

          {/* Shipping */}
          <Card padding={false}>
            <CardHeader title="Shipping" />
            <CardSection>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Weight"
                  type="number"
                  min="0"
                  value={draft.weightGrams ?? ''}
                  onChange={(e) => patch({ weightGrams: e.target.value === '' ? undefined : Number(e.target.value) })}
                  helpText="Used to calculate shipping rates"
                />
                <div>
                  <span className="mb-1 block text-xs font-medium">Physical product</span>
                  <Toggle checked={draft.requiresShipping} onChange={(v) => patch({ requiresShipping: v })} label="" />
                </div>
              </div>
            </CardSection>
          </Card>

          {/* Variants */}
          <Card padding={false}>
            <CardHeader
              title="Variants"
              subtitle={
                draft.options.length > 0
                  ? `${draft.variants.length} variants from ${draft.options.length} options`
                  : 'Add options like size or color to generate variants'
              }
            />
            <CardSection>
              <OptionEditor
                options={draft.options}
                onChange={(options) => {
                  // apply immediately to the draft; regenerate combos preserving data
                  const active = options.filter((o) => o.values.length > 0)
                  if (active.length === 0) {
                    patch({ options: [] })
                    return
                  }
                  let combos: Record<string, string>[] = [{}]
                  for (const opt of active) {
                    combos = combos.flatMap((c) => opt.values.map((v) => ({ ...c, [opt.name]: v })))
                  }
                  const existing = new Map(draft.variants.map((v) => [Object.values(v.optionValues).join(' / '), v]))
                  const variants = combos.map((ov, i) => {
                    const key = Object.values(ov).join(' / ')
                    const prior = existing.get(key)
                    return {
                      id: prior?.id ?? `${draft.id}_v${i + 1}`,
                      productId: draft.id,
                      title: key,
                      sku: prior?.sku ?? '',
                      barcode: prior?.barcode,
                      price: prior?.price ?? draft.variants[0]?.price ?? 0,
                      compareAtPrice: prior?.compareAtPrice,
                      costPerItem: prior?.costPerItem,
                      optionValues: ov,
                      weightGrams: prior?.weightGrams ?? draft.weightGrams,
                      imageId: prior?.imageId,
                      available: prior?.available ?? true,
                    }
                  })
                  patch({ options: active, variants })
                }}
              />
              {draft.variants.length > 0 && (
                <div className="mt-4 overflow-x-auto scroll-thin">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-text-muted">
                        <th className="px-3 py-2 font-medium">Variant</th>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 text-right font-medium">Price</th>
                        <th className="px-3 py-2 text-right font-medium">Available</th>
                        <th className="px-3 py-2 text-right font-medium">On sale</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {draft.variants.map((v) => (
                        <VariantRow
                          key={v.id}
                          variant={v}
                          onChange={(vp) => patchVariant(v.id, vp)}
                          onOpenInventory={() => setVariantInvDrawer(v)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-xs text-text-muted">
                Changes to options are applied when you save. New variants start with the default price.
              </p>
            </CardSection>
          </Card>

          {/* Search engine listing */}
          <Card padding={false}>
            <CardHeader title="Search engine listing" subtitle="How this product appears in search results" />
            <CardSection>
              <div className="space-y-3">
                <Input
                  label="Page title"
                  value={draft.seo.title}
                  onChange={(e) => patch({ seo: { ...draft.seo, title: e.target.value } })}
                  helpText={`${draft.seo.title.length}/60 characters`}
                />
                <Input
                  label="URL handle"
                  value={draft.seo.handle}
                  onChange={(e) => patch({ seo: { ...draft.seo, handle: slugify(e.target.value) } })}
                  helpText={`northstargoods.com/products/${draft.seo.handle || 'handle'}`}
                />
                <Textarea
                  label="Meta description"
                  rows={3}
                  value={draft.seo.description}
                  onChange={(e) => patch({ seo: { ...draft.seo, description: e.target.value } })}
                  helpText={`${draft.seo.description.length}/160 characters`}
                />
              </div>
            </CardSection>
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-4">
          <Card padding={false}>
            <CardHeader title="Status" />
            <CardSection>
              <div className="space-y-2">
                {(['draft', 'active', 'archived'] as ProductStatus[]).map((s) => (
                  <Radio
                    key={s}
                    name="status"
                    label={s === 'active' ? 'Active — visible in the store' : s === 'draft' ? 'Draft — hidden from customers' : 'Archived'}
                    checked={draft.status === s}
                    onChange={() => patch({ status: s })}
                  />
                ))}
              </div>
            </CardSection>
          </Card>

          <Card padding={false}>
            <CardHeader title="Product organization" />
            <CardSection>
              <div className="space-y-3">
                <Input label="Vendor" value={draft.vendor} onChange={(e) => patch({ vendor: e.target.value })} />
                <Input label="Product type" value={draft.productType} onChange={(e) => patch({ productType: e.target.value })} placeholder="e.g. Apparel" />
                <Select
                  label="Category"
                  value={draft.category ?? ''}
                  onChange={(e) => patch({ category: e.target.value || undefined })}
                  options={[
                    { label: 'Uncategorized', value: '' },
                    ...[...new Set(useStore.getState().products.map((p) => p.category).filter(Boolean))].map((c) => ({ label: c!, value: c! })),
                  ]}
                />
                <Select
                  label="Collections"
                  multiple={false}
                  value=""
                  onChange={(e) => {
                    const cid = e.target.value
                    if (cid && !draft.collectionIds.includes(cid)) patch({ collectionIds: [...draft.collectionIds, cid] })
                  }}
                  options={[{ label: 'Add to collection…', value: '' }, ...collections.map((c) => ({ label: c.title, value: c.id }))]}
                />
                {draft.collectionIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {draft.collectionIds.map((cid) => {
                      const c = collections.find((x) => x.id === cid)
                      return (
                        <button
                          key={cid}
                          className="inline-flex items-center gap-1 rounded-md bg-[#e3e3e3] px-1.5 py-0.5 text-xs hover:bg-[#d0d0d0]"
                          onClick={() => patch({ collectionIds: draft.collectionIds.filter((x) => x !== cid) })}
                          aria-label={`Remove from ${c?.title}`}
                        >
                          {c?.title ?? cid} ×
                        </button>
                      )
                    })}
                  </div>
                )}
                <div>
                  <span className="mb-1 block text-xs font-medium">Tags</span>
                  <TagInput
                    value={draft.tags}
                    onChange={(tags) => patch({ tags })}
                    suggestions={[...new Set(useStore.getState().products.flatMap((p) => p.tags))]}
                  />
                </div>
              </div>
            </CardSection>
          </Card>

          <Card padding={false}>
            <CardHeader title="Sales channels" />
            <CardSection>
              <div className="space-y-2">
                {(
                  [
                    { value: 'online_store', label: 'Online Store' },
                    { value: 'point_of_sale', label: 'Point of Sale' },
                  ] as { value: SalesChannel; label: string }[]
                ).map((c) => (
                  <Toggle
                    key={c.value}
                    label={c.label}
                    checked={draft.channels.includes(c.value)}
                    onChange={(on) => patch({ channels: on ? [...draft.channels, c.value] : draft.channels.filter((x) => x !== c.value) })}
                  />
                ))}
              </div>
            </CardSection>
          </Card>

          {!createMode && canRemove && (
            <Card>
              <Button
                variant="destructive"
                icon={<Trash2 size={13} />}
                className="w-full"
                onClick={() =>
                  confirm({
                    title: `Delete ${draft.title || 'this product'}?`,
                    body: 'The product will be removed from all collections. This action cannot be undone.',
                    confirmLabel: 'Delete',
                    destructive: true,
                    onConfirm: async () => {
                      await deleteProducts([draft.id])
                      toast('Product deleted', { tone: 'critical' })
                      navigate('/products')
                    },
                  })
                }
              >
                Delete product
              </Button>
            </Card>
          )}

          {draft.trackQuantity && draft.status === 'active' && draft.variants.length === 1 && variantAvailable(draft.variants[0]!.id) <= 8 && (
            <Card className="border-[#ecd489] bg-warning-surface-soft">
              <div className="flex items-start gap-2 text-[13px] text-warning">
                <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                Low stock — {variantAvailable(draft.variants[0]!.id)} units remaining.
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Sticky save bar (Shopify pattern) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-3 py-2.5 md:px-6">
          <span className="flex items-center gap-2 text-xs text-text-muted">
            {draft.status === 'active' ? (
              <Badge tone="success" dot>Active</Badge>
            ) : draft.status === 'draft' ? (
              <Badge tone="info" dot>Draft</Badge>
            ) : (
              <Badge tone="neutral" dot>Archived</Badge>
            )}
            {createMode ? 'New product — not saved yet' : 'Changes save to this demo store'}
          </span>
          <span className="flex items-center gap-2">
            <Button onClick={() => navigate(createMode ? '/products' : `/products/${draft.id}`)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void handleSave()} disabled={!canEdit}>
              Save
            </Button>
          </span>
        </div>
      </div>

      {/* Variant inventory drawer */}
      {variantInvDrawer && draft.id !== 'new' && (
        <InventoryDrawer
          variantId={variantInvDrawer.id}
          title={`${draft.title} · ${variantInvDrawer.title}`}
          onClose={() => setVariantInvDrawer(null)}
          onSaved={() => {
            setDraft((prev) => {
              const fresh = useStore.getState().products.find((p) => p.id === prev!.id)
              return fresh ? { ...fresh } : prev
            })
          }}
        />
      )}

      {/* Preview modal (§12) */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Product page preview" size="lg">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            {draft.media[0] ? (
              <img src={draft.media[0].src} alt="" className="w-full rounded-xl border border-border object-cover" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-border bg-[#f1f1f1] text-text-muted">
                No image
              </div>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-subdued">{draft.vendor}</p>
            <h3 className="mt-1 text-lg font-semibold">{draft.title || 'Untitled'}</h3>
            <p className="mt-1 text-[15px]">
              {formatMoney(draft.variants[0]?.price ?? 0)}
              {draft.variants[0]?.compareAtPrice && (
                <span className="ml-2 text-text-muted line-through">{formatMoney(draft.variants[0].compareAtPrice)}</span>
              )}
            </p>
            <p className="mt-1 text-xs text-text-muted">{formatWeight(draft.weightGrams)} · SKU {draft.variants[0]?.sku || '—'}</p>
            <div className="mt-3" dangerouslySetInnerHTML={{ __html: draft.descriptionHtml }} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
