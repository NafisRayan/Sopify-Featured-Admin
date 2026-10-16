import assert from 'node:assert/strict'
import test from 'node:test'
import { HealthController } from './health.controller'

test('HealthController GET /api/health returns HTTP 200 with database connectivity and tenant count', async () => {
  const mockPrisma = {
    $queryRaw: async () => [{ '?column?': 1 }],
    store: {
      count: async () => 2,
    },
  }

  const controller = new HealthController(mockPrisma as any)

  let statusCode = 0
  let responseData: any = null

  const mockRes = {
    status: (code: number) => {
      statusCode = code
      return {
        json: (payload: any) => {
          responseData = payload
        },
      }
    },
  }

  await controller.checkHealth(mockRes as any)

  assert.equal(statusCode, 200)
  assert.equal(responseData.status, 'ok')
  assert.equal(responseData.database, 'connected')
  assert.equal(responseData.tenantCount, 2)
  assert.equal(typeof responseData.uptime, 'number')
  assert.ok(responseData.timestamp)
  assert.equal(responseData.platform, 'Shopify Admin & Storefront Engine')
})

test('HealthController GET /api/health fails gracefully with HTTP 503 when database is disconnected', async () => {
  const mockPrisma = {
    $queryRaw: async () => {
      throw new Error('Connection refused at 5432')
    },
  }

  const controller = new HealthController(mockPrisma as any)

  let statusCode = 0
  let responseData: any = null

  const mockRes = {
    status: (code: number) => {
      statusCode = code
      return {
        json: (payload: any) => {
          responseData = payload
        },
      }
    },
  }

  await controller.checkHealth(mockRes as any)

  assert.equal(statusCode, 503)
  assert.equal(responseData.status, 'error')
  assert.equal(responseData.database, 'disconnected')
  assert.equal(responseData.error, 'Database connection unavailable')
})
