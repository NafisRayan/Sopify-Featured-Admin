import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { slugify } from '@/lib/validation'
import { delay } from '@/lib/delay'
import { IS_REMOTE, mutatePayload, syncMutation, gqlLiteral } from './api'
import type { Collection, CollectionRule, Product } from '@/types'

/** Evaluate smart-collection rules against a product (live, §15) */
export function matchesRules(product: Product, rules: CollectionRule[], match: 'all' | 'any'): boolean {
  if (rules.length === 0) return false
  const results = rules.map((r) => {
    const haystack =
      r.column === 'tag' ? product.tags.join('|')
      : r.column === 'title' ? product.title
      : r.column === 'product_type' ? product.productType
      : product.vendor
    const needle = r.condition.trim().toLowerCase()
    if (!needle) return false
    if (r.relation === 'equals')
      return haystack.toLowerCase() === needle || product.tags.some((t) => t.toLowerCase() === needle && r.column === 'tag')
    if (r.relation === 'contains') return haystack.toLowerCase().includes(needle)
    return haystack.toLowerCase().startsWith(needle)
  })
  return match === 'all' ? results.every(Boolean) : results.some(Boolean)
}

export function smartPreview(rules: CollectionRule[], match: 'all' | 'any'): Product[] {
  return getStore().products.filter((p) => matchesRules(p, rules, match))
}

export async function createCollection(input: Partial<Collection>): Promise<Collection> {
  await delay(350)
  const store = getStore()
  const id = uid('col')
  const title = input.title ?? 'Untitled collection'
  const collection: Collection = {
    id,
    title,
    descriptionHtml: input.descriptionHtml ?? '<p></p>',
    imageSrc: input.imageSrc,
    handle: input.handle || slugify(title) || id,
    type: input.type ?? 'manual',
    rules: input.rules ?? [],
    rulesMatch: input.rulesMatch ?? 'all',
    productIds: input.type === 'smart' ? smartPreview(input.rules ?? [], input.rulesMatch ?? 'all').map((p) => p.id) : input.productIds ?? [],
    status: input.status ?? 'active',
    seoTitle: input.seoTitle ?? title,
    seoDescription: input.seoDescription,
    publishedAt: (input.status ?? 'active') === 'active' ? new Date().toISOString() : undefined,
    createdAt: new Date().toISOString(),
  }
  if (store.collections.some((c) => c.handle === collection.handle)) {
    throw new Error('A collection with this handle already exists')
  }
  store.addCollection(collection)
  syncMutation(`mutation { collectionCreate(collection: ${gqlLiteral({ title: collection.title, descriptionHtml: collection.descriptionHtml, imageSrc: collection.imageSrc, handle: collection.handle, type: collection.type, rules: collection.rules, rulesMatch: collection.rulesMatch, productIds: collection.productIds, status: collection.status })}) { userErrors { message } } }`)
  // maintain product → collection links
  for (const pid of collection.productIds) {
    const p = store.products.find((x) => x.id === pid)
    if (p && !p.collectionIds.includes(id)) store.patchProduct(pid, { collectionIds: [...p.collectionIds, id] })
  }
  return collection
}

/** Collection field-selection for server mutation payloads. */
const COLLECTION_SELECTION = `id title descriptionHtml imageSrc handle type rules { column relation condition } rulesMatch productIds status seoTitle seoDescription publishedAt createdAt`

/**
 * Duplicate a collection (server-side when remote). The copy starts as a draft
 * with the same products and rules; the handle gets a unique `-copy` suffix.
 */
