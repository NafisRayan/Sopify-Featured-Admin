import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { delay } from '@/lib/delay'
import { syncMutation, gqlLiteral, mutatePayload, IS_REMOTE } from './api'
import type { Customer, Address, MarketingConsent } from '@/types'

/**
 * Customers service. Deleting a customer keeps orders intact; the UI renders
 * those as "Deleted customer" so referential integrity stays visible.
 */

export async function createCustomer(input: {
  firstName: string
  lastName: string
  email: string
  phone?: string
  address?: Partial<Address>
  note?: string
  tags?: string[]
  acceptsMarketing?: boolean
}): Promise<Customer> {
  await delay(350)
  if (IS_REMOTE) {
    const { entity } = await mutatePayload('customerCreate', `customerCreate(customer: { firstName: ${gqlLiteral(input.firstName)}, lastName: ${gqlLiteral(input.lastName)}, email: ${gqlLiteral(input.email)}, phone: ${gqlLiteral(input.phone ?? null)}, note: ${gqlLiteral(input.note ?? null)}, tags: ${gqlLiteral(input.tags ?? [])} }) { customer { id firstName lastName email phone defaultAddress { firstName lastName address1 address2 city province country zip phone company } addresses { firstName lastName address1 address2 city province country zip phone company } tags note emailMarketingConsent taxExempt createdAt ordersCount totalSpent lastOrderAt } userErrors { field message } }`)
    getStore().addCustomer(entity as Customer)
    return entity as Customer
  }
  const store = getStore()
  if (store.customers.some((c) => c.email.toLowerCase() === input.email.toLowerCase())) {
    throw new Error('A customer with this email already exists')
  }
  const now = new Date().toISOString()
  const address: Address | undefined = input.address?.address1
    ? {
        firstName: input.firstName,
        lastName: input.lastName,
        address1: input.address.address1,
        address2: input.address.address2,
        city: input.address.city ?? '',
        province: input.address.province ?? '',
        country: input.address.country ?? 'United States',
        zip: input.address.zip ?? '',
        phone: input.phone,
      }
    : undefined
  const customer: Customer = {
    id: uid('c'),
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    defaultAddress: address,
    addresses: address ? [address] : [],
    tags: input.tags ?? [],
    note: input.note,
    emailMarketingConsent: (input.acceptsMarketing ? 'subscribed' : 'not_subscribed') as MarketingConsent,
    taxExempt: false,
    createdAt: now,
  }
  store.addCustomer(customer)
  syncMutation(`mutation { customerCreate(customer: { firstName: ${gqlLiteral(customer.firstName)}, lastName: ${gqlLiteral(customer.lastName)}, email: ${gqlLiteral(customer.email)}, phone: ${gqlLiteral(customer.phone ?? null)}, note: ${gqlLiteral(customer.note ?? null)}, tags: ${gqlLiteral(customer.tags)} }) { userErrors { message } } }`)
  return customer
}

export async function updateCustomer(id: string, patch: Partial<Customer>): Promise<void> {
  await delay(300)
  getStore().patchCustomer(id, patch)
  const { addresses: _a, defaultAddress: _d, ...input } = patch as any
  syncMutation(`mutation { customerUpdate(id: ${gqlLiteral(id)}, customer: ${gqlLiteral(input)}) { userErrors { message } } }`)
}

export async function deleteCustomers(ids: string[]): Promise<void> {
  await delay(350)
  getStore().removeCustomers(ids)
  syncMutation(`mutation { customerDelete(ids: ${gqlLiteral(ids)}) { userErrors { message } } }`)
}

export async function addCustomerTags(ids: string[], tags: string[]): Promise<void> {
  await delay(250)
  const store = getStore()
  for (const id of ids) {
    const c = store.customers.find((x) => x.id === id)
    if (c) store.patchCustomer(id, { tags: [...new Set([...c.tags, ...tags])] })
  }
}

export async function removeCustomerTags(ids: string[], tags: string[]): Promise<void> {
  await delay(250)
  const store = getStore()
  for (const id of ids) {
    const c = store.customers.find((x) => x.id === id)
    if (c) store.patchCustomer(id, { tags: c.tags.filter((t) => !tags.includes(t)) })
  }
}

export async function setConsent(id: string, consent: MarketingConsent): Promise<void> {
  await delay(200)
  getStore().patchCustomer(id, { emailMarketingConsent: consent })
}

export async function addAddress(id: string, address: Address): Promise<void> {
  await delay(250)
  const c = getStore().customers.find((x) => x.id === id)
  if (!c) throw new Error('Customer not found')
  getStore().patchCustomer(id, {
    addresses: [...c.addresses, address],
    defaultAddress: c.defaultAddress ?? address,
  })
}

export async function setDefaultAddress(id: string, index: number): Promise<void> {
  await delay(200)
  const c = getStore().customers.find((x) => x.id === id)
  if (!c) throw new Error('Customer not found')
  const address = c.addresses[index]
  if (address) getStore().patchCustomer(id, { defaultAddress: address })
}
