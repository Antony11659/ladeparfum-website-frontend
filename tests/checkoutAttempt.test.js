import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as helper from '../src/services/checkoutAttempt.js'

const STORAGE_KEY = 'ladeparfum_checkout_attempt_v1'
const key = '12345678-1234-4123-8123-123456789abc'
const payload = () => ({
  customer: { name: 'Test', phone: '+79991234567', city: 'City', address: 'Address', comment: null },
  delivery: { provider: 'ozon', deliveryPointId: '123' },
  items: [{ variantId: 1, quantity: 2 }, { variantId: 2, quantity: 1 }], promoCode: null,
})
const throwsCode = (fn, code) => assert.throws(fn, (error) => error instanceof helper.CheckoutAttemptError && error.code === code)

function setup(t) {
  const records = new Map()
  let uuidCalls = 0
  let writes = 0
  const storage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => { writes++; records.set(key, value) },
    removeItem: (key) => { records.delete(key) },
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  })
  t.mock.method(globalThis.crypto, 'randomUUID', () => { uuidCalls++; return key })
  t.mock.method(globalThis, 'fetch', () => { assert.fail('Network calls are forbidden') })
  return { records, storage, uuidCalls: () => uuidCalls, writes: () => writes }
}

test('new attempt persists exact payload before returning; matching data reuses key', (t) => {
  const state = setup(t)
  assert.equal(helper.getPendingCheckoutAttempt(), null)
  const original = payload()
  const result = helper.createOrReuseCheckoutAttempt(original)
  assert.equal(result.status, 'created')
  assert.equal(result.attempt.idempotencyKey, key)
  assert.equal(result.attempt.version, 1)
  assert.equal(new Date(result.attempt.createdAt).toISOString(), result.attempt.createdAt)
  assert.equal(JSON.stringify(result.attempt.payload), JSON.stringify(original))
  assert.deepEqual(JSON.parse(state.records.get(STORAGE_KEY)), result.attempt)
  assert.deepEqual(helper.createOrReuseCheckoutAttempt(payload()), { status: 'existing', attempt: result.attempt })
  assert.equal(state.uuidCalls(), 1)
  assert.equal(state.writes(), 1)
})

test('fresh module recovers key and identical request after reload without generating UUID', async (t) => {
  const state = setup(t)
  const first = helper.createOrReuseCheckoutAttempt(payload()).attempt
  const stored = state.records.get(STORAGE_KEY)
  const reloaded = await import('../src/services/checkoutAttempt.js?reload-test')
  assert.deepEqual(reloaded.getPendingCheckoutAttempt(), first)
  const retry = reloaded.createOrReuseCheckoutAttempt(payload()).attempt
  assert.equal(retry.idempotencyKey, first.idempotencyKey)
  assert.equal(JSON.stringify(retry.payload), JSON.stringify(first.payload))
  assert.equal(state.records.get(STORAGE_KEY), stored)
  assert.equal(state.uuidCalls(), 1)
})

test('cart, phone, PVZ, promo, address and other changes cannot replace pending data', (t) => {
  const state = setup(t)
  const { attempt } = helper.createOrReuseCheckoutAttempt(payload())
  const stored = state.records.get(STORAGE_KEY)
  const changes = [
    (p) => { p.items[0].quantity++ },
    (p) => { p.items[0].variantId++ },
    (p) => { p.customer.phone = '+79991234568' },
    (p) => { p.delivery.deliveryPointId = '456' },
    (p) => { p.promoCode = 'PROMO' },
    (p) => { p.customer.address += ' ' },
    (p) => { p.customer.name += ' ' },
    (p) => { p.customer.city += ' ' },
    (p) => { p.items.reverse() },
    (p) => { delete p.promoCode },
    (p) => { p.customer.comment = '' },
    (p) => { p.customer = { ...p.customer, messenger: null } },
  ]
  for (const change of changes) {
    const changed = payload()
    change(changed)
    assert.equal(helper.compareCheckoutAttemptPayload(attempt, changed), false)
    throwsCode(() => helper.createOrReuseCheckoutAttempt(changed), 'changed_checkout_data')
    assert.equal(state.records.get(STORAGE_KEY), stored)
  }
  assert.equal(state.uuidCalls(), 1)
  assert.equal(state.writes(), 1)
})

test('input and all returned objects are defensive copies', (t) => {
  setup(t)
  const input = payload()
  const first = helper.createOrReuseCheckoutAttempt(input).attempt
  input.customer.name = 'Changed'
  first.payload.items[0].quantity = 100
  first.idempotencyKey = 'Changed'
  const read = helper.getPendingCheckoutAttempt()
  read.payload.customer.address = 'Changed'
  const reused = helper.createOrReuseCheckoutAttempt(payload()).attempt
  reused.payload.customer.phone = 'Changed'
  assert.deepEqual(helper.getPendingCheckoutAttempt().payload, payload())
  assert.equal(helper.getPendingCheckoutAttempt().idempotencyKey, key)
})

