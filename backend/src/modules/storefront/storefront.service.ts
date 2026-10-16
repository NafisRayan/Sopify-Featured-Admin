import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { graphql, buildSchema, GraphQLSchema, ExecutionResult } from 'graphql'
import { PrismaService } from '../../prisma/prisma.service'
import { ReviewsService } from '../products/reviews.service'
import { parseJson, toJson, encodeCursor, decodeCursor } from '../../common/helpers'
import { uid, slugify, roundMoney } from '../../common/ids'
import { currentTenant } from '../../common/tenant.middleware'
import { hashPassword, verifyPassword } from '../../auth/password.util'
import { createHmac, timingSafeEqual } from 'node:crypto'

interface CartLineItem {
  id: string
  merchandiseId: string
  quantity: number
  attributes?: { key: string; value: string }[]
}

interface CartSessionRecord {
  id: string
  createdAt: string
  updatedAt: string
  lines: CartLineItem[]
  buyerIdentity: {
    email?: string
    phone?: string
    countryCode?: string
  }
  discountCodes: string[]
  note?: string
}

@Injectable()
export class StorefrontService implements OnModuleInit {
  private readonly logger = new Logger(StorefrontService.name)
  private schema!: GraphQLSchema
  // In-memory runtime cart store (can be persisted to Prisma or memory session)
  private carts = new Map<string, CartSessionRecord>()

  getCartRecord(cartId: string): CartSessionRecord | null {
    return this.carts.get(this.parseId(cartId)) ?? null
  }

  private readonly customerTokens = new Map<string, { customerId: string; email: string; expiresAt: number }>()

  private signCustomerToken(customerId: string, email: string): { accessToken: string; expiresAt: Date } {
    const exp = Date.now() + 1000 * 60 * 60 * 24 * 30 // 30 days
    const payload = `${customerId}:${exp}`
    const hmac = createHmac('sha256', process.env.SESSION_SECRET || 'dev_customer_session_secret')
      .update(payload)
      .digest('hex')
    const accessToken = `${payload}:${hmac}`
    this.customerTokens.set(accessToken, { customerId, email, expiresAt: exp })
    return { accessToken, expiresAt: new Date(exp) }
  }

  private verifyCustomerToken(accessToken: string): { customerId: string; email: string } | null {
    if (!accessToken) return null
    const cached = this.customerTokens.get(accessToken)
    if (cached && cached.expiresAt > Date.now()) {
      return { customerId: cached.customerId, email: cached.email }
    }
    const parts = accessToken.split(':')
    if (parts.length !== 3) return null
    const [customerId, expStr, hmac] = parts
    const exp = Number(expStr)
    if (!Number.isFinite(exp) || exp < Date.now()) return null
    const expected = createHmac('sha256', process.env.SESSION_SECRET || 'dev_customer_session_secret')
      .update(`${customerId}:${exp}`)
      .digest('hex')
    try {
      if (timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) {
        return { customerId, email: '' }
      }
    } catch {
      return null
    }
    return null
  }

  private buildMailingAddress(addr: Record<string, unknown> | null) {
    if (!addr) return null
    const parts = [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country].filter(Boolean) as string[]
    return {
      id: this.gid('MailingAddress', (addr.id as string) || uid('addr')),
      address1: (addr.address1 as string) || '',
      address2: (addr.address2 as string) || null,
      city: (addr.city as string) || '',
      province: (addr.province as string) || '',
      zip: (addr.zip as string) || '',
      country: (addr.country as string) || 'United States',
      firstName: (addr.firstName as string) || '',
      lastName: (addr.lastName as string) || '',
      phone: (addr.phone as string) || null,
      formatted: parts,
    }
  }

  private async buildCustomerObject(c: Record<string, unknown>) {
    const addressesList = parseJson<Record<string, unknown>[]>(c.addresses as string, [])
    const defaultAddr = parseJson<Record<string, unknown> | null>(c.defaultAddress as string, addressesList[0] || null)
    const customerEmail = c.email as string

    return {
      id: this.gid('Customer', c.id as string),
      email: customerEmail,
      firstName: (c.firstName as string) || '',
      lastName: (c.lastName as string) || '',
      displayName: `${(c.firstName as string) || ''} ${(c.lastName as string) || ''}`.trim() || customerEmail,
      phone: (c.phone as string) || null,
      defaultAddress: this.buildMailingAddress(defaultAddr),
      addresses: async () => {
        const edges = addressesList.map((a, idx) => ({
          cursor: encodeCursor(idx),
          node: this.buildMailingAddress(a),
        }))
        return {
          edges,
          pageInfo: { hasNextPage: false, hasPreviousPage: false },
        }
      },
      orders: async () => {
        const orders = await this.prisma.order.findMany({
          where: {
            OR: [
              { customerId: c.id as string },
              { email: { equals: customerEmail, mode: 'insensitive' } },
            ],
          },
          orderBy: { createdAt: 'desc' },
        })

        const edges = orders.map((o, idx) => {
          const lineItems = parseJson<Record<string, unknown>[]>(o.lineItems as string, [])
          const fulfillments = parseJson<Record<string, unknown>[]>(o.fulfillments as string, [])
          const shippingAddr = parseJson<Record<string, unknown> | null>(o.shippingAddress as string, null)
          const orderNum = Number(String(o.name).replace('#', '')) || idx + 1000

          return {
            cursor: encodeCursor(idx),
            node: {
              id: this.gid('Order', o.id),
              name: o.name,
              orderNumber: orderNum,
              processedAt: o.createdAt.toISOString(),
              financialStatus: (o.paymentStatus || 'PAID').toUpperCase(),
              fulfillmentStatus: (o.fulfillmentStatus || 'UNFULFILLED').toUpperCase(),
              totalPrice: { amount: o.total, currencyCode: o.currency || 'USD' },
              subtotalPrice: { amount: o.subtotal, currencyCode: o.currency || 'USD' },
              totalTax: { amount: o.taxTotal, currencyCode: o.currency || 'USD' },
              totalShippingPrice: { amount: o.shippingPrice, currencyCode: o.currency || 'USD' },
              shippingAddress: this.buildMailingAddress(shippingAddr),
              lineItems: () =>
                lineItems.map((li) => ({
                  id: this.gid('OrderLineItem', li.id as string),
                  title: li.title,
                  variantTitle: li.variantTitle,
                  quantity: li.quantity,
                  originalTotalPrice: { amount: Number(li.price) * Number(li.quantity), currencyCode: o.currency || 'USD' },
                })),
              fulfillments: fulfillments.map((f) => ({
                status: f.status || 'SUCCESS',
                trackingCompany: f.carrier || 'Standard Carrier',
                trackingInfo: [
                  {
                    number: (f.trackingNumber as string) || 'NS-TRACK-1024',
                    url: `https://track.northstargoods.com/${(f.trackingNumber as string) || 'NS-TRACK-1024'}`,
                    company: (f.carrier as string) || 'USPS',
                  },
                ],
              })),
            },
          }
        })

        return {
          edges,
          pageInfo: { hasNextPage: false, hasPreviousPage: false },
        }
      },
    }
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewsService: ReviewsService,
  ) {}

