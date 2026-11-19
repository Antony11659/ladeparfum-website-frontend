import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

// Substitute only Vite's environment expression so Node can load the actual
// adapter without starting a server. All fetch calls are mocked below.
const source = await readFile(new URL('../src/services/websiteOrdersApi.js', import.meta.url), 'utf8')
async function load(base = 'http://localhost:3000/website/') {
  const code = source.replace('import.meta.env.VITE_ORDERS_API_BASE_URL', JSON.stringify(base))
  return import(`data:text/javascript,${encodeURIComponent(code)}`)
}
const { createWebsiteOrder, WebsiteOrderError } = await load()
const key = 'Ab123456-1234-4123-8123-123456789abc'
const payload = {
  customer: { name: 'Тест', phone: '+79991234567', city: 'Москва', address: 'Адрес' },
  delivery: { provider: 'ozon', deliveryPointId: 'pvz-1' },
  items: [{ variantId: 1, quantity: 2 }], promoCode: null,
}
const order = { id: 1, orderNumber: 'WEB-1', pricingMode: 'website', subtotal: 200, deliveryPrice: 50, total: 250, status: 'new' }
const input = { payload, idempotencyKey: key }
const response = (status, body, headers) => new Response(JSON.stringify(body), { status, headers })

test('website order adapter: mocked requests only', async (t) => {
  let calls = []
  let reply
  t.mock.method(globalThis, 'fetch', async (...args) => {
    calls.push(args)
    return reply(...args)
  })
  // Any storage access fails the test, including reads.
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Unexpected localStorage access') } })
  t.after(() => {
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
    else delete globalThis.localStorage
  })
  async function failure(options, expected) {
    calls = []
    await assert.rejects(createWebsiteOrder(options), (error) => {
      assert.ok(error instanceof WebsiteOrderError)
      for (const [field, value] of Object.entries(expected)) assert.equal(error[field], value, field)
      return true
    })
    assert.equal(calls.length, expected.kind === 'validation' || expected.kind === 'configuration' ? 0 : 1)
  }

  await t.test('URL, headers, exact key, JSON payload, signal and backend values', async () => {
    const controller = new AbortController()
    reply = async () => response(201, { success: true, order })
    assert.deepEqual(await createWebsiteOrder({ ...input, signal: controller.signal }), { order, paymentAccessToken: null })
    assert.equal(calls.length, 1)
    const [url, options] = calls[0]
    assert.equal(url, 'http://localhost:3000/website/orders')
    assert.equal(options.method, 'POST')
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json', 'Idempotency-Key': key })
    assert.equal(options.body, JSON.stringify(payload))
    assert.equal(options.signal.aborted, false)
    controller.abort()
    assert.equal(options.signal.aborted, true)
  })
  await t.test('missing/invalid UUID rejected before fetch', async () => {
    for (const idempotencyKey of [undefined, '', 'not-a-uuid', ` ${key}`, key.replace('-8123-', '-7123-')]) {
      await failure({ payload, idempotencyKey }, { kind: 'validation', outcomeUnknown: false })
    }
  })
  await t.test('malformed 201 remains ambiguous', async () => {
    for (const body of [null, { success: false, order }, ...[
      { id: 0 }, { id: Number.MAX_SAFE_INTEGER + 1 }, { orderNumber: ' ' },
      { subtotal: '200' }, { deliveryPrice: null }, { total: null },
    ].map((change) => ({ success: true, order: { ...order, ...change } }))]) {
      reply = async () => response(201, body)
      await failure(input, { kind: 'invalid_response', status: 201, outcomeUnknown: true })
    }
  })
  await t.test('400 safe validation message and code', async () => {
    reply = async () => response(400, { code: 'VALIDATION_ERROR', message: 'Проверьте телефон.' })
    await failure(input, { kind: 'http', status: 400, code: 'VALIDATION_ERROR', message: 'Проверьте телефон.', outcomeUnknown: false })
    reply = async () => response(400, { message: '<script>unsafe</script>' })
    await failure(input, { kind: 'http', message: 'Проверьте данные заказа.' })
  })
  await t.test('409 conflict and in-progress preserve codes and Retry-After without retry', async () => {
    for (const code of ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_IN_PROGRESS']) {
      reply = async () => response(409, { code }, { 'Retry-After': '5' })
      await failure(input, { kind: 'http', status: 409, code, retryAfter: '5', outcomeUnknown: false })
    }
  })
  await t.test('503 persistence failure and 500 are potentially unknown', async () => {
    reply = async () => response(503, { error: { code: 'PERSISTENCE_ERROR' } })
    await failure(input, { kind: 'http', status: 503, code: 'PERSISTENCE_ERROR', outcomeUnknown: true })
    reply = async () => response(500, {})
    await failure(input, { kind: 'http', status: 500, outcomeUnknown: true })
  })
  await t.test('network failure and invalid JSON never retry', async () => {
    reply = async () => { throw new TypeError('Network failed') }
    await failure(input, { kind: 'network', outcomeUnknown: true })
    reply = async () => new Response('invalid JSON', { status: 201 })
    await failure(input, { kind: 'invalid_response', status: 201, outcomeUnknown: true })
  })
  await t.test('30 second timeout remains unknown without retry', async () => {
    const timeout = new AbortController()
    t.mock.method(AbortSignal, 'timeout', (ms) => {
      assert.equal(ms, 30000)
      return timeout.signal
    })
    reply = async (_url, options) => {
      timeout.abort(new DOMException('Timed out', 'TimeoutError'))
      throw options.signal.reason
    }
    await failure(input, { kind: 'timeout', outcomeUnknown: true })
    t.mock.restoreAll()
  })
})
