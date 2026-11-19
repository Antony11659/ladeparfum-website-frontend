const ORDERS_BASE = import.meta.env.VITE_ORDERS_API_BASE_URL?.replace(/\/+$/, '')
export const WEBSITE_OZON_PAY_ENABLED = import.meta.env.VITE_WEBSITE_OZON_PAY_ENABLED === 'true'

const unknownOutcome = 'Результат подготовки оплаты неизвестен.'
const httpMessages = {
  401: 'Разрешение на оплату отсутствует, недействительно или истекло.',
  403: 'Разрешение на оплату не подходит для этого заказа.',
  409: 'Оплата уже зарезервирована или недоступна.',
  503: 'Сервис оплаты временно недоступен. Результат подготовки оплаты неизвестен.',
}

class WebsitePaymentError extends Error {
  constructor(message, kind, status = null) {
    super(message)
    this.name = 'WebsitePaymentError'
    this.kind = kind
    this.status = status
  }
}

const nonempty = (value) => typeof value === 'string' && Boolean(value.trim())

export async function createWebsitePayment({ orderId, paymentAccessToken } = {}) {
  if (!WEBSITE_OZON_PAY_ENABLED || !ORDERS_BASE) {
    throw new WebsitePaymentError('Сервис оплаты недоступен.', 'configuration')
  }
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !nonempty(paymentAccessToken)) {
    throw new WebsitePaymentError('Требуется корректное разрешение на оплату заказа.', 'validation')
  }

  let response
  let result
  try {
    response = await fetch(`${ORDERS_BASE}/orders/${orderId}/payment`, {
      method: 'POST',
      headers: { 'X-Website-Payment-Token': paymentAccessToken },
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    })
    if (response.status === 200) result = await response.json()
  } catch {
    throw new WebsitePaymentError(unknownOutcome, response ? 'invalid_response' : 'network', response?.status)
  }

  if (response.status !== 200) {
    throw new WebsitePaymentError(httpMessages[response.status] ?? unknownOutcome, 'http', response.status)
  }

  const payment = result?.payment
  if (result?.success !== true || payment?.orderId !== orderId || !nonempty(payment.orderNumber)
    || !Number.isFinite(payment.amount) || payment.amount <= 0 || !nonempty(payment.ozonPayOrderId)
    || !nonempty(payment.payLink) || typeof payment.isTestMode !== 'boolean') {
    throw new WebsitePaymentError(unknownOutcome, 'invalid_response', response.status)
  }
  return payment
}

const paymentStatuses = new Set(['not_started', 'pending', 'processing', 'recovery_required', 'unavailable', 'paid'])
const statusError = 'Не удалось проверить оплату'

export async function getWebsitePaymentStatus({ orderId, paymentAccessToken } = {}) {
  if (!WEBSITE_OZON_PAY_ENABLED || !ORDERS_BASE
    || !Number.isSafeInteger(orderId) || orderId <= 0 || !nonempty(paymentAccessToken)) {
    throw new WebsitePaymentError(statusError, 'validation')
  }

  let response
  let result
  try {
    response = await fetch(`${ORDERS_BASE}/orders/${orderId}/payment-status`, {
      method: 'GET',
      headers: { 'X-Website-Payment-Token': paymentAccessToken },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    })
    if (response.status === 200) result = await response.json()
  } catch {
    throw new WebsitePaymentError(statusError, response ? 'invalid_response' : 'network', response?.status)
  }

  if (response.status !== 200) throw new WebsitePaymentError(statusError, 'http', response.status)
  if (result?.success !== true || result.orderId !== orderId || !paymentStatuses.has(result.paymentStatus)) {
    throw new WebsitePaymentError(statusError, 'invalid_response', response.status)
  }
  return result.paymentStatus
}
