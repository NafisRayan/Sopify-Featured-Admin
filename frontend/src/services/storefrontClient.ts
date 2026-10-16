export const STOREFRONT_API_URL: string =
  ((typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) as string | undefined) ||
  'http://localhost:4000'

const STOREFRONT_ENDPOINT = `${STOREFRONT_API_URL}/api/storefront/graphql`

export interface StorefrontMoney {
  amount: number
  currencyCode: string
}

export interface StorefrontImage {
  url: string
  altText?: string | null
}

export interface StorefrontProductVariant {
  id: string
  title: string
  availableForSale: boolean
  currentlyNotInStock: boolean
  quantityAvailable?: number | null
  sku?: string | null
  price: StorefrontMoney
  compareAtPrice?: StorefrontMoney | null
  image?: StorefrontImage | null
  selectedOptions: Array<{ name: string; value: string }>
  product?: {
    id: string
    title: string
    handle: string
  } | null
}

export interface StorefrontProduct {
  id: string
  handle: string
  title: string
  description: string
  descriptionHtml: string
  vendor: string
  productType: string
  availableForSale: boolean
  images: StorefrontImage[]
  featuredImage?: StorefrontImage | null
  priceRange: {
    minVariantPrice: StorefrontMoney
    maxVariantPrice: StorefrontMoney
  }
  compareAtPriceRange: {
    minVariantPrice: StorefrontMoney
    maxVariantPrice: StorefrontMoney
  }
  options: Array<{
    id: string
    name: string
    values: string[]
  }>
  variants: {
    edges: Array<{
      cursor: string
      node: StorefrontProductVariant
    }>
  }
  reviewsCount?: number
  averageRating?: number
  reviews?: Array<{
    id: string
    customerName: string
    rating: number
    title: string
    body: string
    isVerifiedBuyer: boolean
    adminReply?: string | null
    createdAt: string
  }>
}

export interface StorefrontCollection {
  id: string
  handle: string
  title: string
  description: string
  descriptionHtml: string
  image?: StorefrontImage | null
  products: {
    edges: Array<{
      cursor: string
      node: StorefrontProduct
    }>
  }
}

export interface StorefrontShop {
  id: string
  name: string
  description?: string | null
  moneyFormat: string
  primaryDomain: {
    host: string
    url: string
  }
  paymentSettings: {
    currencyCode: string
    acceptedCardBrands: string[]
  }
}

export interface StorefrontCartLine {
  id: string
  quantity: number
  merchandise: StorefrontProductVariant
  cost: {
    totalAmount: StorefrontMoney
    subtotalAmount: StorefrontMoney
    amountPerQuantity: StorefrontMoney
    compareAtAmountPerQuantity?: StorefrontMoney | null
  }
  attributes: Array<{ key: string; value: string }>
}

export interface StorefrontCart {
  id: string
  checkoutUrl: string
  totalQuantity: number
  createdAt: string
  updatedAt: string
  note?: string | null
  cost: {
    totalAmount: StorefrontMoney
    subtotalAmount: StorefrontMoney
    totalTaxAmount?: StorefrontMoney | null
    totalDutyAmount?: StorefrontMoney | null
    totalDiscountAmount?: StorefrontMoney | null
  }
  lines: {
    edges: Array<{
      cursor: string
      node: StorefrontCartLine
    }>
  }
  discountCodes: Array<{ code: string; applicable: boolean; amount?: StorefrontMoney | null }>
  discountAllocations?: Array<{
    discountedAmount: StorefrontMoney
    code?: string | null
    title?: string | null
  }>
}
export interface StorefrontUserError {
  field?: string[] | null
  message: string
  code?: string | null
}

