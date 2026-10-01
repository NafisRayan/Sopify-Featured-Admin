# Northstar Goods — Product & SQA Audit

**Date:** 2026-09-18
**Roles:** Senior product engineer, then SQA
**Surface:** Shopify Admin–style merchant back office (`frontend/` React SPA + `backend/` NestJS GraphQL)
**Live check:** Admin at `http://localhost:5173` (remote mode: `VITE_API_URL=http://localhost:4000`). Dashboard, 20+ routes, order `#1122` / `#1121`, themes, settings, account menu.

**Verdict:** The admin *looks* like Shopify Admin. Core commerce rules are not merchant-safe. Discounts, tax, B2B prices, and gift cards are CRUD/UI only. Inventory is never reserved on order create. Fulfill/refund in remote mode often never reach GraphQL. `backend/SHOPIFY_PARITY.md` overclaims “Full” on Orders, Discounts, Payments, Online store, Gift cards, and Analytics.

**Correction (2026-09-30):** Authentication, GraphQL mutation authorization, upload protection, and configured CORS origins were added after the live audit. C5 and related statements below now describe the current implementation.

---

## How this was verified

| Layer | Method |
|---|---|
| Code | Orders, inventory, commerce, customers, store-content, frontend services/pages, GraphQL SDL |
| Live UI | Home, Orders, Create order, Drafts, Abandoned, Products, Collections, Inventory, Gift cards, Customers, Segments, Companies, Discounts, Marketing, Analytics, Payouts, Pages, Files, Themes, Apps, Settings (+ shipping/taxes/billing/preferences) |
| Live bug | `#1122` Closed + Refunded + Returned still shows **Fulfill** and “2 unfulfilled items”; customer LTV still `$117.83` after a full refund |

---

## Severity key

| Level | Meaning |
|---|---|
| **Critical** | Wrong money, stock, or persistence. Ship-blocker. |
| **High** | Merchant will act on a lie; data reverts or is unenforceable. |
| **Medium** | Incomplete Shopify Admin workflow; fake or dead UI. |

---

# 1. Critical — bugs & business logic

### C1. Inventory is never reserved; fulfill does not consume on-hand

**Category:** Business logic
**Where:** `backend/src/modules/orders/orders.service.ts` (`createDraft` ~413–477, `convertDraft` 505–522, `fulfill` 154–175); same rules in `frontend/src/services/ordersService.ts` 61–82, 358–377.

**Expected:** Live order creation moves qty available → committed. Fulfill then releases committed and reduces on-hand.

**Actual:** Create/convert only write order JSON. Fulfill only does `committed = max(0, committed - qty)`. `available` never drops. Missing location levels are created at 0/0/0 and the shipment still succeeds. Cancel restock uses `Math.min(level.committed, qty)` — if committed is 0, restock is a no-op.

**Merchant impact:** Oversell. Warehouse counts do not move when goods ship. Combined with refund restock (C2), stock inflates.

---

### C2. Refund / return restock adds the full line qty at the wrong location

**Category:** Business logic
**Where:** `orders.service.ts` 228–238 (refund), 355–366 (`closeReturn`); `ordersService.ts` 159–167.

**Expected:** Restock returned *units* at the fulfillment location, once.

**Actual:** `available += line.quantity` (full line, not refunded qty) on `findFirst({ variantId })` (first location, not fulfill location). Repeat refunds restock again. Fulfill never reduced `available`, so fulfill-then-refund-restock *increases* on-hand above the pre-order level.

**Merchant impact:** Phantom inventory; wrong warehouse.

---

### C3. Remote fulfill and refund never hit GraphQL

**Category:** Bug
**Where:** `frontend/src/services/ordersService.ts` 61–112 (`fulfillOrder`), 135–178 (`refundOrder`). Contrast `markAsPaid` 116–122 which *does* call `syncMutation`.

**Expected:** Remote mode persists then reconciles from `bootstrap`.

**Actual:** Zustand only. `App.tsx` 24–30 refetches on window focus; `scheduleRefresh` (~600ms) overwrites local fulfillments/refunds.

**Merchant impact:** In `VITE_API_URL` mode, packing slips, payment badges, and stock revert after refresh. Offline localStorage keeps the change; remote merchants lose it.

