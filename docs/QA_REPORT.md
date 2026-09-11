# QA Report — Full-Stack E2E (2026-09-11)

Scope: NestJS/GraphQL backend (Neon Postgres) + React frontend in remote mode.
Suite: `backend/qa-api.mjs` (reusable), plus browser E2E via Playwright.

## Results

| Area | Result |
|---|---|
| GraphQL API suite | **77/77 passed** (25 query-root tests, 52 mutation/workflow/error tests) |
| Frontend route walk | **37/37 routes, 0 console errors** (remote mode, live Neon data) |
| Mutation round-trip | UI click → GraphQL → Postgres → debounced reconcile ✓ verified |
| Persistence | Mutations survive reload + verified directly in Neon (`tasks`, `inventoryLevels`, `orders`) |
| Business rules | fulfill→stock+status ✓, refund→partially_refunded ✓, over-refund→userError ✓, cancel→restock ✓, order edit→totals ✓, transfer send/receive→stock ✓, insufficient stock→userError ✓, duplicate email/code→userError ✓, segment filters evaluate ✓ |

## Bugs found & fixed during QA

1. **JSON filter broken on Postgres** — `path: ['$']` inside Prisma `array_contains` returned no matches; variant lookup for drafts/edits/transfers silently failed. Removed `path`, kept `array_contains`.
2. **Draft crash for addressless customers** — `Order.shippingAddress` is non-nullable; drafts for customers without addresses wrote `DbNull` → Prisma error. Added address fallback.
3. **Transfers lacked source-stock validation** — sending more than available silently clamped to 0. Added validation → `userErrors`.
4. **Bootstrap hydration query invalid** — snapshot query selected object lists without subfields, and `AdminSnapshot.settings` didn't exist. Fixed query + schema; hydration now works.
5. **Double-wrapped mutations in frontend sync** — `syncMutation` wrapped already-complete mutation strings; stripped.

## Known limitations (not fixed — by design/scope)

- **No authentication/authorization on the API** — anyone who can reach :4000 can mutate. Required before any real deployment.
- No rate limiting, request-size limits, or API-level audit of who did what (activity log is informational, owner-attributed).
- Single currency (`Float` USD, not `MoneyV2`), JSON-typed aggregates instead of fully relational graphs.
- Concurrent-write races on inventory possible (row updates, not `SELECT … FOR UPDATE`).
- Test data is stateful: `qa-api.mjs` expects a freshly seeded DB (`npm run seed` first).

## Production-readiness verdict

**Not production-ready as-is.** It is a *production-shaped, fully functional demo*: real database, real API, real business logic, clean builds, 77/77 API tests, 37/37 UI routes. To ship to real users it needs, at minimum: authentication (JWT/session + guards), API rate limiting, inventory row locking, secret management, observability (logging/metrics/error tracking), CI running `qa-api.mjs`, and a real payment integration. Estimated effort for that hardening pass: days, not weeks — the architecture (services own all mutations, single seam for auth middleware) supports it.
