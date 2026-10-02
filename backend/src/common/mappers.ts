import { parseJson } from '../common/helpers'

/** Row → GraphQL type mappers (JSON columns + computed fields) */

export interface Row {
  [k: string]: unknown
}

export function mapProduct(p: Row): Row {
  return {
    ...p,
    tags: parseJson<unknown[]>(p.tags as string, []),
    collectionIds: parseJson<unknown[]>(p.collectionIds as string, []),
    channels: parseJson<unknown[]>(p.channels as string, []),
    options: parseJson<unknown[]>(p.options as string, []),
    variants: parseJson<unknown[]>(p.variants as string, []),
    media: parseJson<unknown[]>(p.media as string, []),
    seo: parseJson<unknown>(p.seo as string, { title: '', description: '', handle: '' }),
    totalInventory: p.trackQuantity
      ? (parseJson<{ available?: boolean }[]>(p.variants as string, [])).reduce(
          (sum) => sum, // variants don't carry stock; levels computed on demand
          0,
        )
      : 0,
  }
}

export function productTotalInventory(levels: { variantId: string; available: number }[], variants: { id: string }[]): number {
  const ids = new Set(variants.map((v) => v.id))
  return levels.filter((l) => ids.has(l.variantId)).reduce((s, l) => s + l.available, 0)
}

export function mapCollection(c: Row): Row {
  return {
    ...c,
    rules: parseJson<unknown[]>(c.rules as string, []),
    productIds: parseJson<unknown[]>(c.productIds as string, []),
  }
}

export function mapCustomer(c: Row, stats?: { ordersCount: number; totalSpent: number; lastOrderAt: Date | null }): Row {
  return {
    ...c,
    tags: parseJson<unknown[]>(c.tags as string, []),
    addresses: parseJson<unknown[]>(c.addresses as string, []),
    defaultAddress: parseJson<unknown>(c.defaultAddress as string, null),
    ordersCount: stats?.ordersCount ?? 0,
    totalSpent: stats?.totalSpent ?? 0,
    lastOrderAt: stats?.lastOrderAt ?? null,
  }
}

export function mapOrder(o: Row, risk?: { level: string; signals: string[] } | null): Row {
  const gc = parseJson<{ code?: string; amount?: number } | null>(o.giftCard as string, null)
  return {
    ...o,
    lineItems: parseJson<unknown[]>(o.lineItems as string, []),
    shippingAddress: parseJson<unknown>(o.shippingAddress as string, {}),
    billingAddress: parseJson<unknown>(o.billingAddress as string, {}),
    discountCode: parseJson<unknown>(o.discountCode as string, null),
    tags: parseJson<unknown[]>(o.tags as string, []),
    timeline: parseJson<unknown[]>(o.timeline as string, []),
    fulfillments: parseJson<unknown[]>(o.fulfillments as string, []),
    refunds: parseJson<unknown[]>(o.refunds as string, []),
    giftCard: gc,
    giftCardCode: gc?.code ?? null,
    giftCardApplied: gc?.amount ?? 0,
    transactions: [],
    riskLevel: risk?.level ?? null,
    riskSignals: risk?.signals ?? [],
  }
}

export function mapCompany(c: Row, totalSpent = 0): Row {
  return {
    ...c,
    locations: parseJson<unknown[]>(c.locations as string, []),
    contacts: parseJson<unknown[]>(c.contacts as string, []),
    totalSpent,
  }
}

export function mapSegment(s: Row, memberCount = 0): Row {
  return { ...s, filters: parseJson<unknown[]>(s.filters as string, []), memberCount }
}

export function mapTransfer(t: Row): Row {
  return { ...t, lines: parseJson<unknown[]>(t.lines as string, []) }
}

export function mapGiftCard(g: Row): Row {
  return { ...g, history: parseJson<unknown[]>(g.history as string, []) }
}

export function mapDiscount(d: Row): Row {
  return {
    ...d,
    productIds: parseJson<unknown[]>(d.productIds as string, []),
    bxgy: parseJson<unknown>(d.bxgy as string, null),
    combinations: parseJson<unknown>(d.combinations as string, {
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: false,
    }),
  }
}

export function mapMenu(m: Row): Row {
  return { ...m, items: parseJson<unknown[]>(m.items as string, []) }
}

export function mapStaff(s: Row): Row {
  return { ...s, permissions: parseJson<unknown>(s.permissions as string, {}) }
}

export function mapApp(a: Row): Row {
  return { ...a, permissions: parseJson<unknown[]>(a.permissions as string, []) }
}

export function mapFile(f: Row): Row {
  return { ...f, dimensions: parseJson<unknown>(f.dimensions as string, null) }
}

export function mapReturn(r: Row): Row {
  return { ...r, lines: parseJson<{ lineItemId: string; quantity: number }[]>(r.lines as string, []) }
}

export function mapMetaobjectDefinition(d: Row): Row {
  return { ...d, fields: parseJson<unknown[]>(d.fields as string, []) }
}

export function mapMetaobjectEntry(e: Row): Row {
  return { ...e, fields: parseJson<unknown>(e.fields as string, {}) }
}

export function mapOrderRisk(r: Row | null | undefined): { level: string; signals: string[] } | null {
  if (!r) return null
  return { level: r.level as string, signals: parseJson<string[]>(r.signals as string, []) }
}