---

### C4. Discount rules are stored, never applied

**Category:** Missing feature / business logic
**Where:** `commerce.module.ts` 26–51 (CRUD, `usedCount: 0`); `orders.service.ts` 413–465 (`discountCode: { code: 'CUSTOM', amount }`); `OrderCreatePage.tsx` 40–46, 12 (`TAX_RATE = 0.08`).

**Live:** Discounts page shows “8 active of 16”. Create order has a free-form dollar field, not a code picker.

**Actual:** No lookup of code, dates, status, min purchase, eligibility, BXGY, free shipping, combinations, or `usageLimit`. `usedCount` never increments.

**Merchant impact:** Staff can apply any dollar off. Expired / limited / product-scoped / subscriber-only discounts are theater.

---

### C5. Resolved — GraphQL and file uploads require authentication

**Category:** Resolved security finding
**Where:** `backend/src/auth/auth.middleware.ts`, `backend/src/auth/gql-authz.interceptor.ts`, `backend/src/auth/mutation-permissions.ts`, and `backend/src/main.ts`.

**Current:** The middleware requires a valid staff session for all `/graphql` methods and `POST /uploads` unless `AUTH_DISABLED=true`. The GraphQL authorization interceptor enforces per-mutation permissions and denies unmapped mutations. `main.ts` consumes `CORS_ORIGINS` and enables credentialed CORS only for configured origins plus local development ports.

**Deployment requirement:** `AUTH_DISABLED=true` remains local-demo-only. Shared and production deployments must set it to `false` and configure a random `SESSION_SECRET`.

---

### C6. Paid cancel looks refunded but writes no refund; a second refund still works

**Category:** Business logic
**Where:** `orders.service.ts` 100–126 vs 205–211.

**Actual:** Cancel of a paid order sets `paymentStatus: 'refunded'` with an empty `refunds[]`. `orderRefund` then sees `already === 0` and allows another full refund. No guard on cancelled/unpaid/draft.

**Merchant impact:** Money “refunded” twice in admin; finance reports that sum `refunds` miss the cancel path.

---

# 2. High — bugs

### H1. Closed / refunded orders still offer Fulfill

**Category:** Bug (confirmed live)
**Where:** `OrderDetailPage.tsx` 213–216 (hides Fulfill only when `status === 'cancelled'`). `unfulfilledItems` 96–100 uses fulfillment IDs, not `fulfillmentStatus`.

**Live `#1122`:** badges Closed · Refunded · Returned, copy “2 unfulfilled items”, primary action **Fulfill**. Customer card: “1 orders · $117.83 spent” after a full refund.

**Merchant impact:** Staff can attempt to ship a fully refunded order.

---

### H2. Remote transfers double-apply stock

**Category:** Bug
**Where:** `frontend/src/services/parityService.ts` 205–239.

**Actual:** `sendTransfer` / `receiveTransfer` call `adjustInventory` (which already `syncMutation`s `inventoryAdjust`) **and** `inventoryTransferSend` / `Receive` (which move stock again on the server).

**Merchant impact:** Remote send/receive deducts/credits twice.

---

### H3. `updateCollection` / content / menus / files / redirects never sync remotely

**Category:** Bug
**Where:** `collectionsService.ts` 65–88 (no GraphQL); `contentService.ts` entire file (pages, posts, files, menus — no `syncMutation`). Redirects/entries similar.

**Merchant impact:** After `refreshFromServer`, CMS and collection membership revert. Parity “Online store ✅ Full” is false for the client.

---

### H4. Payments, shipping rates, staff, theme, apps, locales, markets are local-only in remote mode

**Category:** Bug
**Where:** `settingsService.ts` 20–41, 45–101, 105–175. Languages/markets/metafields in `SettingsSectionPage.tsx` write Zustand directly.

**Actual:** `updateStoreSettings` syncs; toggles for providers, shipping table, invite staff, publish theme, install app do not. Focus/bootstrap wipes them.

---

### H5. Order edit drops deletions and qty increases; no inventory move

**Category:** Bug
**Where:** `OrderActions.tsx` ~65–83; `orderEditService.ts` 44–91; `orders.service.ts` 256–302.

