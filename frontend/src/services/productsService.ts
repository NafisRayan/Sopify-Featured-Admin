import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { slugify } from '@/lib/validation'
import { delay } from '@/lib/delay'
import { syncMutation, gqlLiteral, mutatePayload, IS_REMOTE } from './api'
import type { Product, ProductVariant, ProductMedia, ProductStatus, ProductOption, SalesChannel } from '@/types'

/**
 * Products service — the only way UI mutates products (spec §39).
 * Read model comes from useStore subscriptions; writes go through here.
 */

export async function getProduct(id: string): Promise<Product | undefined> {
  await delay(150)
  return getStore().products.find((p) => p.id === id)
}

export async function createProduct(input?: Partial<Product>): Promise<Product> {
  if (IS_REMOTE) {
    const v = input?.variants?.[0]
    const { entity } = await mutatePayload('productCreate', `productCreate(product: { title: ${gqlLiteral(input?.title ?? '')}, vendor: ${gqlLiteral(input?.vendor ?? 'Northstar Goods')}, productType: ${gqlLiteral(input?.productType ?? '')}, status: ${gqlLiteral(input?.status ?? 'draft')}, tags: ${gqlLiteral(input?.tags ?? [])}, variants: [{ title: ${gqlLiteral(v?.title ?? 'Default Title')}, sku: ${gqlLiteral(v?.sku ?? '')}, price: ${v?.price ?? 0}, available: true }] }) { product { id title descriptionHtml vendor productType category status tags collectionIds channels options { name values } variants { id productId title sku barcode price compareAtPrice costPerItem optionValues weightGrams imageId available } media { id productId type src alt } seo { title description handle } weightGrams requiresShipping trackQuantity createdAt updatedAt totalInventory } userErrors { field message } }`)
    getStore().addProduct(entity as Product)
    return entity as Product
  }
  await delay(350)
  const now = new Date().toISOString()
  const id = uid('p')
  const title = input?.title ?? ''
  const product: Product = {
    id,
    title,
    descriptionHtml: input?.descriptionHtml ?? '<p></p>',
    vendor: input?.vendor ?? 'Northstar Goods',
    productType: input?.productType ?? '',
    category: input?.category,
    status: input?.status ?? 'draft',
    tags: input?.tags ?? [],
    collectionIds: input?.collectionIds ?? [],
    channels: input?.channels ?? ['online_store'],
    options: input?.options ?? [],
    variants:
      input?.variants ?? [
        {
          id: `${id}_v1`,
          productId: id,
          title: 'Default Title',
          sku: '',
          price: 0,
          optionValues: {},
          available: true,
        },
      ],
    media: input?.media ?? [],
    seo: input?.seo ?? { title, description: '', handle: slugify(title) || id },
    requiresShipping: true,
    trackQuantity: true,
    createdAt: now,
    updatedAt: now,
  }
  getStore().addProduct(product)
  return product
}

export async function updateProduct(id: string, patch: Partial<Product>): Promise<void> {
  await delay(350)
  getStore().patchProduct(id, { ...patch, updatedAt: new Date().toISOString() })
  const variants = patch.variants ?? undefined
  const { variants: _v, media: _m, ...rest } = patch as any
  const input: Record<string, unknown> = { ...rest }
  if (variants !== undefined) input.variants = variants.map((v: any) => ({ ...v, optionValues: v.optionValues ?? {} }))
  if (patch.media !== undefined) input.media = patch.media
  if (patch.options !== undefined) input.options = patch.options
  if (patch.seo !== undefined) input.seo = patch.seo
  syncMutation(`mutation { productUpdate(id: ${gqlLiteral(id)}, product: ${gqlLiteral(input)}) { userErrors { message } } }`)
}

/** Serialize the full product for productUpdate (mirrors updateProduct's input shape). */
function productInput(p: Product): Record<string, unknown> {
  return {
    title: p.title,
    descriptionHtml: p.descriptionHtml,
    vendor: p.vendor,
    productType: p.productType,
    category: p.category,
    status: p.status,
    tags: p.tags,
    collectionIds: p.collectionIds,
    channels: p.channels,
    options: p.options,
    variants: p.variants.map((v) => ({ ...v, optionValues: v.optionValues ?? {} })),
    media: p.media,
    seo: p.seo,
    weightGrams: p.weightGrams,
    requiresShipping: p.requiresShipping,
    trackQuantity: p.trackQuantity,
  }
}

