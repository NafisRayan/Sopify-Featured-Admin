import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSchema, graphql } from 'graphql'
import { StorefrontService } from './storefront.service'

test('Customer Account Lifecycle: Register -> Login -> Profile Query -> Address Management', async () => {
  const storefrontSdl = readFileSync(join(__dirname, 'storefront.graphql'), 'utf8')
  const schema = buildSchema(storefrontSdl)
  assert.ok(schema, 'Storefront schema builds cleanly')

  // In-memory mock database
  const customerDb: any[] = []
  const orderDb: any[] = [
    {
      id: 'ord_sample_1',
      name: '#1028',
      customerId: 'cust_sarah_1',
      email: 'sarah.connor@example.com',
      total: 85.0,
      subtotal: 75.0,
      taxTotal: 10.0,
      shippingPrice: 0,
      currency: 'USD',
      paymentStatus: 'paid',
      fulfillmentStatus: 'fulfilled',
      createdAt: new Date(),
      lineItems: JSON.stringify([
        { id: 'li_1', title: 'Everyday Canvas Duffel', variantTitle: 'Olive', quantity: 1, price: 85.0 },
      ]),
      fulfillments: JSON.stringify([
        { status: 'SUCCESS', carrier: 'FedEx', trackingNumber: 'FX-889922' },
      ]),
      shippingAddress: JSON.stringify({
        address1: '400 Cyberdyne Way',
        city: 'Los Angeles',
        province: 'CA',
        zip: '90001',
        country: 'United States',
      }),
    },
  ]

  const mockPrisma = {
    customer: {
      findUnique: async ({ where }: any) => {
        return customerDb.find((c) => c.email.toLowerCase() === where.email.toLowerCase()) || null
      },
      findFirst: async ({ where }: any) => {
        if (where.email) {
          const matched = customerDb.find((c) => c.email.toLowerCase() === where.email.toLowerCase())
          if (matched) return matched
        }
        if (where.OR) {
          for (const cond of where.OR) {
            if (cond.id) {
              const matched = customerDb.find((c) => c.id === cond.id)
              if (matched) return matched
            }
            if (cond.email) {
              const matched = customerDb.find((c) => c.email.toLowerCase() === cond.email.toLowerCase())
              if (matched) return matched
            }
          }
        }
        return null
      },
      create: async ({ data }: any) => {
        customerDb.push(data)
        return data
      },
      update: async ({ where, data }: any) => {
        const idx = customerDb.findIndex((c) => c.id === where.id)
        if (idx >= 0) {
          customerDb[idx] = { ...customerDb[idx], ...data }
          return customerDb[idx]
        }
        return data
      },
    },
    order: {
      findMany: async () => orderDb,
      findUnique: async ({ where }: any) => orderDb.find((o) => o.id === where.id) || null,
    },
    product: { findMany: async () => [] },
    collection: { findMany: async () => [] },
    storeSettings: { findUnique: async () => null },
    inventoryLevel: { findMany: async () => [] },
  }

  const storefrontService = new StorefrontService(mockPrisma as any)
  storefrontService.onModuleInit()

  // 1. Register Customer
  const registerMutation = `
    mutation Register($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        customer {
          id
          email
          displayName
        }
        customerUserErrors {
          message
        }
      }
    }
  `
  const regRes = await storefrontService.execute(registerMutation, {
    input: {
      email: 'sarah.connor@example.com',
      password: 'Terminator2026!',
      firstName: 'Sarah',
      lastName: 'Connor',
    },
  })
  assert.equal(regRes.errors, undefined)
  const createdCustomer = (regRes.data as any)?.customerCreate?.customer
  assert.ok(createdCustomer)
  assert.equal(createdCustomer.email, 'sarah.connor@example.com')
  assert.equal(createdCustomer.displayName, 'Sarah Connor')

  // Verify password hash storage (scrypt format)
  const storedRecord = customerDb[0]
  const tags = typeof storedRecord.tags === 'string' ? JSON.parse(storedRecord.tags) : storedRecord.tags
  assert.ok(tags.some((t: string) => t.startsWith('pwd:scrypt:')), 'Password must be stored as scrypt hash')
  // 2. Authenticate Customer to obtain customerAccessToken
  const loginMutation = `
    mutation Login($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
        customerAccessToken {
          accessToken
          expiresAt
        }
        customerUserErrors {
          message
        }
      }
    }
  `
  const loginRes = await storefrontService.execute(loginMutation, {
    input: {
      email: 'sarah.connor@example.com',
      password: 'Terminator2026!',
    },
  })
  assert.equal(loginRes.errors, undefined)
  const token = (loginRes.data as any)?.customerAccessTokenCreate?.customerAccessToken
  assert.ok(token)
  assert.ok(token.accessToken)

  // 3. Query Customer Profile, Orders, and Addresses via customerAccessToken
  const profileQuery = `
    query CustomerProfile($token: String!) {
      customer(customerAccessToken: $token) {
        id
        email
        displayName
        orders(first: 10) {
          edges {
            node {
              id
              name
              financialStatus
              fulfillmentStatus
              totalPrice {
                amount
              }
              fulfillments {
                status
                trackingCompany
                trackingInfo {
                  number
                }
              }
            }
          }
        }
      }
    }
  `
  const profileRes = await storefrontService.execute(profileQuery, {
    token: token.accessToken,
  })
  assert.equal(profileRes.errors, undefined)
  const profile = (profileRes.data as any)?.customer
  assert.equal(profile.displayName, 'Sarah Connor')
  assert.equal(profile.orders.edges.length, 1)
  const orderNode = profile.orders.edges[0].node
  assert.equal(orderNode.name, '#1028')
  assert.equal(orderNode.financialStatus, 'PAID')
  assert.equal(orderNode.fulfillmentStatus, 'FULFILLED')
  assert.equal(orderNode.fulfillments[0].trackingCompany, 'FedEx')

  // 4. Create Shipping Address
  const addAddressMutation = `
    mutation AddAddress($token: String!, $address: MailingAddressInput!) {
      customerAddressCreate(customerAccessToken: $token, address: $address) {
        customerAddress {
          id
          address1
          city
          province
          zip
          country
        }
        customerUserErrors {
          message
        }
      }
    }
  `
  const addressRes = await storefrontService.execute(addAddressMutation, {
    token: token.accessToken,
    address: {
      address1: '400 Cyberdyne Way',
      city: 'Los Angeles',
      province: 'CA',
      zip: '90001',
      country: 'United States',
      firstName: 'Sarah',
      lastName: 'Connor',
    },
  })
  assert.equal(addressRes.errors, undefined)
  const createdAddr = (addressRes.data as any)?.customerAddressCreate?.customerAddress
  assert.ok(createdAddr)
  assert.equal(createdAddr.city, 'Los Angeles')
  assert.equal(createdAddr.zip, '90001')
})
