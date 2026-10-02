# Shopify Admin GraphQL API — Parity Matrix

Comparison of this backend's GraphQL surface against the Shopify Admin GraphQL API
(https://shopify.dev/docs/api/admin-graphql/latest), domain by domain.

**Conventions replicated**

- QueryRoot with singular `product(id)` / plural `products(first, after, last, before, query, reverse)` patterns
- Relay Global Object Identification: `interface Node { id: ID! }`, `node(id: ID!): Node`, and `nodes(ids: [ID!]!): [Node]!` supporting both `gid://shopify/<Type>/<id>` and internal IDs
- Relay-style connections: `*Edge { cursor, node }`, `*Connection { edges, pageInfo, totalCount }`
- Full Relay `PageInfo`: `hasNextPage`, `hasPreviousPage`, `startCursor`, `endCursor` with bidirectional slicing (`first`/`after` and `last`/`before`)
- Mutations return `*Payload { entity, userErrors: [UserError!]! }` (never throw for expected failures)
- Domain + entity naming and status vocabularies (payment/fulfillment/discount statuses, etc.)
- `shop` singleton, `node`-style id lookups per domain

**Documented deviations**

- Money is `Float` USD rather than `MoneyV2 { amount, currencyCode }` (single-currency demo)
- Aggregate objects (variants, line items, timeline…) are JSON-typed fields rather than
  fully relational connection graphs
- Webhooks / Bulk operations / Billing / Privacy / Checkout-branding are backend-infrastructure
  domains of Shopify's platform, not admin features — intentionally out of scope
- Checkout itself is a separate storefront surface (out of scope)

## Coverage

| Shopify domain | Our query/mutation surface | Status |
|---|---|---|
| Products (Product, Variant, Option, Media, Publication) | `product(s)`, `productCreate/Update/Delete/Duplicate`, `productVariantCreate/Update/Delete` (sets primary warehouse stock; multi-location balancing uses `inventoryAdjust`), `productStatusSet`, `productAddTags/RemoveTags`, `productMediaReorder`, options & variants via `ProductInput`, REST `/uploads` with auth check | 🔶 Core (admin-side; granular variant CRUD supported; no multi-channel publishing) |
| Collections (Smart/Manual) | `collection(s)`, `collectionCreate/Update/Delete`, `collectionAddProducts/RemoveProducts`, smart-rule evaluation | 🔶 Core (rule evaluation on save) |
| Orders (Order, LineItem, Fulfillment, Refund, Transaction, Risk) | `order(s)`, `orderMarkAsPaid`, `orderCancel`, `orderClose/Reopen`, `orderFulfill`, `orderRefund`, `orderEdit`, inventory ledger reservation, status guards, risk analysis, timeline | 🔶 Core (admin-side; transactions recorded on mark-paid/refund) |
| Draft orders (DraftOrder, invoice) | `draftOrders`, `draftOrderCreate/Update/Delete`, `draftOrderCalculate`, `draftOrderConvert`, `draftOrderInvoiceSend`, discounts & tax-exempt calculation | 🔶 Core (admin-side live calculation & conversion) |
| Returns & exchanges (Return, ReturnLine) | `returnCreate`, `returnClose`, `returnsForOrder`, restock at fulfillment location + refund semantics | 🔶 Core (staff return resolution) |
| Abandoned checkouts | `abandonedCheckouts`, `abandonedCheckoutRecoverySend`, `abandonedCheckoutConvert` | 🔶 Partial (recovery state flag and conversion flow) |
| Customers (Customer, Address, consent) | `customer(s)`, `customerCreate/Update/Delete`, tags, addresses, default address, consent, derived stats with refund deduction | 🔶 Core (admin-side) |
| B2B (Company, CompanyLocation, CompanyContact, PriceList) | `companies`, `companyCreate/Update/Delete`, `companyLocationAdd`, `companyContactAdd`, price-list discount % applied to order creation | 🔶 Core (no catalog-per-company publishing) |
| Customers segments (Segment, query language) | `segments`, `segment`, `segmentMembers`, `segmentCreate/Update/Delete` with tag/spend/orders filter DSL | 🔶 Core (subset of Shopify QueryLanguage) |
| Inventory (InventoryLevel, Item, Adjustment) | `inventoryLevels`, `inventoryAdjust`, `inventoryBulkAdjust`, `inventoryHistory`, on-hand / committed ledger | 🔶 Core |
| Shipping & fulfillment (FulfillmentOrder, Location) | fulfillment via `orderFulfill` (per-item, location, tracking), `locations`, `locationCreate/Update` | 🔶 Core (no carrier API live rates or shipping labels) |
| Inventory transfers (private API parity) | `transfers`, `inventoryTransferCreate/Send/Receive` with stock movement + single mutation sync | 🔶 Core |
| Discounts (DiscountCodeBasic/Bxgy/FreeShipping, combinations) | `discounts`, `discountCreate/Update/Delete/StatusSet`, code lookup & validation at order create, usedCount increments | 🔶 Core (code & fixed/percentage calculation) |
| Marketing (Campaign, activity) | `campaigns`, `campaignCreate/Launch/Complete/Delete`, attributed order metrics | 🔶 Partial (demo simulation) |
| Shopify Payments (Payout, BalanceTransaction) | `payouts`, `balanceTransactions` (charges/refunds/fees recorded on orders) | 🔶 Read-model (derived transactions; no live gateway processor) |
| Gift cards | `giftCards`, `giftCardCreate/Disable/Enable/BalanceAdjust/SendNotification`, history with correct status tracking | 🔶 Core (issue/adjust/disable/notify and tender integration) |
| Online store (Page, Article/Blog, Menu, Redirect, File) | `pages`, `blogPosts`, `files`, `menus`, `redirects` + CRUD sets synced remotely | 🔶 Core (CMS and redirects; no public storefront engine) |
| Metafields (definitions + values) | `metafieldDefinitions`, `metafields`, `metafieldDefinitionCreate/Delete`, `metafieldsSet` | 🔶 Core |
| Metaobjects | `metaobjectDefinitions`, `metaobjectEntries` + create/update/delete | 🔶 Core |
| Access (StaffMember, permissions) | `staff`, `staffMemberCreate/Update/Delete`, `staffMemberPermissionSet`, `staffMemberSetStatus`, staff session cookie check, `activity` audit log | 🔶 Core |
| Shop (Shop, Plan) | `shop`, `settingsUpdate`, billing plan card, locales (`localeAdd/Remove`), markets (`marketUpdate`) | 🔶 Core |
| Analytics | Computed client-side from order data (net sales minus refunds/discounts) | 🔶 Partial (client rollups) |
| Apps | `apps`, `appInstall/Uninstall/Toggle` (simulated catalog) | 🔶 Demo |
| Webhooks / Bulk operations / Carrier rates / Checkout branding | — | ⛔ Intentionally out of scope (platform infrastructure, not admin features) |

## Run

```bash
cd backend
cp .env.example .env        # set DATABASE_URL (Neon Postgres) + PORT
npm install
npm run seed                # load demo data (frontend/src/data)
npm start                   # → http://localhost:4000/graphql (playground enabled)
```

**Auth:** POST `/auth/login` with `{ "email": "…", "password": "…" }` sets an HttpOnly staff session
cookie (scrypt-verified `passwordHash` on `StaffMember`). All `/graphql` methods (GET and POST) and
`POST /uploads` require a valid session unless `AUTH_DISABLED=true`. Playground and introspection are
dev-only (`NODE_ENV !== production`). `SESSION_SECRET` must be ≥32 random chars or the server refuses
to boot. After `npm run seed`, demo login is `ava@northstargoods.com` / `northstar123`.

**Authorization:** GraphQL mutations enforce staff permissions from the `StaffMember.permissions`
JSON (owner bypasses all checks; staff mutations are owner-only). Unmapped mutations are **denied**
(default-deny). Run `npm run check:authz` to verify SDL ↔ permission-map parity. Activity logs and
order timeline events attribute the logged-in staff member.

**Session revocation:** Logout clears the browser cookie only. The stateless HMAC token remains valid
for up to 7 days if copied. Kill switches: deactivate the staff member (checked on every request) or
rotate `SESSION_SECRET`.

Frontend: set `VITE_API_URL=http://localhost:4000` in `frontend/.env.local` and `npm run dev`.
Without `VITE_API_URL`, the frontend falls back to the offline localStorage demo mode.
