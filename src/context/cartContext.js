import { createContext, useContext } from 'react'

export const CART_STORAGE_KEY = 'ladeparfum_cart_v1'
export const CartContext = createContext(null)

export function readCartItems() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]')
    if (!Array.isArray(stored)) return []
    const items = new Map()
    for (const item of stored) {
      if (!item || !Number.isSafeInteger(item.variantId) || item.variantId <= 0 ||
          !Number.isSafeInteger(item.quantity) || item.quantity <= 0) continue
      const quantity = (items.get(item.variantId) || 0) + item.quantity
      if (Number.isSafeInteger(quantity)) items.set(item.variantId, quantity)
    }
    return Array.from(items, ([variantId, quantity]) => ({ variantId, quantity }))
  } catch {
    return []
  }
}

export function useCart() {
  const cart = useContext(CartContext)
  if (!cart) throw new Error('CartProvider is required')
  return cart
}
