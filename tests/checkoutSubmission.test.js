import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'

// Optional browser dependency: npm run build, then run with Playwright available
// through the normal Node resolution path (including NODE_PATH).
let chromium
try { ({ chromium } = createRequire(import.meta.url)('playwright')) } catch { /* Node-only environments skip browser tests. */ }
const dist = new URL('../dist/', import.meta.url)
const storageKey = 'ladeparfum_checkout_attempt_v1'
const cartKey = 'ladeparfum_cart_v1'
const key = '12345678-1234-4123-8123-123456789abc'
const payload = {
  customer: { name: 'Fixture', phone: '+79991234567', city: 'Fixture city', address: 'Fixture address', comment: 'Comment' },
  delivery: { provider: 'ozon', deliveryPointId: '123' },
  items: [{ variantId: 1, quantity: 2 }], promoCode: null,
}
const savedAttempt = () => ({ version: 1, idempotencyKey: key, payload: structuredClone(payload), createdAt: '2026-11-17T10:00:00.000Z' })
const success = { success: true, order: { id: 12, orderNumber: 'WEB-FIXTURE', pricingMode: 'website', subtotal: 1900, deliveryPrice: 70, total: 1970, status: 'new' } }

test('checkout submission (all browser requests intercepted)', { skip: !chromium }, async (t) => {
  await access(new URL('index.html', dist))
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  t.after(() => browser.close())

  async function fixture(options = {}) {
    const context = await browser.newContext()
    t.after(() => context.close())
    const page = await context.newPage()
    page.setDefaultTimeout(5000)
    if (options.timeout) await page.addInitScript(() => {
      const timeout = AbortSignal.timeout.bind(AbortSignal)
      AbortSignal.timeout = (ms) => timeout(ms === 30000 ? 100 : ms)
    })
    const orders = []
    const unexpected = []
    const errors = []
    let orderReply = (route) => route.fulfill({ status: 201, json: success })
    let promoReply = (route) => route.fulfill({ json: { success: true, pricingMode: 'discount' } })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.hostname === 'checkout.fixture.test') {
        const file = request.isNavigationRequest() ? 'index.html' : url.pathname.slice(1)
        try {
          return await route.fulfill({ body: await readFile(new URL(file, dist)), contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' })
        } catch { return route.fulfill({ status: 404, body: '' }) }
      }
      if (url.pathname === '/perfumes/') return route.fulfill({ json: [{ id: 1, name: 'Fixture', gender: 'U', brand: { name: 'Fixture' }, images: [], variants: [{ id: 1, volume_ml: 10 }] }] })
      if (url.pathname === '/prices/') return route.fulfill({ json: [{ volume_ml: 10, website_price: 1000, discount_price: 800 }] })
      if (url.pathname === '/promo/activate') return promoReply(route)
      if (url.pathname.endsWith('/check-client')) return route.fulfill({ json: { success: true, canBeDelivered: true } })
      if (url.pathname.endsWith('/address-suggestions')) return route.fulfill({ json: { success: true, suggestions: [{ address: 'Fixture address', city: 'Fixture city', latitude: 55.7, longitude: 37.6 }] } })
      if (url.pathname.endsWith('/verify-pvz')) return route.fulfill({ json: { success: true, found: true, point: { deliveryPointId: 123, name: 'Fixture PVZ', address: 'Fixture pickup' } } })
      if (url.pathname.endsWith('/checkout')) return route.fulfill({ json: { success: true, available: true, delivery: { customerDeliveryPrice: 50 } } })
      if (url.pathname === '/website/orders') {
        const stored = await page.evaluate((key) => localStorage.getItem(key), storageKey)
        // Assert persistence precedes HTTP, including serialization and key.
        const attempt = JSON.parse(stored)
        assert.equal(request.postData(), JSON.stringify(attempt.payload))
        assert.equal(request.headers()['idempotency-key'], attempt.idempotencyKey)
        orders.push({ body: request.postData(), key: request.headers()['idempotency-key'] })
        return orderReply(route)
      }
      unexpected.push(url.pathname)
      return route.fulfill({ status: 404, body: '' })
    })
    await page.goto('https://checkout.fixture.test/checkout')
    await page.evaluate(({ cartKey, storageKey, options }) => {
      localStorage.setItem(cartKey, JSON.stringify(options.cart ?? [{ variantId: 1, quantity: 2 }]))
      if (options.pending !== undefined) localStorage.setItem(storageKey, typeof options.pending === 'string' ? options.pending : JSON.stringify(options.pending))
    }, { cartKey, storageKey, options })
    await page.reload()
    const button = page.getByRole('button', { name: 'ПОДТВЕРДИТЬ ЗАКАЗ', exact: true })
    const recovery = page.getByRole('button', { name: 'ПОВТОРИТЬ ИСХОДНЫЙ ЗАПРОС', exact: true })
    const confirmPickup = () => page.getByRole('button', { name: /ПОДТВЕРДИТЬ ПУНКТ|ПОВТОРИТЬ РАСЧЁТ/ }).click()
    async function ready() {
      await page.getByLabel('Ваше имя', { exact: true }).fill('Fixture')
      await page.getByLabel('Телефон', { exact: true }).fill('89991234567')
      await page.getByLabel('Комментарий к заказу (необязательно)', { exact: true }).fill('Comment')
      await page.getByRole('button', { name: 'ПЕРЕЙТИ К ДОСТАВКЕ', exact: true }).click()
      await page.getByLabel('Адрес для поиска пункта выдачи').fill('Fi')
      await page.getByRole('button', { name: 'Fixture address', exact: true }).click()
      await page.getByRole('button', { name: 'НАЙТИ ПУНКТ ВЫДАЧИ', exact: true }).click()
      await confirmPickup()
      await page.getByText('Доставка доступна', { exact: true }).waitFor()
    }
    async function preserved() {
      assert.ok(await page.evaluate((key) => localStorage.getItem(key), storageKey))
      assert.notEqual(await page.evaluate((key) => localStorage.getItem(key), cartKey), '[]')
    }
    t.after(() => { assert.deepEqual(errors, []); assert.deepEqual(unexpected, []) })
    return { page, orders, button, recovery, ready, confirmPickup, preserved, reply: (fn) => { orderReply = fn }, promoReply: (fn) => { promoReply = fn } }
  }

  await t.test('success uses trusted backend total, clears matching attempt/cart, remains visible', async () => {
    const f = await fixture()
    assert.equal(await f.button.isDisabled(), true)
    await f.ready()
    await f.button.click()
    await f.page.getByRole('heading', { name: 'Заказ № WEB-FIXTURE создан' }).waitFor()
    assert.equal(f.orders.length, 1)
    assert.deepEqual(JSON.parse(f.orders[0].body), payload)
    await f.page.getByText('Заказ ещё не оплачен.', { exact: true }).waitFor()
    assert.match(await f.page.locator('.checkout-order-success').innerText(), /1\s*970/)
    assert.equal(await f.page.evaluate((key) => localStorage.getItem(key), storageKey), null)
    await f.page.waitForFunction((key) => localStorage.getItem(key) === '[]', cartKey)
    assert.equal(await f.page.getByRole('heading', { name: 'Ваша корзина пуста' }).count(), 0)
  })

  await t.test('same-tick duplicate clicks send once and disable controls', async () => {
    const f = await fixture()
    let held
    f.reply((route) => { held = route })
    await f.ready()
    await f.button.evaluate((button) => { button.click(); button.click() })
    await f.page.getByText('Создаём заказ… Не закрывайте страницу.', { exact: true }).waitFor()
    assert.equal(f.orders.length, 1)
    assert.equal(await f.page.getByLabel('Ваше имя', { exact: true }).isDisabled(), true)
    assert.equal(await f.recovery.isDisabled(), true)
    await held.fulfill({ status: 201, json: success })
    await f.page.getByRole('heading', { name: 'Заказ № WEB-FIXTURE создан' }).waitFor()
    assert.equal(f.orders.length, 1)
  })

  await t.test('reload recovers original request with empty/different cart and form', async () => {
    const f = await fixture({ pending: savedAttempt(), cart: [] })
    assert.equal(f.orders.length, 0)
    await f.page.reload()
    await f.recovery.click()
    await f.page.getByRole('heading', { name: 'Заказ № WEB-FIXTURE создан' }).waitFor()
    assert.deepEqual(f.orders, [{ key, body: JSON.stringify(payload) }])
  })

  await t.test('changed form cannot replace pending attempt; explicit recovery uses original', async () => {
    const f = await fixture({ pending: savedAttempt() })
    await f.ready()
    await f.page.getByLabel('Комментарий к заказу (необязательно)', { exact: true }).fill('Changed')
    await f.button.click()
    await f.page.getByText('Данные изменились.', { exact: false }).waitFor()
    assert.equal(f.orders.length, 0)
    assert.deepEqual(await f.page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey), savedAttempt())
    await f.recovery.click()
    await f.page.getByRole('heading', { name: 'Заказ № WEB-FIXTURE создан' }).waitFor()
    assert.deepEqual(f.orders, [{ key, body: JSON.stringify(payload) }])
  })

  for (const [status, code, message] of [
    [400, 'VALIDATION_ERROR', 'Fixture validation error'],
    [409, 'IDEMPOTENCY_KEY_CONFLICT', 'Conflict'],
    [409, 'ORDER_IN_PROGRESS', 'In progress'],
    [503, 'ORDER_PERSISTENCE_UNAVAILABLE', 'Unavailable'],
    [500, 'INTERNAL_ERROR', 'Failure'],
  ]) await t.test(`HTTP ${status} ${code}: preserve cart/key/body; manual retry only`, async () => {
    const f = await fixture({ pending: savedAttempt() })
    f.reply((route) => route.fulfill({ status, json: { success: false, code, message }, headers: { 'Retry-After': '5' } }))
    await f.recovery.click()
    await f.page.getByRole('alert').filter({ hasText: status === 400 ? message : status === 409 ? code === 'ORDER_IN_PROGRESS' ? 'ещё обрабатывается' : 'Конфликт' : 'Результат создания заказа неизвестен' }).waitFor()
    await f.preserved()
    assert.equal(f.orders.length, 1)
    assert.deepEqual(await f.page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey), savedAttempt())
    f.reply((route) => route.fulfill({ status: 201, json: success }))
    await f.recovery.click()
    await f.page.getByRole('heading', { name: 'Заказ № WEB-FIXTURE создан' }).waitFor()
    assert.deepEqual(f.orders, [{ key, body: JSON.stringify(payload) }, { key, body: JSON.stringify(payload) }])
  })

  await t.test('network failure and malformed 201 preserve attempt and report uncertainty', async () => {
    const f = await fixture({ pending: savedAttempt() })
    f.reply((route) => route.abort('failed'))
    await f.recovery.click()
    await f.page.getByText('Результат создания заказа неизвестен:', { exact: false }).waitFor()
    await f.preserved()
    assert.equal(f.orders.length, 1)
    f.reply((route) => route.fulfill({ status: 201, body: 'not JSON' }))
    await f.recovery.click()
    await f.page.waitForFunction(() => !document.querySelector('.checkout-recovery button').disabled)
    await f.preserved()
    assert.equal(f.orders.length, 2)
    assert.equal(f.orders[0].body, f.orders[1].body)
    assert.equal(f.orders[0].key, f.orders[1].key)
  })

  await t.test('timeout keeps original UUID/body, reports unknown outcome and does not retry', async () => {
    const f = await fixture({ pending: savedAttempt(), timeout: true })
    f.reply(() => {}) // Hold the mocked request until the adapter's signal aborts.
    await f.recovery.click()
    await f.page.getByText('Результат создания заказа неизвестен:', { exact: false }).waitFor()
    await f.preserved()
    assert.deepEqual(f.orders, [{ key, body: JSON.stringify(payload) }])
  })

  await t.test('failed persistence blocks HTTP; cleanup failure after 201 keeps success', async () => {
    const f = await fixture()
    await f.ready()
    await f.page.evaluate((key) => {
      const set = Storage.prototype.setItem
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new Error('Storage denied')
        return set.call(this, name, value)
      }
    }, storageKey)
    await f.button.click()
    await f.page.getByText('Не удалось отправить заказ.', { exact: false }).waitFor()
    assert.equal(f.orders.length, 0)
    assert.equal(await f.page.evaluate((key) => localStorage.getItem(key), storageKey), null)
    assert.notEqual(await f.page.evaluate((key) => localStorage.getItem(key), cartKey), '[]')
    const recovery = await fixture({ pending: savedAttempt() })
    await recovery.page.evaluate(() => { Storage.prototype.removeItem = () => { throw new Error('Storage denied') } })
    await recovery.recovery.click()
    await recovery.page.getByRole('heading', { name: 'Заказ № WEB-FIXTURE создан' }).waitFor()
    await recovery.page.getByText('Заказ создан, но не удалось полностью очистить локальные данные.', { exact: false }).waitFor()
    assert.ok(await recovery.page.evaluate((key) => localStorage.getItem(key), storageKey))
    await recovery.page.waitForFunction((key) => localStorage.getItem(key) === '[]', cartKey)
  })

  await t.test('readiness rejects stale city/phone/PVZ/estimate and pending/failed promo', async () => {
    const f = await fixture()
    await f.ready()
    assert.equal(await f.button.isEnabled(), true)
    await f.page.getByLabel('Город или населённый пункт', { exact: true }).fill('Other city')
    assert.equal(await f.button.isDisabled(), true)
    await f.page.getByRole('button', { name: 'НАЙТИ ПУНКТ ВЫДАЧИ', exact: true }).click()
    await f.confirmPickup()
    await f.page.getByText('Доставка доступна', { exact: true }).waitFor()
    let promoRoute
    f.promoReply((route) => { promoRoute = route })
    await f.page.getByLabel('Введите промокод', { exact: true }).fill('CODE')
    // Dispatch promo validation and order confirmation in one JavaScript turn.
    await f.page.evaluate(() => {
      document.querySelector('.cart-promo form').requestSubmit()
      ;[...document.querySelectorAll('button')].find((button) => button.textContent === 'ПОДТВЕРДИТЬ ЗАКАЗ').click()
    })
    await f.page.getByText('Проверяем промокод.', { exact: false }).waitFor()
    await f.page.waitForFunction(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'ПОДТВЕРДИТЬ ЗАКАЗ')?.disabled)
    assert.equal(await f.button.isDisabled(), true)
    assert.equal(f.orders.length, 0)
    await promoRoute.fulfill({ status: 503, json: {} })
    await f.page.getByRole('button', { name: 'Повторить проверку', exact: true }).waitFor()
    assert.equal(await f.button.isDisabled(), true)
    // Success exposes only validated CODE, and requires a fresh estimate.
    f.promoReply((route) => route.fulfill({ json: { success: true, pricingMode: 'discount' } }))
    await f.page.getByRole('button', { name: 'Повторить проверку', exact: true }).click()
    await f.page.getByText('Применён: CODE', { exact: true }).waitFor()
    assert.equal(await f.button.isDisabled(), true)
    await f.confirmPickup()
    await f.page.getByText('Доставка доступна', { exact: true }).waitFor()
    await f.button.click()
    await f.page.getByRole('heading', { name: 'Заказ № WEB-FIXTURE создан' }).waitFor()
    assert.equal(JSON.parse(f.orders[0].body).promoCode, 'CODE')
  })

  await t.test('corrupted storage blocks submission and remains untouched', async () => {
    const f = await fixture({ pending: '{broken' })
    await f.ready()
    assert.equal(await f.button.isDisabled(), true)
    assert.equal(await f.recovery.count(), 0)
    assert.equal(f.orders.length, 0)
    assert.equal(await f.page.evaluate((key) => localStorage.getItem(key), storageKey), '{broken')
  })

  await t.test('phone/address changes invalidate readiness and unresolved cart cannot submit', async () => {
    const f = await fixture()
    await f.ready()
    await f.page.getByLabel('Телефон', { exact: true }).fill('79991234568')
    assert.equal(await f.button.isDisabled(), true)
    assert.equal(await f.page.getByText('Доставка доступна', { exact: true }).count(), 0)
    await f.ready()
    await f.page.getByLabel('Адрес для поиска пункта выдачи').fill('Changed address')
    assert.equal(await f.button.isDisabled(), true)
    assert.equal(await f.page.getByText('Fixture PVZ', { exact: true }).count(), 0)
    assert.equal(f.orders.length, 0)
    const invalid = await fixture({ cart: [{ variantId: 999, quantity: 1 }] })
    await invalid.page.getByText('Не удалось рассчитать стоимость товаров.', { exact: false }).waitFor()
    assert.equal(await invalid.button.isDisabled(), true)
    assert.equal(invalid.orders.length, 0)
  })
})
