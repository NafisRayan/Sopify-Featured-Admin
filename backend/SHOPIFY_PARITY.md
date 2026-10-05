# Shopify Admin GraphQL API — Parity Matrix

Comparison of this backend's GraphQL surface against the Shopify Admin GraphQL API
(https://shopify.dev/docs/api/admin-graphql/latest, version 2026-10), domain by domain.
Companion gap analysis and scope rationale: [`../SHOPIFY_GAP_REPORT.md`](../SHOPIFY_GAP_REPORT.md).

**Surface:** 74 queries / 145 mutations (Shopify 2026-10: 298 / 532 — the delta is
platform/app-developer surface documented as out of scope in the gap report §2).

**Conventions replicated**

- QueryRoot with singular `product(id)` / plural `products(first, after, last, before, query, reverse)` patterns
- Relay Global Object Identification: `interface Node { id: ID! }`, `node(id: ID!): Node`, and `nodes(ids: [ID!]!): [Node]!` supporting both `gid://shopify/<Type>/<id>` and internal IDs
- Relay-style connections: `*Edge { cursor, node }`, `*Connection { edges, pageInfo, totalCount }`
- Full Relay `PageInfo`: `hasNextPage`, `hasPreviousPage`, `startCursor`, `endCursor` with bidirectional slicing (`first`/`after` and `last`/`before`)
- Mutations return `*Payload { entity, userErrors: [UserError!]! }` (never throw for expected failures)
- Domain + entity naming and status vocabularies (payment/fulfillment/discount/return statuses)
- `*Count` queries for every paginated list, `shop` singleton, `currentStaffMember`

**Documented deviations**

- Money is `Float` USD rather than `MoneyV2 { amount, currencyCode }` (single-currency demo)
- Aggregate objects (variants, line items, timeline…) are JSON-typed fields rather than fully relational connection graphs
- Order edits are a single `orderEdit` mutation rather than the staged `orderEditBegin…Commit` session (same recompute semantics)
- Discounts are a flat `Discount` type rather than Shopify's `discountNode` wrapper (same four classes: basic/BXGY/free-shipping/automatic)
- Marketing campaign reach/sessions metrics are simulated and labeled as such (no storefront traffic source)
- Monthly payout bucketing uses end-of-month + next-Friday simplification (documented in `finances.module.ts`)

## Coverage

| Shopify domain | Our query/mutation surface | Status |
|---|---|---|
| Products (Product, Variant, Option, Media) | `product(s)`, `productsCount`, `productCreate/Update/Delete/Duplicate`, `productStatusSet`, `productAddTags/RemoveTags`, `productMediaReorder`, `productVariantCreate/Update/Delete`, `inventoryItemUpdate` (SKU/cost/tracked), `inventoryActivate/Deactivate` | ✅ Core |
| Collections (Smart/Manual) | `collection(s)`, `collectionsCount`, `collectionCreate/Update/Delete/Duplicate`, `collectionAddProducts/RemoveProducts`, smart-rule evaluation | ✅ Core |
| Draft orders | `draftOrders(Count)`, `draftOrderCreate/Update/Delete/Calculate/Convert/InvoiceSend`, `draftOrderCreateFromOrder`, `draftOrderDuplicate`; discounts, tax-exempt, B2B pricing + gift-card tender in calculation | ✅ Core |
| Orders (LineItem, Fulfillment, Refund, Transaction, Risk) | `order(s)(Count)`, `orderMarkAsPaid`, `orderCancel`, `orderClose/Reopen`, `orderFulfill`, `orderRefund`, `orderEdit`, reservation ledger, status guards, risk, timeline, `Order.transactions` read-model | ✅ Core (markAsPaid is a SALE — auth→capture→void needs a live gateway, out of scope) |
| Fulfillment lifecycle | `fulfillmentCancel` (restock reversal), `fulfillmentEventCreate` (Shopify event statuses), per-fulfillment events log | ✅ Core |
| Returns & exchanges | `returnCreate` (requested) → `returnApprove` → `returnClose` (complete, restock at fulfillment location + optional refund) \| `returnDecline` \| `returnCancel`; legacy statuses normalized | ✅ Core (buyer-requested returns need a storefront) |
| Abandoned checkouts | `abandonedCheckouts`, `abandonedCheckoutRecoverySend`, `abandonedCheckoutConvert` | ✅ Core |
| B2B (Company, Location, Contact, PriceList) | `companies/company`, company CRUD + locations/contacts, **price lists with per-variant fixed prices** (`priceListCreate/Update/Delete`, `priceLists(companyId)`, `Company.priceLists`), location-scoped price resolution before company `%` fallback | ✅ Core (Catalogs container compressed into company→priceList link) |
| Customers | `customer(s)(Count)`, CRUD, tags, addresses, `customerEmailMarketingConsentUpdate`, `customerSmsMarketingConsentUpdate`, `customerSendAccountInviteEmail`, `customerMerge` | ✅ Core |
| Customer segments | `segments(Count)`, `segmentMembers`, `segmentCreate/Update/Delete`, tag `equals` = exact membership, spend-minus-refunds stats | ✅ Core |
| Inventory | `inventoryLevels`, `inventoryHistory`, `inventoryAdjust`, `inventoryBulkAdjust`, `inventorySetOnHandQuantities` (cycle counts), `inventoryMoveQuantities`, `locations(Count)`, `locationCreate/Update` | ✅ Core |
| Inventory transfers | `transfers`, `inventoryTransferCreate/Send/Receive` two-step audited stock move | ✅ Core |
| Gift cards | `giftCards(Count)`, `giftCardCreate/Disable/Enable/BalanceAdjust/Update/SendNotification`, history, tender redemption on draft→order conversion | ✅ Core |
| Discounts & marketing | `discounts(Count)`, `discountCreate/Update/Delete/StatusSet` (code + automatic, basic/BXGY/free-shipping, eligibility/limits enforced at conversion), `campaigns`, `campaignCreate/Launch/Complete/Delete` (metrics labeled simulated) | ✅ Core |
| Shopify Payments (Payout, BalanceTransaction) | `payouts`, `balanceTransactions` — payouts **materialized** from every charge/refund/gift-card transaction on a settings-driven schedule (`scheduled → in_transit → paid`), per-transaction `payoutId` linkage | ✅ Core (read-model over generated data; no live gateway) |
| Analytics | `analytics(from, to)` — server-computed gross/discounts/refunds/net sales, shipping, taxes, gift-card sales, AOV, returning-customer rate, top products | ✅ Core (replaces client-side rollups; sessions/conversion out of scope — no storefront) |
| Online store (Page, Blog, Menu, Redirect, Policies, Domains, Themes) | `pages(Count)`, `blogPosts(Count)`, `redirects(Count)`, `menus`, page/post/file/menu/redirect CRUD, `shopPolicies` + `shopPolicyUpdate` (refund/privacy/terms/shipping/subscriber), `domains` + `domainAdd/SetPrimary/Delete`, theme library + `themePublish/Duplicate` | ✅ Core (no public storefront engine) |
| Files | `files`, `fileCreate/Update/Delete`, REST `/uploads` with auth check | ✅ Core |
| Metafields | `metafieldDefinitions`, `metafields`, `metafieldDefinitionCreate/Update/Delete`, `metafieldsSet/Delete` | ✅ Core |
| Metaobjects | `metaobjectDefinitions`, `metaobjectEntries`, definition `Create/Update/Delete` (delete guarded by entries), entry CRUD, included in `bootstrap` | ✅ Core |
| Saved searches | `savedSearches(resourceType)`, `savedSearchCreate/Update/Delete` | ✅ Core (UI ships on Orders) |
| Access (StaffMember, permissions) | `staff`, `currentStaffMember`, `staffMemberCreate/Update/Delete`, `staffMemberPermissionSet`, `staffMemberSetStatus`, session cookie auth, per-mutation authorization (default-deny), `activity` audit log | ✅ Core (2FA roadmap) |
| Shop (Shop, Plan, Locales, Markets) | `shop`, `settingsUpdate`, `plan`, `localeAdd/Remove/Update`, `marketCreate/Update/Delete`, notification/task mutations | ✅ Core |
| System | `resetDemoData` — real transactional wipe + reseed (owner-only) | ✅ Core |
| Apps | `apps`, `appInstall/Uninstall/Toggle` (demo catalog, labeled) | 🔶 Demo |
| Webhooks / Bulk operations / Carrier services / Checkout branding / Functions / Pixels / Subscriptions / POS / Translations / App billing / Staged uploads | — | ⛔ Out of scope — platform infrastructure, not admin features (gap report §2) |

## Run

```bash
cd backend
cp .env.example .env        # set DATABASE_URL (Neon Postgres) + PORT
npm install
npm run seed                # load demo data (frontend/src/data) — takes a few minutes over Neon
npm start                   # → http://localhost:4000/graphql (playground enabled)
```

**Auth:** POST `/auth/login` with `{ "email": "…", "password": "…" }` sets an HttpOnly staff session
cookie (scrypt-verified `passwordHash` on `StaffMember`). All `/graphql` methods (GET and POST) and
`POST /uploads` require a valid session unless `AUTH_DISABLED=true`. Playground and introspection are
dev-only (`NODE_ENV !== production`). `SESSION_SECRET` must be ≥32 random chars or the server refuses
to boot. After `npm run seed`, demo login is `ava@northstargoods.com` / `northstar123`.

**Authorization:** GraphQL mutations enforce staff permissions from the `StaffMember.permissions`
JSON (owner bypasses all checks; staff mutations are owner-only). Unmapped mutations are **denied**
(default-deny). Run `npm run check:authz` to verify SDL ↔ permission-map parity (145 ↔ 145).
Activity logs and order timeline events attribute the logged-in staff member.

**Session revocation:** Logout clears the browser cookie only. The stateless HMAC token remains valid
for up to 7 days if copied. Kill switches: deactivate the staff member (checked on every request) or
rotate `SESSION_SECRET`.

**QA:** `node qa-api.mjs` (server on :4000) exercises the whole surface end-to-end, including the
returns lifecycle, fulfillment cancel/tracking events, price-list application, payout materialization,
customer merge/consent/invite, domains/policies, saved searches, counts, and the demo-data reset.

Frontend: set `VITE_API_URL=http://localhost:4000` in `frontend/.env.local` and `npm run dev`.
Without `VITE_API_URL`, the frontend falls back to the offline localStorage demo mode.