**Actual:** Save only diffs “new lines” vs “qty reduced on remaining rows”. Trash removes the row from the draft so it is **not** in `removed`. Increasing qty is ignored. Edit never touches inventory. Stale `discountCode.amount` can drive **negative tax** if subtotal falls below the discount.

---

### H6. Return drawer refund amount is display-only

**Category:** Bug
**Where:** `OrderActions.tsx` (input shows line subtotal; state stays `'0.00'` until typed). Submit uses `Number(refundAmount) || 0` then `closeReturn(..., markRefunded: false)`. Frontend `closeReturn` does not update `paymentStatus`.

**Merchant impact:** Staff think they refunded item value; order stays Paid.

---

### H7. Draft update drops shipping/discount; frontend `updateDraft` does not call the API

**Category:** Bug
**Where:** `orders.service.ts` 479–497 (creates a throwaway draft, copies a subset of fields); `ordersService.ts` 341–356 (local only).

**Merchant impact:** Editing a discounted/custom-shipping draft can keep old shipping/discount on the server; remote edits vanish.

---

### H8. Remote “create order + collect payment” leaves a local draft

**Category:** Bug
**Where:** `OrderCreatePage.tsx` 66–72 vs offline 74–77.

**Actual:** Server convert + mark paid; client does not patch `isDraft`. Navigates to `/orders/:id` which still reads a draft in Zustand until bootstrap.

---

### H9. Mark as paid / fulfill / close have no real guards

**Category:** Bug
**Where:** `orders.service.ts` 91–97, 129–138, 154–192.

- `markAsPaid` always sets paid (including drafts).
- `close` overwrites `cancelled` → `closed`.
- `reopen` always forces `open`.
- Fulfill accepts cancelled/already-fulfilled line IDs via API.
- Bulk archive (`OrdersListPage`) does not skip cancelled.

---

### H10. Customer spend / segments ignore refunds

**Category:** Business logic
**Where:** `customers.module.ts` 15–22; `selectors.ts` 32–45.

**Live:** Rowan Bennett still “$117.83 spent” on fully refunded `#1122`.

**Actual:** Stats sum `order.total` for non-draft/non-cancelled. Refunded orders still count as full purchases. Segment `tag` equals uses `tags.join('|')`, so `equals "vip"` fails for `['vip','wholesale']`.

---

### H11. Tax settings, tax-exempt, B2B price lists, markets do not affect orders

**Category:** Business logic
**Where:** `TAX_RATE = 0.08` in `orders.service.ts:7` and `OrderCreatePage.tsx:12`. Customer `taxExempt` never read. Company `priceListDiscountPercent` never applied (`orders.service.ts` 419–432). Settings tax % / “charge tax on shipping” unused. Currency in settings is unused (`format.ts` hardcodes `USD`).

**Live:** Settings → Taxes is a single % + two toggles. Create order still 8%. Company UI: “Catalog prices shown to this company are reduced…” — false.

---

### H12. Gift cards cannot be redeemed; enable history is always `disabled`

**Category:** Missing feature / bug
**Where:** Gift-card CRUD `commerce.module.ts` 161–201 (`setGiftCardStatus` always appends `type: 'disabled'` even when enabling). Create order has no gift-card tender. Gift card service does not `syncMutation`.

**Live:** Gift cards page: “$677.50 outstanding… Issue gift card”. Copy implies checkout redemption; there is no checkout.

---

### H13. Payouts are a static seed; upcoming can be negative

**Category:** Missing feature / bug
**Where:** `finances.module.ts` read-only; `PayoutsPage.tsx` 18–26 sums scheduled `amount`.

**Live:** “Upcoming payout **-$114.41**”. Paid/refunded orders never write charges, fees, or payouts. Parity claim “derived from orders” is false.

---

### H14. New products get no inventory levels; SKUs are not unique

**Category:** Bug
**Where:** `products.service.ts` 72–116 (variants JSON, no `InventoryLevel` rows). SKU lives in JSON — no unique constraint.

**Merchant impact:** New SKUs show 0 / untracked until a manual adjust. Duplicate SKUs allowed.

---

### H15. Abandoned recovery / invoice / bulk tags / campaign launch are fake or unsynced

**Category:** Bug
**Where:**