  onModuleInit(): void {
    const sdl = readFileSync(join(__dirname, 'storefront.graphql'), 'utf8')
    this.schema = buildSchema(sdl)
    this.logger.log('Shopify Storefront GraphQL Schema compiled')
  }

  private gid(type: string, id: string): string {
    return id.startsWith('gid://') ? id : `gid://shopify/${type}/${id}`
  }

  private parseId(gidOrId: string): string {
    if (!gidOrId) return ''
    if (gidOrId.startsWith('gid://shopify/')) {
      const parts = gidOrId.split('/')
      return parts[parts.length - 1]
    }
    return gidOrId
  }

  private async getVariantInventory(variantId: string): Promise<number> {
    const levels = await this.prisma.inventoryLevel.findMany({
      where: { variantId },
    })
    return levels.reduce((sum, l) => sum + Math.max(0, l.available), 0)
  }

  private async findProductAndVariant(variantGidOrId: string): Promise<{ product: any; variant: any } | null> {
    const variantId = this.parseId(variantGidOrId)
    const products = await this.prisma.product.findMany()
    for (const p of products) {
      const variants = parseJson<any[]>(p.variants as string, [])
      const v = variants.find((item) => item.id === variantId)
      if (v) return { product: p, variant: v }
    }
    return null
  }

  private buildVariantObject(v: any, p: any, qtyAvailable: number) {
    const media = parseJson<any[]>(p.media as string, [])
    const img = v.imageId ? media.find((m) => m.id === v.imageId) : media[0]
    const options = parseJson<any[]>(p.options as string, [])
    const optValues = typeof v.optionValues === 'object' && v.optionValues ? v.optionValues : {}

    const selectedOptions = options.map((opt) => ({
      name: opt.name,
      value: optValues[opt.name] ?? opt.values?.[0] ?? '',
    }))

    return {
      id: this.gid('ProductVariant', v.id),
      title: v.title ?? 'Default Title',
      availableForSale: qtyAvailable > 0 || !p.trackQuantity,
      currentlyNotInStock: qtyAvailable <= 0 && p.trackQuantity,
      quantityAvailable: qtyAvailable,
      sku: v.sku ?? '',
      barcode: v.barcode ?? null,
      price: { amount: roundMoney(Number(v.price ?? 0)), currencyCode: 'USD' },
      compareAtPrice: v.compareAtPrice ? { amount: roundMoney(Number(v.compareAtPrice)), currencyCode: 'USD' } : null,
      image: img ? { url: img.src, altText: img.alt ?? '' } : null,
      selectedOptions,
      product: this.buildProductObject(p),
    }
  }

  private buildProductObject(p: any) {
    const variants = parseJson<any[]>(p.variants as string, [])
    const media = parseJson<any[]>(p.media as string, [])
    const options = parseJson<any[]>(p.options as string, [])
    const seo = parseJson<any>(p.seo as string, { handle: p.id })

    const prices = variants.map((v) => Number(v.price ?? 0))
    const minPrice = prices.length ? Math.min(...prices) : 0
    const maxPrice = prices.length ? Math.max(...prices) : 0

    const comparePrices = variants.map((v) => Number(v.compareAtPrice ?? v.price ?? 0))
    const minCompare = comparePrices.length ? Math.min(...comparePrices) : 0
    const maxCompare = comparePrices.length ? Math.max(...comparePrices) : 0

    return {
      id: this.gid('Product', p.id),
      handle: seo.handle || slugify(p.title) || p.id,
      title: p.title,
      description: p.descriptionHtml?.replace(/<[^>]+>/g, '') || '',
      descriptionHtml: p.descriptionHtml || '',
      vendor: p.vendor || '',
      productType: p.productType || '',
      availableForSale: p.status === 'active',
      options: options.map((opt, i) => ({
        id: this.gid('ProductOption', `${p.id}_opt_${i}`),
        name: opt.name,
        values: opt.values || [],
      })),
      images: media.map((m) => ({
        url: m.src,
        altText: m.alt || '',
      })),
      featuredImage: media[0] ? { url: media[0].src, altText: media[0].alt || '' } : null,
      priceRange: {
        minVariantPrice: { amount: roundMoney(minPrice), currencyCode: 'USD' },
        maxVariantPrice: { amount: roundMoney(maxPrice), currencyCode: 'USD' },
      },
      compareAtPriceRange: {
        minVariantPrice: { amount: roundMoney(minCompare), currencyCode: 'USD' },
        maxVariantPrice: { amount: roundMoney(maxCompare), currencyCode: 'USD' },
      },
      reviews: async () => {
        const tenant = currentTenant()
        const res = await this.reviewsService.getProductReviewsSummary(tenant.id, p.id)
        return res.reviews
      },
      reviewsCount: async () => {
        const tenant = currentTenant()
        const res = await this.reviewsService.getProductReviewsSummary(tenant.id, p.id)
        return res.reviewsCount
      },
      averageRating: async () => {
        const tenant = currentTenant()
        const res = await this.reviewsService.getProductReviewsSummary(tenant.id, p.id)
        return res.averageRating
      },
      variants: async ({ first = 50 }: { first?: number }): Promise<Record<string, unknown>> => {
        const slice = variants.slice(0, first)
        const edges: Array<{ cursor: string; node: Record<string, unknown> }> = []
        for (let idx = 0; idx < slice.length; idx++) {
          const v = slice[idx]
          const qty = await this.getVariantInventory(v.id)
          edges.push({
            cursor: encodeCursor(idx),
            node: this.buildVariantObject(v, p, qty),
          })
        }
        return {
          edges,
          pageInfo: {
            hasNextPage: variants.length > first,
            hasPreviousPage: false,
            startCursor: edges[0]?.cursor ?? null,
            endCursor: edges[edges.length - 1]?.cursor ?? null,
          },
        }
      },
    }
  }