/** Re-sync a product's full state after a local patch (optimistic UI first). */
function syncProductFull(id: string): void {
  const p = getStore().products.find((x) => x.id === id)
  if (!p) return
  syncMutation(`mutation { productUpdate(id: ${gqlLiteral(id)}, product: ${gqlLiteral(productInput(p))}) { userErrors { message } } }`)
}

/** Removing products also removes them from collections (relationship integrity, spec §36) */
export async function deleteProducts(ids: string[]): Promise<void> {
  await delay(400)
  const store = getStore()
  for (const col of store.collections) {
    if (col.productIds.some((pid) => ids.includes(pid))) {
      store.patchCollection(col.id, { productIds: col.productIds.filter((pid) => !ids.includes(pid)) })
    }
  }
  store.removeProducts(ids)
  syncMutation(`mutation { productDelete(ids: ${gqlLiteral(ids)}) { userErrors { message } } }`)
}

export async function duplicateProduct(id: string): Promise<Product | undefined> {
  await delay(350)
  if (IS_REMOTE) {
    const { entity } = await mutatePayload('productDuplicate', `productDuplicate(id: ${gqlLiteral(id)}) { product { id title descriptionHtml vendor productType category status tags collectionIds channels options { name values } variants { id productId title sku barcode price compareAtPrice costPerItem optionValues weightGrams imageId available } media { id productId type src alt } seo { title description handle } weightGrams requiresShipping trackQuantity createdAt updatedAt totalInventory } userErrors { field message } }`)
    if (entity) getStore().addProduct(entity as Product)
    return entity as Product | undefined
  }
  const source = getStore().products.find((p) => p.id === id)
  if (!source) return undefined
  const now = new Date().toISOString()
  const newId = uid('p')
  const copy: Product = {
    ...structuredClone(source),
    id: newId,
    title: `${source.title} (copy)`,
    status: 'draft',
    seo: { ...source.seo, handle: slugify(`${source.seo.handle}-copy`) },
    createdAt: now,
    updatedAt: now,
  }
  copy.variants = copy.variants.map((v, i) => ({ ...v, id: `${newId}_v${i + 1}`, productId: newId }))
  copy.media = copy.media.map((m, i) => ({ ...m, id: `${newId}_m${i + 1}`, productId: newId }))
  copy.collectionIds = [] // copies start unassigned, like Shopify
  getStore().addProduct(copy)
  return copy
}

export async function setProductsStatus(ids: string[], status: ProductStatus): Promise<void> {
  await delay(300)
  const store = getStore()
  for (const id of ids) store.patchProduct(id, { status, updatedAt: new Date().toISOString() })
  syncMutation(`mutation { productStatusSet(ids: ${gqlLiteral(ids)}, status: ${gqlLiteral(status)}) { userErrors { message } } }`)
}

export async function addTags(ids: string[], tags: string[]): Promise<void> {
  await delay(250)
  const store = getStore()
  for (const id of ids) {
    const p = store.products.find((x) => x.id === id)
    if (!p) continue
    const merged = [...new Set([...p.tags, ...tags])]
    store.patchProduct(id, { tags: merged, updatedAt: new Date().toISOString() })
  }
  syncMutation(`mutation { productAddTags(ids: ${gqlLiteral(ids)}, tags: ${gqlLiteral(tags)}) { userErrors { message } } }`)
}

export async function removeTags(ids: string[], tags: string[]): Promise<void> {
  await delay(250)
  const store = getStore()
  for (const id of ids) {
    const p = store.products.find((x) => x.id === id)
    if (!p) continue
    store.patchProduct(id, {
      tags: p.tags.filter((t) => !tags.includes(t)),
      updatedAt: new Date().toISOString(),
    })
  }
  syncMutation(`mutation { productRemoveTags(ids: ${gqlLiteral(ids)}, tags: ${gqlLiteral(tags)}) { userErrors { message } } }`)
}

// ─── Media ────────────────────────────────────────────────────────────────

export async function addMedia(productId: string, src: string, alt: string): Promise<void> {
  await delay(300)
  const store = getStore()
  const p = store.products.find((x) => x.id === productId)
  if (!p) return
  const media: ProductMedia = { id: uid('m'), productId, type: 'image', src, alt }
  store.patchProduct(productId, {
    media: [...p.media, media],
    updatedAt: new Date().toISOString(),
  })
  syncProductFull(productId)
}

export async function removeMedia(productId: string, mediaId: string): Promise<void> {
  await delay(250)
  const store = getStore()
  const p = store.products.find((x) => x.id === productId)
  if (!p) return
  store.patchProduct(productId, {
    media: p.media.filter((m) => m.id !== mediaId),
    variants: p.variants.map((v) => (v.imageId === mediaId ? { ...v, imageId: undefined } : v)),
    updatedAt: new Date().toISOString(),
  })
  syncProductFull(productId)
}

