# ── Stage 1: Build & Compile ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build essentials for native binaries
RUN apk add --no-cache openssl libc6-compat

# Install dependencies (respecting legacy peer deps)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy Prisma schema & generate typed client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source and build TypeScript
COPY . .
RUN npm run build

# ── Stage 2: Production Runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# OpenSSL required for Prisma engine
RUN apk add --no-cache openssl libc6-compat

ENV NODE_ENV=production
ENV PORT=4000

# Non-root user for container security
USER node

# Copy compiled artifacts, prisma runtime, and production dependencies
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/src/graphql/schema ./src/graphql/schema
COPY --chown=node:node --from=builder /app/src/modules/storefront/storefront.graphql ./src/modules/storefront/storefront.graphql

EXPOSE 4000

CMD ["node", "dist/main.js"]
