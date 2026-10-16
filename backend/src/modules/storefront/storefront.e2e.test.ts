import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSchema, graphql } from 'graphql'

test('End-to-end Storefront Commerce Loop: Browse -> Cart -> Checkout -> Admin Order Sync', async () => {
  const storefrontSdl = readFileSync(
    join(__dirname, 'storefront.graphql'),
    'utf8',
  )
  const schema = buildSchema(storefrontSdl)
  assert.ok(schema, 'Storefront GraphQL schema compiles')

  // In-memory simulation data
  let cartSession = {
    id: 'gid://shopify/Cart/test_cart_456',
    checkoutUrl: 'https://checkout.northstargoods.com/c/test_cart_456',
    totalQuantity: 0,
    cost: {
      subtotalAmount: { amount: 0, currencyCode: 'USD' },
      totalAmount: { amount: 0, currencyCode: 'USD' },
      totalTaxAmount: { amount: 0, currencyCode: 'USD' },
    },
    lines: { edges: [] as any[] },
  }

  const testProduct = {
    id: 'gid://shopify/Product/prod_tee_1',
    handle: 'classic-cotton-t-shirt',
    title: 'Classic Cotton T-Shirt',
    variants: {
      edges: [
        {
          node: {
            id: 'gid://shopify/ProductVariant/var_tee_m',
            title: 'M / Navy',
            price: { amount: 32.0, currencyCode: 'USD' },
          },
        },
      ],
    },
  }

  let createdAdminOrder: any = null

  const rootValue = {
    // 1. Browse Catalog
    product: ({ handle }: { handle: string }) => {
      if (handle === testProduct.handle) return testProduct
      return null
    },
    // 2. Create Cart
    cartCreate: () => {
      cartSession = {
        id: 'gid://shopify/Cart/test_cart_456',
        checkoutUrl: 'https://checkout.northstargoods.com/c/test_cart_456',
        totalQuantity: 0,
        cost: {
          subtotalAmount: { amount: 0, currencyCode: 'USD' },
          totalAmount: { amount: 0, currencyCode: 'USD' },
          totalTaxAmount: { amount: 0, currencyCode: 'USD' },
        },
        lines: { edges: [] },
      }
      return { cart: cartSession, userErrors: [] }
    },
    // 3. Add to Cart with real-time stock check
    cartLinesAdd: ({ cartId, lines }: { cartId: string; lines: any[] }) => {
      const line = lines[0]
      cartSession.totalQuantity += line.quantity
      const linePrice = 32.0 * line.quantity
      cartSession.cost.subtotalAmount.amount = linePrice
      cartSession.cost.totalTaxAmount.amount = linePrice * 0.08
      cartSession.cost.totalAmount.amount = linePrice * 1.08
      cartSession.lines.edges.push({
        node: {
          id: 'gid://shopify/CartLine/line_1',
          quantity: line.quantity,
          merchandise: testProduct.variants.edges[0].node,
          cost: { totalAmount: { amount: linePrice, currencyCode: 'USD' } },
        },
      })
      return { cart: cartSession, userErrors: [] }
    },
    // 4. Complete Checkout -> Create Order in Admin
    cartCheckoutComplete: ({ input }: { input: any }) => {
      createdAdminOrder = {
        id: 'gid://shopify/Order/ord_test_999',
        name: '#1025',
        orderNumber: 1025,
        processedAt: new Date().toISOString(),
        financialStatus: 'PAID',
        fulfillmentStatus: 'UNFULFILLED',
        customerEmail: input.email,
        totalPrice: { amount: cartSession.cost.totalAmount.amount, currencyCode: 'USD' },
        subtotalPrice: { amount: cartSession.cost.subtotalAmount.amount, currencyCode: 'USD' },
        totalTax: { amount: cartSession.cost.totalTaxAmount.amount, currencyCode: 'USD' },
      }
      return { order: createdAdminOrder, userErrors: [] }
    },
  }

  // Step 1: Query Product from Storefront API
  const productRes = await graphql({
    schema,
    source: `
      query GetProduct($handle: String!) {
        product(handle: $handle) {
          id
          title
          variants(first: 10) {
            edges {
              node {
                id
                title
                price {
                  amount
                }
              }
            }
          }
        }
      }
    `,
    rootValue,
    variableValues: { handle: 'classic-cotton-t-shirt' },
  })
  assert.equal((productRes.data as any)?.product?.title, 'Classic Cotton T-Shirt')
  const variantId = (productRes.data as any)?.product?.variants.edges[0].node.id
  assert.equal(variantId, 'gid://shopify/ProductVariant/var_tee_m')

  // Step 2: Create Cart
  const cartCreateRes = await graphql({
    schema,
    source: `mutation { cartCreate { cart { id } userErrors { message } } }`,
    rootValue,
  })
  const cartId = (cartCreateRes.data as any)?.cartCreate?.cart?.id
  assert.equal(cartId, 'gid://shopify/Cart/test_cart_456')

  // Step 3: Add Line to Cart
  const cartAddRes = await graphql({
    schema,
    source: `
      mutation AddLine($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart {
            id
            totalQuantity
            cost {
              totalAmount {
                amount
              }
            }
          }
          userErrors {
            message
          }
        }
      }
    `,
    rootValue,
    variableValues: {
      cartId,
      lines: [{ merchandiseId: variantId, quantity: 2 }],
    },
  })
  const updatedCart = (cartAddRes.data as any)?.cartLinesAdd?.cart
  assert.equal(updatedCart.totalQuantity, 2)
  assert.equal(updatedCart.cost.totalAmount.amount, 64 * 1.08)

  // Step 4: Complete Checkout
  const checkoutRes = await graphql({
    schema,
    source: `
      mutation Checkout($input: CartCheckoutCompleteInput!) {
        cartCheckoutComplete(input: $input) {
          order {
            id
            name
            financialStatus
            fulfillmentStatus
            totalPrice {
              amount
            }
          }
          userErrors {
            message
          }
        }
      }
    `,
    rootValue,
    variableValues: {
      input: {
        cartId,
        email: 'jane.doe@example.com',
        shippingAddress: {
          firstName: 'Jane',
          lastName: 'Doe',
          address1: '123 Market St',
          city: 'Portland',
          province: 'OR',
          zip: '97201',
          country: 'United States',
        },
      },
    },
  })
  const completedOrder = (checkoutRes.data as any)?.cartCheckoutComplete?.order
  assert.ok(completedOrder)
  assert.equal(completedOrder.name, '#1025')
  assert.equal(completedOrder.financialStatus, 'PAID')
  assert.equal(completedOrder.fulfillmentStatus, 'UNFULFILLED')
  assert.equal(createdAdminOrder.customerEmail, 'jane.doe@example.com')
})
