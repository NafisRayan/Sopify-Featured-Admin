import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSchema, graphql } from 'graphql'
import { tenantContext } from '../../common/tenant.middleware'
import { StorefrontService } from './storefront.service'
import { ReviewsService } from '../products/reviews.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ProductsService } from '../products/products.service'

test('Multi-Tenant Platform Isolation: Store A (Northstar) vs Store B (Apex Outdoor)', async () => {
  const storefrontSdl = readFileSync(join(__dirname, 'storefront.graphql'), 'utf8')
  const schema = buildSchema(storefrontSdl)
  assert.ok(schema, 'Storefront schema builds cleanly')

  const storeDb = [
    { id: 'store_northstar', name: 'Northstar Goods', slug: 'northstar', currency: 'USD' },
    { id: 'store_apex', name: 'Apex Outdoor Co', slug: 'apex', currency: 'CAD' },
  ]

  const productDb: any[] = [
    {
      id: 'prod_northstar_1',
      storeId: 'store_northstar',
      title: 'Northstar Wool Blanket',
      status: 'active',
      variants: JSON.stringify([{ id: 'v1', price: 95.0 }]),
      media: '[]',
      options: '[]',
      channels: '["online_store"]',
      tags: '["wool"]',
      collectionIds: '[]',
      seo: JSON.stringify({ handle: 'wool-blanket' }),
    },
    {
      id: 'prod_apex_1',
      storeId: 'store_apex',
      title: 'Apex Alpine Backpack',
      status: 'active',
      variants: JSON.stringify([{ id: 'v2', price: 180.0 }]),
      media: '[]',
      options: '[]',
      channels: '["online_store"]',
      tags: '["backpack"]',
      collectionIds: '[]',
      seo: JSON.stringify({ handle: 'alpine-backpack' }),
    },
  ]

  const mockPrisma = {
    store: {
      findUnique: async ({ where }: any) => {
        if (where.id) return storeDb.find((s) => s.id === where.id) || null
        if (where.slug) return storeDb.find((s) => s.slug === where.slug) || null
        return null
      },
      findFirst: async ({ where }: any) => {
        if (where.slug) return storeDb.find((s) => s.slug === where.slug) || null
        return null
      },
      findMany: async () => storeDb,
      create: async ({ data }: any) => {
        storeDb.push(data)
        return data
      },
    },
    product: {
      findMany: async (args?: any) => {
        if (args?.where?.storeId) {
          return productDb.filter((p) => p.storeId === args.where.storeId)
        }
        return productDb
      },
      create: async ({ data }: any) => {
        productDb.push(data)
        return data
      },
    },
    location: { findMany: async () => [{ id: 'loc_1', active: true }] },
    inventoryLevel: {
      findMany: async () => [],
      findUnique: async () => null,
      create: async () => ({}),
      createMany: async () => ({}),
    },
    inventoryHistory: { create: async () => ({}) },
    storeSettings: { findUnique: async () => null },
  }

  const prismaStub = mockPrisma as unknown as PrismaService // test mock implements only the delegates these flows touch
  const storefrontService = new StorefrontService(prismaStub, new ReviewsService(prismaStub))
  storefrontService.onModuleInit()

  // 1. Query Storefront under Tenant Context: Store A (Northstar Goods)
  await tenantContext.run(storeDb[0], async () => {
    const res = await storefrontService.execute(`
      query {
        shop {
          name
          primaryDomain { host }
        }
        products(first: 10) {
          edges {
            node {
              id
              title
            }
          }
        }
      }
    `)
    assert.equal(res.errors, undefined)
    const data = res.data as any
    assert.equal(data.shop.name, 'Northstar Goods')
    assert.equal(data.shop.primaryDomain.host, 'northstar.platform.com')
    assert.equal(data.products.edges.length, 1)
    assert.equal(data.products.edges[0].node.title, 'Northstar Wool Blanket')
  })

  // 2. Query Storefront under Tenant Context: Store B (Apex Outdoor Co)
  await tenantContext.run(storeDb[1], async () => {
    const res = await storefrontService.execute(`
      query {
        shop {
          name
          primaryDomain { host }
        }
        products(first: 10) {
          edges {
            node {
              id
              title
            }
          }
        }
      }
    `)
    assert.equal(res.errors, undefined)
    const data = res.data as any
    assert.equal(data.shop.name, 'Apex Outdoor Co')
    assert.equal(data.shop.primaryDomain.host, 'apex.platform.com')
    assert.equal(data.products.edges.length, 1)
    assert.equal(data.products.edges[0].node.title, 'Apex Alpine Backpack')
  })

  // 3. Verify Admin ProductsService creates product isolated strictly to active tenant
  const productsService = new ProductsService(mockPrisma as any)

  await tenantContext.run(storeDb[1], async () => {
    // Add product to Store B
    await productsService.create({
      title: 'Apex Expedition Tent',
      variants: [{ id: 'v_tent', price: 340.0, sku: 'APEX-TENT' }],
    })
    const count = await productsService.productsCount()
    assert.equal(count, 2, 'Store B should now have 2 products')
  })

  await tenantContext.run(storeDb[0], async () => {
    const count = await productsService.productsCount()
    assert.equal(count, 1, 'Store A (Northstar) must remain isolated with 1 product')
  })
})
