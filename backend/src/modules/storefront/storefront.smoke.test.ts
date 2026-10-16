import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSchema, graphql } from 'graphql'

test('Admin GraphQL SDL compiles and fulfills { shop { name id } } query with valid GID', async () => {
  const schemaDir = join(__dirname, '..', '..', 'graphql', 'schema')
  const rootSdl = readFileSync(join(schemaDir, 'root.graphql'), 'utf8')
  const baseSdl = readFileSync(join(schemaDir, 'base.graphql'), 'utf8')
  const ordersSdl = readFileSync(join(schemaDir, 'orders.graphql'), 'utf8')
  const contentSdl = readFileSync(join(schemaDir, 'content.graphql'), 'utf8')
  const discountsSdl = readFileSync(join(schemaDir, 'discounts.graphql'), 'utf8')

  const fullSdl = [baseSdl, ordersSdl, contentSdl, discountsSdl, rootSdl].join('\n')
  const schema = buildSchema(fullSdl)
  assert.ok(schema, 'Admin schema should build cleanly')

  const query = `
    query {
      shop {
        id
        name
      }
    }
  `
  const rootValue = {
    shop: () => ({
      id: 'gid://shopify/Shop/singleton',
      name: 'Northstar Goods',
    }),
  }

  const result = await graphql({ schema, source: query, rootValue })
  assert.deepEqual(result.errors, undefined)
  assert.equal((result.data as any)?.shop?.id, 'gid://shopify/Shop/singleton')
  assert.equal((result.data as any)?.shop?.name, 'Northstar Goods')
})

test('Storefront GraphQL SDL compiles and executes cartCreate with valid Relay ID and empty lines', async () => {
  const storefrontSdl = readFileSync(join(__dirname, 'storefront.graphql'), 'utf8')
  const schema = buildSchema(storefrontSdl)
  assert.ok(schema, 'Storefront schema should build cleanly')

  const mutation = `
    mutation {
      cartCreate {
        cart {
          id
          checkoutUrl
          totalQuantity
          lines(first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `
  const rootValue = {
    cartCreate: () => ({
      cart: {
        id: 'gid://shopify/Cart/cart_test_123',
        checkoutUrl: 'https://checkout.northstargoods.com/c/cart_test_123',
        totalQuantity: 0,
        lines: { edges: [] },
      },
      userErrors: [],
    }),
  }

  const result = await graphql({ schema, source: mutation, rootValue })
  assert.deepEqual(result.errors, undefined)
  const cart = (result.data as any)?.cartCreate?.cart
  assert.ok(cart)
  assert.equal(cart.id, 'gid://shopify/Cart/cart_test_123')
  assert.equal(cart.totalQuantity, 0)
  assert.equal(cart.lines.edges.length, 0)
})