export async function reorderMedia(productId: string, orderedIds: string[]): Promise<void> {
  await delay(200)
  const store = getStore()
  const p = store.products.find((x) => x.id === productId)
  if (!p) return
  const map = new Map(p.media.map((m) => [m.id, m]))
  const ordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as ProductMedia[]
  const rest = p.media.filter((m) => !orderedIds.includes(m.id))
  store.patchProduct(productId, { media: [...ordered, ...rest], updatedAt: new Date().toISOString() })
  syncMutation(`mutation { productMediaReorder(id: ${gqlLiteral(productId)}, mediaIds: ${gqlLiteral(orderedIds)}) { userErrors { message } } }`)
}

export async function setFeaturedMedia(productId: string, mediaId: string): Promise<void> {
  await reorderMedia(productId, [mediaId, ...getStore().products.find((p) => p.id === productId)?.media.filter((m) => m.id !== mediaId).map((m) => m.id) ?? []])
}

// ─── Variants & options ───────────────────────────────────────────────────

export async function updateVariant(productId: string, variantId: string, patch: Partial<ProductVariant>): Promise<void> {
  await delay(250)
  const store = getStore()
  const p = store.products.find((x) => x.id === productId)
  if (!p) return
  store.patchProduct(productId, {
    variants: p.variants.map((v) => (v.id === variantId ? { ...v, ...patch } : v)),
    updatedAt: new Date().toISOString(),
  })
  syncProductFull(productId)
}

/** Update all variants at once (editor save) */
export async function updateVariants(productId: string, variants: ProductVariant[]): Promise<void> {
  await delay(250)
  getStore().patchProduct(productId, { variants, updatedAt: new Date().toISOString() })
  syncProductFull(productId)
}

/**
 * Set product options and regenerate variants, preserving data for combos
 * that already existed (SKU, price, etc.) — Shopify-like behavior (§14).
 */
export async function setOptions(productId: string, options: ProductOption[]): Promise<void> {
  await delay(300)
  const store = getStore()
  const p = store.products.find((x) => x.id === productId)
  if (!p) return

  const active = options.filter((o) => o.values.length > 0)
  if (active.length === 0) {
    // collapse to a single default variant, preserving first variant's data
    const keep = p.variants[0]
    const variant: ProductVariant = {
      id: `${productId}_v1`,
      productId,
      title: 'Default Title',
      sku: keep?.sku ?? '',
      barcode: keep?.barcode,
      price: keep?.price ?? 0,
      compareAtPrice: keep?.compareAtPrice,
      costPerItem: keep?.costPerItem,
      optionValues: {},
      weightGrams: keep?.weightGrams,
      imageId: keep?.imageId,
      available: true,
    }
    store.patchProduct(productId, { options: [], variants: [variant], updatedAt: new Date().toISOString() })
    syncProductFull(productId)
    return
  }

  // cartesian product of option values
  let combos: Record<string, string>[] = [{}]
  for (const opt of active) {
    combos = combos.flatMap((c) => opt.values.map((v) => ({ ...c, [opt.name]: v })))
  }

  const existing = new Map(p.variants.map((v) => [Object.values(v.optionValues).join(' / '), v]))
  const variants: ProductVariant[] = combos.map((ov, i) => {
    const key = Object.values(ov).join(' / ')
    const prior = existing.get(key)
    return {
      id: prior?.id ?? `${productId}_v${i + 1}`,
      productId,
      title: key,
      sku: prior?.sku ?? '',
      barcode: prior?.barcode,
      price: prior?.price ?? p.variants[0]?.price ?? 0,
      compareAtPrice: prior?.compareAtPrice,
      costPerItem: prior?.costPerItem,
      optionValues: ov,
      weightGrams: prior?.weightGrams,
      imageId: prior?.imageId,
      available: prior?.available ?? true,
    }
  })
  store.patchProduct(productId, { options: active, variants, updatedAt: new Date().toISOString() })
  syncProductFull(productId)
}

export async function setChannels(productId: string, channels: SalesChannel[]): Promise<void> {
  await delay(200)
  getStore().patchProduct(productId, { channels, updatedAt: new Date().toISOString() })
  syncProductFull(productId)
}

/** Next sequential SKU suggestion for a product's new variant */
let skuSeq = 0
export function suggestSku(productTitle: string): string {
  const root = productTitle.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || 'SKU'
  skuSeq += 1
  return `${root}-${Date.now().toString(36)}${skuSeq.toString(36)}`
}
