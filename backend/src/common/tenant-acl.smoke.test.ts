import assert from 'node:assert/strict'
import test from 'node:test'
import { TenantMiddleware, DEFAULT_STORE } from './tenant.middleware'
import { staffContext } from '../auth/staff-context'

test('Tenant ACL Security: Regular staff session with foreign x-store-id is rejected with HTTP 403', async () => {
  const storeDb = [
    { id: 'store_northstar', name: 'Northstar Goods', slug: 'northstar', currency: 'USD' },
    { id: 'store_apex', name: 'Apex Outdoor Co', slug: 'apex', currency: 'CAD' },
  ]

  const mockPrisma = {
    store: {
      findUnique: async ({ where }: any) => storeDb.find((s) => s.id === where.id || s.slug === where.slug) || null,
    },
  }

  const middleware = new TenantMiddleware(mockPrisma as any)

  // 1. Regular staff belonging to Store A (Northstar) attempting to access Store B (Apex)
  const reqWithForeignStore = {
    headers: {
      'x-store-id': 'store_apex',
    },
    query: {},
  } as any

  let statusCode = 0
  let responseData: any = null
  let nextCalled = false

  const res = {
    setHeader: () => {},
    status: (code: number) => {
      statusCode = code
      return {
        json: (payload: any) => {
          responseData = payload
        },
      }
    },
  } as any

  const next = () => {
    nextCalled = true
  }

  // Staff session belonging to store_northstar
  const staffMemberSession = {
    id: 'staff_alice',
    name: 'Alice',
    email: 'alice@northstargoods.com',
    role: 'staff',
    storeId: 'store_northstar',
  }

  await staffContext.run(staffMemberSession, async () => {
    await middleware.use(reqWithForeignStore, res, next)
  })

  assert.equal(statusCode, 403, 'Should issue HTTP 403 Forbidden on foreign store access')
  assert.equal(nextCalled, false, 'Next middleware must not be invoked on ACL failure')
  assert.ok(responseData?.message?.includes('Access denied'))
})

test('Tenant ACL Security: Staff member accessing their own store succeeds', async () => {
  const storeDb = [
    { id: 'store_apex', name: 'Apex Outdoor Co', slug: 'apex', currency: 'CAD' },
  ]

  const mockPrisma = {
    store: {
      findUnique: async ({ where }: any) => storeDb.find((s) => s.id === where.id) || null,
    },
  }

  const middleware = new TenantMiddleware(mockPrisma as any)

  const req = {
    headers: { 'x-store-id': 'store_apex' },
    query: {},
  } as any

  let nextCalled = false
  const res = { setHeader: () => {} } as any
  const next = () => {
    nextCalled = true
  }

  const staffMemberSession = {
    id: 'staff_bob',
    name: 'Bob',
    email: 'bob@apexoutdoor.com',
    role: 'staff',
    storeId: 'store_apex',
  }

  await staffContext.run(staffMemberSession, async () => {
    await middleware.use(req, res, next)
  })

  assert.equal(nextCalled, true, 'Next middleware should be called when staff belongs to store')
  assert.equal(req.store.id, 'store_apex')
})

test('Tenant ACL Security: Superadmin role bypasses store restrictions', async () => {
  const storeDb = [
    { id: 'store_apex', name: 'Apex Outdoor Co', slug: 'apex', currency: 'CAD' },
  ]

  const mockPrisma = {
    store: {
      findUnique: async ({ where }: any) => storeDb.find((s) => s.id === where.id) || null,
    },
  }

  const middleware = new TenantMiddleware(mockPrisma as any)

  const req = {
    headers: { 'x-store-id': 'store_apex' },
    query: {},
  } as any

  let nextCalled = false
  const res = { setHeader: () => {} } as any
  const next = () => {
    nextCalled = true
  }

  const superadminSession = {
    id: 'staff_root',
    name: 'Root Admin',
    email: 'admin@platform.com',
    role: 'superadmin',
    storeId: 'store_northstar',
  }

  await staffContext.run(superadminSession, async () => {
    await middleware.use(req, res, next)
  })

  assert.equal(nextCalled, true, 'Superadmin must bypass cross-store check')
  assert.equal(req.store.id, 'store_apex')
})
