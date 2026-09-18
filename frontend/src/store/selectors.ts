import { useStore } from './useStore'
import type { InventoryLevel } from '@/types'

export const onHand = (l: InventoryLevel): number => l.available + l.committed + l.unavailable

/** Total sellable (available) units for a variant across all locations */
export function variantAvailable(variantId: string): number {
  return useStore
    .getState()
    .inventoryLevels.filter((l) => l.variantId === variantId)
    .reduce((s, l) => s + l.available, 0)
}

export function variantLevelAt(variantId: string, locationId: string): InventoryLevel | undefined {
  return useStore.getState().inventoryLevels.find((l) => l.variantId === variantId && l.locationId === locationId)
}

/** Total inventory across a product's variants */
export function productTotalInventory(productId: string): number {
  const product = useStore.getState().products.find((p) => p.id === productId)
  if (!product || !product.trackQuantity) return Infinity
  return product.variants.reduce((s, v) => s + variantAvailable(v.id), 0)
}

export interface CustomerStats {
  ordersCount: number
  totalSpent: number
  avgOrderValue: number
  lastOrderAt: string | undefined
}

/** Derived from orders — never stored, always coherent (spec §48) */
export function customerStats(customerId: string): CustomerStats {
  const orders = useStore
    .getState()
    .orders.filter((o) => o.customerId === customerId && o.status !== 'draft' && o.status !== 'cancelled')
  const totalSpent = orders.reduce((s, o) => {
    const refunded = o.refunds.reduce((rSum, r) => rSum + r.amount, 0)
    return s + Math.max(0, o.total - refunded)
  }, 0)
  const lastOrder = orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return {
    ordersCount: orders.length,
    totalSpent,
    avgOrderValue: orders.length ? totalSpent / orders.length : 0,
    lastOrderAt: lastOrder?.createdAt,
  }
}

export function ordersForCustomer(customerId: string) {
  return useStore
    .getState()
    .orders.filter((o) => o.customerId === customerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Variants at/below threshold, excluding untracked products */
export function lowStockVariants(threshold = 10) {
  const { products, inventoryLevels } = useStore.getState()
  const result: { variantId: string; productId: string; title: string; variantTitle: string; sku: string; available: number; imageSrc?: string }[] = []
  for (const p of products) {
    if (p.status === 'archived' || !p.trackQuantity) continue
    for (const v of p.variants) {
      const available = inventoryLevels.filter((l) => l.variantId === v.id).reduce((s, l) => s + l.available, 0)
      if (available <= threshold) {
        result.push({
          variantId: v.id, productId: p.id, title: p.title,
          variantTitle: v.title === 'Default Title' ? '' : v.title,
          sku: v.sku, available, imageSrc: p.media[0]?.src,
        })
      }
    }
  }
  return result.sort((a, b) => a.available - b.available)
}
