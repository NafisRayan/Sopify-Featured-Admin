import { getStore } from '@/store/useStore'
import { delay } from '@/lib/delay'
import { syncMutation, gqlLiteral } from './api'
import type { Metafield } from '@/types/parity'

/** Metafield editing service (Admin API: metafieldsSet / metafieldDelete) */

export function ownerKey(resourceType: 'product' | 'customer' | 'order' | 'company', id: string): string {
  return `${resourceType}:${id}`
}

export async function setMetafields(owner: string, list: Metafield[]): Promise<void> {
  await delay(300)
  const store = getStore()
  // values validated against definition types at the editor level
  store.updateMetafields(owner, list)
  const [ownerType, ownerId] = owner.split(':')
  syncMutation(`mutation { metafieldsSet(metafields: ${gqlLiteral(list.map((m) => ({ ownerType, ownerId, definitionId: m.definitionId, value: m.value })))}) { userErrors { message } } }`)
}
