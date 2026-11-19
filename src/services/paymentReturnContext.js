// A tab-scoped capability readable by same-origin JavaScript.
const KEY = 'ladeparfum_payment_return_v1'
const MAX_AGE = 60 * 60 * 1000

function validContext(value) {
  const now = Date.now()
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 3
    && Number.isSafeInteger(value.orderId) && value.orderId > 0
    && typeof value.paymentAccessToken === 'string' && Boolean(value.paymentAccessToken.trim())
    && Number.isSafeInteger(value.createdAt) && value.createdAt > 0
    && value.createdAt <= now && now - value.createdAt < MAX_AGE
}

export function savePaymentReturnContext({ orderId, paymentAccessToken }) {
  const context = { orderId, paymentAccessToken, createdAt: Date.now() }
  if (!validContext(context)) return false
  try {
    const serialized = JSON.stringify(context)
    sessionStorage.setItem(KEY, serialized)
    return sessionStorage.getItem(KEY) === serialized
  } catch { return false }
}

export function readPaymentReturnContext() {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw === null) return null
    let context
    try { context = JSON.parse(raw) } catch { /* Remove malformed context below. */ }
    if (validContext(context)) return context
    sessionStorage.removeItem(KEY)
  } catch { /* Storage may be unavailable. */ }
  return null
}

export function clearPaymentReturnContext(context) {
  try {
    const current = readPaymentReturnContext()
    if (current?.orderId === context.orderId
      && current.paymentAccessToken === context.paymentAccessToken
      && current.createdAt === context.createdAt) sessionStorage.removeItem(KEY)
  } catch { /* A storage failure cannot invalidate the verified result. */ }
}
