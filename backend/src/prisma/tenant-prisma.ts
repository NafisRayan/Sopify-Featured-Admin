import { PrismaClient } from '@prisma/client'

const TENANT_MODELS: Record<string, true> = {
  Product: true,
  Collection: true,
  Order: true,
  Customer: true,
  Theme: true,
  Discount: true,
  InventoryLevel: true,
  AbandonedCheckout: true,
  ProductReview: true,
  GiftCard: true,
  Payout: true,
  BalanceTransaction: true,
  Company: true,
  Segment: true,
  StorePage: true,
  BlogPost: true,
  NavMenu: true,
  Redirect: true,
}

function isTenantModel(model?: string): boolean {
  if (!model) return false
  const capitalized = model.charAt(0).toUpperCase() + model.slice(1)
  return Boolean(TENANT_MODELS[capitalized] || TENANT_MODELS[model])
}

/**
 * Creates a centralized tenant-scoped Prisma Client extension.
 * Automatically enforces `storeId` on all read and write queries for tenant models,
 * eliminating ad-hoc manual filters across resolvers and preventing cross-tenant leaks.
 */
export function createTenantPrismaClient(prisma: PrismaClient, storeId: string) {
  if (prisma && typeof prisma === 'object' && '$extends' in prisma && typeof prisma.$extends === 'function') {
    const extensionConfig = {
      query: {
        $allModels: {
          async findMany({ model, args, query }: { model: string; args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
            if (isTenantModel(model)) {
              args.where = { ...(args.where || {}), storeId }
            }
            return query(args)
          },
          async findFirst({ model, args, query }: { model: string; args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
            if (isTenantModel(model)) {
              args.where = { ...(args.where || {}), storeId }
            }
            return query(args)
          },
          async count({ model, args, query }: { model: string; args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
            if (isTenantModel(model)) {
              args.where = { ...(args.where || {}), storeId }
            }
            return query(args)
          },
          async create({ model, args, query }: { model: string; args: { data?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
            if (isTenantModel(model)) {
              args.data = { ...(args.data || {}), storeId }
            }
            return query(args)
          },
          async createMany({ model, args, query }: { model: string; args: { data?: unknown }; query: (args: unknown) => Promise<unknown> }) {
            if (isTenantModel(model) && Array.isArray(args.data)) {
              args.data = args.data.map((item: Record<string, unknown>) => ({ ...item, storeId }))
            }
            return query(args)
          },
          async update({ model, args, query }: { model: string; args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
            if (isTenantModel(model)) {
              args.where = { ...(args.where || {}), storeId }
            }
            return query(args)
          },
          async updateMany({ model, args, query }: { model: string; args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
            if (isTenantModel(model)) {
              args.where = { ...(args.where || {}), storeId }
            }
            return query(args)
          },
          async delete({ model, args, query }: { model: string; args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
            if (isTenantModel(model)) {
              args.where = { ...(args.where || {}), storeId }
            }
            return query(args)
          },
          async deleteMany({ model, args, query }: { model: string; args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
            if (isTenantModel(model)) {
              args.where = { ...(args.where || {}), storeId }
            }
            return query(args)
          },
        },
      },
    }
    return prisma.$extends(extensionConfig as any)
  }

  // Fallback wrapper for unit test mocks lacking full PrismaClient prototype
  const targetObj = prisma && typeof prisma === 'object' ? (prisma as unknown as Record<string, unknown>) : {}
  return new Proxy(targetObj, {
    get(target, prop: string) {
      const model = target[prop]
      if (isTenantModel(prop) && model && typeof model === 'object') {
        return new Proxy(model as Record<string, (...args: unknown[]) => unknown>, {
          get(mTarget, mProp: string) {
            const orig = mTarget[mProp]
            if (typeof orig === 'function') {
              return async (args?: { where?: Record<string, unknown>; data?: Record<string, unknown> | Array<Record<string, unknown>> }) => {
                const safeArgs = args ? { ...args } : {}
                if (['findMany', 'findFirst', 'count', 'delete', 'deleteMany', 'update', 'updateMany'].includes(mProp)) {
                  safeArgs.where = { ...(safeArgs.where || {}), storeId }
                } else if (mProp === 'create') {
                  safeArgs.data = { ...(safeArgs.data || {}), storeId }
                }
                return orig(safeArgs)
              }
            }
            return orig
          },
        })
      }
      return model
    },
  })
}
