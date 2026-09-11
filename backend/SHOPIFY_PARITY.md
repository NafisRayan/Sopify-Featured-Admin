# Shopify Admin GraphQL API — Parity Matrix

Comparison of this backend's GraphQL surface against the Shopify Admin GraphQL API
(https://shopify.dev/docs/api/admin-graphql/latest), domain by domain.

**Conventions replicated**

- QueryRoot with singular `product(id)` / plural `products(first, after, query, reverse)` patterns
- Relay-style connections: `*Edge { cursor, node }`, `*Connection { edges, pageInfo, totalCount }`
- Opaque base64 cursors, `pageInfo { hasNextPage hasPreviousPage }`
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
| Products (Product, Variant, Option, Media, Publication) | `product(s)`, `productCreate/Update/Delete/Duplicate`, `productStatusSet`, `productAddTags/RemoveTags`, `productMediaReorder`, options & variants via `ProductInput`, **CSV import** + **multipart media upload** (REST `/uploads`, files served statically) | ✅ Full (admin-side) |
| Collections (Smart/Manual) | `collection(s)`, `collectionCreate/Update/Delete`, `collectionAddProducts/RemoveProducts`, smart-rule evaluation server-side | ✅ Full |
| Orders (Order, LineItem, Fulfillment, Refund, Transaction, Risk) | `order(s)`, `orderMarkAsPaid`, `orderCancel`, `orderClose/Reopen`, `orderFulfill`, `orderRefund`, `orderEdit`, risk fields, timeline + **full Create Order UI** (customer/variant pickers, discounts, shipping, collect payment), **packing-slip & invoice print templates** | ✅ Full (admin-side) |
| Draft orders (DraftOrder, invoice) | `draftOrders`, `draftOrderCreate/Update/Delete`, `draftOrderConvert`, `draftOrderInvoiceSend`, **Create Order UI** builds drafts with custom shipping/discounts | ✅ Full |
| Returns & exchanges (Return, ReturnLine) | `returnCreate`, `returnClose`, `returnsForOrder`, restock + refund semantics | ✅ Full (lighter than Shopify's exchange variants) |
| Abandoned checkouts | `abandonedCheckouts`, `abandonedCheckoutRecoverySend`, `abandonedCheckoutConvert` | ✅ Full |
| Customers (Customer, Address, consent) | `customer(s)`, `customerCreate/Update/Delete`, tags, addresses, default address, consent, derived stats | ✅ Full |
| B2B (Company, CompanyLocation, CompanyContact, PriceList) | `companies`, `companyCreate/Update/Delete`, `companyLocationAdd`, `companyContactAdd`, price-list discount % | ✅ Core (no catalog-per-company publishing) |
| Customers segments (Segment, query language) | `segments`, `segment`, `segmentMembers`, `segmentCreate/Update/Delete` with simplified filter DSL | ✅ Core (subset of Shopify QueryLanguage) |
| Inventory (InventoryLevel, Item, Adjustment) | `inventoryLevels`, `inventoryAdjust`, `inventoryBulkAdjust`, `inventoryHistory` | ✅ Full |
| Shipping & fulfillment (FulfillmentOrder, Location) | fulfillment via `orderFulfill` (per-item, location, tracking), `locations`, `locationCreate/Update` | ✅ Core (no shipping profiles/zones editor, no labels) |
| Inventory transfers (private API parity) | `transfers`, `inventoryTransferCreate/Send/Receive` with stock movement + history | ✅ Full |
| Discounts (DiscountCodeBasic/Bxgy/FreeShipping, combinations) | `discounts`, `discountCreate/Update/Delete/StatusSet`, all 4 types, combinations | ✅ Full |
| Marketing (Campaign, activity) | `campaigns`, `campaignCreate/Launch/Complete/Delete`, attributed metrics | ✅ Core (marketing activities are app-owned in Shopify) |
| Shopify Payments (Payout, BalanceTransaction) | `payouts`, `balanceTransactions` (charges/refunds/fees derived from orders) | ✅ Read-model (no real payment processing) |
| Gift cards | `giftCards`, `giftCardCreate/Disable/Enable/BalanceAdjust`, history | ✅ Full |
| Online store (Page, Article/Blog, Menu, Redirect, File) | `pages`, `blogPosts`, `files`, `menus`, `redirects` + full CRUD sets | ✅ Full |
| Metafields (definitions + values) | `metafieldDefinitions`, `metafields`, `metafieldDefinitionCreate/Delete`, `metafieldsSet` | ✅ Full |
| Metaobjects | `metaobjectDefinitions`, `metaobjectEntries` + create/update/delete | ✅ Core |
| Access (StaffMember, permissions) | `staff`, `staffMemberCreate/Update/Delete`, `staffMemberPermissionSet`, `staffMemberSetStatus`, `activity` audit log | ✅ Full |
| Shop (Shop, Plan) | `shop`, `settingsUpdate`, plan card, locales (`localeAdd/Remove`), markets (`marketUpdate`) | ✅ Full |
| Analytics | Computed client-side from order data via the same APIs (reports are Shopify-internal) | ✅ Equivalent output |
| Apps | `apps`, `appInstall/Uninstall/Toggle` (simulated catalog) | ✅ Demo |
| Webhooks / Bulk operations / Billing / Privacy / Cart / Checkout branding | — | ⛔ Intentionally out of scope (platform infrastructure, not admin features) |

## Run

```bash
cd backend
cp .env.example .env        # set DATABASE_URL (Neon Postgres) + PORT
npm install
npm run seed                # load demo data (frontend/src/data)
npm start                   # → http://localhost:4000/graphql (playground enabled)
```

Frontend: set `VITE_API_URL=http://localhost:4000` in `frontend/.env.local` and `npm run dev`.
Without `VITE_API_URL`, the frontend falls back to the offline localStorage demo mode.