export async function storefrontRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data?: T; errors?: Array<{ message: string }> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search)
    const queryShop = urlParams.get('shop')
    if (queryShop) {
      headers['x-store-slug'] = queryShop
    }
  }
  const res = await fetch(STOREFRONT_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    throw new Error(`Storefront API error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

// ─── Query Operations ────────────────────────────────────────────────────────

export async function getStorefrontShop(): Promise<StorefrontShop> {
  const query = `
    query {
      shop {
        id
        name
        description
        moneyFormat
        primaryDomain {
          host
          url
        }
        paymentSettings {
          currencyCode
          acceptedCardBrands
        }
      }
    }
  `
  const res = await storefrontRequest<{ shop: StorefrontShop }>(query)
  if (res.errors?.length || !res.data) {
    throw new Error(res.errors?.[0]?.message || 'Failed to fetch shop')
  }
  return res.data.shop
}

export async function getStorefrontProducts(limit = 24): Promise<StorefrontProduct[]> {
  const query = `
    query GetProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            handle
            title
            description
            descriptionHtml
            vendor
            productType
            availableForSale
            featuredImage {
              url
              altText
            }
            images {
              url
              altText
            }
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
              maxVariantPrice {
                amount
                currencyCode
              }
            }
            compareAtPriceRange {
              minVariantPrice {
                amount
                currencyCode
              }
              maxVariantPrice {
                amount
                currencyCode
              }
            }
            options {
              id
              name
              values
            }
            variants(first: 50) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  currentlyNotInStock
                  quantityAvailable
                  sku
                  price {
                    amount
                    currencyCode
                  }
                  compareAtPrice {
                    amount
                    currencyCode
                  }
                  image {
                    url
                    altText
                  }
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  `
  const res = await storefrontRequest<{ products: { edges: Array<{ node: StorefrontProduct }> } }>(
    query,
    { first: limit },
  )
  return res.data?.products.edges.map((e) => e.node) || []
}

export async function getStorefrontProduct(handle: string): Promise<StorefrontProduct | null> {
  const query = `
    query GetProduct($handle: String!) {
      product(handle: $handle) {
        id
        handle
        title
        description
        descriptionHtml
        vendor
        productType
        availableForSale
        featuredImage {
          url
          altText
        }
        images {
          url
          altText
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        compareAtPriceRange {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        options {
          id
          name
          values
        }
        variants(first: 50) {
          edges {
            node {
              id
              title
              availableForSale
              currentlyNotInStock
              quantityAvailable
              sku
              price {
                amount
                currencyCode
              }
              compareAtPrice {
                amount
                currencyCode
              }
              image {
                url
                altText
              }
              selectedOptions {
                name
                value
              }
            }
          }
        }
        reviewsCount
        averageRating
        reviews {
          id
          customerName
          rating
          title
          body
          isVerifiedBuyer
          adminReply
          createdAt
        }
      }
    }
  `
  const res = await storefrontRequest<{ product: StorefrontProduct | null }>(query, { handle })
  return res.data?.product || null
}

export async function getStorefrontCollections(): Promise<StorefrontCollection[]> {
  const query = `
    query {
      collections(first: 10) {
        edges {
          node {
            id
            handle
            title
            description
            descriptionHtml
            image {
              url
              altText
            }
            products(first: 8) {
              edges {
                node {
                  id
                  handle
                  title
                  vendor
                  availableForSale
                  featuredImage {
                    url
                    altText
                  }
                  priceRange {
                    minVariantPrice {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `
  const res = await storefrontRequest<{
    collections: { edges: Array<{ node: StorefrontCollection }> }
  }>(query)
  return res.data?.collections.edges.map((e) => e.node) || []
}

export async function getStorefrontCart(cartId: string): Promise<StorefrontCart | null> {
  const query = `
    query GetCart($id: ID!) {
      cart(id: $id) {
        id
        checkoutUrl
        totalQuantity
        createdAt
        updatedAt
        note
        cost {
          totalAmount {
            amount
            currencyCode
          }
          subtotalAmount {
            amount
            currencyCode
          }
          totalTaxAmount {
            amount
            currencyCode
          }
        }
        lines(first: 100) {
          edges {
            node {
              id
              quantity
              attributes {
                key
                value
              }
              merchandise {
                id
                title
                availableForSale
                price {
                  amount
                  currencyCode
                }
                image {
                  url
                  altText
                }
                selectedOptions {
                  name
                  value
                }
                product {
                  id
                  title
                  handle
                }
              }
              cost {
                totalAmount {
                  amount
                  currencyCode
                }
                subtotalAmount {
                  amount
                  currencyCode
                }
                amountPerQuantity {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  `
  const res = await storefrontRequest<{ cart: StorefrontCart | null }>(query, { id: cartId })
  return res.data?.cart || null
}

// ─── Cart Mutation Operations ────────────────────────────────────────────────

export async function createStorefrontCart(
  lines?: Array<{ merchandiseId: string; quantity: number }>,
): Promise<{ cart: StorefrontCart | null; userErrors: StorefrontUserError[] }> {
  const mutation = `
    mutation CartCreate($input: CartInput) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount {
              amount
              currencyCode
            }
            subtotalAmount {
              amount
              currencyCode
            }
            totalTaxAmount {
              amount
              currencyCode
            }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                merchandise {
                  id
                  title
                  price {
                    amount
                    currencyCode
                  }
                  image {
                    url
                    altText
                  }
                  product {
                    id
                    title
                    handle
                  }
                }
                cost {
                  totalAmount {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `
  const res = await storefrontRequest<{
    cartCreate: { cart: StorefrontCart | null; userErrors: StorefrontUserError[] }
  }>(mutation, { input: lines ? { lines } : {} })
  return res.data?.cartCreate || { cart: null, userErrors: [{ message: 'Network error creating cart' }] }
}

export async function addStorefrontCartLines(
  cartId: string,
  lines: Array<{ merchandiseId: string; quantity: number }>,
): Promise<{ cart: StorefrontCart | null; userErrors: StorefrontUserError[] }> {
  const mutation = `
    mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount {
              amount
              currencyCode
            }
            subtotalAmount {
              amount
              currencyCode
            }
            totalTaxAmount {
              amount
              currencyCode
            }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                merchandise {
                  id
                  title
                  price {
                    amount
                    currencyCode
                  }
                  image {
                    url
                    altText
                  }
                  product {
                    id
                    title
                    handle
                  }
                }
                cost {
                  totalAmount {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `
  const res = await storefrontRequest<{
    cartLinesAdd: { cart: StorefrontCart | null; userErrors: StorefrontUserError[] }
  }>(mutation, { cartId, lines })
  return res.data?.cartLinesAdd || { cart: null, userErrors: [{ message: 'Network error adding line' }] }
}

export async function updateStorefrontCartLines(
  cartId: string,
  lines: Array<{ id: string; quantity: number }>,
): Promise<{ cart: StorefrontCart | null; userErrors: StorefrontUserError[] }> {
  const mutation = `
    mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount {
              amount
              currencyCode
            }
            subtotalAmount {
              amount
              currencyCode
            }
            totalTaxAmount {
              amount
              currencyCode
            }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                merchandise {
                  id
                  title
                  price {
                    amount
                    currencyCode
                  }
                  image {
                    url
                    altText
                  }
                  product {
                    id
                    title
                    handle
                  }
                }
                cost {
                  totalAmount {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `
  const res = await storefrontRequest<{
    cartLinesUpdate: { cart: StorefrontCart | null; userErrors: StorefrontUserError[] }
  }>(mutation, { cartId, lines })
  return res.data?.cartLinesUpdate || { cart: null, userErrors: [{ message: 'Network error updating line' }] }
}

export async function removeStorefrontCartLines(
  cartId: string,
  lineIds: string[],
): Promise<{ cart: StorefrontCart | null; userErrors: StorefrontUserError[] }> {
  const mutation = `
    mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount {
              amount
              currencyCode
            }
            subtotalAmount {
              amount
              currencyCode
            }
            totalTaxAmount {
              amount
              currencyCode
            }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                merchandise {
                  id
                  title
                  price {
                    amount
                    currencyCode
                  }
                  image {
                    url
                    altText
                  }
                  product {
                    id
                    title
                    handle
                  }
                }
                cost {
                  totalAmount {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `
  const res = await storefrontRequest<{
    cartLinesRemove: { cart: StorefrontCart | null; userErrors: StorefrontUserError[] }
  }>(mutation, { cartId, lineIds })
  return res.data?.cartLinesRemove || { cart: null, userErrors: [{ message: 'Network error removing line' }] }
}

export interface StorefrontCheckoutInput {
  cartId: string
  email: string
  shippingAddress: {
    firstName: string
    lastName: string
    address1: string
    city: string
    province?: string
    zip: string
    country: string
  }
  billingAddress?: {
    firstName: string
    lastName: string
    address1: string
    city: string
    province?: string
    zip: string
    country: string
  }
  paymentGateway?: string
}

export interface StorefrontCompletedOrder {
  id: string
  name: string
  orderNumber: number
  processedAt: string
  financialStatus: string
  fulfillmentStatus: string
  totalPrice: StorefrontMoney
  subtotalPrice: StorefrontMoney
  totalTax: StorefrontMoney
}

export async function completeStorefrontCheckout(
  input: StorefrontCheckoutInput,
): Promise<{ order: StorefrontCompletedOrder | null; userErrors: StorefrontUserError[] }> {
  const mutation = `
    mutation CartCheckoutComplete($input: CartCheckoutCompleteInput!) {
      cartCheckoutComplete(input: $input) {
        order {
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
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `
  const res = await storefrontRequest<{
    cartCheckoutComplete: { order: StorefrontCompletedOrder | null; userErrors: StorefrontUserError[] }
  }>(mutation, { input })
  return res.data?.cartCheckoutComplete || { order: null, userErrors: [{ message: 'Checkout network failure' }] }
}
export async function updateStorefrontCartDiscountCodes(
  cartId: string,
  discountCodes: string[],
): Promise<{ cart: StorefrontCart | null; userErrors: StorefrontUserError[] }> {
  const mutation = `
    mutation CartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!) {
      cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount {
              amount
              currencyCode
            }
            subtotalAmount {
              amount
              currencyCode
            }
            totalTaxAmount {
              amount
              currencyCode
            }
            totalDiscountAmount {
              amount
              currencyCode
            }
          }
          discountCodes {
            code
            applicable
            amount {
              amount
              currencyCode
            }
          }
          discountAllocations {
            code
            discountedAmount {
              amount
              currencyCode
            }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                merchandise {
                  id
                  title
                  price {
                    amount
                    currencyCode
                  }
                }
                cost {
                  totalAmount {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `
  const res = await storefrontRequest<{
    cartDiscountCodesUpdate: { cart: StorefrontCart | null; userErrors: StorefrontUserError[] }
  }>(mutation, { cartId, discountCodes })
  return (
    res.data?.cartDiscountCodesUpdate || {
      cart: null,
      userErrors: [{ message: 'Network error updating discount codes' }],
    }
  )
}

export interface ProductReviewInput {
  productId: string
  customerName: string
  customerEmail: string
  rating: number
  title: string
  body: string
}

export async function submitProductReview(input: ProductReviewInput): Promise<{
  review: any | null
  userErrors: StorefrontUserError[]
}> {
  const mutation = `
    mutation ProductReviewCreate($input: ProductReviewInput!) {
      productReviewCreate(input: $input) {
        review {
          id
          customerName
          rating
          title
          body
          isVerifiedBuyer
          adminReply
          createdAt
        }
        userErrors {
          field
          message
        }
      }
    }
  `
  const res = await storefrontRequest<{
    productReviewCreate: { review: any | null; userErrors: StorefrontUserError[] }
  }>(mutation, { input })
  return {
    review: res.data?.productReviewCreate?.review || null,
    userErrors: res.data?.productReviewCreate?.userErrors || [],
  }
}
