export const formatRubles = (amount) => new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', maximumFractionDigits: 2, minimumFractionDigits: 0,
}).format(amount)

function validPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function resolveCartLines(cartItems, perfumes, prices, pricingMode) {
  const variants = new Map()
  for (const product of perfumes) {
    if (!Array.isArray(product.variants)) continue
    for (const variant of product.variants) {
      if (variant && Number.isSafeInteger(variant.id)) variants.set(variant.id, { product, variant })
    }
  }
  return cartItems.map((item) => {
    const resolved = variants.get(item.variantId)
    if (!resolved) return { ...item, error: 'Аромат или выбранный вариант больше не найден. Удалите его из корзины.' }
    const { product, variant } = resolved
    const priceRecord = prices.find((price) => price.volume_ml === variant.volume_ml)
    const regularPrice = priceRecord?.website_price
    const unitPrice = pricingMode === 'discount' ? priceRecord?.discount_price : regularPrice
    const lineTotal = unitPrice * item.quantity
    const regularTotal = regularPrice * item.quantity
    if (!validPrice(regularPrice) || !validPrice(unitPrice) || !Number.isFinite(lineTotal) || !Number.isFinite(regularTotal)) {
      return { ...item, product, variant, error: pricingMode === 'discount' ? 'Актуальная обычная цена или цена по промокоду недоступна для этого объёма.' : 'Актуальная цена недоступна для этого объёма.' }
    }
    return { ...item, product, variant, unitPrice, lineTotal, regularTotal }
  })
}

export function calculateCartTotals(lines) {
  if (!lines.length || lines.some((line) => line.error)) return null
  const subtotal = lines.reduce((sum, line) => sum + line.regularTotal, 0)
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  if (!Number.isFinite(subtotal) || !Number.isFinite(total)) return null
  return { subtotal, total, discount: subtotal - total }
}
