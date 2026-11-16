// Set only after verifying the public delivery prefix against deployed API docs.
const DELIVERY_BASE = import.meta.env.VITE_DELIVERY_API_BASE_URL?.replace(/\/$/, '')
export const deliveryConfigured = Boolean(DELIVERY_BASE)

export function normalizeRussianPhone(value) {
  const digits = value.replace(/\D/g, '')
  if (/^[78]\d{10}$/.test(digits)) return `+7${digits.slice(1)}`
  if (/^9\d{9}$/.test(digits)) return `+7${digits}`
  return null
}

export async function deliveryRequest(endpoint, body, signal) {
  if (!DELIVERY_BASE) throw new Error('Сервис доставки пока не настроен. Попробуйте позже.')
  const timeout = AbortSignal.timeout(12000)
  let response
  try {
    response = await fetch(`${DELIVERY_BASE}/${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(timeout.aborted ? 'Время ожидания истекло. Повторите попытку.' : 'Не удалось связаться со службой доставки. Повторите попытку.', { cause: error })
  }
  if (!response.ok) throw new Error(`Сервис доставки недоступен (${response.status}). Повторите попытку.`)
  const result = await response.json()
  if (result?.success !== true) throw new Error('Сервис доставки не смог выполнить запрос. Повторите попытку.')
  return result
}