  private async buildCartView(cart: CartSessionRecord) {
    let subtotal = 0
    const lineEdges = []

    for (let i = 0; i < cart.lines.length; i++) {
      const line = cart.lines[i]
      const pair = await this.findProductAndVariant(line.merchandiseId)
      if (!pair) continue

      const qty = await this.getVariantInventory(pair.variant.id)
      const variantObj = this.buildVariantObject(pair.variant, pair.product, qty)
      const linePrice = roundMoney(variantObj.price.amount * line.quantity)
      subtotal += linePrice

      lineEdges.push({
        cursor: encodeCursor(i),
        node: {
          id: this.gid('CartLine', line.id),
          quantity: line.quantity,
          attributes: line.attributes || [],
          merchandise: variantObj,
          cost: {
            totalAmount: { amount: linePrice, currencyCode: 'USD' },
            subtotalAmount: { amount: linePrice, currencyCode: 'USD' },
            amountPerQuantity: variantObj.price,
            compareAtAmountPerQuantity: variantObj.compareAtPrice,
          },
          estimatedCost: {
            totalAmount: { amount: linePrice, currencyCode: 'USD' },
            subtotalAmount: { amount: linePrice, currencyCode: 'USD' },
            amountPerQuantity: variantObj.price,
            compareAtAmountPerQuantity: variantObj.compareAtPrice,
          },
        },
      })
    }
    subtotal = roundMoney(subtotal)

    // Validate and calculate real-time discount allocations from PostgreSQL Discount table
    let totalDiscountAmount = 0
    const discountAllocations: Array<{ discountedAmount: { amount: number; currencyCode: string }; code: string; title: string }> = []
    const validatedDiscountCodes: Array<{ code: string; applicable: boolean; amount: { amount: number; currencyCode: string } }> = []

    const tenant = currentTenant()
    for (const code of cart.discountCodes || []) {
      const normalizedCode = code.trim().toUpperCase()
      const discountRow = await this.prisma.discount.findFirst({
        where: { storeId: tenant.id, code: normalizedCode },
      })
      if (discountRow && discountRow.status === 'active') {
        const now = new Date()
        if (discountRow.startsAt && new Date(discountRow.startsAt) > now) continue
        if (discountRow.endsAt && new Date(discountRow.endsAt) < now) continue
        if (discountRow.usageLimit && (discountRow.usedCount || 0) >= discountRow.usageLimit) continue
        if (discountRow.minPurchase && subtotal < discountRow.minPurchase) continue

        let codeDiscount = 0
        if (discountRow.type === 'percentage') {
          const pct = Number(discountRow.value || 0)
          codeDiscount = roundMoney(subtotal * (pct / 100))
        } else if (discountRow.type === 'fixed_amount') {
          codeDiscount = roundMoney(Math.min(subtotal, Number(discountRow.value || 0)))
        } else if (discountRow.type === 'free_shipping') {
          codeDiscount = 0 // shipping discount
        }

        totalDiscountAmount += codeDiscount
        discountAllocations.push({
          discountedAmount: { amount: codeDiscount, currencyCode: 'USD' },
          code: normalizedCode,
          title: discountRow.title,
        })
        validatedDiscountCodes.push({
          code: normalizedCode,
          applicable: true,
          amount: { amount: codeDiscount, currencyCode: 'USD' },
        })
      } else {
        validatedDiscountCodes.push({
          code: normalizedCode,
          applicable: false,
          amount: { amount: 0, currencyCode: 'USD' },
        })
      }
    }

    const discountedSubtotal = Math.max(0, roundMoney(subtotal - totalDiscountAmount))
    const taxAmount = roundMoney(discountedSubtotal * 0.08)
    const total = roundMoney(discountedSubtotal + taxAmount)
    const totalQuantity = cart.lines.reduce((s, l) => s + l.quantity, 0)

    return {
      id: this.gid('Cart', cart.id),
      checkoutUrl: `https://checkout.northstargoods.com/c/${cart.id}`,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
      totalQuantity,
      note: cart.note || null,
      buyerIdentity: {
        email: cart.buyerIdentity.email || null,
        phone: cart.buyerIdentity.phone || null,
        countryCode: cart.buyerIdentity.countryCode || 'US',
        customer: null,
      },
      discountCodes: validatedDiscountCodes,
      discountAllocations,
      cost: {
        totalAmount: { amount: total, currencyCode: 'USD' },
        subtotalAmount: { amount: discountedSubtotal, currencyCode: 'USD' },
        totalTaxAmount: { amount: taxAmount, currencyCode: 'USD' },
        totalDutyAmount: { amount: 0, currencyCode: 'USD' },
        totalDiscountAmount: { amount: totalDiscountAmount, currencyCode: 'USD' },
      },
      deliveryGroups: [
        {
          id: this.gid('CartDeliveryGroup', 'default_group'),
          deliveryOptions: [
            { handle: 'standard', title: 'Standard Shipping', estimatedCost: { amount: 0, currencyCode: 'USD' } },
            { handle: 'express', title: 'Express Shipping (2-Day)', estimatedCost: { amount: 15, currencyCode: 'USD' } },
          ],
          selectedDeliveryOption: {
            handle: 'standard',
            title: 'Standard Shipping',
            estimatedCost: { amount: 0, currencyCode: 'USD' },
          },
        },
      ],
      lines: {
        edges: lineEdges,
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: lineEdges[0]?.cursor ?? null,
          endCursor: lineEdges[lineEdges.length - 1]?.cursor ?? null,
        },
      },
    }
  }

  // GraphQL Execution Engine
  async execute(query: string, variables?: Record<string, unknown>, operationName?: string): Promise<ExecutionResult> {
    const rootValue = {
      // ─── Query Resolvers ───────────────────────────────────────────────
      shop: async () => {
        const tenant = currentTenant()
        const settingsRow = await this.prisma.storeSettings.findUnique({ where: { id: 'singleton' } })
        const val = parseJson<any>(settingsRow?.value as string, {})
        return {
          id: this.gid('Shop', tenant.id),
          name: tenant.name || val.storeName || 'Northstar Goods',
          description: 'A modern goods store for everyday adventure.',
          moneyFormat: '${{amount}}',
          primaryDomain: {
            host: `${tenant.slug}.platform.com`,
            sslEnabled: true,
            url: `https://${tenant.slug}.platform.com`,
          },
          paymentSettings: {
            currencyCode: tenant.currency || 'USD',
            acceptedCardBrands: ['VISA', 'MASTERCARD', 'AMEX'],
          },
        }
      },

      node: async ({ id }: { id: string }) => {
        const rawId = this.parseId(id)
        if (id.includes('ProductVariant')) {
          const pair = await this.findProductAndVariant(rawId)
          if (!pair) return null
          const qty = await this.getVariantInventory(pair.variant.id)
          return this.buildVariantObject(pair.variant, pair.product, qty)
        }
        if (id.includes('Product')) {
          const p = await this.prisma.product.findUnique({ where: { id: rawId } })
          return p ? this.buildProductObject(p) : null
        }
        if (id.includes('Cart')) {
          const cart = this.carts.get(rawId)
          return cart ? this.buildCartView(cart) : null
        }
        return null
      },

      nodes: async ({ ids }: { ids: string[] }) => {
        return Promise.all(ids.map((id) => rootValue.node({ id })))
      },

      product: async ({ id, handle }: { id?: string; handle?: string }) => {
        let p: any = null
        if (id) {
          p = await this.prisma.product.findUnique({ where: { id: this.parseId(id) } })
        } else if (handle) {
          const all = await this.prisma.product.findMany({ where: { status: 'active' } })
          p = all.find((item) => {
            const seo = parseJson<any>(item.seo as string, {})
            return seo.handle === handle || slugify(item.title) === handle || item.id === handle
          })
        }
        return p ? this.buildProductObject(p) : null
      },

      products: async ({ first = 20, after, query, reverse }: { first?: number; after?: string; query?: string; reverse?: boolean }) => {
        const tenant = currentTenant()
        let rows = await this.prisma.product.findMany({
          where: { storeId: tenant.id, status: 'active' },
          orderBy: { createdAt: reverse ? 'asc' : 'desc' },
        })
        if (query) {
          const q = query.toLowerCase()
          rows = rows.filter((r) => r.title.toLowerCase().includes(q) || r.vendor.toLowerCase().includes(q))
        }
        const offset = after ? decodeCursor(after) + 1 : 0
        const page = rows.slice(offset, offset + first)
        const edges = page.map((p, idx) => ({
          cursor: encodeCursor(offset + idx),
          node: this.buildProductObject(p),
        }))
        return {
          edges,
          pageInfo: {
            hasNextPage: offset + first < rows.length,
            hasPreviousPage: offset > 0,
            startCursor: edges[0]?.cursor ?? null,
            endCursor: edges[edges.length - 1]?.cursor ?? null,
          },
          totalCount: rows.length,
        }
      },

      collection: async ({ id, handle }: { id?: string; handle?: string }) => {
        let c: any = null
        if (id) {
          c = await this.prisma.collection.findUnique({ where: { id: this.parseId(id) } })
        } else if (handle) {
          c = await this.prisma.collection.findUnique({ where: { handle } })
        }
        if (!c) return null
        return {
          id: this.gid('Collection', c.id),
          handle: c.handle,
          title: c.title,
          description: c.descriptionHtml?.replace(/<[^>]+>/g, '') || '',
          descriptionHtml: c.descriptionHtml || '',
          image: c.imageSrc ? { url: c.imageSrc, altText: c.title } : null,
          products: async ({ first = 20 }: { first?: number }) => {
            const productIds = parseJson<string[]>(c.productIds as string, [])
            const products = await this.prisma.product.findMany({
              where: { id: { in: productIds }, status: 'active' },
            })
            const edges = products.slice(0, first).map((p, idx) => ({
              cursor: encodeCursor(idx),
              node: this.buildProductObject(p),
            }))
            return {
              edges,
              pageInfo: {
                hasNextPage: products.length > first,
                hasPreviousPage: false,
                startCursor: edges[0]?.cursor ?? null,
                endCursor: edges[edges.length - 1]?.cursor ?? null,
              },
              totalCount: products.length,
            }
          },
        }
      },

      collections: async ({ first = 20, after }: { first?: number; after?: string }) => {
        const rows = await this.prisma.collection.findMany({ where: { status: 'active' } })
        const offset = after ? decodeCursor(after) + 1 : 0
        const page = rows.slice(offset, offset + first)
        const edges = page.map((c, idx) => ({
          cursor: encodeCursor(offset + idx),
          node: {
            id: this.gid('Collection', c.id),
            handle: c.handle,
            title: c.title,
            description: c.descriptionHtml?.replace(/<[^>]+>/g, '') || '',
            descriptionHtml: c.descriptionHtml || '',
            image: c.imageSrc ? { url: c.imageSrc, altText: c.title } : null,
            products: async () => ({ edges: [], pageInfo: { hasNextPage: false, hasPreviousPage: false } }),
          },
        }))
        return {
          edges,
          pageInfo: {
            hasNextPage: offset + first < rows.length,
            hasPreviousPage: offset > 0,
            startCursor: edges[0]?.cursor ?? null,
            endCursor: edges[edges.length - 1]?.cursor ?? null,
          },
          totalCount: rows.length,
        }
      },

      cart: async ({ id }: { id: string }) => {
        const cart = this.carts.get(this.parseId(id))
        return cart ? this.buildCartView(cart) : null
      },

      customer: async ({ customerAccessToken }: { customerAccessToken: string }) => {
        const session = this.verifyCustomerToken(customerAccessToken)
        if (!session) return null
        const c = await this.prisma.customer.findFirst({
          where: {
            OR: [
              { id: session.customerId },
              ...(session.email ? [{ email: session.email }] : []),
            ],
          },
        })
        return c ? this.buildCustomerObject(c as unknown as Record<string, unknown>) : null
      },

      order: async ({ id }: { id: string }) => {
        const rawId = this.parseId(id)
        const o = await this.prisma.order.findUnique({ where: { id: rawId } })
        if (!o) return null
        const lineItems = parseJson<Record<string, unknown>[]>(o.lineItems as string, [])
        const fulfillments = parseJson<Record<string, unknown>[]>(o.fulfillments as string, [])
        const shippingAddr = parseJson<Record<string, unknown> | null>(o.shippingAddress as string, null)
        const orderNum = Number(String(o.name).replace('#', '')) || 1000

        return {
          id: this.gid('Order', o.id),
          name: o.name,
          orderNumber: orderNum,
          processedAt: o.createdAt.toISOString(),
          financialStatus: (o.paymentStatus || 'PAID').toUpperCase(),
          fulfillmentStatus: (o.fulfillmentStatus || 'UNFULFILLED').toUpperCase(),
          totalPrice: { amount: o.total, currencyCode: o.currency || 'USD' },
          subtotalPrice: { amount: o.subtotal, currencyCode: o.currency || 'USD' },
          totalTax: { amount: o.taxTotal, currencyCode: o.currency || 'USD' },
          totalShippingPrice: { amount: o.shippingPrice, currencyCode: o.currency || 'USD' },
          shippingAddress: this.buildMailingAddress(shippingAddr),
          lineItems: () =>
            lineItems.map((li) => ({
              id: this.gid('OrderLineItem', li.id as string),
              title: li.title,
              variantTitle: li.variantTitle,
              quantity: li.quantity,
              originalTotalPrice: { amount: Number(li.price) * Number(li.quantity), currencyCode: o.currency || 'USD' },
            })),
          fulfillments: fulfillments.map((f) => ({
            status: f.status || 'SUCCESS',
            trackingCompany: f.carrier || 'USPS Express',
            trackingInfo: [
              {
                number: (f.trackingNumber as string) || 'NS-TRACK-1024',
                url: `https://track.northstargoods.com/${(f.trackingNumber as string) || 'NS-TRACK-1024'}`,
                company: (f.carrier as string) || 'USPS',
              },
            ],
          })),
          returns: async () => {
            const returnRecords = await this.prisma.returnRecord.findMany({ where: { orderId: o.id } })
            return returnRecords.map((r) => {
              const lines = parseJson<Array<{ lineItemId: string; quantity: number }>>(r.lines as string, [])
              return {
                id: this.gid('Return', r.id),
                status: (r.status || 'REQUESTED').toUpperCase(),
                reason: r.reason || 'CUSTOMER_REQUEST',
                createdAt: r.createdAt.toISOString(),
                refundAmount: { amount: r.refundAmount || 0, currencyCode: o.currency || 'USD' },
                returnLineItems: lines.map((l) => ({
                  id: this.gid('ReturnLineItem', l.lineItemId),
                  quantity: l.quantity,
                  lineItem: lineItems.find((li) => li.id === l.lineItemId),
                })),
              }
            })
          },
        }
      },

      // ─── Customer Account Mutations ────────────────────────────────────
      customerCreate: async ({ input }: { input: Record<string, unknown> }) => {
        const email = String(input.email || '').trim().toLowerCase()
        if (!email) {
          return {
            customer: null,
            customerUserErrors: [{ field: ['email'], message: 'Email is required' }],
            userErrors: [{ field: ['email'], message: 'Email is required' }],
          }
        }

        const tenant = currentTenant()
        const existing = await this.prisma.customer.findFirst({ where: { storeId: tenant.id, email } })
        if (existing) {
          return {
            customer: null,
            customerUserErrors: [{ field: ['email'], message: 'Email has already been taken.' }],
            userErrors: [{ field: ['email'], message: 'Email has already been taken.' }],
          }
        }

        const customerId = uid('cust')
        const hashed = hashPassword((input.password as string) || 'password123')

        const created = await this.prisma.customer.create({
          data: {
            id: customerId,
            email,
            firstName: (input.firstName as string) || '',
            lastName: (input.lastName as string) || '',
            phone: (input.phone as string) || null,
            emailMarketingConsent: input.acceptsMarketing ? 'subscribed' : 'not_subscribed',
            tags: toJson(['storefront_account', `pwd:${hashed}`]),
            addresses: toJson([]),
            note: 'Registered via Shopify Storefront API',
          },
        })

        return {
          customer: await this.buildCustomerObject(created as unknown as Record<string, unknown>),
          customerUserErrors: [],
          userErrors: [],
        }
      },

      customerAccessTokenCreate: async ({ input }: { input: Record<string, unknown> }) => {
        const email = String(input.email || '').trim().toLowerCase()
        const tenant = currentTenant()
        const customer = await this.prisma.customer.findFirst({ where: { storeId: tenant.id, email } })
        if (!customer) {
          return {
            customerAccessToken: null,
            customerUserErrors: [{ field: ['email'], message: 'Unrecognized email or password' }],
            userErrors: [{ field: ['email'], message: 'Unrecognized email or password' }],
          }
        }

        const tags = parseJson<string[]>(customer.tags as string, [])
        const pwdTag = tags.find((t) => t.startsWith('pwd:'))
        const storedHash = pwdTag ? pwdTag.slice(4) : null

        if (storedHash && !verifyPassword(String(input.password || ''), storedHash)) {
          return {
            customerAccessToken: null,
            customerUserErrors: [{ field: ['password'], message: 'Unrecognized email or password' }],
            userErrors: [{ field: ['password'], message: 'Unrecognized email or password' }],
          }
        }

        const token = this.signCustomerToken(customer.id, customer.email)
        return {
          customerAccessToken: {
            accessToken: token.accessToken,
            expiresAt: token.expiresAt.toISOString(),
          },
          customerUserErrors: [],
          userErrors: [],
        }
      },

      customerAccessTokenDelete: async ({ customerAccessToken }: { customerAccessToken: string }) => {
        this.customerTokens.delete(customerAccessToken)
        return {
          deletedAccessToken: customerAccessToken,
          deletedCustomerAccessTokenId: customerAccessToken,
          userErrors: [],
        }
      },

      customerAddressCreate: async ({ customerAccessToken, address }: { customerAccessToken: string; address: Record<string, unknown> }) => {
        const session = this.verifyCustomerToken(customerAccessToken)
        if (!session) {
          return {
            customerAddress: null,
            customerUserErrors: [{ field: ['customerAccessToken'], message: 'Invalid or expired customer session' }],
            userErrors: [{ field: ['customerAccessToken'], message: 'Invalid or expired customer session' }],
          }
        }

        const customer = await this.prisma.customer.findFirst({
          where: {
            OR: [{ id: session.customerId }, ...(session.email ? [{ email: session.email }] : [])],
          },
        })
        if (!customer) throw new Error('Customer not found')

        const addresses = parseJson<Record<string, unknown>[]>(customer.addresses as string, [])
        const newAddr = {
          id: uid('addr'),
          ...address,
        }
        addresses.push(newAddr)

        await this.prisma.customer.update({
          where: { id: customer.id },
          data: {
            addresses: toJson(addresses),
            defaultAddress: customer.defaultAddress ? customer.defaultAddress : toJson(newAddr),
          },
        })

        return {
          customerAddress: this.buildMailingAddress(newAddr),
          customerUserErrors: [],
          userErrors: [],
        }
      },

      customerAddressUpdate: async ({ customerAccessToken, id, address }: { customerAccessToken: string; id: string; address: Record<string, unknown> }) => {
        const session = this.verifyCustomerToken(customerAccessToken)
        if (!session) {
          return {
            customerAddress: null,
            customerUserErrors: [{ field: ['customerAccessToken'], message: 'Invalid customer session' }],
            userErrors: [{ field: ['customerAccessToken'], message: 'Invalid customer session' }],
          }
        }

        const rawId = this.parseId(id)
        const customer = await this.prisma.customer.findFirst({
          where: {
            OR: [{ id: session.customerId }, ...(session.email ? [{ email: session.email }] : [])],
          },
        })
        if (!customer) throw new Error('Customer not found')

        let addresses = parseJson<Record<string, unknown>[]>(customer.addresses as string, [])
        let updatedAddr: Record<string, unknown> | null = null

        addresses = addresses.map((a) => {
          if (a.id === rawId || a.id === id) {
            updatedAddr = { ...a, ...address }
            return updatedAddr
          }
          return a
        })

        if (!updatedAddr) {
          return {
            customerAddress: null,
            customerUserErrors: [{ field: ['id'], message: 'Address not found' }],
            userErrors: [{ field: ['id'], message: 'Address not found' }],
          }
        }

        await this.prisma.customer.update({
          where: { id: customer.id },
          data: { addresses: toJson(addresses) },
        })

        return {
          customerAddress: this.buildMailingAddress(updatedAddr),
          customerUserErrors: [],
          userErrors: [],
        }
      },

      customerAddressDelete: async ({ customerAccessToken, id }: { customerAccessToken: string; id: string }) => {
        const session = this.verifyCustomerToken(customerAccessToken)
        if (!session) {
          return {
            deletedCustomerAddressId: null,
            customerUserErrors: [{ field: ['customerAccessToken'], message: 'Invalid customer session' }],
            userErrors: [{ field: ['customerAccessToken'], message: 'Invalid customer session' }],
          }
        }

        const rawId = this.parseId(id)
        const customer = await this.prisma.customer.findFirst({
          where: {
            OR: [{ id: session.customerId }, ...(session.email ? [{ email: session.email }] : [])],
          },
        })
        if (!customer) throw new Error('Customer not found')

        const addresses = parseJson<Record<string, unknown>[]>(customer.addresses as string, []).filter(
          (a) => a.id !== rawId && a.id !== id,
        )

        await this.prisma.customer.update({
          where: { id: customer.id },
          data: { addresses: toJson(addresses) },
        })

        return {
          deletedCustomerAddressId: id,
          customerUserErrors: [],
          userErrors: [],
        }
      },

      customerDefaultAddressUpdate: async ({ customerAccessToken, addressId }: { customerAccessToken: string; addressId: string }) => {
        const session = this.verifyCustomerToken(customerAccessToken)
        if (!session) {
          return {
            customer: null,
            customerUserErrors: [{ field: ['customerAccessToken'], message: 'Invalid customer session' }],
            userErrors: [{ field: ['customerAccessToken'], message: 'Invalid customer session' }],
          }
        }

        const rawId = this.parseId(addressId)
        const customer = await this.prisma.customer.findFirst({
          where: {
            OR: [{ id: session.customerId }, ...(session.email ? [{ email: session.email }] : [])],
          },
        })
        if (!customer) throw new Error('Customer not found')

        const addresses = parseJson<Record<string, unknown>[]>(customer.addresses as string, [])
        const matched = addresses.find((a) => a.id === rawId || a.id === addressId)
        if (!matched) {
          return {
            customer: null,
            customerUserErrors: [{ field: ['addressId'], message: 'Address not found' }],
            userErrors: [{ field: ['addressId'], message: 'Address not found' }],
          }
        }

        const updated = await this.prisma.customer.update({
          where: { id: customer.id },
          data: { defaultAddress: toJson(matched) },
        })

        return {
          customer: await this.buildCustomerObject(updated as unknown as Record<string, unknown>),
          customerUserErrors: [],
          userErrors: [],
        }
      },
      cartCreate: async ({ input }: { input?: any }) => {
        const id = uid('cart')
        const now = new Date().toISOString()
        const userErrors: any[] = []
        const lines: CartLineItem[] = []

        if (input?.lines?.length) {
          for (const line of input.lines) {
            const pair = await this.findProductAndVariant(line.merchandiseId)
            if (!pair) {
              userErrors.push({
                field: ['lines', 'merchandiseId'],
                message: `Merchandise ${line.merchandiseId} not found`,
                code: 'INVALID_MERCHANDISE_LINE',
              })
              continue
            }
            if (pair.product.trackQuantity) {
              const qty = await this.getVariantInventory(pair.variant.id)
              if (qty < line.quantity) {
                userErrors.push({
                  field: ['lines', 'quantity'],
                  message: `Not enough stock available for ${pair.product.title} (${pair.variant.title}). Available: ${qty}`,
                  code: 'INSUFFICIENT_STOCK',
                })
                continue
              }
            }
            lines.push({
              id: uid('line'),
              merchandiseId: line.merchandiseId,
              quantity: line.quantity,
              attributes: line.attributes || [],
            })
          }
        }

        const cart: CartSessionRecord = {
          id,
          createdAt: now,
          updatedAt: now,
          lines,
          buyerIdentity: input?.buyerIdentity || {},
          discountCodes: input?.discountCodes || [],
          note: input?.note || '',
        }
        this.carts.set(id, cart)

        return {
          cart: await this.buildCartView(cart),
          userErrors,
        }
      },

      cartLinesAdd: async ({ cartId, lines }: { cartId: string; lines: any[] }) => {
        const id = this.parseId(cartId)
        const cart = this.carts.get(id)
        if (!cart) {
          return {
            cart: null,
            userErrors: [{ field: ['cartId'], message: 'Cart not found', code: 'CART_NOT_FOUND' }],
          }
        }

        const userErrors: any[] = []
        for (const line of lines) {
          const pair = await this.findProductAndVariant(line.merchandiseId)
          if (!pair) {
            userErrors.push({
              field: ['lines', 'merchandiseId'],
              message: `Merchandise ${line.merchandiseId} not found`,
              code: 'INVALID_MERCHANDISE_LINE',
            })
            continue
          }
          if (pair.product.trackQuantity) {
            const avail = await this.getVariantInventory(pair.variant.id)
            const existing = cart.lines.find((l) => l.merchandiseId === line.merchandiseId)
            const totalRequested = (existing?.quantity || 0) + line.quantity
            if (avail < totalRequested) {
              userErrors.push({
                field: ['lines', 'quantity'],
                message: `Not enough stock available for ${pair.product.title}. Max additional: ${Math.max(0, avail - (existing?.quantity || 0))}`,
                code: 'INSUFFICIENT_STOCK',
              })
              continue
            }
          }
          const existingIndex = cart.lines.findIndex((l) => l.merchandiseId === line.merchandiseId)
          if (existingIndex >= 0) {
            cart.lines[existingIndex].quantity += line.quantity
          } else {
            cart.lines.push({
              id: uid('line'),
              merchandiseId: line.merchandiseId,
              quantity: line.quantity,
              attributes: line.attributes || [],
            })
          }
        }

        cart.updatedAt = new Date().toISOString()
        return {
          cart: await this.buildCartView(cart),
          userErrors,
        }
      },

      cartLinesUpdate: async ({ cartId, lines }: { cartId: string; lines: any[] }) => {
        const id = this.parseId(cartId)
        const cart = this.carts.get(id)
        if (!cart) {
          return {
            cart: null,
            userErrors: [{ field: ['cartId'], message: 'Cart not found', code: 'CART_NOT_FOUND' }],
          }
        }

        const userErrors: any[] = []
        for (const update of lines) {
          const lineId = this.parseId(update.id)
          const target = cart.lines.find((l) => l.id === lineId)
          if (!target) {
            userErrors.push({
              field: ['lines', 'id'],
              message: `Cart line ${update.id} not found`,
              code: 'LINE_NOT_FOUND',
            })
            continue
          }
          if (update.quantity === 0) {
            cart.lines = cart.lines.filter((l) => l.id !== lineId)
            continue
          }
          if (update.quantity > 0) {
            const pair = await this.findProductAndVariant(target.merchandiseId)
            if (pair?.product.trackQuantity) {
              const avail = await this.getVariantInventory(pair.variant.id)
              if (avail < update.quantity) {
                userErrors.push({
                  field: ['lines', 'quantity'],
                  message: `Not enough stock available. Available: ${avail}`,
                  code: 'INSUFFICIENT_STOCK',
                })
                continue
              }
            }
            target.quantity = update.quantity
          }
        }

        cart.updatedAt = new Date().toISOString()
        return {
          cart: await this.buildCartView(cart),
          userErrors,
        }
      },

      cartLinesRemove: async ({ cartId, lineIds }: { cartId: string; lineIds: string[] }) => {
        const id = this.parseId(cartId)
        const cart = this.carts.get(id)
        if (!cart) {
          return {
            cart: null,
            userErrors: [{ field: ['cartId'], message: 'Cart not found', code: 'CART_NOT_FOUND' }],
          }
        }

        const rawLineIds = new Set(lineIds.map((lid) => this.parseId(lid)))
        cart.lines = cart.lines.filter((l) => !rawLineIds.has(l.id))
        cart.updatedAt = new Date().toISOString()

        return {
          cart: await this.buildCartView(cart),
          userErrors: [],
        }
      },

      cartBuyerIdentityUpdate: async ({ cartId, buyerIdentity }: { cartId: string; buyerIdentity: any }) => {
        const id = this.parseId(cartId)
        const cart = this.carts.get(id)
        if (!cart) {
          return {
            cart: null,
            userErrors: [{ field: ['cartId'], message: 'Cart not found', code: 'CART_NOT_FOUND' }],
          }
        }
        cart.buyerIdentity = { ...cart.buyerIdentity, ...buyerIdentity }
        cart.updatedAt = new Date().toISOString()
        return { cart: await this.buildCartView(cart), userErrors: [] }
      },

      cartDiscountCodesUpdate: async ({ cartId, discountCodes }: { cartId: string; discountCodes: string[] }) => {
        const id = this.parseId(cartId)
        const cart = this.carts.get(id)
        if (!cart) {
          return {
            cart: null,
            userErrors: [{ field: ['cartId'], message: 'Cart not found', code: 'CART_NOT_FOUND' }],
          }
        }

        const userErrors: Array<{ field: string[]; message: string; code: string }> = []
        const validatedCodes: string[] = []
        const now = new Date()

        for (const code of discountCodes) {
          const normalized = code.trim().toUpperCase()
          const tenant = currentTenant()
          const discountRow = await this.prisma.discount.findFirst({ where: { storeId: tenant.id, code: normalized } })
          if (!discountRow || discountRow.status !== 'active') {
            userErrors.push({
              field: ['discountCodes'],
              message: `Discount code "${normalized}" is invalid or has expired.`,
              code: 'DISCOUNT_NOT_FOUND',
            })
          } else if (discountRow.startsAt && new Date(discountRow.startsAt) > now) {
            userErrors.push({
              field: ['discountCodes'],
              message: `Discount code "${normalized}" is not active yet.`,
              code: 'DISCOUNT_EXPIRED',
            })
          } else if (discountRow.endsAt && new Date(discountRow.endsAt) < now) {
            userErrors.push({
              field: ['discountCodes'],
              message: `Discount code "${normalized}" has expired.`,
              code: 'DISCOUNT_EXPIRED',
            })
          } else if (discountRow.usageLimit && (discountRow.usedCount || 0) >= discountRow.usageLimit) {
            userErrors.push({
              field: ['discountCodes'],
              message: `Discount code "${normalized}" has reached its usage limit.`,
              code: 'DISCOUNT_LIMIT_REACHED',
            })
          } else {
            validatedCodes.push(normalized)
          }
        }

        cart.discountCodes = validatedCodes
        cart.updatedAt = new Date().toISOString()
        return { cart: await this.buildCartView(cart), userErrors }
      },

      cartNoteUpdate: async ({ cartId, note }: { cartId: string; note: string }) => {
        const id = this.parseId(cartId)
        const cart = this.carts.get(id)
        if (!cart) {
          return {
            cart: null,
            userErrors: [{ field: ['cartId'], message: 'Cart not found', code: 'CART_NOT_FOUND' }],
          }
        }
        cart.note = note
        cart.updatedAt = new Date().toISOString()
        return { cart: await this.buildCartView(cart), userErrors: [] }
      },

      cartCheckoutComplete: async ({ input }: { input: any }) => {
        const cart = this.carts.get(this.parseId(input.cartId))
        if (!cart || cart.lines.length === 0) {
          return {
            order: null,
            userErrors: [{ field: ['cartId'], message: 'Cart is empty or not found', code: 'CART_EMPTY' }],
          }
        }

        const userErrors: any[] = []
        const lineItemsPayload: any[] = []
        let subtotal = 0

        // 1. Validate and construct order line items
        for (const line of cart.lines) {
          const pair = await this.findProductAndVariant(line.merchandiseId)
          if (!pair) continue
          const price = roundMoney(Number(pair.variant.price ?? 0))
          lineItemsPayload.push({
            id: uid('line'),
            productId: pair.product.id,
            variantId: pair.variant.id,
            title: pair.product.title,
            variantTitle: pair.variant.title ?? 'Default Title',
            sku: pair.variant.sku ?? '',
            quantity: line.quantity,
            price,
            totalDiscount: 0,
            requiresShipping: pair.product.requiresShipping ?? true,
          })
          subtotal += price * line.quantity
        }
        subtotal = roundMoney(subtotal)

        // Calculate discount deductions
        let discountTotal = 0
        for (const code of cart.discountCodes || []) {
          const tenant = currentTenant()
          const discountRow = await this.prisma.discount.findFirst({ where: { storeId: tenant.id, code } })
          if (discountRow && discountRow.status === 'active') {
            if (discountRow.type === 'percentage') {
              discountTotal += roundMoney(subtotal * (Number(discountRow.value || 0) / 100))
            } else if (discountRow.type === 'fixed_amount') {
              discountTotal += roundMoney(Math.min(subtotal, Number(discountRow.value || 0)))
            }
            // Increment used count
            await this.prisma.discount.update({
              where: { id: discountRow.id },
              data: { usedCount: (discountRow.usedCount || 0) + 1 },
            })
          }
        }

        const discountedSubtotal = Math.max(0, roundMoney(subtotal - discountTotal))
        const taxTotal = roundMoney(discountedSubtotal * 0.08)
        const total = roundMoney(discountedSubtotal + taxTotal)
        // 2. Derive next order number
        const counter = await this.prisma.shopCounter.upsert({
          where: { id: 'order_number' },
          create: { id: 'order_number', value: 1001 },
          update: { value: { increment: 1 } },
        })
        const orderNumber = counter.value
        const orderId = uid('ord')
        const now = new Date()

        // 3. Atomically create Order in database
        const createdOrder = await this.prisma.order.create({
          data: {
            id: orderId,
            name: `#${orderNumber}`,
            customerId: 'cust_walk_in',
            email: input.email || cart.buyerIdentity.email || 'customer@example.com',
            phone: cart.buyerIdentity.phone || null,
            createdAt: now,
            paymentStatus: 'paid',
            fulfillmentStatus: 'unfulfilled',
            status: 'open',
            channel: 'Online Store',
            lineItems: toJson(lineItemsPayload),
            shippingAddress: toJson(input.shippingAddress || {}),
            billingAddress: toJson(input.billingAddress || input.shippingAddress || {}),
            shippingTitle: 'Standard Shipping',
            shippingPrice: 0,
            subtotal: discountedSubtotal,
            taxTotal,
            total,
            currency: 'USD',
            tags: toJson(['storefront', 'online']),
            note: cart.note || null,
            timeline: toJson([
              {
                id: uid('tl'),
                createdAt: now,
                type: 'order_placed',
                message: `Order #${orderNumber} placed via Shopify Storefront GraphQL API`,
                author: 'Storefront Customer',
              },
            ]),
            fulfillments: toJson([]),
            refunds: toJson([]),
            paymentGateway: input.paymentGateway || 'Shopify Payments',
            isDraft: false,
          },
        })

        // 4. Reserve stock on committed inventory levels
        for (const item of lineItemsPayload) {
          const pair = await this.findProductAndVariant(item.variantId)
          if (pair?.product.trackQuantity) {
            const level = await this.prisma.inventoryLevel.findFirst({
              where: { variantId: item.variantId, available: { gte: item.quantity } },
            })
            if (level) {
              await this.prisma.inventoryLevel.update({
                where: { variantId_locationId: { variantId: level.variantId, locationId: level.locationId } },
                data: {
                  available: level.available - item.quantity,
                  committed: level.committed + item.quantity,
                },
              })
            }
          }
        }

        // 5. Clear cart session
        this.carts.delete(this.parseId(input.cartId))

        const outcome = {
          order: {
            id: this.gid('Order', createdOrder.id),
            name: createdOrder.name,
            orderNumber,
            processedAt: now.toISOString(),
            financialStatus: 'PAID',
            fulfillmentStatus: 'UNFULFILLED',
            totalPrice: { amount: total, currencyCode: 'USD' },
            subtotalPrice: { amount: discountedSubtotal, currencyCode: 'USD' },
            totalTax: { amount: taxTotal, currencyCode: 'USD' },
            totalShippingPrice: { amount: 0, currencyCode: 'USD' },
          },
          userErrors,
        }

        // Mark any abandoned checkout matching this cart as recovered
        try {
          await this.prisma.abandonedCheckout.updateMany({
            where: {
              OR: [
                { id: `abandoned_${this.parseId(input.cartId)}` },
                { email: input.email || cart.buyerIdentity.email },
              ],
            },
            data: { recoveryStatus: 'recovered' },
          })
        } catch {
          // ignore
        }

        return outcome
      },

      returnRequest: async ({ orderId, returnLineItems }: { orderId: string; returnLineItems: Array<{ lineItemId: string; quantity: number; reason?: string; note?: string }> }) => {
        const rawId = this.parseId(orderId)
        const order = await this.prisma.order.findUnique({ where: { id: rawId } })
        if (!order) {
          return {
            return: null,
            userErrors: [{ field: ['orderId'], message: 'Order not found' }],
          }
        }

        if (!['fulfilled', 'partial'].includes(order.fulfillmentStatus)) {
          return {
            return: null,
            userErrors: [{ field: ['orderId'], message: 'Only fulfilled or partially fulfilled orders are eligible for return.' }],
          }
        }

        const lineItems = parseJson<Array<{ id: string; price: number; quantity: number }>>(order.lineItems as string, [])
        let refundAmount = 0

        for (const item of returnLineItems) {
          const rawLineId = this.parseId(item.lineItemId)
          const li = lineItems.find((x) => x.id === rawLineId)
          if (!li) {
            return {
              return: null,
              userErrors: [{ field: ['returnLineItems'], message: `Line item ${item.lineItemId} not found in this order.` }],
            }
          }
          if (item.quantity > li.quantity) {
            return {
              return: null,
              userErrors: [{ field: ['returnLineItems'], message: `Requested quantity exceeds purchased quantity for line item.` }],
            }
          }
          refundAmount += li.price * item.quantity
        }

        refundAmount = roundMoney(refundAmount)
        const returnId = uid('ret')
        const reason = returnLineItems[0]?.reason || 'CUSTOMER_REQUEST'

        const returnRecord = await this.prisma.returnRecord.create({
          data: {
            id: returnId,
            orderId: order.id,
            status: 'requested',
            lines: toJson(
              returnLineItems.map((li) => ({
                lineItemId: this.parseId(li.lineItemId),
                quantity: li.quantity,
              })),
            ),
            reason,
            restock: true,
            refundAmount,
          },
        })

        return {
          return: {
            id: this.gid('Return', returnRecord.id),
            status: 'REQUESTED',
            reason,
            createdAt: (returnRecord.createdAt ? new Date(returnRecord.createdAt) : new Date()).toISOString(),
            refundAmount: { amount: refundAmount, currencyCode: order.currency || 'USD' },
            returnLineItems: returnLineItems.map((li) => ({
              id: this.gid('ReturnLineItem', li.lineItemId),
              quantity: li.quantity,
              lineItem: lineItems.find((x) => x.id === this.parseId(li.lineItemId)),
            })),
          },
          userErrors: [],
        }
      },
      productReviewCreate: async ({ input }: { input: any }) => {
        return this.reviewsService.createReview(input)
      },
    }

    return graphql({
      schema: this.schema,
      source: query,
      rootValue,
      variableValues: variables,
      operationName,
    })
  }
}
