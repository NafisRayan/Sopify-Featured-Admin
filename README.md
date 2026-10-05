# Northstar Goods — Monorepo

A Shopify Admin–style ecommerce back office: React frontend + NestJS/GraphQL backend
on Neon Postgres, replicating the Shopify Admin API's merchant-facing surface.

```
frontend/   React 18 + TypeScript + Vite + Tailwind v4 + Zustand admin SPA
backend/    NestJS 10 + Apollo GraphQL (schema-first SDL) + Prisma ORM
            → Neon Postgres (isolated `northstar` schema)
docs/       plans & architecture notes
```

## Quick start

```bash
# 1. Backend (GraphQL API on :4000)
cd backend
cp .env.example .env          # DATABASE_URL = your Neon Postgres URL
npm install
npm run seed                  # load demo data (53 products, 130 orders, …)
npm start                     # → http://localhost:4000/graphql

# 2. Frontend (admin UI on :5173)
cd frontend
npm install
echo 'VITE_API_URL=http://localhost:4000' > .env.local
npm run dev
```

Without `VITE_API_URL`, the frontend runs in **offline demo mode** (localStorage persistence).
The copied backend config sets `AUTH_DISABLED=true` for local demo use. Before any
shared or production deployment, set it to `false` and configure a random
`SESSION_SECRET` as documented in `backend/.env.example`.

### Demo login

- Email: `ava@northstargoods.com`
- Password: `northstar123`

## Architecture

**Data flow (remote mode):** UI action → optimistic Zustand update (instant UI) →
GraphQL mutation → Postgres → debounced `bootstrap` refetch reconciles the store
(server is source of truth). Every list in the SPA hydrates from the backend's
`bootstrap` snapshot query on boot and on window focus.

**Backend:** schema-first SDL following Shopify Admin API conventions —
QueryRoot, Relay-style connections with opaque cursors, `userErrors` on every
payload, domain naming and status vocabularies. See
[`backend/SHOPIFY_PARITY.md`](backend/SHOPIFY_PARITY.md) for the full
domain-by-domain comparison against shopify.dev, and
[`SHOPIFY_GAP_REPORT.md`](SHOPIFY_GAP_REPORT.md) for the gap analysis and
scope rationale (what's in, what's out, and why) behind the 2026-10 parity pass.

**Business rules live in backend services:** fulfill decrements committed stock,
refunds update payment status and restock, cancels release reserved units,
transfers move stock in two audited steps, order edits recompute totals,
smart collections and customer segments are evaluated server-side, staff
permission changes are audited to the activity log.
