import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { delay } from '@/lib/delay'
import { CURRENT_USER } from '@/lib/constants'
import { syncMutation, gqlLiteral } from './api'
import type { InventoryHistoryEntry, InventoryLevel } from '@/types'

/** Inventory service (spec §16, §48): adjustments, transfers, history. */

function levelFor(variantId: string, locationId: string): InventoryLevel {
  const store = getStore()
  return (
    store.inventoryLevels.find((l) => l.variantId === variantId && l.locationId === locationId) ?? {
      variantId, locationId, available: 0, committed: 0, unavailable: 0,
    }
  )
}

function recordHistory(
  level: InventoryLevel,
  change: number,
  resultingAvailable: number,
  reason: string,
): InventoryHistoryEntry {
  return {
    id: uid('ih'),
    variantId: level.variantId,
    locationId: level.locationId,
    change,
    resultingAvailable,
    reason,
    createdAt: new Date().toISOString(),
    author: CURRENT_USER.name,
  }
}

export async function adjustInventory(
  variantId: string,
  locationId: string,
  newAvailable: number,
  reason: string,
): Promise<void> {
  await delay(350)
  if (newAvailable < 0) throw new Error('Quantity cannot be negative')
  const store = getStore()
  const current = levelFor(variantId, locationId)
  const change = newAvailable - current.available
  if (change === 0) return
  const updated = { ...current, available: newAvailable }
  store.upsertInventoryLevel(updated)
  store.addInventoryHistory([recordHistory(updated, change, newAvailable, reason)])
  syncMutation(`mutation { inventoryAdjust(input: { variantId: ${gqlLiteral(variantId)}, locationId: ${gqlLiteral(locationId)}, availableDelta: ${change}, reason: ${gqlLiteral(reason)} }) { userErrors { message } } }`)
}

export interface TransferInput {
  variantId: string
  fromLocationId: string
  toLocationId: string
  quantity: number
}

export async function transferInventory(input: TransferInput): Promise<void> {
  await delay(450)
  if (input.quantity <= 0) throw new Error('Transfer quantity must be positive')
  if (input.fromLocationId === input.toLocationId) throw new Error('Choose two different locations')
  const store = getStore()
  const from = levelFor(input.variantId, input.fromLocationId)
  if (from.available < input.quantity) throw new Error('Not enough available stock at source location')
  const to = levelFor(input.variantId, input.toLocationId)

  const updatedFrom = { ...from, available: from.available - input.quantity }
  const updatedTo = { ...to, available: to.available + input.quantity }
  store.upsertInventoryLevel(updatedFrom)
  store.upsertInventoryLevel(updatedTo)
  store.addInventoryHistory([
    recordHistory(updatedFrom, -input.quantity, updatedFrom.available, 'Outgoing transfer'),
    recordHistory(updatedTo, input.quantity, updatedTo.available, 'Incoming transfer'),
  ])
}

export async function bulkAdjust(
  variantIds: string[],
  locationId: string,
  delta: number,
  reason: string,
): Promise<number> {
  await delay(400)
  let changed = 0
  for (const variantId of variantIds) {
    const current = levelFor(variantId, locationId)
    const next = Math.max(0, current.available + delta)
    if (next !== current.available) {
      const updated = { ...current, available: next }
      getStore().upsertInventoryLevel(updated)
      getStore().addInventoryHistory([recordHistory(updated, next - current.available, next, reason)])
      changed++
    }
  }
  return changed
}

export async function historyFor(variantId: string): Promise<InventoryHistoryEntry[]> {
  await delay(150)
  return getStore()
    .inventoryHistory.filter((h) => h.variantId === variantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