export async function duplicateCollection(id: string): Promise<Collection> {
  const store = getStore()
  const source = store.collections.find((c) => c.id === id)
  if (!source) throw new Error('Collection not found')
  await delay(350)
  const linkProducts = (col: Collection) => {
    for (const pid of col.productIds) {
      const p = store.products.find((x) => x.id === pid)
      if (p && !p.collectionIds.includes(col.id)) store.patchProduct(pid, { collectionIds: [...p.collectionIds, col.id] })
    }
  }
  if (IS_REMOTE) {
    const { entity } = await mutatePayload('collectionDuplicate', `collectionDuplicate(id: ${gqlLiteral(id)}) { collection { ${COLLECTION_SELECTION} } userErrors { field message } }`)
    if (!entity) throw new Error('Duplicate failed')
    const copy = entity as Collection
    store.addCollection(copy)
    linkProducts(copy)
    return copy
  }
  const base = slugify(source.handle || source.title) || 'collection'
  let handle = `${base}-copy`
  let n = 2
  while (store.collections.some((c) => c.handle === handle)) {
    handle = `${base}-copy-${n}`
    n += 1
  }
  const copy: Collection = {
    ...source,
    id: uid('col'),
    title: `${source.title} (copy)`,
    handle,
    status: 'draft',
    publishedAt: undefined,
    productIds: [...source.productIds],
    rules: source.rules.map((r) => ({ ...r })),
    createdAt: new Date().toISOString(),
  }
  store.addCollection(copy)
  linkProducts(copy)
  return copy
}

export async function updateCollection(id: string, patch: Partial<Collection>): Promise<void> {
  await delay(350)
  const store = getStore()
  const existing = store.collections.find((c) => c.id === id)
  if (!existing) throw new Error('Collection not found')

  const next: Collection = { ...existing, ...patch }
  if (next.type === 'smart') {
    next.productIds = smartPreview(next.rules, next.rulesMatch).map((p) => p.id)
  }

  // reconcile product.collectionIds with the collection's product list
  const added = next.productIds.filter((pid) => !existing.productIds.includes(pid))
  const removed = existing.productIds.filter((pid) => !next.productIds.includes(pid))
  store.patchCollection(id, next)
  syncMutation(`mutation { collectionUpdate(id: ${gqlLiteral(id)}, collection: ${gqlLiteral({ title: next.title, descriptionHtml: next.descriptionHtml, imageSrc: next.imageSrc, handle: next.handle, type: next.type, rules: next.rules, rulesMatch: next.rulesMatch, productIds: next.productIds, status: next.status, seoTitle: next.seoTitle, seoDescription: next.seoDescription })}) { userErrors { message } } }`)
  for (const pid of added) {
    const p = store.products.find((x) => x.id === pid)
    if (p && !p.collectionIds.includes(id)) store.patchProduct(pid, { collectionIds: [...p.collectionIds, id] })
  }
  for (const pid of removed) {
    const p = store.products.find((x) => x.id === pid)
    if (p) store.patchProduct(pid, { collectionIds: p.collectionIds.filter((cid) => cid !== id) })
  }
}

export async function deleteCollections(ids: string[]): Promise<void> {
  await delay(300)
  const store = getStore()
  for (const col of store.collections.filter((c) => ids.includes(c.id))) {
    for (const pid of col.productIds) {
      const p = store.products.find((x) => x.id === pid)
      if (p) store.patchProduct(pid, { collectionIds: p.collectionIds.filter((cid) => cid !== col.id) })
    }
  }
  store.removeCollections(ids)
  syncMutation(`mutation { collectionDelete(ids: ${gqlLiteral(ids)}) { userErrors { message } } }`)
}

export async function addProducts(id: string, productIds: string[]): Promise<void> {
  const col = getStore().collections.find((c) => c.id === id)
  if (!col) throw new Error('Collection not found')
  await updateCollection(id, { productIds: [...new Set([...col.productIds, ...productIds])] })
}

export async function removeProducts(id: string, productIds: string[]): Promise<void> {
  const col = getStore().collections.find((c) => c.id === id)
  if (!col) throw new Error('Collection not found')
  await updateCollection(id, { productIds: col.productIds.filter((pid) => !productIds.includes(pid)) })
}