- `sendRecoveryEmail` (`ordersService.ts` 388–394) — local status only, no GraphQL, no email
- `createOrderFromAbandoned` — does not call `abandonedCheckoutConvert`
- `sendDraftInvoice` — timeline only
- `bulkAddTags` — local only
- `launchCampaign` — `Math.random()` metrics; no `campaignLaunch` sync

**Live:** Conversion rate on Home is labeled “Sessions are simulated”. Marketing KPIs (reach 159,515) are not order-attributed.

---

# 3. Medium — product gaps, dead UI, SQA notes

### M1. Prompt rule “do not build fake non-functional UI” is violated

Confirmed toast-only or no-op:

| Control | What happens | File |
|---|---|---|
| Theme **Preview** | Toast: storefront preview is not part of this demo | `OnlineStorePage.tsx` 75–80 |
| **View online store** | Toast: storefront is not part of this demo | `HeaderBar.tsx` 114 |
| **Log out** | Toast: logging out is disabled | `HeaderBar.tsx` 115 |
| App **Open** | Toast | `AppsPage.tsx` |
| **Add store** | Navigates to general settings | `Sidebar.tsx` |
| Timeline **Visible to customer** | Checkbox unused | `OrderDetailPage.tsx` 385–387 |
| Files **Upload file** | URL paste only, not multipart; `uploadMedia` exists unused here | `FilesPage.tsx` 266–280 |
| Setup guide **Open** (custom domain, etc.) | Links into incomplete settings | `DashboardPage` |

---

### M2. Settings → Preferences Save drops SEO and password

**Where:** `PreferencesPage.tsx` save only `email` / `phone`. Homepage title, meta description, password page stay in React state.

**Live:** Homepage title field was empty; password protection toggle is disconnected from a real storefront.

---

### M3. `/settings/billing` is an empty page

**Where:** `AppRoutes.tsx` 157 → `SettingsSectionPage` with unknown section → title “Settings”, no body. Not 404. Settings index has no Billing card.

---

### M4. URL redirects exist but are missing from Online Store nav

**Where:** Route `/online-store/redirects` (`AppRoutes.tsx` 150); Sidebar children are Themes / Navigation / Preferences only (`Sidebar.tsx` 86–91).

---

### M5. Gift cards initial sort key does not exist

**Where:** `GiftCardsListPage.tsx` `initialSort={{ key: 'created' }}` — columns are `code | customer | balance | expires | status`.

---

### M6. Analytics net sales is invented; acquisition chart is order count

**Where:** `analytics.ts` 118–121 `netSales = totalSales * 0.972`. `AnalyticsPage.tsx` customer chart increments `newCount` for every order.

**Live:** Home net sales `$484.56` vs total `$498.52` (that 2.8% haircut). Payouts page tells a different 2.9%+$0.30 story.

---

### M7. Print packing slip lists every line at full qty

**Where:** Overflow menu uses `window.print()` (`OrderDetailPage.tsx` 245) instead of `/orders/:id/print`. `OrderPrintPage.tsx` exists but is easy to miss. Packing slip does not split fulfilled vs remaining; invoice ignores `totalDiscount`. Billing address in the UI is hardcoded “Same as shipping”.

---

### M8. Digital / no-shipping lines cannot become fulfilled

**Where:** `recomputeFulfillmentStatus` returns `'unfulfilled'` when there are zero shipping lines (`orders.service.ts` 75–77). Drafts force `requiresShipping: true`.

---

### M9. Smart collections only re-evaluate on collection save

**Where:** `products.service.ts` / `collectionsService.ts` `smartPreview` on write. Product tag/type changes do not refresh membership. Rule DSL is tag/title/type/vendor only (no inventory, price, vendor ≠).

---

### M10. `resetDemoData` does not reset the database

**Where:** Frontend clears `localStorage` key `northstar-admin-v1`. GraphQL `resetDemoData` is a no-op that returns `StoreSettings`.

---

### M11. Bootstrap is an unbounded dump; metaobjects omitted from hydrate

**Where:** `api.ts` `SNAPSHOT_QUERY`; `useStore.ts` `hydrateRemote` does not apply metaobject definitions/entries. Product `totalInventory` in bootstrap vs `product(id)` can disagree across locations.

---

