import { useStore } from '@/store/useStore'

/**
 * GraphQL bridge to the NestJS backend (backend/).
 *
 * Mode selection:
 *  - VITE_API_URL set  → REMOTE: every UI mutation optimistically updates the
 *    local store, fires the matching GraphQL mutation, then reconciles with a
 *    debounced `bootstrap` refetch (server is source of truth).
 *  - VITE_API_URL unset → LOCAL demo: localStorage persistence only.
 */

export const API_URL: string | undefined = (import.meta as any).env?.VITE_API_URL || undefined
export const IS_REMOTE = Boolean(API_URL)

export async function gqlRequest<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!API_URL) throw new Error('API_URL not configured')
  const res = await fetch(`${API_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data as T
}

/** GraphQL literal for inline values (JSON-compatible with GraphQL input literals) */
export const q = (v: unknown): string => JSON.stringify(v ?? null)

/** Fire an inline mutation against the backend (remote mode only); reconciles after. */
export function syncMutation(mutation: string): void {
  if (!IS_REMOTE) return
  const field = mutation.replace(/^mutation\s*/, '').trim().replace(/^{(.*)}$/s, '$1').trim()
  gqlRequest(`mutation _ { ${field} }`)
    .then(() => scheduleRefresh())
    .catch((e) => console.error('[sync]', mutation.slice(0, 60), e))
}

// ─── Server reconcile ───────────────────────────────────────────────────────

const SNAPSHOT_QUERY = `{
  bootstrap {
    products { id title descriptionHtml vendor productType category status tags collectionIds channels options { name values } variants { id productId title sku barcode price compareAtPrice costPerItem optionValues weightGrams imageId available } media { id productId type src alt } seo { title description handle } weightGrams requiresShipping trackQuantity createdAt updatedAt totalInventory }
    customers { id firstName lastName email phone defaultAddress { firstName lastName address1 address2 city province country zip phone company } addresses { firstName lastName address1 address2 city province country zip phone company } tags note emailMarketingConsent taxExempt createdAt ordersCount totalSpent lastOrderAt }
    orders { id name customerId email phone createdAt cancelledAt closedAt paymentStatus fulfillmentStatus status channel lineItems { id productId variantId title variantTitle sku quantity price totalDiscount requiresShipping imageSrc } shippingAddress { firstName lastName address1 address2 city province country zip phone company } billingAddress { firstName lastName address1 address2 city province country zip phone company } shippingTitle shippingPrice discountCode { code amount } subtotal taxTotal total currency tags note timeline { id createdAt type message author } fulfillments { id createdAt lineItemIds trackingNumber carrier locationId status } refunds { id createdAt amount reason lineItemIds restock } paymentGateway isDraft riskLevel riskSignals }
    abandonedCheckouts { id customerId email createdAt lineItems { id productId variantId title variantTitle sku quantity price totalDiscount requiresShipping imageSrc } total recoveryStatus }
    collections { id title descriptionHtml imageSrc handle type rules { column relation condition } rulesMatch productIds status seoTitle seoDescription publishedAt createdAt }
    locations { id name address1 city province country zip phone active createdAt }
    inventoryLevels { variantId locationId available committed unavailable onHand }
    inventoryHistory { id variantId locationId change resultingAvailable reason createdAt author }
    discounts { id code title type method value bxgy { customerBuysQuantity customerBuysAmount customerGetsQuantity customerGetsDiscountPercent } minPurchase customerEligibility productEligibility productIds usageLimit usedCount startsAt endsAt status combinations { orderDiscounts productDiscounts shippingDiscounts } }
    campaigns { id name channel status sentAt audience reached sessions orders revenue cost }
    staff { id name email role status lastActiveAt permissions }
    pages { id title contentHtml handle status seoTitle seoDescription createdAt updatedAt }
    blogPosts { id title author excerpt contentHtml imageSrc tags status publishedAt }
    files { id name type src sizeKb dimensions uploadedAt alt }
    menus { id title handle items { id title url children { id title url children { id title url children { id title url } } } } }
    apps { id name description iconBg iconChar status permissions category suggested }
    notifications { id kind title body createdAt read link }
    tasks { id title description done link }
    theme { activeTheme value }
    themeLibrary { id name version role imageSrc addedAt }
    companies { id name externalId status customerId note locations { id name phone address { firstName lastName address1 address2 city province country zip phone company } taxExempt } contacts { id name email phone locationIds isPrimary } priceListDiscountPercent createdAt totalSpent }
    segments { id name description filters { column relation value } createdAt memberCount }
    transfers { id name status fromLocationId toLocationId lines { id variantId sku title variantTitle quantity receivedQuantity } createdAt sentAt receivedAt note }
    giftCards { id code customerId initialBalance balance currency status expiresAt note createdAt history { id at type amount note } }
    payouts { id status amount currency issuedAt arrivedAt bankAccount }
    balanceTransactions { id at type amount fee net orderId description payoutId }
    metafieldDefinitions { id namespace key name type description resourceType }
    metafields { id ownerType ownerId definitionId value }
    redirects { id from to createdAt }
    locales { code name isDefault published }
    markets { code name currency priceAdjustmentPercent enabled }
    activity { id at staffId staffName action resource resourceId }
    returns { id orderId status lines { lineItemId quantity } reason restock refundAmount createdAt closedAt }
    orderEdits
    plan { name status trialDaysLeft storeId }
    settings { value }
  }
}`

let refreshTimer: ReturnType<typeof setTimeout> | null = null
let refreshing = false

/** Debounced full reconcile from the server (server is source of truth). */
export function scheduleRefresh(delayMs = 600): void {
  if (!IS_REMOTE) return
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => void refreshFromServer(), delayMs)
}

export async function refreshFromServer(): Promise<void> {
  if (!IS_REMOTE || refreshing) return
  refreshing = true
  try {
    const data = await gqlRequest<any>(SNAPSHOT_QUERY)
    if (data?.bootstrap) {
      useStore.getState().hydrateRemote(data.bootstrap)
    }
  } catch (e) {
    console.error('[api] bootstrap refresh failed', e)
  } finally {
    refreshing = false
  }
}
