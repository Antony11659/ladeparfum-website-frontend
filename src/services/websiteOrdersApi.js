const ORDERS_BASE = import.meta.env.VITE_ORDERS_API_BASE_URL?.replace(/\/+$/, '')
const CHECKOUT_TIMEOUT_MS = 30000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// outcomeUnknown means the caller must retain the original key and reconcile
// the result: an order may already exist. This adapter never retries.
export class WebsiteOrderError extends Error {
  constructor(message, { kind, status = null, code = null, retryAfter = null, outcomeUnknown = false, cause } = {}) {
    super(message, { cause })
    this.name = 'WebsiteOrderError'
    this.kind = kind
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
    this.outcomeUnknown = outcomeUnknown
  }
}

function validationMessage(result) {
  const message = result?.message ?? result?.error?.message
  return typeof message === 'string' && message.trim() && message.length <= 500
    && !/[<>]/.test(message) && !Array.from(message).some((character) => character.charCodeAt(0) < 32)
    ? message.trim()
    : 'Проверьте данные заказа.'
}

export async function createWebsiteOrder({ payload, idempotencyKey, signal } = {}) {
  if (typeof idempotencyKey !== 'string' || !UUID.test(idempotencyKey)) {
    throw new WebsiteOrderError('Требуется корректный ключ идемпотентности UUID.', { kind: 'validation' })
  }
  if (!ORDERS_BASE) throw new WebsiteOrderError('Сервис заказов пока не настроен.', { kind: 'configuration' })
  let body
  try {
    body = JSON.stringify(payload)
    if (body === undefined) throw new TypeError('Missing request body')
  } catch (cause) {
    throw new WebsiteOrderError('Не удалось подготовить данные заказа.', { kind: 'validation', cause })
  }
  if (signal?.aborted) throw new WebsiteOrderError('Запрос отменён до отправки.', { kind: 'aborted', cause: signal.reason })
  const timeout = AbortSignal.timeout(CHECKOUT_TIMEOUT_MS)
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  let response
  let result
  try {
    response = await fetch(`${ORDERS_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body,
      signal: requestSignal,
    })
    result = await response.json()
  } catch (cause) {
    const kind = timeout.aborted ? 'timeout' : signal?.aborted ? 'aborted' : response ? 'invalid_response' : 'network'
    throw new WebsiteOrderError('Результат создания заказа неизвестен. Сохраните ключ запроса для проверки.', {
      kind, status: response?.status, retryAfter: response?.headers.get('Retry-After'), outcomeUnknown: true, cause,
    })
  }
  if (response.status !== 201) {
    throw new WebsiteOrderError(response.status === 400 ? validationMessage(result) : 'Сервис заказов вернул ошибку.', {
      kind: 'http',
      status: response.status,
      code: typeof result?.code === 'string' ? result.code : typeof result?.error?.code === 'string' ? result.error.code : typeof result?.error === 'string' ? result.error : null,
      retryAfter: response.headers.get('Retry-After'),
      outcomeUnknown: response.status !== 400 && response.status !== 409,
    })
  }
  const order = result?.order
  if (result?.success !== true || !Number.isSafeInteger(order?.id) || order.id <= 0
    || typeof order.orderNumber !== 'string' || !order.orderNumber.trim()
    || !['subtotal', 'deliveryPrice', 'total'].every((field) => typeof order[field] === 'number' && Number.isFinite(order[field]))) {
    throw new WebsiteOrderError('Некорректный ответ сервиса заказов. Результат создания заказа неизвестен.', {
      kind: 'invalid_response', status: response.status, outcomeUnknown: true,
    })
  }
  const token = result.paymentAccessToken
  return { order, paymentAccessToken: typeof token === 'string' && token.trim() ? token : null }
}
