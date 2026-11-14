import { useEffect, useState } from 'react'
import { CART_STORAGE_KEY, CartContext, readCartItems } from './cartContext.js'

function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState(readCartItems)
  const [storageError, setStorageError] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems))
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Report the result of synchronizing external browser storage.
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [cartItems])

  function addItem(variantId) {
    if (!Number.isSafeInteger(variantId) || variantId <= 0) return
    setCartItems((items) => {
      const existing = items.find((item) => item.variantId === variantId)
      if (!existing) return [...items, { variantId, quantity: 1 }]
      if (!Number.isSafeInteger(existing.quantity + 1)) return items
      return items.map((item) => item.variantId === variantId ? { ...item, quantity: item.quantity + 1 } : item)
    })
  }

  function removeItem(variantId) {
    setCartItems((items) => items.filter((item) => item.variantId !== variantId))
  }

  function updateQuantity(variantId, quantity) {
    if (!Number.isSafeInteger(quantity) || quantity < 1) return
    setCartItems((items) => items.map((item) => item.variantId === variantId ? { ...item, quantity } : item))
  }

  function clearCart() {
    setCartItems([])
  }

  const cartCount = cartItems.reduce((count, item) => count + item.quantity, 0)

  return (
    <CartContext.Provider value={{ cartItems, addItem, removeItem, updateQuantity, clearCart, cartCount, storageError }}>
      {children}
    </CartContext.Provider>
  )
}

export default CartProvider