test('only the matching key clears the record; unrelated storage is preserved', (t) => {
  const state = setup(t)
  state.records.set('cart', 'untouched')
  assert.equal(helper.clearCheckoutAttempt(key), false)
  helper.createOrReuseCheckoutAttempt(payload())
  assert.equal(helper.clearCheckoutAttempt('wrong'), false)
  assert.notEqual(helper.getPendingCheckoutAttempt(), null)
  assert.equal(helper.clearCheckoutAttempt(key), true)
  assert.equal(helper.getPendingCheckoutAttempt(), null)
  assert.equal(state.records.get('cart'), 'untouched')
})

test('corrupted records fail closed without deletion or UUID generation', (t) => {
  const state = setup(t)
  const valid = { version: 1, idempotencyKey: key, payload: payload(), createdAt: '2026-11-17T10:00:00.000Z' }
  for (const raw of [
    '', '{', 'null', '[]', '{}',
    ...[
      { version: 2 }, { idempotencyKey: 'invalid' }, { createdAt: 'invalid' },
      { payload: {} }, { extra: 'secret' },
      { payload: { ...payload(), customer: { ...payload().customer, token: 'forbidden' } } },
      { payload: { ...payload(), items: [{ variantId: 0, quantity: 1 }] } },
    ].map((change) => JSON.stringify({ ...valid, ...change })),
  ]) {
    state.records.set(STORAGE_KEY, raw)
    throwsCode(() => helper.getPendingCheckoutAttempt(), 'corrupted_attempt')
    throwsCode(() => helper.createOrReuseCheckoutAttempt(payload()), 'corrupted_attempt')
    throwsCode(() => helper.clearCheckoutAttempt(key), 'corrupted_attempt')
    assert.equal(state.records.get(STORAGE_KEY), raw)
  }
  assert.equal(state.uuidCalls(), 0)
  assert.equal(state.writes(), 0)
})

test('invalid payloads never persist or generate a UUID', (t) => {
  const state = setup(t)
  for (const invalid of [null, {},
    { ...payload(), token: 'forbidden' },
    { ...payload(), promoCode: undefined },
    { ...payload(), delivery: { provider: 'other', deliveryPointId: '1' } },
    { ...payload(), items: [] },
    { ...payload(), items: [{ variantId: 1, quantity: 1.5 }] },
    { ...payload(), items: [{ variantId: Number.MAX_SAFE_INTEGER + 1, quantity: 1 }] },
    { ...payload(), items: Array(1) },
  ]) throwsCode(() => helper.createOrReuseCheckoutAttempt(invalid), 'invalid_payload')
  assert.equal(state.uuidCalls(), 0)
  assert.equal(state.writes(), 0)
})

test('storage read, write, verification and removal failures fail safely', (t) => {
  const state = setup(t)
  const fail = () => { throw new Error('Storage denied') }
  const get = state.storage.getItem
  state.storage.getItem = fail
  throwsCode(() => helper.createOrReuseCheckoutAttempt(payload()), 'storage_unavailable')
  assert.equal(state.uuidCalls(), 0)
  state.storage.getItem = get
  state.storage.setItem = fail
  throwsCode(() => helper.createOrReuseCheckoutAttempt(payload()), 'storage_unavailable')
  assert.equal(helper.getPendingCheckoutAttempt(), null)
  state.storage.setItem = () => {}
  throwsCode(() => helper.createOrReuseCheckoutAttempt(payload()), 'storage_unavailable')
  state.storage.setItem = (key, value) => state.records.set(key, value)
  helper.createOrReuseCheckoutAttempt(payload())
  state.storage.removeItem = fail
  throwsCode(() => helper.clearCheckoutAttempt(key), 'storage_unavailable')
  assert.equal(helper.getPendingCheckoutAttempt().idempotencyKey, key)
  state.storage.removeItem = () => {}
  throwsCode(() => helper.clearCheckoutAttempt(key), 'storage_unavailable')
})

test('unavailable storage property and UUID generation fail explicitly', (t) => {
  setup(t)
  t.mock.method(globalThis.crypto, 'randomUUID', () => { throw new Error('Unavailable') })
  throwsCode(() => helper.createOrReuseCheckoutAttempt(payload()), 'uuid_unavailable')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Denied') } })
  throwsCode(() => helper.getPendingCheckoutAttempt(), 'storage_unavailable')
})