### M12. Gift-card / file size / campaign metrics are fabricated

- Files `addFileByUrl`: `sizeKb: Math.floor(Math.random() * 400) + 30`
- Campaign launch: random reach/sessions/orders/revenue
- Conversion 3.0% labeled simulated

---

# 4. Missing functionality vs Shopify Admin

Product view: this is an admin shell, not an operating store. Gaps a merchant would hit on day one:

| Shopify Admin | This clone |
|---|---|
| Login / 2FA / staff session | Staff login and signed HttpOnly sessions are implemented; 2FA is not. |
| Customer checkout / cart / Shop Pay | Out of scope; gift cards and payment providers have nowhere to run. |
| Online storefront + theme editor (OS 2.0) | Color/font drawer; Preview is a toast. |
| POS | Channel label on seed orders only. Create order always `Online Store`. |
| Billing / plan / invoices | Plan badge; `/settings/billing` empty. |
| Domains | Setup-guide card only. |
| Payments onboarding, capture vs auth vs void, 3DS | Toggle list + `orderMarkAsPaid`. No transactions. |
| Shipping profiles, zones, carrier rates, labels | Flat rate table, unsynced remotely. |
| Tax regions / Shopify Tax / duties | One percent. Always 8% on drafts. |
| Notification templates | Four booleans. `notifyCustomer` is timeline text. |
| Discount *application* (codes, auto, BXGY, shipping) | Discount *editor* only. |
| Gift card redeem | Issue/adjust/disable only. |
| Markets as a product (catalogs, duties, pricing) | Settings % only. |
| Customer accounts (new vs classic) | Radio under Checkout. |
| Fulfillment orders, partial qty, cancel fulfillment | Whole-line IDs. Auto-closes order when fully fulfilled. |
| Returns: request / approve / decline / exchange | Create + auto-close. |
| Fraud actions | Risk badge display only (`#1122` Low risk). |
| Analytics Live / reports / sessions | Client rollups from orders. |
| Apps / sales channels (real) | Demo catalog + Open toast. |
| Flow, Email, automations | Marketing list with RNG metrics. |
| B2B catalogs / company-specific publishing | Price % field, unused at order create. |
| Global search: content, files, settings, staff | Products/orders/customers/collections/discounts/companies/gift cards/segments/transfers only. |
| Bulk publish/delete pages & collections | Row actions only. |
| Multi-currency `MoneyV2` | Documented Float USD. |

`ComingSoonPage.tsx` is unused. Unknown settings sections fail open as a blank page instead of 404.

---

# 5. Live frontend observations (SQA)

Exercised 2026-09-18 against the running SPA.

| Check | Result |
|---|---|
| Home loads with seed metrics | Yes. Last 30 days $498.52 / 7 orders. Conversion 3.0% simulated. POS channel shown. |
| Sidebar counts | Orders 48 open; Drafts 8. |
| Orders table | Seed `#1001`–`#1122`. Click row → `/orders/o_1122`. |
| `#1122` refunded/returned | **Fulfill still shown.** LTV not reduced. Billing “Same as shipping”. |
| `#1121` paid/fulfilled | Refund + Return items. Closed. Tracking UPS. |
| Create order | Giant customer `<select>` of 50 names, auto-selects first. No discount *code*. No gift card. No inventory check at add-item (copy says stock counts at fulfill). |
| Drafts | List works; remote draft edit unsynced (code). |
| Abandoned | 9 awaiting recovery; Send email is status-only. |
| Products / inventory | 166 tracked variants, 11 out of stock at Portland Warehouse. |
| Gift cards | $677.50 outstanding / 8 cards. Cannot apply to an order. |
| Segments | Local Portland 5 members, etc. Tag-equals logic is wrong in code. |
| Companies | Cascadia Outfitters etc. Price list is display-only. |
| Discounts | 8 active / 16. Used counts are stale zeros. |
| Marketing | Reach 159k — not from orders. |
| Payouts | Upcoming **negative** -$114.41. |
| Files | “Upload” = URL. Random sizeKb in code. |
| Themes | Customize + Preview toast. Dawn/Studio library. |
| Apps | 6 installed; Open is a toast. |
| Settings | General/payments/checkout/shipping/taxes present. Billing empty. Shipping table rendered but remote persist is broken. |
| Account menu | At audit time, Simulate-as list and Log out toast only. Real staff sessions were added afterward. |

