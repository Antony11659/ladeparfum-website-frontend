// Privacy: this record contains customer name, phone and address in plaintext.
// localStorage is readable by same-origin scripts, persists on shared devices,
// and may be cleared by the browser/user. Never log records or add secrets,
// tokens or payment data. Clear only after a confirmed HTTP 201.
const STORAGE_KEY = 'ladeparfum_checkout_attempt_v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const own = (value, key) => Object.hasOwn(value, key)
const text = (value) => typeof value === 'string' && value.length > 0
const optionalText = (value) => value === null || typeof value === 'string'
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0

export class CheckoutAttemptError extends Error {
  constructor(code) {
    super(`Checkout attempt: ${code}`)
    this.name = 'CheckoutAttemptError'
    this.code = code
  }
}

function shape(value, required, optional = []) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && required.every((key) => own(value, key))
    && Reflect.ownKeys(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return [...required, ...optional].includes(key) && descriptor.enumerable && own(descriptor, 'value')
    })
}

function validPayload(payload) {
  if (!shape(payload, ['customer', 'delivery', 'items'], ['promoCode'])) return false
  const { customer, delivery, items } = payload
  return shape(customer, ['name', 'phone', 'city', 'address'], ['messenger', 'comment'])
    && ['name', 'phone', 'city', 'address'].every((key) => text(customer[key]))
    && ['messenger', 'comment'].every((key) => !own(customer, key) || optionalText(customer[key]))
    && shape(delivery, ['provider', 'deliveryPointId'])
    && delivery.provider === 'ozon' && text(delivery.deliveryPointId)
    && Array.isArray(items) && items.length > 0
    && Object.keys(items).length === items.length
    && Array.from(items).every((item) => shape(item, ['variantId', 'quantity'])
      && positiveInteger(item.variantId) && positiveInteger(item.quantity))
    && (!own(payload, 'promoCode') || optionalText(payload.promoCode))
}

function validAttempt(attempt) {
  return shape(attempt, ['version', 'idempotencyKey', 'payload', 'createdAt'])
    && attempt.version === 1 && typeof attempt.idempotencyKey === 'string' && UUID.test(attempt.idempotencyKey)
    && validPayload(attempt.payload) && typeof attempt.createdAt === 'string'
    && Number.isFinite(Date.parse(attempt.createdAt))
    && new Date(attempt.createdAt).toISOString() === attempt.createdAt
}

function storageOperation(operation) {
  try { return operation(globalThis.localStorage) } catch {
    // Do not expose storage errors that might embed customer data.
    throw new CheckoutAttemptError('storage_unavailable')
  }
}

const copy = (value) => JSON.parse(JSON.stringify(value))

// null explicitly means no pending attempt; errors never imply it is safe to
// replace a record. No cached state: every invocation recovers from storage.
export function getPendingCheckoutAttempt() {
  const raw = storageOperation((storage) => storage.getItem(STORAGE_KEY))
  if (raw === null) return null
  let attempt
  try { attempt = JSON.parse(raw) } catch { throw new CheckoutAttemptError('corrupted_attempt') }
  if (!validAttempt(attempt)) throw new CheckoutAttemptError('corrupted_attempt')
  return attempt
}

// Intentionally stricter than backend normalization: preserve whitespace,
// casing, item order, optional-field presence and JSON property order.
export function compareCheckoutAttemptPayload(attempt, payload) {
  if (!validAttempt(attempt)) throw new CheckoutAttemptError('corrupted_attempt')
  if (!validPayload(payload)) throw new CheckoutAttemptError('invalid_payload')
  return JSON.stringify(attempt.payload) === JSON.stringify(payload)
}

export function createOrReuseCheckoutAttempt(payload) {
  const existing = getPendingCheckoutAttempt()
  if (!validPayload(payload)) throw new CheckoutAttemptError('invalid_payload')
  if (existing) {
    if (!compareCheckoutAttemptPayload(existing, payload)) throw new CheckoutAttemptError('changed_checkout_data')
    return { status: 'existing', attempt: copy(existing) }
  }
  let idempotencyKey
  try { idempotencyKey = globalThis.crypto.randomUUID() } catch {
    throw new CheckoutAttemptError('uuid_unavailable')
  }
  if (!UUID.test(idempotencyKey)) throw new CheckoutAttemptError('uuid_unavailable')
  const attempt = { version: 1, idempotencyKey, payload: copy(payload), createdAt: new Date().toISOString() }
  const serialized = JSON.stringify(attempt)
  storageOperation((storage) => storage.setItem(STORAGE_KEY, serialized))
  if (storageOperation((storage) => storage.getItem(STORAGE_KEY)) !== serialized) {
    throw new CheckoutAttemptError('storage_unavailable')
  }
  return { status: 'created', attempt: copy(attempt) }
}

// Caller must have confirmed HTTP 201. No error path auto-clears an attempt.
// localStorage has no cross-tab compare-and-swap; callers must serialize checkout
// in multiple tabs. This synchronous helper cannot provide a cross-tab lock.
export function clearCheckoutAttempt(idempotencyKey) {
  const attempt = getPendingCheckoutAttempt()
  if (!attempt || attempt.idempotencyKey !== idempotencyKey) return false
  storageOperation((storage) => storage.removeItem(STORAGE_KEY))
  if (storageOperation((storage) => storage.getItem(STORAGE_KEY)) !== null) {
    throw new CheckoutAttemptError('storage_unavailable')
  }
  return true
}
