import { create } from 'zustand'
import {
  type CustomerAccountProfile,
  type CustomerRegisterInput,
  type CustomerMailingAddressInput,
  loginStorefrontCustomer,
  createStorefrontCustomer,
  logoutStorefrontCustomer,
  getStorefrontCustomerProfile,
  createCustomerAddress,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
} from '@/services/storefrontCustomerService'

const LOCAL_STORAGE_CUSTOMER_TOKEN = 'ns_customer_access_token'

interface StorefrontCustomerState {
  token: string | null
  customer: CustomerAccountProfile | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<boolean>
  register: (input: CustomerRegisterInput) => Promise<boolean>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
  addAddress: (address: CustomerMailingAddressInput) => Promise<boolean>
  removeAddress: (addressId: string) => Promise<boolean>
  setDefaultAddress: (addressId: string) => Promise<boolean>
}

export const useStorefrontCustomer = create<StorefrontCustomerState>((set, get) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_CUSTOMER_TOKEN) : null,
  customer: null,
  isAuthenticated: Boolean(
    typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_CUSTOMER_TOKEN) : null,
  ),
  isLoading: false,
  error: null,

  init: async () => {
    const token = get().token
    if (!token) return

    set({ isLoading: true })
    try {
      const profile = await getStorefrontCustomerProfile(token)
      if (profile) {
        set({ customer: profile, isAuthenticated: true, isLoading: false, error: null })
      } else {
        // Token expired or invalid
        if (typeof window !== 'undefined') {
          localStorage.removeItem(LOCAL_STORAGE_CUSTOMER_TOKEN)
        }
        set({ token: null, customer: null, isAuthenticated: false, isLoading: false })
      }
    } catch {
      set({ isLoading: false })
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const { customerAccessToken, userErrors } = await loginStorefrontCustomer(email, password)
      if (customerAccessToken) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOCAL_STORAGE_CUSTOMER_TOKEN, customerAccessToken.accessToken)
        }
        set({ token: customerAccessToken.accessToken, isAuthenticated: true, isLoading: false })
        await get().refreshProfile()
        return true
      }
      if (userErrors.length) {
        set({ error: userErrors[0].message, isLoading: false })
        return false
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
      return false
    }
    set({ isLoading: false })
    return false
  },

  register: async (input: CustomerRegisterInput) => {
    set({ isLoading: true, error: null })
    try {
      const { customer, userErrors } = await createStorefrontCustomer(input)
      if (customer) {
        // Automatically log in upon successful account creation
        return await get().login(input.email, input.password)
      }
      if (userErrors.length) {
        set({ error: userErrors[0].message, isLoading: false })
        return false
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
      return false
    }
    set({ isLoading: false })
    return false
  },

  logout: async () => {
    const token = get().token
    if (token) {
      try {
        await logoutStorefrontCustomer(token)
      } catch {
        // ignore
      }
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_CUSTOMER_TOKEN)
    }
    set({ token: null, customer: null, isAuthenticated: false, error: null })
  },

  refreshProfile: async () => {
    const token = get().token
    if (!token) return
    try {
      const profile = await getStorefrontCustomerProfile(token)
      if (profile) {
        set({ customer: profile, isAuthenticated: true })
      }
    } catch {
      // ignore
    }
  },

  addAddress: async (address: CustomerMailingAddressInput) => {
    const token = get().token
    if (!token) return false
    set({ isLoading: true, error: null })
    try {
      const { customerAddress, userErrors } = await createCustomerAddress(token, address)
      if (customerAddress) {
        await get().refreshProfile()
        set({ isLoading: false })
        return true
      }
      if (userErrors.length) {
        set({ error: userErrors[0].message, isLoading: false })
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
    set({ isLoading: false })
    return false
  },

  removeAddress: async (addressId: string) => {
    const token = get().token
    if (!token) return false
    try {
      const { deletedId } = await deleteCustomerAddress(token, addressId)
      if (deletedId) {
        await get().refreshProfile()
        return true
      }
    } catch {
      // ignore
    }
    return false
  },

  setDefaultAddress: async (addressId: string) => {
    const token = get().token
    if (!token) return false
    try {
      await setDefaultCustomerAddress(token, addressId)
      await get().refreshProfile()
      return true
    } catch {
      // ignore
    }
    return false
  },
}))
