import { useStore } from '@/store/useStore'
import type { AnalyticsSummary } from '@/types'

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

export interface StaffSessionInfo {
  id: string
  name: string
  email: string
  role: string
}

/** Returns the current staff session, or null only when the server returns 401. */
export async function checkSession(): Promise<StaffSessionInfo | null> {
  if (!API_URL) return null
  const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`Session check failed (${res.status})`)
  const data = await res.json()
  if (!data?.staff) throw new Error('Session check returned an invalid response')
  return data.staff
}

/** Authenticate with email + password; sets HttpOnly session cookie. */
export async function login(email: string, password: string): Promise<StaffSessionInfo> {
  if (!API_URL) throw new Error('API_URL not configured')
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.message ?? 'Invalid email or password')
  return body.staff
}

export async function logout(): Promise<void> {
  if (!API_URL) return
  await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
}

export async function gqlRequest<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!API_URL) throw new Error('API_URL not configured')
  const res = await fetch(`${API_URL}/graphql`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    // Hard cap: a stalled socket (e.g. mid-restart backend) would otherwise hang
    // the bootstrap reconcile guard (`refreshing`) forever.
    signal: AbortSignal.timeout(90_000),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data as T
}

/** GraphQL literal for inline values (JSON-compatible with GraphQL input literals) */
export const q = (v: unknown): string => JSON.stringify(v ?? null)

/** Serialize a JS value as a GraphQL input literal (unquoted object keys). */
export function gqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(gqlLiteral).join(',')}]`
  if (typeof v === 'object')
    return `{${Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${k}: ${gqlLiteral(x)}`)
      .join(',')}}`
  return 'null'
}

/** Fire an inline mutation against the backend (remote mode only); reconciles after. */
export function syncMutation(mutation: string): void {
  if (!IS_REMOTE) return
  const field = mutation.replace(/^mutation\s*/, '').trim().replace(/^{(.*)}$/s, '$1').trim()
  gqlRequest(`mutation _ { ${field} }`)
    .then(() => scheduleRefresh())
    .catch((e) => {
      console.error('[sync]', mutation.slice(0, 60), e)
      scheduleRefresh()
    })
}

// ─── Server reconcile ───────────────────────────────────────────────────────

const SNAPSHOT_QUERY = `{
  bootstrap {
    products { id title descriptionHtml vendor productType category status tags collectionIds channels options { name values } variants { id productId title sku barcode price compareAtPrice costPerItem optionValues weightGrams imageId available } media { id productId type src alt } seo { title description handle } weightGrams requiresShipping trackQuantity createdAt updatedAt totalInventory }
    customers { id firstName lastName email phone defaultAddress { firstName lastName address1 address2 city province country zip phone company } addresses { firstName lastName address1 address2 city province country zip phone company } tags note emailMarketingConsent taxExempt createdAt ordersCount totalSpent lastOrderAt }
    orders { id name customerId email phone createdAt cancelledAt closedAt paymentStatus fulfillmentStatus status channel lineItems { id productId variantId title variantTitle sku quantity price totalDiscount requiresShipping imageSrc restockedQty } shippingAddress { firstName lastName address1 address2 city province country zip phone company } billingAddress { firstName lastName address1 address2 city province country zip phone company } shippingTitle shippingPrice discountCode { code amount } giftCardCode giftCardApplied transactions { id createdAt kind amount fee net gateway description } subtotal taxTotal total currency tags note timeline { id createdAt type message author } fulfillments { id createdAt lineItemIds trackingNumber carrier locationId status } refunds { id createdAt amount reason lineItemIds restock } paymentGateway isDraft riskLevel riskSignals }
    abandonedCheckouts { id customerId email createdAt lineItems { id productId variantId title variantTitle sku quantity price totalDiscount requiresShipping imageSrc restockedQty } total recoveryStatus }
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
    metaobjectDefinitions { id name fields { key label type } }
    metaobjectEntries { id definitionId fields status updatedAt }
    savedSearches { id name resourceType query createdAt }
    priceLists { id name currency companyId locationId parentCompanyId entries { id variantId price } createdAt updatedAt }
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

/** Upload a file; remote mode stores on the backend, local mode returns a data URL. */
export async function uploadMedia(file: File): Promise<{ url: string; name: string; sizeKb: number }> {
  if (IS_REMOTE) {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API_URL}/uploads`, { method: 'POST', credentials: 'include', body: fd })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Upload failed')
    return res.json()
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
  return { url: dataUrl, name: file.name, sizeKb: Math.max(1, Math.round(file.size / 1024)) }
}

/** Server-first create: run mutation, return `{ field, userErrors }`. */
export async function mutatePayload(field: string, mutation: string): Promise<{ entity: any; userErrors: any[] }> {
  const data = await gqlRequest(`mutation _ { ${mutation} }`)
  const payload: any = data?.[field] ?? {}
  if (payload.userErrors?.length) throw new Error(payload.userErrors.map((e: any) => e.message).join('; '))
  scheduleRefresh()
  const entityKey = Object.keys(payload).find((k) => k !== 'userErrors')
  return { entity: entityKey ? payload[entityKey] : null, userErrors: payload.userErrors ?? [] }
}

/** Server-computed analytics for a date range (remote mode only; null offline). */
export async function fetchAnalytics(from: string, to: string): Promise<AnalyticsSummary | null> {
  if (!IS_REMOTE) return null
  const data = await gqlRequest<{ analytics: AnalyticsSummary }>(
    `{ analytics(from: ${q(from)}, to: ${q(to)}) { from to grossSales discounts refunds netSales shipping taxes giftCardSales ordersCount avgOrderValue returningCustomerRate topProducts { productId title units revenue } } }`,
  )
  return data.analytics ?? null
}
