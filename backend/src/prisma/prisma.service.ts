import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { createTenantPrismaClient } from './tenant-prisma'
import { currentTenant } from '../common/tenant.middleware'

/** Prisma access (repository pattern — services depend on this abstraction) */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name)

  async onModuleInit(): Promise<void> {
    await this.$connect()
    this.logger.log('Database connected')
  }

  /**
   * Returns a tenant-scoped Prisma client extension enforcing the current tenant context.
   * If a custom storeId is provided, scopes explicitly to that tenant.
   */
  tenant(customStoreId?: string) {
    const storeId = customStoreId || currentTenant().id
    return createTenantPrismaClient(this, storeId)
  }
}