Remote mode: frontend `.env.local` points at `:4000`. Backend *was* listening (`EADDRINUSE` on a second start). Bootstrap on focus can wipe unsynced local mutations (C3, H3, H4).

---

# 6. Parity doc vs reality

`backend/SHOPIFY_PARITY.md` should not say **Full** for:

| Claim | Reality |
|---|---|
| Orders / Drafts / Returns / Abandoned ✅ Full | No reservation, no capture/void, fulfill/refund remote drop, returns auto-close, recovery is a flag |
| Discounts ✅ Full | CRUD only |
| Gift cards ✅ Full | No redeem |
| Access / staff ✅ Full | API authentication and mutation authorization are enforced; staff invite/settings synchronization remains incomplete |
| Shopify Payments ✅ “derived from orders” | Seed JSON; can go negative |
| Online store ✅ Full | No storefront; content unsynced |
| Analytics ✅ Equivalent | Fake net sales, fake conversion |
| Inventory transfers ✅ Full | Remote double-apply |
| Collections smart rules ✅ Full | Not live; update unsynced |
| CSV import + media upload | CSV is Title/Price, one variant; Files UI does not use `/uploads` |

Intentional out-of-scope (checkout, webhooks, billing APIs) is fine — **do not label adjacent admin features Full**.

---

# 7. What actually works

Not everything is broken. These paths are real CRUD in-browser (offline) and often have matching GraphQL:

- Product list/editor, duplicate, status, tags, media reorder (remote via `mutatePayload`)
- Manual collection membership (create + delete sync; **update does not**)
- Inventory quantity adjust (single-location `inventoryAdjust`)
- Customer CRUD, addresses, tags
- Discount **editor** (not checkout application)
- Draft **create** (remote `draftOrderCreate`)
- Mark as paid / cancel / close / reopen (synced; rules still wrong)
- Locations create/update
- Transfer **state machine** exists (draft → in transit → received) — do not use it in remote until H2 is fixed
- Print templates exist at `/orders/:id/print`
- Dashboard / analytics charts from in-memory orders
- Global search ⌘K for a subset of entities
- Staff login, signed sessions, GraphQL/upload authentication, and mutation authorization
- Staff “simulate as” hides some buttons locally

Treat those as UI completeness, not correctness of money or stock.

---

# 8. Suggested fix order (product)

1. **Inventory ledger:** reserve on convert, consume on fulfill, restock returned *qty* at the *fulfill* location, all in a transaction. Stop creating empty levels to “succeed” a fulfill.
2. **Remote sync:** `fulfillOrder`, `refundOrder`, `updateDraft`, `updateCollection`, content/menus/files, payments, shipping, staff, gift cards, campaign launch, abandoned convert — same pattern as `markAsPaid`.
3. **Money:** evaluate a real discount code; honor tax settings + taxExempt; apply B2B %; gift cards as a tender; write payouts from captures/refunds.
4. **Guards:** no fulfill/refund/cancel/mark-paid on illegal statuses; hide Fulfill on returned/closed; record a refund on paid-cancel.
5. **Stop lying in UI:** Preview / Log out / recovery email / preferences save / billing / unused checkboxes — either implement or remove.
6. **Rewrite `SHOPIFY_PARITY.md`** to Core / Stub / Out of scope so the next engineer does not trust it.

---

# 9. SQA test ideas (regression)

These would have caught the ship-blockers:

1. Convert draft → available drops, committed rises by line qty.
2. Fulfill → committed 0, on-hand down, location matches picker. Refresh (remote) still shows the fulfillment.
3. Refund $1 of a 10-unit line with restock → available +1, not +10.
4. Full refund of unfulfilled order → no Fulfill button; customer spend $0.
5. Apply code `SAVE10` with usageLimit 1 twice → second `userErrors`.
6. Tax-exempt customer draft → tax $0.
7. B2B company 20% price list → line price 80% of catalog.
8. Send transfer remote → source available drops **once**.
9. Preferences save → reload keeps homepage title.
10. `POST /graphql` without cookie cannot `orderRefund`.

---

*End of audit. No production code was changed.*
