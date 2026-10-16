import {
  storefrontRequest,
  type StorefrontUserError,
  type StorefrontMoney,
} from './storefrontClient'

export interface CustomerMailingAddress {
  id: string
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  zip?: string | null
  country?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  formatted: string[]
}

export interface CustomerOrderLineItem {
  id: string
  title: string
  variantTitle?: string | null
  quantity: number
  originalTotalPrice: StorefrontMoney
}

export interface CustomerOrderFulfillment {
  status: string
  trackingCompany?: string | null
  trackingInfo: Array<{
    number?: string | null
    url?: string | null
    company?: string | null
  }>
}

export interface CustomerOrderSummary {
  id: string
  name: string
  orderNumber: number
  processedAt: string
  financialStatus: string
  fulfillmentStatus: string
  totalPrice: StorefrontMoney
  subtotalPrice: StorefrontMoney
  totalTax: StorefrontMoney
  totalShippingPrice: StorefrontMoney
  shippingAddress?: CustomerMailingAddress | null
  lineItems?: CustomerOrderLineItem[]
  fulfillments: CustomerOrderFulfillment[]
  returns?: Array<{
    id: string
    status: string
    reason: string
    createdAt: string
    refundAmount?: StorefrontMoney | null
    returnLineItems: Array<{
      id: string
      quantity: number
      lineItem?: CustomerOrderLineItem | null
    }>
  }>
}

export interface StorefrontReturnLineItemInput {
  lineItemId: string
  quantity: number
  reason?: string
  note?: string
}

export async function requestReturnOrder(
  orderId: string,
  returnLineItems: StorefrontReturnLineItemInput[],
): Promise<{ return: any | null; userErrors: StorefrontUserError[] }> {
  const mutation = `
    mutation ReturnRequest($orderId: ID!, $items: [ReturnLineItemInput!]!) {
      returnRequest(orderId: $orderId, returnLineItems: $items) {
        return {
          id
          status
          reason
          createdAt
          refundAmount {
            amount
            currencyCode
          }
          returnLineItems {
            id
            quantity
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `
  const res = await storefrontRequest<{
    returnRequest: { return: any | null; userErrors: StorefrontUserError[] }
  }>(mutation, {
    orderId: orderId.startsWith('gid://') ? orderId : `gid://shopify/Order/${orderId}`,
    items: returnLineItems,
  })
  return {
    return: res.data?.returnRequest?.return || null,
    userErrors: res.data?.returnRequest?.userErrors || [],
  }
}

export interface CustomerAccountProfile {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
  displayName: string
  phone?: string | null
  defaultAddress?: CustomerMailingAddress | null
  addresses: {
    edges: Array<{
      cursor: string
      node: CustomerMailingAddress
    }>
  }
  orders: {
    edges: Array<{
      cursor: string
      node: CustomerOrderSummary
    }>
  }
}

export interface CustomerAccessToken {
  accessToken: string
  expiresAt: string
}

export interface CustomerRegisterInput {
  email: string
  password: string
  firstName?: string
  lastName?: string
  phone?: string
  acceptsMarketing?: boolean
}

export interface CustomerMailingAddressInput {
  address1?: string
  address2?: string
  city?: string
  province?: string
  zip?: string
  country?: string
  firstName?: string
  lastName?: string
  phone?: string
}

// ─── Customer Auth Operations ────────────────────────────────────────────────

export async function createStorefrontCustomer(
  input: CustomerRegisterInput,
): Promise<{ customer: { id: string; email: string; displayName: string } | null; userErrors: StorefrontUserError[] }> {
  const mutation = `
    mutation CustomerCreate($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        customer {
          id
          email
          displayName
        }
        customerUserErrors {
          field
          message
          code
        }
      }
    }
  `
  const res = await storefrontRequest<{
    customerCreate: {
      customer: { id: string; email: string; displayName: string } | null
      customerUserErrors: StorefrontUserError[]
    }
  }>(mutation, { input })
  return {
    customer: res.data?.customerCreate?.customer || null,
    userErrors: res.data?.customerCreate?.customerUserErrors || [],
  }
}

export async function loginStorefrontCustomer(
  email: string,
  password: string,
): Promise<{ customerAccessToken: CustomerAccessToken | null; userErrors: StorefrontUserError[] }> {
  const mutation = `
    mutation CustomerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
        customerAccessToken {
          accessToken
          expiresAt
        }
        customerUserErrors {
          field
          message
          code
        }
      }
    }
  `
  const res = await storefrontRequest<{
    customerAccessTokenCreate: {
      customerAccessToken: CustomerAccessToken | null
      customerUserErrors: StorefrontUserError[]
    }
  }>(mutation, { input: { email, password } })
  return {
    customerAccessToken: res.data?.customerAccessTokenCreate?.customerAccessToken || null,
    userErrors: res.data?.customerAccessTokenCreate?.customerUserErrors || [],
  }
}

