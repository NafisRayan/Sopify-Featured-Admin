# Production Deployment Runbook — Northstar Shopify Platform

The Northstar Commerce Platform is a production-grade, multi-tenant e-commerce system featuring **1:1 Shopify Admin & Storefront GraphQL APIs**, Online Store 2.0 theme builder, Stripe payment rails, customer self-service accounts, multi-location logistics, authoritative server-side analytics, and product reviews.

---

## 1. Architecture & Services

The platform runs as a unified 3-tier containerized stack via Docker Compose:

| Service | Container Image | Port | Description |
|---|---|---|---|
| **`frontend`** | `nginx:alpine` (multi-stage Vite build) | `80` | Static SPA serving Admin & Customer Storefront with Gzip & Reverse Proxy |
| **`backend`** | `node:20-alpine` (multi-stage NestJS build) | `4000` | GraphQL Admin API, Storefront API, Stripe Webhooks, Health Checks |
| **`postgres`** | `postgres:16-alpine` | `5432` | Multi-tenant schema-partitioned database with persistent volume |

---

## 2. Prerequisites

- **Docker Engine** (v24.0+)
- **Docker Compose** (v2.20+)
- **Node.js** (v20+ for local development / testing)

---

## 3. Quick Start (One-Command Launch)

Clone or enter the repository root and launch the entire stack:

```bash
docker compose up --build -d
```

To tail live service logs:
```bash
docker compose logs -f
```

To stop the running platform:
```bash
docker compose down
```

---

## 4. Platform Endpoints & Access

Once started, access the application in your browser:

- **Merchant Admin Backoffice:** `http://localhost/` or `http://localhost/orders`
  - *Default Demo Login:* Demo staff accounts are active without requiring setup.
- **Customer Storefront:** `http://localhost/store`
- **Customer Account Portal:** `http://localhost/store/account/login`
- **Admin GraphQL Endpoint:** `http://localhost/graphql`
- **Storefront GraphQL Endpoint:** `http://localhost/api/storefront/graphql`
- **System Health Check:** `http://localhost/api/health`
  - Returns: `{ "status": "ok", "database": "connected", "tenantCount": 2, ... }`

---

## 5. Configuration Reference (`.env`)

Set these environment variables in your deployment environment or a root `.env` file:

| Variable | Default Value | Description |
|---|---|---|
| `POSTGRES_USER` | `northstar` | Database master username |
| `POSTGRES_PASSWORD` | `northstar_secret_2026` | Database password |
| `POSTGRES_DB` | `northstar_db` | Primary database name |
| `SESSION_SECRET` | *(Random 32-char hex)* | HMAC secret for session cookies and customer tokens |
| `STRIPE_SECRET_KEY` | *(Empty / sk_test_...)* | Stripe API secret key. If omitted, operates in zero-config simulated test mode |
| `STRIPE_WEBHOOK_SECRET`| `whsec_test_mock_secret` | Secret for cryptographic webhook signature verification |
| `PORT` | `4000` | Backend API port |

---

## 6. SRE Runbook & Quality Verification

Run complete test suites across frontend and backend:

```bash
# 1. Local Developer Run (smoke tests pass; DB-dependent suites cleanly skip offline)
npm test

# 2. Strict CI Pipeline (FAILS if any test is skipped; enforces reachable DATABASE_URL)
npm run test:ci

# 3. Compilation & Authorization Parity
npm run check
```
