# Shopify Parity Gap Report — Northstar Goods Admin Clone

**Date:** 2026-10-05
**Roles:** Senior project owner + senior engineer
**Reference:** Shopify Admin GraphQL API **2026-10 (`latest`)** — official inventory extracted from shopify.dev sitemap: **298 query fields / 532 mutation fields** across 1,159 object types.
**Audited codebase:** `backend/` (NestJS 10, schema-first Apollo SDL, Prisma → Neon Postgres) + `frontend/` (React 18 + Vite + Zustand admin SPA).
**Evidence:** full code read of all 5 SDL files, 9 backend module services (4,600+ lines), 15 frontend service files, route table, Prisma schema (40 models), `PRODUCT_SQA_AUDIT.md` (2026-09-18, corrected 2026-09-30), and live-capable QA harness (`backend/qa-api.mjs`).

---

## 1. Executive summary

The clone implements **55 of 298 Shopify queries and 108 of 532 Shopify mutations**, deliberately scoped to the merchant-facing admin surface (Tier A below). Its **conventions are excellent** — Relay connections, Global Object Identification, `userErrors` payloads, status vocabularies — and the previously-audited money/stock Criticals (C1–C6) are **fixed and verified in current code**.

What remains between this clone and "100% of the Shopify admin system in exact flow" is, in order of merchant impact:

1. **12 frontend remote-sync gaps** — local-only writes silently reverted by the next bootstrap reconcile (bulk tags, discount status, metafields, locales/markets, company/segment edits, file rename, metaobjects, bulk inventory adjust).
2. **Correctness residuals** — payouts never generated (transactions carry `payoutId: null`, upcoming payout can render negative), digital line items hardcoded `requiresShipping: true`, analytics "net sales" invented client-side (`× 0.972`), `resetDemoData` is a no-op stub.
3. **Missing Tier A API flows** — fulfillment cancel/tracking events, returns approve/decline/cancel lifecycle, customer merge/invite/consent, B2B fixed-price price lists (real Shopify B2B flow vs today's `%` approximation), inventory on-hand count/SKU update/move, draft-from-order/duplicate, saved searches, count queries, shop policies, market create/delete, domain management, `currentStaffMember`.
4. **Platform-infrastructure surface (Tier B)** that no admin clone should or can replicate without being Shopify: webhooks, bulk operations, app billing, functions/pixels, staged uploads, POS devices, subscriptions billing engine, multi-currency `MoneyV2`. These are **documented exclusions**, not gaps.

**Verdict:** ~85% of Tier A is done properly. This report defines the remaining 15% and the exact work to close it; everything in §6 is implemented in the current pass unless explicitly marked *Excluded*.

---

## 2. Scope definition (what "100%" means)

### Tier A — Merchant admin surface (target: 100%)

Everything a store staff member can do in Shopify Admin UI, with the matching Admin GraphQL API flow:

Products & catalog, collections, orders & fulfillment & returns & refunds, draft orders, abandoned checkouts, customers & segments, B2B companies & price lists, discounts, gift cards, inventory/transfers/locations, payouts, online-store content (pages/blog/menus/redirects/themes), files, metafields/metaobjects, marketing campaigns, analytics, staff & permissions, settings (general/checkout/payments/shipping/taxes/notifications/policies/languages/markets/domains/plan/billing), global search, saved searches, notifications, activity log.

### Tier B — Platform / app-developer surface (excluded, with justification)

| Shopify surface | Mutations (n) | Why excluded |
|---|---|---|
| Webhooks, EventBridge/pubSub subscriptions | 9 | Server-to-app push infra; no consuming apps exist |
| Bulk operations (`bulkOperationRun*`) | 4 | Async job infra for API-scale datasets |
| App billing (`appPurchaseOneTimeCreate`, `appSubscription*`, `appUsageRecordCreate`) | 8 | App-store monetization; this store has no apps billing merchants |
| Staged uploads (`stagedUploadTargetGenerate*`) | 3 | Direct-to-CDN upload protocol; clone uploads via authenticated REST `/uploads` |
| Functions ecosystem (cartTransform, paymentCustomization, deliveryCustomization, validation*) | 12 | Requires checkout runtime + WASM functions platform |
| Pixels (server/web) & script tags | 11 | Third-party analytics injection platform |
| POS / cash drawers / cash management | 14 | Physical POS device fleet |
| Subscriptions (sellingPlanGroup*, subscriptionContract*, subscriptionBilling*) | 46 | Requires tokenized gateway billing engine + customer portal; catalog + billing + skip/resume state machine is a product, not an admin feature |
| Carrier services, delivery promises/profiles | 14 | Live carrier rate integrations |
| Disputes (`disputeEvidenceUpdate`) | 1 | Requires real Shopify Payments gateway |
| Translations / localizations register | 4 | Multi-locale content rendering (locales list is managed, §6) |
| Mobile platform applications, delegate access tokens, rollout, privacy erasure jobs, consent policy, backup regions | 12 | Platform ops |
| Checkout branding / checkout profiles | 7 | Hosted checkout engine surface |
| ShopifyQL (`shopifyqlQuery`) | 1 | Replaced by a purpose-built server `analytics` query (§6 W1.7) — documented equivalence |
| Store credit accounts (`storeCreditAccountCredit/Debit`) | 2 | Redundant wallet next to Gift Cards in single-currency clone; gift cards cover merchant-issued credit |
| Payments auth→capture→void (`orderCapture`, `transactionVoid`) | 2 | No live gateway can place an AUTH hold; `orderMarkAsPaid` SALE + refund path is the documented equivalent |
| Reverse logistics disposal (`reverseFulfillmentOrderDispose`, `reverseDelivery*`) | 3 | Recycling-partner network integration |
| Requested order edits (customer-submitted) | 3 | Requires storefront checkout surface (out of scope) |
| Payment terms templates (`paymentTerms*`) | 3 | Roadmap (§8); B2B due-date invoicing is real but lower merchant impact than price lists |
| Bundles / combined listings / quantity rules / product feeds | 10 | Catalog-complexity features; roadmap (§8) |

Tier B totals ~160 mutations that are **platform capability**, not admin workflows. Excluding them is the same judgment Shopify itself makes when it ships "Admin" without them to merchants.

---

## 3. What is done properly ✅

Verified in current code (file:line evidence from backend scout):

**API conventions (Shopify-grade):**
- QueryRoot singular/plural, `first/after/last/before/reverse/query` args (`root.graphql:11-50`)
- Relay `Node` interface + `node`/`nodes` with `gid://shopify/<Type>/<id>` parsing and 50-id cap (`store-content.module.ts:713-869`)
- Connections with full `PageInfo` bidirectional slicing (`common/relay-and-goi.test.ts`)
- `*Payload { userErrors: [UserError!]! }` on every mutation (orders resolver try/catch pattern)
- Status vocabularies mirror Shopify (payment/fulfillment/discount statuses)

**Commerce correctness (audit Criticals — all fixed):**
- C1 inventory: reserve on convert (`orders.service.ts:1267-1272`), consume committed/on-hand at fulfill (`:260-303`), no empty-level fake success
- C2 refunds restock refunded qty at the fulfillment location, once (`:530-559`)
- C4 discounts: code lookup, window/limit/min-purchase/eligibility incl. BXGY + free shipping + best-automatic selection, `usedCount` incremented exactly at conversion (`:941-1145`, `:1243-1279`)
- C6 paid cancel writes a real refund record + gift-card restore + balance transaction (`:341-419`)
- H9 guards on markAsPaid/fulfill/close/reopen/cancel/refund → userErrors
- H10 customer spend subtracts refunds (`customers.module.ts:15-33`)
- H11 tax settings + `taxExempt` + B2B `%` price multiplier applied at draft computation and order edit (`orders.service.ts:135-152`, `:986-987`)
- H12 gift-card tender: validated, capped at balance, redeemed at conversion with history + balance transaction + born-paid (`:1124-1131`, `:1253-1315`)
- H13 balance transactions written on markAsPaid/refund/cancel/return-close with gateway-style fee (2.9% + $0.30) (`:317-331`, `:565-632`) — *payout generation still missing (§4)*
- H14 variant create ensures InventoryLevel rows per active location; SKU uniqueness (`products.service.ts:36`, `:70-84`)
- H2 transfer double-apply fixed — remote path early-returns after `mutatePayload` (`parityService.ts:244-318`)
- H5/H7 order edit + draft update full-field recompute; remote sync wired

**Security:** session auth (scrypt + HMAC cookie), per-mutation permission enforcement default-deny, `check:authz` SDL↔map parity script, upload protection, CORS allowlist.

**Breadth already present:** products/variants/media, collections (manual+smart), orders end-to-end, draft orders w/ live calculation, abandoned recovery/convert, returns (create/close), customers, companies, segments (server-evaluated), discounts (code+automatic, 4 types), gift cards, inventory adjust/history/transfers (two-step), locations, payouts read-model, pages/blog/files/menus/redirects, metafields, metaobjects, themes (library+publish), apps (demo), staff + permissions + activity, notifications, tasks, settings (general/checkout/payments/shipping/taxes/markets/locales/plan), global search.

---

## 4. Correctness residuals (open bugs)

| # | Issue | Evidence | Fix (plan §6) |
|---|---|---|---|
| R1 | **Payouts never generated.** All written `BalanceTransaction.payoutId = null`; no code creates `Payout` rows; "Upcoming payout" sums seed and can be negative | `finances.module.ts:10-19` read-only; `orders.service.ts` money writes set `payoutId: null` | W1.2 payout materializer |
| R2 | **Digital lines can't exist.** `requiresShipping: true` hardcoded on every line item (`orders.service.ts:1006`, `:717`); the digital-aware `recomputeFulfillmentStatus` (`:119-126`) is dead code; product `requiresShipping` flag never copied | M8 | W1.1 |
| R3 | **Analytics net sales invented** — `netSales = totalSales × 0.972` client-side; conversion is simulated constant | `analytics.ts:118-121`, `DashboardPage.tsx:111-112` | W1.7 server `analytics` query |
| R4 | **`resetDemoData` is a stub** — returns settings, resets nothing | `store-content.module.ts:1231-1233` | W1.3 |
| R5 | **Metaobjects never hydrate remote** — absent from `AdminSnapshot`, `SNAPSHOT_QUERY`, `hydrateRemote`; entries CRUD is local-only | frontend scout §5 | W2.1 |
| R6 | Segment tag `equals` semantics — audit H10 note; verify exact-match on tag arrays vs joined-string | `customers.module.ts` segment engine | W1.6 |
| R7 | Campaign metrics are RNG (`campaignLaunch`) — labeled "simulated" in UI | `commerce.module.ts:110-153` | Documented deviation (no attribution source; faking attribution would violate the no-fake-UI rule) |
| R8 | Gift-card `initialSort` key `created` matches no column (audit M5, cosmetic) | `GiftCardsListPage.tsx` | W2 UI pass |

---

## 5. Frontend remote-sync gaps (remote-mode data loss)

Local-only writes overwritten by the next bootstrap reconcile (frontend scout §3/§4, verified):

| # | Operation | File:line | Backend mutation exists? |
|---|---|---|---|
| F1 | `bulkAddTags` (orders) | `ordersService.ts:328-335` | ✅ `orderUpdate(tags)` — not called |
| F2 | `setDiscountsStatus` | `discountsService.ts:77-81` | ✅ `discountStatusSet` — not called |
| F3 | Product helpers: bulk status/tags, media add/remove/reorder/featured, `updateVariant(s)`, `setOptions`, `setChannels` | `productsService.ts:117-270` | ✅ `productStatusSet`/`productAddTags`/`productRemoveTags`/`productMediaReorder`/`productUpdate` — not called |
| F4 | Customer tags add/remove, `setConsent`, `addAddress`, `setDefaultAddress` | `customersService.ts:78-116` | tags/addresses ✅; consent ❌ (add W2) |
| F5 | `inventoryService.bulkAdjust`, `transferInventory` (drawer two-level move) | `inventoryService.ts:62-99` | bulk ✅ `inventoryBulkAdjust` — not called; move ❌ (add W2 `inventoryMoveQuantities`) |
| F6 | `metafieldService.setMetafields` — comment claims parity, fires nothing | `metafieldService.ts:11-15` | ✅ `metafieldsSet` — not called |
| F7 | Metafield definition create/delete (settings) | `SettingsSectionPage.tsx:863/894` | ✅ — not called |
| F8 | Locales add/remove, markets price/enable | `SettingsSectionPage.tsx:540/685/705/750` | ✅ `localeAdd/Remove`, `marketUpdate` — not called |
| F9 | `updateCompany`/`deleteCompany`/`addCompanyLocation`/`addCompanyContact` | `parityService.ts:85-123` | ✅ — not called |
| F10 | Segment create/update/delete | `parityService.ts:166-196` | ✅ — not called |
| F11 | `renameFile` / `setFileAlt` | `contentService.ts:104-113` | ✅ `fileUpdate` — not called |
| F12 | `sendDraftInvoice` | `orderEditService.ts:273-280` | ✅ `draftOrderInvoiceSend` — not called |
| F13 | Metaobject entries CRUD (see R5) | `EntriesListPage.tsx:13-21` | ✅ mutations exist; snapshot missing |

Dead/fake UI to remove or complete: Apps **Open** toast (`AppsPage.tsx:99-101`), theme **Preview** toast (`OnlineStorePage.tsx:76-78`), dead `ComingSoonPage`, dead `src/lib/rng.ts`.

---

## 6. Plan to 100% (Tier A) — implemented in this pass

### W1 — Backend correctness
1. **Digital lines (R2):** copy `requiresShipping` from product/variant onto every line item at draft create/update/edit/convert; invoke `recomputeFulfillmentStatus` on every mutation that changes lines.
2. **Payout generation (R1):** settings gain `payouts: { schedule: 'daily'|'weekly'|'biweekly'|'monthly', dayOfWeek? }`. Idempotent materializer buckets every `charge/refund/gift_card` transaction (incl. seed) into dated `Payout` rows on `payouts`/`balanceTransactions`/`bootstrap` reads; status `scheduled → in_transit → paid` by date. Upcoming payout = sum of open bucket (never negative display bug once fees net correctly).
3. **Real `resetDemoData` (R4):** extract seed core from `prisma/seed.ts` into importable `src/seed/seed-core.ts`; mutation = transactional wipe + reseed (owner-only, already in permission map).
4. **`bootstrap` adds metaobjects** (definitions + entries) — kills R5 backend half.
5. **Count queries:** `ordersCount`, `draftOrdersCount`, `productsCount`, `customersCount`, `collectionsCount`, `discountsCount`, `giftCardsCount`, `segmentsCount`, `pagesCount`, `blogPostsCount`, `redirectsCount`, `locationsCount` — Shopify has a `*Count` for every list.
6. **Segment engine (R6):** `equals` on tags = exact array membership; `contains` = substring — mirror Shopify segment semantics; regression test.
7. **Server `analytics(from, to)`:** gross sales, discounts, refunds/returns, net sales (gross − discounts − refunds), shipping, taxes, orders count, AOV, top products — computed from orders; dashboard/analytics pages consume it; the `×0.972` invention is deleted. Sessions/conversion stay labeled simulated (no storefront).

### W2 — Shopify-flow API additions (backend), each wired to UI
**Orders / fulfillment / returns:**
- `fulfillmentCancel(fulfillmentId)` — reverses stock consumption (restock at fulfillment location), removes fulfillment, recomputes status, timeline entry, guards on shipped-tracking.
- `fulfillmentEventCreate(fulfillmentId, status, message, notifiedAt?)` — tracking event log on the fulfillment (Shopify's `FulfillmentEvent`).
- `returnApprove(id)` / `returnDecline(id, reason)` / `returnCancel(id)` — full Shopify Return lifecycle `requested → approved → complete | declined | canceled`; `returnClose` keeps processing semantics (restock + optional refund) mapping to `complete`.
- `draftOrderCreateFromOrder(orderId)` / `draftOrderDuplicate(id)`.
**Customers:**
- `customerSendAccountInviteEmail(id)` — invitation Notification + activity log (email delivery itself simulated-and-labeled, consistent with single-surface app).
- `customerEmailMarketingConsentUpdate(ids, consentState)` / `customerSmsMarketingConsentUpdate(ids, consentState)` — single-customer and bulk.
- `customerMerge(primaryId, secondaryId)` — reassign orders/returns/gift cards, union tags/addresses, stats recompute, delete secondary.
**B2B price lists (real Shopify flow):**
- Models `PriceList` (name, currency, companyId?, locationId?, parent Catalog compressed) + `PriceListEntry` (variantId, fixed price).
- `priceListCreate/Update/Delete`, `priceLists(companyId?)`, `Company.priceLists`.
- Draft/order computation: location-scoped fixed price → company-scoped fixed price → existing `%` multiplier fallback.
**Inventory:**
- `inventorySetOnHandQuantities(input)` — absolute count with reason (Shopify: cycle counts).
- `inventoryMoveQuantities(input)` — single-mutation ledger move between locations (drawer flow).
- `inventoryItemUpdate(variantId, sku?, cost?, tracked?)` + `inventoryActivate/Deactivate(variantId)` — SKU moves to uniqueness-checked field, `tracked` gates stock consumption.
**Content / settings:**
- `shopPolicies` query + `shopPolicyUpdate(policy, body)` — refund/privacy/terms/shipping/subscriber policy pages (Settings → Policies UI).
- `marketCreate` / `marketDelete` (parity with `marketUpdate`), `localeUpdate(code, name)`.
- `metafieldDefinitionUpdate`, `metafieldsDelete(ids)`, `metaobjectDefinitionUpdate`.
- `domains` query + `domainAdd/domainSetPrimary/domainDelete` — Settings → Domains (documented REST-flow compression), settings JSON-backed.
- `savedSearches(resourceType)` + `savedSearchCreate/Update/Delete` — saved searches on list pages (UI ships for Orders first).
- `giftCardUpdate(id, note?, expiresOn?)`.
- `collectionDuplicate(id)`; `themeDuplicate(id)`.
- `currentStaffMember` query (GraphQL parity for `/auth/me`).

### W3 — Frontend
- Wire every §5 gap F1–F13 to the existing/new mutations (same `syncMutation`/`mutatePayload` pattern).
- New UI: returns approve/decline/cancel buttons; fulfillment cancel + tracking-event drawer; price-list editor on company detail; Settings → Policies + Domains sections; saved-search tabs on Orders; server-analytics dashboard; payout page on generated payouts.
- Remove dead code: `ComingSoonPage`, `lib/rng.ts`; replace fake Open/Preview toasts with honest disabled affordances (removed).
- Gift-card list sort key fix (R8).

### W4 — Verification & docs
- `mutation-permissions.ts` updated for all new mutations; `npm run check` (authz + seed syntax + build) green.
- Prisma migration + reseed against Neon; unit tests extended (payout materializer, price-list application, segment equals, returns lifecycle guards).
- `qa-api.mjs` extended with the new flows; live run green.
- `SHOPIFY_PARITY.md` rewritten to reflect post-implementation state; README updated; §7 status column of this report updated.

---

## 7. Domain-by-domain parity matrix (post-plan status)

| Domain | Shopify flow | Clone before | After this pass |
|---|---|---|---|
| Products & variants | CRUD, duplicate, status, tags, media, options | ✅ core; helpers unsynced | ✅ 100% (helpers synced) |
| Collections | CRUD, add/remove, smart rules, duplicate | 🔶 no duplicate | ✅ |
| Orders & fulfillment | fulfill, cancel fulfillment, tracking events, guards | 🔶 no cancel/tracking | ✅ |
| Returns | request→approve/decline→complete/cancel | 🔶 create/close only | ✅ full lifecycle |
| Refunds | per-line, restock-at-location, once | ✅ | ✅ |
| Draft orders | create/update/calc/convert/invoice/from-order/duplicate | 🔶 last two missing | ✅ |
| Discounts | code+auto, basic/bxgy/freeship, status, usage | ✅ core | ✅ (+status sync) |
| Gift cards | issue/adjust/enable/disable/notify/update | 🔶 no update | ✅ |
| Customers | CRUD, tags, addresses, consent, invite, merge | 🔶 last three missing | ✅ |
| Segments | CRUD, server-eval, counts | 🔶 equals bug | ✅ |
| B2B companies | companies, locations, contacts, price lists | 🔶 % only, edits unsynced | ✅ fixed-price lists |
| Inventory | adjust, bulk, count, move, transfers, item update | 🔶 count/move/item missing | ✅ |
| Payouts | scheduled buckets, statuses, per-transaction link | ❌ read-only seed | ✅ generated |
| Analytics | reports from real data | ❌ invented | ✅ server-computed |
| Online store | pages/blog/menus/redirects/policies/themes | 🔶 policies missing | ✅ |
| Files | create/update/delete, upload | 🔶 update unsynced | ✅ |
| Metafields | defs CRUD + set/delete | 🔶 update/delete missing | ✅ |
| Metaobjects | defs + entries CRUD | 🔶 local-only | ✅ remote |
| Markets/locales | update + create/delete | 🔶 update only, unsynced | ✅ |
| Staff & access | CRUD, permissions, status, current member | 🔶 no current query | ✅ |
| Settings | general/checkout/payments/shipping/taxes/notifications/policies/domains | 🔶 policies+domains missing | ✅ |
| Saved searches | per-resource saved queries | ❌ | ✅ (Orders UI) |
| Search | global resource search | 🔶 subset | ✅ (subset documented) |
| Apps / channels | install/toggle | ✅ demo (documented) | demo |
| Marketing campaigns | create/launch/complete/delete | ✅ (metrics labeled simulated) | same |
| Notifications/tasks | in-app | ✅ clone-specific | same |
| Billing/plan | plan card | ✅ demo card | same |

---

## 8. Explicit remaining exclusions (beyond Tier B §2, with reasons)

1. **Storefront/checkout engine** — the clone is the admin surface; online-store preview is honest-disabled, not faked.
2. **Subscriptions** — full `sellingPlanGroup` + `subscriptionContract` billing engine is a product surface (46 mutations, tokenized gateway); excluded with the same logic as checkout.
3. **Payment terms templates** (`paymentTerms*`) — roadmap; smaller merchant win than price lists; tracked here for the next iteration.
4. **Bundles / combined listings / quantity rules / product feeds** — catalog-complexity roadmap items.
5. **Multi-currency `MoneyV2`** — single-currency demo documented deviation (settings currency field honored by formatter).
6. **2FA for staff** — auth hardening roadmap; password auth + sessions + permissions shipped.
7. **Campaign attribution** — no attribution source exists without a storefront; metrics stay labeled simulated rather than fabricated.
8. **Count queries for remaining minor lists** (apps/files/menus/staff/…counts) — trivial to add later; the shipped twelve cover every Shopify list the UI paginates.

---

## 9. Verification protocol (acceptance)

1. `cd backend && npm run check` — authz map parity + seed syntax + clean build.
2. `npx prisma db push` + `npm run seed` against Neon; `npm test` (unit) green.
3. `node qa-api.mjs` (live :4000, authenticated) — extended suite incl.: returns lifecycle, fulfillmentCancel restock, price-list application on draft calculate, payout buckets, customer merge, consent, saved searches, counts, policies, domains, digital-line fulfillment, metaobject snapshot round-trip.
4. Frontend `npm run build` + browser pass: remote mode — every §5 operation survives a focus-refetch; returns/price-list/policies/domains/saved-search UI functional; payouts ledger-true.
5. This report §7 statuses confirmed; `SHOPIFY_PARITY.md` rewritten (no overclaims).

---

## 10. Implementation result (2026-10-05)

Everything in §6 W1–W4 is implemented and verified:

- **Backend:** 74 queries / 145 mutations (was 55/108); `npm run check` green (authz 145↔145, seed, build); `npm test` green.
- **Live QA:** `qa-api.mjs` extended with sections 11–15 (counts, currentStaffMember, domains, policies, consent/invite/merge, price lists + B2B fixed-price application, returns lifecycle, fulfillment cancel/tracking events, set-on-hand/move/item-update, payouts, analytics, saved searches, metaobjects) — **124 passed / 0 failed** against the seeded Neon DB, re-confirmed after the final snapshot fixes.
- **`resetDemoData`:** real transactional reseed via GraphQL, ~80s (seed inserts batched with `createMany`; was 5.5 min per-row).
- **Frontend:** `npm run build` green; browser-verified in remote mode — dashboard on server analytics (net sales server-computed, returning-rate scale fixed), orders saved-search bar, order detail Fulfillments card (cancel + tracking events), returns lifecycle (approve/decline/cancel/process), company price lists, Settings → Domains (primary/SSL/verification + payout schedule) and Policies (5 policies), payouts page ledger-true (55 payouts; scheduled/in_transit/paid; fictional seed rows dropped).
- **Fixes found during live verification:** snapshot `settings` key restored (bootstrap silently failed → frozen store), `Fulfillment.events` defaulting, `PriceList.parentCompanyId` snapshot decoration, `customersCount` resolver, `settingsUpdate` shallow-merge (partial updates no longer wipe policies/domains/payouts), empty-lineItems fulfill guard, `ensurePayouts` N+1 elimination (~60s → ~1s steady-state), 90s fetch timeout so a stalled bootstrap can never freeze reconciliation.
- **Remaining known deviations:** exactly those documented in §8 (plus §2 Tier B); no fake UI remains (Open/Preview toasts removed).

*End of report.*