export async function logoutStorefrontCustomer(customerAccessToken: string): Promise<void> {
  const mutation = `
    mutation CustomerAccessTokenDelete($customerAccessToken: String!) {
      customerAccessTokenDelete(customerAccessToken: $customerAccessToken) {
        deletedAccessToken
      }
    }
  `
  await storefrontRequest(mutation, { customerAccessToken })
}

export async function getStorefrontCustomerProfile(
  customerAccessToken: string,
): Promise<CustomerAccountProfile | null> {
  const query = `
    query GetCustomer($token: String!) {
      customer(customerAccessToken: $token) {
        id
        email
        firstName
        lastName
        displayName
        phone
        defaultAddress {
          id
          address1
          address2
          city
          province
          zip
          country
          firstName
          lastName
          phone
          formatted
        }
        addresses(first: 25) {
          edges {
            cursor
            node {
              id
              address1
              address2
              city
              province
              zip
              country
              firstName
              lastName
              phone
              formatted
            }
          }
        }
        orders(first: 25) {
          edges {
            cursor
            node {
              id
              name
              orderNumber
              processedAt
              financialStatus
              fulfillmentStatus
              totalPrice {
                amount
                currencyCode
              }
              subtotalPrice {
                amount
                currencyCode
              }
              totalTax {
                amount
                currencyCode
              }
              totalShippingPrice {
                amount
                currencyCode
              }
              shippingAddress {
                address1
                city
                province
                zip
                country
              }
              lineItems(first: 25) {
                id
                title
                variantTitle
                quantity
                originalTotalPrice {
                  amount
                  currencyCode
                }
              }
              fulfillments {
                status
                trackingCompany
                trackingInfo {
                  number
                  url
                  company
                }
              }
            }
          }
        }
      }
    }
  `
  const res = await storefrontRequest<{ customer: CustomerAccountProfile | null }>(query, {
    token: customerAccessToken,
  })
  return res.data?.customer || null
}

export async function createCustomerAddress(
  customerAccessToken: string,
  address: CustomerMailingAddressInput,
): Promise<{ customerAddress: CustomerMailingAddress | null; userErrors: StorefrontUserError[] }> {
  const mutation = `
    mutation AddressCreate($token: String!, $address: MailingAddressInput!) {
      customerAddressCreate(customerAccessToken: $token, address: $address) {
        customerAddress {
          id
          address1
          address2
          city
          province
          zip
          country
          firstName
          lastName
          phone
          formatted
        }
        customerUserErrors {
          field
          message
        }
      }
    }
  `
  const res = await storefrontRequest<{
    customerAddressCreate: {
      customerAddress: CustomerMailingAddress | null
      customerUserErrors: StorefrontUserError[]
    }
  }>(mutation, { token: customerAccessToken, address })
  return {
    customerAddress: res.data?.customerAddressCreate?.customerAddress || null,
    userErrors: res.data?.customerAddressCreate?.customerUserErrors || [],
  }
}

export async function deleteCustomerAddress(
  customerAccessToken: string,
  id: string,
): Promise<{ deletedId: string | null; userErrors: StorefrontUserError[] }> {
  const mutation = `
    mutation AddressDelete($token: String!, $id: ID!) {
      customerAddressDelete(customerAccessToken: $token, id: $id) {
        deletedCustomerAddressId
        customerUserErrors {
          field
          message
        }
      }
    }
  `
  const res = await storefrontRequest<{
    customerAddressDelete: {
      deletedCustomerAddressId: string | null
      customerUserErrors: StorefrontUserError[]
    }
  }>(mutation, { token: customerAccessToken, id })
  return {
    deletedId: res.data?.customerAddressDelete?.deletedCustomerAddressId || null,
    userErrors: res.data?.customerAddressDelete?.customerUserErrors || [],
  }
}

export async function setDefaultCustomerAddress(
  customerAccessToken: string,
  addressId: string,
): Promise<{ userErrors: StorefrontUserError[] }> {
  const mutation = `
    mutation AddressDefault($token: String!, $addressId: ID!) {
      customerDefaultAddressUpdate(customerAccessToken: $token, addressId: $addressId) {
        customerUserErrors {
          field
          message
        }
      }
    }
  `
  const res = await storefrontRequest<{
    customerDefaultAddressUpdate: {
      customerUserErrors: StorefrontUserError[]
    }
  }>(mutation, { token: customerAccessToken, addressId })
  return {
    userErrors: res.data?.customerDefaultAddressUpdate?.customerUserErrors || [],
  }
}
