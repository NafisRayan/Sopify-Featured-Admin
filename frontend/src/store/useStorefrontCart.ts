import { create } from 'zustand'
import {
  type StorefrontCart,
  createStorefrontCart,
  getStorefrontCart,
  addStorefrontCartLines,
  updateStorefrontCartLines,
  removeStorefrontCartLines,
  updateStorefrontCartDiscountCodes,
} from '../services/storefrontClient'

const LOCAL_STORAGE_CART_KEY = 'ns_storefront_cart_id'

interface StorefrontCartState {
  cart: StorefrontCart | null
  cartId: string | null
  isOpen: boolean
  isLoading: boolean
  error: string | null

  // Actions
  openCart: () => void
  closeCart: () => void
  toggleCart: () => void
  initCart: () => Promise<void>
  addItem: (merchandiseId: string, quantity?: number) => Promise<boolean>
  updateQuantity: (lineId: string, quantity: number) => Promise<void>
  removeItem: (lineId: string) => Promise<void>
  applyDiscount: (code: string) => Promise<boolean>
  removeDiscount: (code: string) => Promise<void>
  clearCart: () => void
}

export const useStorefrontCart = create<StorefrontCartState>((set, get) => ({
  cart: null,
  cartId: typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_CART_KEY) : null,
  isOpen: false,
  isLoading: false,
  error: null,

  openCart: () => set({ isOpen: true }),
  closeCart: () => set({ isOpen: false, error: null }),
  toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

  initCart: async () => {
    const existingId = get().cartId
    if (existingId) {
      try {
        set({ isLoading: true })
        const existingCart = await getStorefrontCart(existingId)
        if (existingCart) {
          set({ cart: existingCart, isLoading: false })
          return
        }
      } catch {
        // Stale or invalid cart id; clear and create fresh below
      }
    }

    try {
      set({ isLoading: true })
      const { cart, userErrors } = await createStorefrontCart()
      if (cart) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOCAL_STORAGE_CART_KEY, cart.id)
        }
        set({ cart, cartId: cart.id, isLoading: false, error: null })
      } else if (userErrors.length) {
        set({ error: userErrors[0].message, isLoading: false })
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  addItem: async (merchandiseId: string, quantity = 1) => {
    let currentId = get().cartId
    set({ isLoading: true, error: null })

    // Ensure we have a valid cart session
    if (!currentId) {
      try {
        const { cart } = await createStorefrontCart([{ merchandiseId, quantity }])
        if (cart) {
          if (typeof window !== 'undefined') {
            localStorage.setItem(LOCAL_STORAGE_CART_KEY, cart.id)
          }
          set({ cart, cartId: cart.id, isOpen: true, isLoading: false, error: null })
          return true
        }
      } catch (err) {
        set({ error: (err as Error).message, isLoading: false })
        return false
      }
    }

    try {
      const { cart, userErrors } = await addStorefrontCartLines(currentId!, [{ merchandiseId, quantity }])
      if (cart) {
        set({ cart, isOpen: true, isLoading: false, error: null })
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

  updateQuantity: async (lineId: string, quantity: number) => {
    const currentId = get().cartId
    if (!currentId) return

    set({ isLoading: true, error: null })
    try {
      const { cart, userErrors } = await updateStorefrontCartLines(currentId, [{ id: lineId, quantity }])
      if (cart) {
        set({ cart, isLoading: false, error: null })
      } else if (userErrors.length) {
        set({ error: userErrors[0].message, isLoading: false })
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  removeItem: async (lineId: string) => {
    const currentId = get().cartId
    if (!currentId) return

    set({ isLoading: true, error: null })
    try {
      const { cart, userErrors } = await removeStorefrontCartLines(currentId, [lineId])
      if (cart) {
        set({ cart, isLoading: false, error: null })
      } else if (userErrors.length) {
        set({ error: userErrors[0].message, isLoading: false })
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },
  applyDiscount: async (code: string) => {
    const currentId = get().cartId
    if (!currentId) return false
    set({ isLoading: true, error: null })
    try {
      const currentCodes = get().cart?.discountCodes?.map((d) => d.code) || []
      const nextCodes = Array.from(new Set([...currentCodes, code.trim().toUpperCase()]))
      const { cart, userErrors } = await updateStorefrontCartDiscountCodes(currentId, nextCodes)
      if (cart) {
        set({ cart, isLoading: false, error: null })
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

  removeDiscount: async (codeToRemove: string) => {
    const currentId = get().cartId
    if (!currentId) return
    set({ isLoading: true, error: null })
    try {
      const currentCodes = get().cart?.discountCodes?.map((d) => d.code) || []
      const nextCodes = currentCodes.filter((c) => c !== codeToRemove.trim().toUpperCase())
      const { cart } = await updateStorefrontCartDiscountCodes(currentId, nextCodes)
      if (cart) {
        set({ cart, isLoading: false, error: null })
      }
    } catch {
      set({ isLoading: false })
    }
  },

  clearCart: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_CART_KEY)
    }
    set({ cart: null, cartId: null, isOpen: false, error: null })
  },
}))
