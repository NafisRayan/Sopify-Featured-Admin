import { Injectable, NestMiddleware, Logger } from '@nestjs/common'
import type { Request, Response, NextFunction } from 'express'
import { AsyncLocalStorage } from 'node:async_hooks'
import { PrismaService } from '../prisma/prisma.service'
import { authDisabled } from '../auth/auth.config'
import { currentStaff } from '../auth/staff-context'

export interface StoreContext {
  id: string
  name: string
  slug: string
  currency: string
}

export const tenantContext = new AsyncLocalStorage<StoreContext>()

export const DEFAULT_STORE: StoreContext = {
  id: 'store_northstar',
  name: 'Northstar Goods',
  slug: 'northstar',
  currency: 'USD',
}

export function currentTenant(): StoreContext {
  return tenantContext.getStore() || DEFAULT_STORE
}

declare module 'express-serve-static-core' {
  interface Request {
    store?: StoreContext
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name)

  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const rawHeaderId = req.headers['x-store-id']
    const headerStoreId = Array.isArray(rawHeaderId) ? rawHeaderId[0] : rawHeaderId

    const rawHeaderSlug = req.headers['x-store-slug']
    const headerStoreSlug = Array.isArray(rawHeaderSlug) ? rawHeaderSlug[0] : rawHeaderSlug

    const queryShop = req.query?.shop as string | undefined

    let store: StoreContext = DEFAULT_STORE

    try {
      if (headerStoreId) {
        const found = await this.prisma.store.findUnique({ where: { id: headerStoreId } })
        if (found) {
          store = { id: found.id, name: found.name, slug: found.slug, currency: found.currency }
        }
      } else if (headerStoreSlug || queryShop) {
        const slug = (headerStoreSlug || queryShop)!.toLowerCase().trim()
        const found = await this.prisma.store.findUnique({ where: { slug } })
        if (found) {
          store = { id: found.id, name: found.name, slug: found.slug, currency: found.currency }
        }
      }
    } catch {
      // Fallback gracefully to default store
    }

    // ─── Tenant ACL Enforcement ─────────────────────────────────────────────
    // Staff sessions must belong to the requested store (role=superadmin bypass).
    // Anonymous / storefront traffic is limited to the default store.
    // Runs AFTER AuthMiddleware has resolved req.staff / staffContext ALS.
    const staff = currentStaff() ?? ((req as Request & { staff?: { id?: string; role?: string; storeId?: string } }).staff ?? null)
    if (!authDisabled() && staff && store.id !== DEFAULT_STORE.id) {
      // Superadmins may administer any store; regular staff only their own.
      const isSuperadmin = staff.role === 'superadmin'
      const isMember = staff.storeId === store.id

      if (!isSuperadmin && !isMember) {
        this.logger.warn(
          `Tenant ACL violation: staff ${staff.id} attempted to access store ${store.id}`,
        )
        res.status(403).json({
          statusCode: 403,
          message: 'Access denied: staff session is not a member of this store',
        })
        return
      }
    }

    ;(req as Request & { store?: StoreContext }).store = store
    res.setHeader('x-store-id', store.id)
    res.setHeader('x-store-slug', store.slug)
    tenantContext.run(store, () => next())
  }
}
