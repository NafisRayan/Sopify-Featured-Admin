import { Controller, Get, Res, HttpStatus, Logger } from '@nestjs/common'
import type { Response } from 'express'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('api')
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async checkHealth(@Res() res: Response): Promise<void> {
    try {
      // Direct raw database ping
      await this.prisma.$queryRaw`SELECT 1`

      let tenantCount = 1
      try {
        tenantCount = await this.prisma.store.count()
      } catch {
        // fallback
      }

      res.status(HttpStatus.OK).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: 'connected',
        tenantCount,
        platform: 'Shopify Admin & Storefront Engine',
      })
    } catch (err) {
      this.logger.error(`Health check failure: ${err}`)
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'error',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: 'Database connection unavailable',
      })
    }
  }
}
