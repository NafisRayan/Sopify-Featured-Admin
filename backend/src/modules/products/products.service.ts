import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { parseJson, toJson, toConnection, filterByQuery, encodeCursor } from '../../common/helpers'
import { mapProduct, productTotalInventory, mapCollection } from '../../common/mappers'
import { uid, slugify, roundMoney } from '../../common/ids'

function matchesRules(
  product: { tags: string[]; title: string; productType: string; vendor: string },
  rules: { column: string; relation: string; condition: string }[],
  match: 'all' | 'any',
): boolean {
  if (rules.length === 0) return false
  const results = rules.map((r) => {
    const haystack =
      r.column === 'tag' ? product.tags.join('|')
      : r.column === 'title' ? product.title
      : r.column === 'product_type' ? product.productType
      : product.vendor
    const needle = r.condition.trim().toLowerCase()
    if (!needle) return false
    if (r.relation === 'equals') return haystack.toLowerCase() === needle || (r.column === 'tag' && product.tags.some((t) => t.toLowerCase() === needle))
    if (r.relation === 'contains') return haystack.toLowerCase().includes(needle)
    return haystack.toLowerCase().startsWith(needle)
  })
  return match === 'all' ? results.every(Boolean) : results.some(Boolean)
}

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  private skuKey(sku: string): string {
    return sku.trim().toLowerCase()
  }

  private async assertUniqueSkus(variants: { sku?: string }[], excludeProductId?: string): Promise<void> {
    const incoming = variants.map((v) => this.skuKey(v.sku ?? '')).filter(Boolean)
    const dupes = incoming.filter((sku, i) => incoming.indexOf(sku) !== i)
    if (dupes.length) throw new Error(`SKU "${dupes[0]}" is used more than once in this product`)
    const products = await this.prisma.product.findMany(
      excludeProductId ? { where: { id: { not: excludeProductId } } } : undefined,
    )
    const taken = new Set<string>()
    for (const product of products) {
      for (const v of parseJson<{ sku?: string }[]>(product.variants as string, [])) {
        if (v.sku) taken.add(this.skuKey(v.sku))
      }
    }
    for (const sku of incoming) {
      if (taken.has(sku)) throw new Error(`SKU "${sku}" is already in use by another product`)
    }
  }


  private async uniqueCopySku(baseSku: string): Promise<string> {
    if (!baseSku.trim()) return ''
    let candidate = `${baseSku.trim()}-COPY`
    let n = 2
    while (true) {
      try {
        await this.assertUniqueSkus([{ sku: candidate }])
        return candidate
      } catch {
        candidate = `${baseSku.trim()}-COPY-${n}`
        n += 1
      }
    }
  }

  private async ensureVariantLevels(variants: { id: string; inventoryQuantity?: number }[]): Promise<void> {
    const locations = await this.prisma.location.findMany({ where: { active: true } })
    for (const v of variants) {
      for (const loc of locations) {
        const existing = await this.prisma.inventoryLevel.findUnique({
          where: { variantId_locationId: { variantId: v.id, locationId: loc.id } },
        })
        if (existing) continue
        const qty = loc.id === locations[0]?.id ? (v.inventoryQuantity ?? 0) : 0
        await this.prisma.inventoryLevel.create({
          data: { variantId: v.id, locationId: loc.id, available: qty, committed: 0, unavailable: 0 },
        })
      }
    }
  }


  private async levelsByVariant(): Promise<Map<string, number>> {
    const levels = await this.prisma.inventoryLevel.findMany()
    const map = new Map<string, number>()
    for (const l of levels) map.set(l.variantId, (map.get(l.variantId) ?? 0) + l.available)
    return map
  }

  private async decorate(products: Record<string, unknown>[]): Promise<any[]> {
    const levels = await this.levelsByVariant()
    return products.map((p) => {
      const mapped = mapProduct(p)
      const variants = parseJson<{ id: string }[]>(p.variants as string, [])
      mapped.totalInventory = p.trackQuantity
        ? variants.reduce((s, v) => s + (levels.get(v.id) ?? 0), 0)
        : 0
      return mapped
    })
  }

  async product(id: string): Promise<any> {
    const row = await this.prisma.product.findUnique({ where: { id } })
    if (!row) return null
    const [decorated] = await this.decorate([row as unknown as Record<string, unknown>])
    return decorated
  }

  async products(args: any): Promise<any> {
    let rows = (await this.prisma.product.findMany({ orderBy: { updatedAt: 'desc' } })) as unknown as Record<string, unknown>[]
    if (args.status) rows = rows.filter((r) => r.status === args.status)
    rows = filterByQuery(rows, args.query, (r) => [
      r.title as string, r.vendor as string, r.productType as string,
      parseJson<string[]>(r.tags as string, []).join(' '),
      parseJson<{ sku?: string }[]>(r.variants as string, []).map((v) => v.sku ?? '').join(' '),
    ])
    if (args.reverse) rows = [...rows].reverse()
    const decorated = await this.decorate(rows)
    return toConnection(decorated, args.first, args.after, args.last, args.before)
  }

  async productsCount(query?: string): Promise<number> {
    let rows = (await this.prisma.product.findMany()) as unknown as Record<string, unknown>[]
    rows = filterByQuery(rows, query, (r) => [
      r.title as string, r.vendor as string, r.productType as string,
      parseJson<string[]>(r.tags as string, []).join(' '),
      parseJson<{ sku?: string }[]>(r.variants as string, []).map((v) => v.sku ?? '').join(' '),
    ])
    return rows.length
  }

  async create(input: Record<string, any>): Promise<any> {
    const now = new Date()
    const id = uid('p')
    const title = input.title ?? ''

    const variantsList = input.variants?.length
      ? input.variants.map((v: any, i: number) => ({
          id: v.id ?? `${id}_v${i + 1}`,
          productId: id,
          title: v.title ?? 'Default Title',
          sku: v.sku ?? '',
          barcode: v.barcode ?? null,
          price: v.price ?? 0,
          compareAtPrice: v.compareAtPrice ?? null,
          costPerItem: v.costPerItem ?? null,
          optionValues: v.optionValues ?? {},
          weightGrams: v.weightGrams ?? null,
          imageId: v.imageId ?? null,
          available: v.available ?? true,
          inventoryQuantity: v.inventoryQuantity ?? 0,
        }))
      : [{ id: `${id}_v1`, productId: id, title: 'Default Title', sku: '', barcode: null, price: 0, compareAtPrice: null, costPerItem: null, optionValues: {}, weightGrams: null, imageId: null, available: true, inventoryQuantity: 0 }]

    await this.assertUniqueSkus(variantsList)

    const row = await this.prisma.product.create({
      data: {
        id,
        title,
        descriptionHtml: input.descriptionHtml ?? '<p></p>',
        vendor: input.vendor ?? 'Northstar Goods',
        productType: input.productType ?? '',
        category: input.category ?? null,
        status: input.status ?? 'draft',
        tags: toJson(input.tags ?? []),
        collectionIds: toJson(input.collectionIds ?? []),
        channels: toJson(input.channels ?? ['online_store']),
        options: toJson(input.options ?? []),
        variants: toJson(variantsList),
        media: toJson(input.media ?? []),
        seo: toJson(input.seo ?? { title, description: '', handle: slugify(title) || id }),
        weightGrams: input.weightGrams ?? null,
        requiresShipping: input.requiresShipping ?? true,
        trackQuantity: input.trackQuantity ?? true,
        createdAt: now,
        updatedAt: now,
      },
    })

    await this.ensureVariantLevels(variantsList)

    return (await this.decorate([row as unknown as Record<string, unknown>]))[0]
  }

  async update(id: string, input: Record<string, any>): Promise<any> {
    const existing = await this.prisma.product.findUnique({ where: { id } })
    if (!existing) throw new Error('Product not found')
    const data: Record<string, unknown> = { updatedAt: new Date() }
    const direct = ['title', 'descriptionHtml', 'vendor', 'productType', 'category', 'status', 'weightGrams', 'requiresShipping', 'trackQuantity']
    for (const key of direct) if (input[key] !== undefined) data[key] = input[key]
    for (const key of ['tags', 'collectionIds', 'channels', 'options', 'variants', 'media', 'seo']) {
      if (input[key] !== undefined) data[key] = toJson(input[key])
    }
    if (input.variants) {
      const oldVariants = parseJson<{ id: string }[]>(existing.variants as string, [])
      const newIds = new Set(
        (input.variants as { id?: string }[]).map((v) => v.id).filter(Boolean) as string[],
      )
      const removedIds = oldVariants.map((v) => v.id).filter((vid) => !newIds.has(vid))
      if (removedIds.length) {
        await this.prisma.inventoryLevel.deleteMany({ where: { variantId: { in: removedIds } } })
      }
      await this.assertUniqueSkus(input.variants, id)
    }
    await this.prisma.product.update({ where: { id }, data })
    if (input.variants) {
      await this.ensureVariantLevels(input.variants)
    }
    return this.product(id)
  }

  async delete(ids: string[]): Promise<string[]> {
    const store = this.prisma
    for (const col of await store.collection.findMany()) {
      const productIds = parseJson<string[]>(col.productIds as string, [])
      if (productIds.some((pid) => ids.includes(pid))) {
        await store.collection.update({
          where: { id: col.id },
          data: { productIds: toJson(productIds.filter((pid) => !ids.includes(pid))) },
        })
      }
    }
    await store.product.deleteMany({ where: { id: { in: ids } } })
    return ids
  }

  async duplicate(id: string): Promise<any> {
    const source = await this.prisma.product.findUnique({ where: { id } })
    if (!source) throw new Error('Product not found')
    const newId = uid('p')
    const seo = parseJson<{ title: string; description: string; handle: string }>(source.seo as string, { title: '', description: '', handle: '' })
    const copy = await this.prisma.product.create({
      data: {
        id: newId,
        title: `${source.title} (copy)`,
        descriptionHtml: source.descriptionHtml,
        vendor: source.vendor,
        productType: source.productType,
        category: source.category,
        status: 'draft',
        tags: parseJson(source.tags as string, []),
        collectionIds: toJson([]),
        channels: parseJson(source.channels as string, []),
        options: parseJson(source.options as string, []),
        variants: toJson(
          await (async () => {
            const sourceVariants = parseJson<Record<string, unknown>[]>(source.variants as string, [])
            const copied = []
            for (let i = 0; i < sourceVariants.length; i++) {
              const v = sourceVariants[i]
              const sku = v.sku ? await this.uniqueCopySku(String(v.sku)) : ''
              copied.push({
                ...v,
                id: `${newId}_v${i + 1}`,
                productId: newId,
                sku,
                inventoryQuantity: 0,
              })
            }
            await this.assertUniqueSkus(copied)
            return copied
          })(),
        ),
        media: toJson(
          parseJson<Record<string, unknown>[]>(source.media as string, []).map((m, i) => ({ ...m, id: `${newId}_m${i + 1}`, productId: newId })),
        ),
        seo: toJson({ ...seo, handle: slugify(`${seo.handle}-copy`) }),
        weightGrams: source.weightGrams,
        requiresShipping: source.requiresShipping,
        trackQuantity: source.trackQuantity,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    const copiedVariants = parseJson<{ id: string }[]>(copy.variants as string, [])
    await this.ensureVariantLevels(copiedVariants.map((v) => ({ ...v, inventoryQuantity: 0 })))
    return (await this.decorate([copy as unknown as Record<string, unknown>]))[0]
  }

  private async findProductForVariant(variantId: string) {
    const direct = await this.prisma.product.findFirst({
      where: { variants: { array_contains: [{ id: variantId }] } },
    })
    if (direct) {
      const vars = parseJson<Record<string, unknown>[]>(direct.variants as string, [])
      const idx = vars.findIndex((v) => v.id === variantId)
      if (idx >= 0) return { product: direct, index: idx, variant: vars[idx] }
    }
    const products = await this.prisma.product.findMany()
    for (const p of products) {
      const vars = parseJson<Record<string, unknown>[]>(p.variants as string, [])
      const idx = vars.findIndex((v) => v.id === variantId)
      if (idx >= 0) return { product: p, index: idx, variant: vars[idx] }
    }
    return null
  }

  async createVariant(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const productId = input.productId as string | undefined
    if (!productId) throw new Error('productId is required to create a variant')
    const product = await this.prisma.product.findUnique({ where: { id: productId } })
    if (!product) throw new Error(`Product ${productId} not found`)

    const variants = parseJson<Record<string, unknown>[]>(product.variants as string, [])
    const sku = typeof input.sku === 'string' ? input.sku.trim() : ''
    if (sku) {
      await this.assertUniqueSkus([{ sku }])
    }

    const varId = uid('var')
    const optionValues = (input.optionValues ?? {}) as Record<string, unknown>
    const newVariant: Record<string, unknown> = {
      id: varId,
      productId,
      title: input.title || `Variant ${variants.length + 1}`,
      sku,
      barcode: input.barcode ?? null,
      price: roundMoney(Number(input.price) || 0),
      compareAtPrice: input.compareAtPrice != null ? roundMoney(Number(input.compareAtPrice)) : null,
      costPerItem: input.costPerItem != null ? roundMoney(Number(input.costPerItem)) : null,
      optionValues,
      weightGrams: input.weightGrams ?? null,
      imageId: input.imageId ?? null,
      available: input.available ?? true,
      inventoryQuantity: input.inventoryQuantity != null ? Math.max(0, Number(input.inventoryQuantity) || 0) : 0,
    }

    // Synchronize product.options with new variant's optionValues
    const currentOptions = parseJson<{ name: string; values: string[] }[]>(product.options as string, [])
    let optionsChanged = false
    for (const [optName, optVal] of Object.entries(optionValues)) {
      if (!optName || optVal == null) continue
      const strVal = String(optVal).trim()
      if (!strVal) continue
      const existing = currentOptions.find((o) => o.name.toLowerCase() === optName.toLowerCase())
      if (existing) {
        if (!existing.values.includes(strVal)) {
          existing.values.push(strVal)
          optionsChanged = true
        }
      } else {
        currentOptions.push({ name: optName, values: [strVal] })
        optionsChanged = true
      }
    }

    variants.push(newVariant)
    await this.ensureVariantLevels([{ id: varId, inventoryQuantity: Number(newVariant.inventoryQuantity) }])
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        variants: toJson(variants),
        ...(optionsChanged ? { options: toJson(currentOptions) } : {}),
        updatedAt: new Date(),
      },
    })

    return newVariant
  }

  async updateVariant(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const target = await this.findProductForVariant(id)
    if (!target) throw new Error(`Variant ${id} not found`)
    const { product: targetProduct, index: targetIndex, variant: targetVariant } = target

    const sku = input.sku !== undefined ? (typeof input.sku === 'string' ? input.sku.trim() : '') : (targetVariant.sku as string)
    if (sku && sku !== targetVariant.sku) {
      await this.assertUniqueSkus([{ sku }])
    }

    const newQty = input.inventoryQuantity !== undefined ? Math.max(0, Number(input.inventoryQuantity) || 0) : undefined

    // Synchronize product.options with updated variant's optionValues if provided
    const currentOptions = parseJson<{ name: string; values: string[] }[]>(targetProduct.options as string, [])
    let optionsChanged = false
    if (input.optionValues && typeof input.optionValues === 'object') {
      for (const [optName, optVal] of Object.entries(input.optionValues as Record<string, unknown>)) {
        if (!optName || optVal == null) continue
        const strVal = String(optVal).trim()
        if (!strVal) continue
        const existing = currentOptions.find((o) => o.name.toLowerCase() === optName.toLowerCase())
        if (existing) {
          if (!existing.values.includes(strVal)) {
            existing.values.push(strVal)
            optionsChanged = true
          }
        } else {
          currentOptions.push({ name: optName, values: [strVal] })
          optionsChanged = true
        }
      }
    }

    const variants = parseJson<Record<string, unknown>[]>(targetProduct.variants as string, [])
    const updated: Record<string, unknown> = {
      ...targetVariant,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.sku !== undefined ? { sku } : {}),
      ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
      ...(input.price !== undefined ? { price: roundMoney(Number(input.price) || 0) } : {}),
      ...(input.compareAtPrice !== undefined ? { compareAtPrice: input.compareAtPrice != null ? roundMoney(Number(input.compareAtPrice)) : null } : {}),
      ...(input.costPerItem !== undefined ? { costPerItem: input.costPerItem != null ? roundMoney(Number(input.costPerItem)) : null } : {}),
      ...(input.optionValues !== undefined ? { optionValues: input.optionValues } : {}),
      ...(input.weightGrams !== undefined ? { weightGrams: input.weightGrams } : {}),
      ...(input.imageId !== undefined ? { imageId: input.imageId } : {}),
      ...(input.available !== undefined ? { available: Boolean(input.available) } : {}),
      ...(newQty !== undefined ? { inventoryQuantity: newQty } : {}),
    }

    // If inventoryQuantity was passed, update the primary active location (matches createVariant)
    if (newQty !== undefined) {
      const locations = await this.prisma.location.findMany({ where: { active: true } })
      if (locations.length > 0) {
        const primaryLoc = locations[0]
        const existingLevel = await this.prisma.inventoryLevel.findUnique({
          where: { variantId_locationId: { variantId: id, locationId: primaryLoc.id } },
        })
        if (existingLevel) {
          await this.prisma.inventoryLevel.update({
            where: { variantId_locationId: { variantId: id, locationId: primaryLoc.id } },
            data: { available: newQty },
          })
        } else {
          await this.prisma.inventoryLevel.create({
            data: { variantId: id, locationId: primaryLoc.id, available: newQty, committed: 0, unavailable: 0 },
          })
        }
      }
    }

    variants[targetIndex] = updated
    await this.prisma.product.update({
      where: { id: targetProduct.id },
      data: {
        variants: toJson(variants),
        ...(optionsChanged ? { options: toJson(currentOptions) } : {}),
        updatedAt: new Date(),
      },
    })

    return updated
  }

  async deleteVariant(id: string): Promise<string> {
    const target = await this.findProductForVariant(id)
    if (!target) throw new Error(`Variant ${id} not found`)
    const { product: targetProduct, index: targetIndex } = target

    const variants = parseJson<Record<string, unknown>[]>(targetProduct.variants as string, [])
    if (variants.length <= 1) {
      throw new Error('Cannot delete the only variant of a product')
    }

    variants.splice(targetIndex, 1)
    await this.prisma.inventoryLevel.deleteMany({ where: { variantId: id } })
    await this.prisma.product.update({
      where: { id: targetProduct.id },
      data: { variants: toJson(variants), updatedAt: new Date() },
    })

    return id
  }

  async updateInventoryItem(
    variantId: string,
    input: { sku?: string; cost?: number | null; tracked?: boolean },
  ): Promise<Record<string, unknown>> {
    const target = await this.findProductForVariant(variantId)
    if (!target) throw new Error(`Variant ${variantId} not found`)
    const { product: targetProduct, index: targetIndex, variant: targetVariant } = target

    const updated: Record<string, unknown> = { ...targetVariant }
    if (input.sku !== undefined) {
      const sku = typeof input.sku === 'string' ? input.sku.trim() : ''
      if (sku && sku !== targetVariant.sku) {
        await this.assertUniqueSkus([{ sku }], targetProduct.id)
      }
      updated.sku = sku
    }
    if (input.cost !== undefined) updated.costPerItem = input.cost != null ? roundMoney(Number(input.cost)) : null
    if (input.tracked !== undefined) updated.tracked = Boolean(input.tracked)

    const variants = parseJson<Record<string, unknown>[]>(targetProduct.variants as string, [])
    variants[targetIndex] = updated
    await this.prisma.product.update({
      where: { id: targetProduct.id },
      data: { variants: toJson(variants), updatedAt: new Date() },
    })
    return updated
  }

  async setVariantTracked(variantId: string, tracked: boolean): Promise<Record<string, unknown>> {
    return this.updateInventoryItem(variantId, { tracked })
  }


  async setStatus(ids: string[], status: string): Promise<string[]> {
    await this.prisma.product.updateMany({ where: { id: { in: ids } }, data: { status, updatedAt: new Date() } })
    return ids
  }

  async modifyTags(ids: string[], tags: string[], mode: 'add' | 'remove'): Promise<string[]> {
    for (const id of ids) {
      const p = await this.prisma.product.findUnique({ where: { id } })
      if (!p) continue
      const current = parseJson<string[]>(p.tags as string, [])
      const next = mode === 'add' ? [...new Set([...current, ...tags])] : current.filter((t) => !tags.includes(t))
      await this.prisma.product.update({ where: { id }, data: { tags: toJson(next), updatedAt: new Date() } })
    }
    return ids
  }

  async reorderMedia(id: string, mediaIds: string[]): Promise<any> {
    const p = await this.prisma.product.findUnique({ where: { id } })
    if (!p) throw new Error('Product not found')
    const media = parseJson<Record<string, unknown>[]>(p.media as string, [])
    const map = new Map(media.map((m) => [m.id as string, m]))
    const ordered = mediaIds.map((mid) => map.get(mid)).filter(Boolean) as Record<string, unknown>[]
    const rest = media.filter((m) => !mediaIds.includes(m.id as string))
    await this.prisma.product.update({ where: { id }, data: { media: toJson([...ordered, ...rest]), updatedAt: new Date() } })
    return this.product(id)
  }

  // collections
  async collection(id: string): Promise<any> {
    const row = await this.prisma.collection.findUnique({ where: { id } })
    return row ? mapCollection(row as unknown as Record<string, unknown>) : null
  }

  async collections(args: any): Promise<any> {
    let rows = (await this.prisma.collection.findMany({ orderBy: { title: 'asc' } })) as unknown as Record<string, unknown>[]
    rows = filterByQuery(rows, args.query, (r) => [r.title as string, r.handle as string])
    const mapped = rows.map(mapCollection)
    return toConnection(mapped, args.first, args.after, args.last, args.before)
  }

  async collectionsCount(query?: string): Promise<number> {
    let rows = (await this.prisma.collection.findMany()) as unknown as Record<string, unknown>[]
    rows = filterByQuery(rows, query, (r) => [r.title as string, r.handle as string])
    return rows.length
  }

  private async evaluateSmart(rules: { column: string; relation: string; condition: string }[], match: 'all' | 'any'): Promise<string[]> {
    const products = await this.prisma.product.findMany({ where: { status: { not: 'archived' } } })
    return products
      .filter((p) =>
        matchesRules(
          {
            tags: parseJson<string[]>(p.tags as string, []),
            title: p.title,
            productType: p.productType,
            vendor: p.vendor,
          },
          rules,
          match,
        ),
      )
      .map((p) => p.id)
  }

  async createCollection(input: Record<string, any>): Promise<any> {
    const id = uid('col')
    const title = input.title ?? 'Untitled collection'
    const type = input.type ?? 'manual'
    const rules = input.rules ?? []
    const productIds =
      type === 'smart' ? await this.evaluateSmart(rules, input.rulesMatch ?? 'all') : input.productIds ?? []
    await this.prisma.collection.create({
      data: {
        id,
        title,
        descriptionHtml: input.descriptionHtml ?? '<p></p>',
        imageSrc: input.imageSrc ?? null,
        handle: input.handle || slugify(title) || id,
        type,
        rules: toJson(rules),
        rulesMatch: input.rulesMatch ?? 'all',
        productIds: toJson(productIds),
        status: input.status ?? 'active',
        seoTitle: input.seoTitle ?? title,
        seoDescription: input.seoDescription ?? null,
        publishedAt: (input.status ?? 'active') === 'active' ? new Date() : null,
        createdAt: new Date(),
      },
    })
    return this.collection(id)
  }

  async updateCollection(id: string, input: Record<string, any>): Promise<any> {
    const existing = await this.prisma.collection.findUnique({ where: { id } })
    if (!existing) throw new Error('Collection not found')
    const merged = { ...mapCollection(existing as unknown as Record<string, unknown>), ...input }

    let productIds = parseJson<string[]>(merged.productIds as unknown as string, [])
    if (merged.type === 'smart') {
      productIds = await this.evaluateSmart(merged.rules as never, merged.rulesMatch as 'all' | 'any')
    }
    const prevIds = parseJson<string[]>(existing.productIds as string, [])
    const added = productIds.filter((pid) => !prevIds.includes(pid))
    const removed = prevIds.filter((pid) => !productIds.includes(pid))

    await this.prisma.collection.update({
      where: { id },
      data: {
        title: merged.title,
        descriptionHtml: merged.descriptionHtml,
        imageSrc: merged.imageSrc ?? null,
        handle: merged.handle,
        type: merged.type,
        rules: toJson(merged.rules),
        rulesMatch: merged.rulesMatch,
        productIds: toJson(productIds),
        status: merged.status,
        seoTitle: merged.seoTitle ?? null,
        seoDescription: merged.seoDescription ?? null,
      },
    })
    // reconcile product side
    for (const pid of added) {
      const p = await this.prisma.product.findUnique({ where: { id: pid } })
      if (p) {
        const list = parseJson<string[]>(p.collectionIds as string, [])
        if (!list.includes(id)) await this.prisma.product.update({ where: { id: pid }, data: { collectionIds: toJson([...list, id]) } })
      }
    }
    for (const pid of removed) {
      const p = await this.prisma.product.findUnique({ where: { id: pid } })
      if (p) {
        const list = parseJson<string[]>(p.collectionIds as string, [])
        await this.prisma.product.update({ where: { id: pid }, data: { collectionIds: toJson(list.filter((c) => c !== id)) } })
      }
    }
    return this.collection(id)
  }

  async deleteCollections(ids: string[]): Promise<string[]> {
    for (const col of await this.prisma.collection.findMany({ where: { id: { in: ids } } })) {
      for (const pid of parseJson<string[]>(col.productIds as string, [])) {
        const p = await this.prisma.product.findUnique({ where: { id: pid } })
        if (p) {
          const list = parseJson<string[]>(p.collectionIds as string, [])
          await this.prisma.product.update({ where: { id: pid }, data: { collectionIds: toJson(list.filter((c) => c !== col.id)) } })
        }
      }
    }
    await this.prisma.collection.deleteMany({ where: { id: { in: ids } } })
    return ids
  }

  async modifyProducts(id: string, productIds: string[], mode: 'add' | 'remove'): Promise<any> {
    const col = await this.prisma.collection.findUnique({ where: { id } })
    if (!col) throw new Error('Collection not found')
    const current = parseJson<string[]>(col.productIds as string, [])
    const next = mode === 'add' ? [...new Set([...current, ...productIds])] : current.filter((pid) => !productIds.includes(pid))
    await this.updateCollection(id, { productIds: next })
    return this.collection(id)
  }

  async duplicateCollection(id: string): Promise<any> {
    const source = await this.prisma.collection.findUnique({ where: { id } })
    if (!source) throw new Error('Collection not found')
    const base = slugify(source.handle || source.title) || 'collection'
    let handle = `${base}-copy`
    let n = 2
    while (await this.prisma.collection.findUnique({ where: { handle } })) {
      handle = `${base}-copy-${n}`
      n += 1
    }
    const newId = uid('col')
    await this.prisma.collection.create({
      data: {
        id: newId,
        title: `${source.title} (copy)`,
        descriptionHtml: source.descriptionHtml,
        imageSrc: source.imageSrc,
        handle,
        type: source.type,
        rules: toJson(parseJson<unknown[]>(source.rules as string, [])),
        rulesMatch: source.rulesMatch,
        productIds: toJson(parseJson<string[]>(source.productIds as string, [])),
        status: 'draft',
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        publishedAt: null,
        createdAt: new Date(),
      },
    })
    return this.collection(newId)
  }
}
