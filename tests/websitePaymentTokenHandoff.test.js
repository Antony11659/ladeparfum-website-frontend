import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { env } from 'node:process'
import { test } from 'node:test'
import { validateOzonPaymentUrl } from '../src/services/ozonPaymentUrl.js'

// Load the actual frontend adapter with only Vite's configuration replaced.
const source = await readFile(new URL('../src/services/websiteOrdersApi.js', import.meta.url), 'utf8')
const base = 'https://orders.fixture.test/website'
const code = source.replace('import.meta.env.VITE_ORDERS_API_BASE_URL', JSON.stringify(base))
const { createWebsiteOrder } = await import(`data:text/javascript,${encodeURIComponent(code)}`)

test('checkout keeps the order and token together for initial 201, replay and tokenless 201', async (t) => {
  const order = {
    id: 12, orderNumber: 'WEB-FIXTURE', pricingMode: 'website',
    subtotal: 1900, deliveryPrice: 70, total: 1970, status: 'new',
  }
  const input = {
    payload: {
      customer: { name: 'Fixture', phone: '+79991234567', city: 'City', address: 'Address' },
      delivery: { provider: 'ozon', deliveryPointId: '123' },
      items: [{ variantId: 1, quantity: 2 }],
    },
    idempotencyKey: '12345678-1234-4123-8123-123456789abc',
  }
  // These are distinct opaque placeholders. The adapter does not verify tokens.
  const replies = [
    { success: true, order, paymentAccessToken: 'fixture-first-token' },
    { success: true, order, paymentAccessToken: 'fixture-replayed-token' },
    { success: true, order },
  ]
  const fetch = t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(url, `${base}/orders`)
    assert.equal(request.method, 'POST')
    assert.deepEqual(request.headers, {
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    })
    assert.equal(request.body, JSON.stringify(input.payload))
    assert.ok(replies.length, 'Unexpected extra request')
    return Response.json(replies.shift(), { status: 201 })
  })

  for (const paymentAccessToken of ['fixture-first-token', 'fixture-replayed-token', null]) {
    assert.deepEqual(await createWebsiteOrder(input), { order, paymentAccessToken })
  }
  assert.equal(fetch.mock.callCount(), 3)
  assert.equal(replies.length, 0)
})

const token = 'fixture-payment-token'
const payment = {
  orderId: 12, orderNumber: 'WEB-FIXTURE', amount: 1970, ozonPayOrderId: 'fixture-ozon-id',
  ozonPayStatus: 'Created', payLink: 'https://checkout.ozon.ru/fixture-only/%2f?session=fictional%2Bvalue&b=2&a=1', isTestMode: true,
}
test('payment URL requires the exact verified HTTPS authority and preserves the original string', () => {
  assert.equal(validateOzonPaymentUrl(payment.payLink), payment.payLink)
  const opaque = 'HTTPS://CHECKOUT.OZON.RU/fixture/%2f?b=%2b&a=%20'
  assert.equal(validateOzonPaymentUrl(opaque), opaque)
  for (const link of [
    null, '', ' ', 'http://checkout.ozon.ru/', 'https://checkout.ozon.ru.example.com/',
    'https://evil-checkout.ozon.ru/', 'https://sub.checkout.ozon.ru/', 'https://payapi.ozon.ru/',
    'https://checkout.ozon.ru@evil.example/', 'https://a:b@checkout.ozon.ru/',
    'https://@checkout.ozon.ru/', 'https://checkout.ozon.ru:444/', 'https://checkout.ozon.ru:443/',
    'javascript:alert(1)', 'data:text/html,example', '/fixture', '//checkout.ozon.ru/fixture',
    'https:checkout.ozon.ru/fixture', 'https:///checkout.ozon.ru/fixture',
    'https://%63heckout.ozon.ru/', 'https://checkout.ozon.ru./', 'https://checkout.ozon.ru/invalid%xx',
    'https://checkout.ozon.ru/line\nbreak', 'https://checkout.ozon.ru/space here',
    'https://checkout.ozon.ru/\\backslash',
  ]) assert.equal(validateOzonPaymentUrl(link), null)
})

const paymentSource = await readFile(new URL('../src/services/websitePaymentsApi.js', import.meta.url), 'utf8')
function loadPaymentApi(flag) {
  const code = paymentSource.replace('import.meta.env.VITE_ORDERS_API_BASE_URL', JSON.stringify(base))
    .replace('import.meta.env.VITE_WEBSITE_OZON_PAY_ENABLED', String(JSON.stringify(flag)))
  return import(`data:text/javascript,${encodeURIComponent(code)}`)
}

test('disabled flags and invalid inputs produce zero payment requests', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { assert.fail('Unexpected request') })
  for (const flag of [undefined, 'false', 'TRUE', true]) {
    const api = await loadPaymentApi(flag)
    assert.equal(api.WEBSITE_OZON_PAY_ENABLED, false)
    await assert.rejects(api.createWebsitePayment({ orderId: 12, paymentAccessToken: token }), { kind: 'configuration' })
  }
  const api = await loadPaymentApi('true')
  for (const input of [{ orderId: 0, paymentAccessToken: token }, { orderId: 12, paymentAccessToken: ' ' }]) {
    await assert.rejects(api.createWebsitePayment(input), { kind: 'validation' })
  }
  assert.equal(fetch.mock.callCount(), 0)
})

test('payment uses only the order-specific POST and token header, with no retries or leaked errors', async (t) => {
  const { createWebsitePayment } = await loadPaymentApi('true')
  const input = { orderId: 12, paymentAccessToken: token }
  let reply = () => Response.json({ success: true, payment })
  const fetch = t.mock.method(globalThis, 'fetch', async (...args) => reply(...args))
  const errorLog = t.mock.method(console, 'error')
  const warnLog = t.mock.method(console, 'warn')
  const infoLog = t.mock.method(console, 'log')
  assert.deepEqual(await createWebsitePayment(input), payment)
  for (const status of [401, 403, 409, 503]) {
    reply = () => Response.json({ message: token }, { status })
    await assert.rejects(createWebsitePayment(input), { kind: 'http', status })
  }
  reply = () => { throw new Error(token) }
  await assert.rejects(createWebsitePayment(input), (error) => {
    assert.equal(error.kind, 'network')
    assert.match(error.message, /результат подготовки оплаты неизвестен/i)
    assert.equal(error.cause, undefined)
    return true
  })
  reply = () => Response.json({ success: true, payment: { ...payment, orderId: 13 } })
  await assert.rejects(createWebsitePayment(input), { kind: 'invalid_response' })
  assert.equal(fetch.mock.callCount(), 7)
  for (const { arguments: [url, request] } of fetch.mock.calls) {
    assert.equal(url, `${base}/orders/12/payment`)
    assert.equal(request.method, 'POST')
    assert.equal(request.redirect, 'error')
    assert.deepEqual(request.headers, { 'X-Website-Payment-Token': token })
    assert.equal(request.body, undefined)
  }
  assert.equal(errorLog.mock.callCount() + warnLog.mock.callCount() + infoLog.mock.callCount(), 0)
})

test('payment timeout leaves the outcome unknown and sends once', async (t) => {
  const { createWebsitePayment } = await loadPaymentApi('true')
  const controller = new AbortController()
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    assert.equal(ms, 30000)
    return controller.signal
  })
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    controller.abort(new DOMException('Fixture timeout', 'TimeoutError'))
    signal.throwIfAborted()
  })
  await assert.rejects(createWebsitePayment({ orderId: 12, paymentAccessToken: token }), {
    message: 'Результат подготовки оплаты неизвестен.',
  })
  assert.equal(fetch.mock.callCount(), 1)
})

test('status adapter sends only GET and rejects mismatched IDs, unknown statuses and private errors', async (t) => {
  const api = await loadPaymentApi('true')
  const disabled = await loadPaymentApi(undefined)
  const replies = [
    { success: true, orderId: 12, paymentStatus: 'paid' },
    { success: true, orderId: 13, paymentStatus: 'paid' },
    { success: true, orderId: 12, paymentStatus: 'unknown' },
  ].map((value) => Response.json(value))
  for (const status of [401, 403, 409, 503]) {
    replies.push(Response.json({ message: token, payLink: payment.payLink }, { status }))
  }
  const fetch = t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(url, `${base}/orders/12/payment-status`)
    assert.equal(request.method, 'GET')
    assert.deepEqual(request.headers, { 'X-Website-Payment-Token': token })
    assert.equal(request.body, undefined)
    assert.ok(request.signal instanceof AbortSignal)
    if (!replies.length) throw new Error(token)
    return replies.shift()
  })
  const input = { orderId: 12, paymentAccessToken: token }
  await assert.rejects(disabled.getWebsitePaymentStatus(input))
  await assert.rejects(api.getWebsitePaymentStatus({ ...input, orderId: 0 }))
  await assert.rejects(api.getWebsitePaymentStatus({ ...input, paymentAccessToken: '' }))
  assert.equal(fetch.mock.callCount(), 0)
  assert.equal(await api.getWebsitePaymentStatus(input), 'paid')
  for (const status of [200, 200, 401, 403, 409, 503, null]) {
    await assert.rejects(api.getWebsitePaymentStatus(input), { message: 'Не удалось проверить оплату', status })
  }
  assert.equal(fetch.mock.callCount(), 8)
})

const returnKey = 'ladeparfum_payment_return_v1'

test('return context stores only the capability, uses a one-hour age limit and clears matching context', async (t) => {
  const { savePaymentReturnContext, readPaymentReturnContext, clearPaymentReturnContext } =
    await import('../src/services/paymentReturnContext.js')
  const entries = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key),
    },
  })
  t.after(() => { delete globalThis.sessionStorage })
  const now = Date.now()
  const clock = t.mock.method(Date, 'now', () => now)
  assert.equal(savePaymentReturnContext({ orderId: 12, paymentAccessToken: token, ...{ payLink: payment.payLink } }), true)
  const saved = readPaymentReturnContext()
  assert.deepEqual(saved, { orderId: 12, paymentAccessToken: token, createdAt: now })
  clearPaymentReturnContext({ ...saved, paymentAccessToken: 'different' })
  assert.deepEqual(readPaymentReturnContext(), saved)
  clearPaymentReturnContext(saved)
  assert.equal(entries.has(returnKey), false)
  assert.equal(savePaymentReturnContext({ orderId: -1, paymentAccessToken: token }), false)
  assert.equal(savePaymentReturnContext({ orderId: 12, paymentAccessToken: '' }), false)
  for (const invalid of ['{', JSON.stringify({ ...saved, customer: 'private' }), JSON.stringify({ ...saved, createdAt: now + 1 })]) {
    entries.set(returnKey, invalid)
    assert.equal(readPaymentReturnContext(), null)
    assert.equal(entries.has(returnKey), false)
  }
  entries.set(returnKey, JSON.stringify(saved))
  clock.mock.mockImplementation(() => now + 60 * 60 * 1000)
  assert.equal(readPaymentReturnContext(), null)
  assert.equal(entries.has(returnKey), false)
})

let chromium
try { ({ chromium } = createRequire(import.meta.url)('playwright')) } catch { /* Optional browser coverage. */ }
// Supply fixture builds made with the flag set to true and false, respectively.
const enabledDist = env.PAYMENT_TEST_ENABLED_DIST
const disabledDist = env.PAYMENT_TEST_DISABLED_DIST

test('checkout payment UI with all browser requests intercepted', {
  skip: !chromium ? 'Playwright unavailable' : (!enabledDist || !disabledDist) && 'Fixture builds unavailable',
}, async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  t.after(() => browser.close())
  const checkoutUrl = 'https://checkout.fixture.test/checkout'
  const storageKey = 'ladeparfum_checkout_attempt_v1'
  const order = {
    id: 12, orderNumber: 'WEB-FIXTURE', pricingMode: 'website',
    subtotal: 1900, deliveryPrice: 70, total: 1970, status: 'new',
  }
  const attempt = {
    version: 1, idempotencyKey: '12345678-1234-4123-8123-123456789abc',
    createdAt: '2026-11-17T10:00:00.000Z',
    payload: {
      customer: { name: 'Fixture', phone: '+79991234567', city: 'City', address: 'Address' },
      delivery: { provider: 'ozon', deliveryPointId: '123' },
      items: [{ variantId: 1, quantity: 2 }],
    },
  }

  async function scenario(subtest, { dist = enabledDist, hasToken = true, outcome = 200, verify = null, statusReplies = [], paymentOverride = {}, storageFailure = null } = {}) {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    subtest.after(() => context.close())
    const page = await context.newPage()
    page.setDefaultTimeout(5000)
    const logs = []
    const requests = []
    const unexpected = []
    const orders = []
    const payments = []
    const statusChecks = []
    const fixturePayment = { ...payment, ...paymentOverride }
    let releasePayment
    const holdPayment = new Promise((resolvePayment) => { releasePayment = resolvePayment })
    subtest.after(releasePayment)
    page.on('console', (message) => logs.push(message.text()))
    page.on('pageerror', (error) => logs.push(error.message))
    page.on('request', (request) => requests.push(request.url()))
    await page.addInitScript(({ storageKey, attempt, returnKey, storageFailure }) => {
      localStorage.setItem(storageKey, JSON.stringify(attempt))
      window.fixturePaymentNavigations = []
      window.navigation.addEventListener('navigate', (event) => {
        if (new URL(event.destination.url).hostname !== 'checkout.ozon.ru') return
        event.preventDefault()
        window.fixturePaymentNavigations.push({
          url: event.destination.url,
          cancelled: event.defaultPrevented,
          context: JSON.parse(sessionStorage.getItem(returnKey)),
        })
      })
      const setItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (this === sessionStorage && key === returnKey && storageFailure) {
          if (storageFailure === 'throw') throw Error('fixture private storage error')
          return
        }
        return setItem.call(this, key, value)
      }
    }, { storageKey, attempt, returnKey, storageFailure })
    await page.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === 'https://checkout.fixture.test' && (['/checkout', '/payment-success', '/payment-failed'].includes(url.pathname) || url.pathname.startsWith('/assets/') || url.pathname === '/favicon.svg')) {
        const file = request.isNavigationRequest() ? 'index.html' : url.pathname.slice(1)
        return route.fulfill({
          body: await readFile(resolve(dist, file)),
          contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html',
        })
      }
      if (request.url() === `${base}/orders`) {
        orders.push(request)
        return route.fulfill({ status: 201, json: { success: true, order, ...(hasToken && { paymentAccessToken: token }) } })
      }
      if (request.url() === `${base}/orders/12/payment`) {
        payments.push(request)
        await holdPayment
        if (outcome === 'network') return route.abort('failed')
        return route.fulfill({ status: outcome, json: outcome === 200 ? { success: true, payment: fixturePayment } : { success: false, message: token } })
      }
      if (request.url() === `${base}/orders/12/payment-status`) {
        statusChecks.push(request)
        if (statusReplies.length === 0) {
          unexpected.push('unexpected status check')
          return route.abort()
        }
        const reply = statusReplies.shift()
        if (reply === 'network') return route.abort('failed')
        return typeof reply === 'number'
          ? route.fulfill({ status: reply, json: { success: false, message: token } })
          : route.fulfill({ json: { success: true, orderId: 12, paymentStatus: reply } })
      }
      if (url.pathname === '/perfumes/' || url.pathname === '/prices/') return route.fulfill({ json: [] })
      unexpected.push(url.pathname)
      return route.abort()
    })

    await page.goto(checkoutUrl)
    await page.getByRole('button', { name: 'ПОВТОРИТЬ ИСХОДНЫЙ ЗАПРОС' }).click()
    const confirmation = page.getByRole('heading', { name: 'Заказ № WEB-FIXTURE создан' })
    await confirmation.waitFor()
    const pay = page.getByRole('button', { name: 'ПЕРЕЙТИ К ОПЛАТЕ' })
    const canPay = dist === enabledDist && hasToken
    const wrongOrder = fixturePayment.orderId !== order.id
    const invalidLink = !validateOzonPaymentUrl(fixturePayment.payLink)
    const shouldNavigate = canPay && outcome === 200 && !wrongOrder && !invalidLink && !storageFailure
    if (canPay) {
      const request = page.waitForRequest(`${base}/orders/12/payment`)
      await pay.evaluate((button) => { button.click(); button.click() })
      const sent = await request
      assert.equal(sent.method(), 'POST')
      assert.equal(sent.headers()['x-website-payment-token'], token)
      assert.equal(sent.headers()['idempotency-key'], undefined)
      assert.equal(sent.postData(), null)
      assert.equal(await pay.isDisabled(), true)
      releasePayment()
      const message = {
        200: wrongOrder ? 'Результат подготовки оплаты неизвестен.'
          : invalidLink ? 'Не удалось открыть страницу оплаты: получена недействительная ссылка.'
            : storageFailure ? 'Не удалось сохранить разрешение на проверку оплаты в этой вкладке.'
              : 'Оплата подготовлена.',
        401: 'Разрешение на оплату отсутствует, недействительно или истекло.',
        403: 'Разрешение на оплату не подходит для этого заказа.',
        409: 'Оплата уже зарезервирована или недоступна.',
        503: 'Сервис оплаты временно недоступен. Результат подготовки оплаты неизвестен.',
        network: 'Результат подготовки оплаты неизвестен.',
      }[outcome]
      await page.getByText(message, { exact: true }).waitFor()
      if (outcome === 200) {
        assert.equal(await pay.isDisabled(), true)
        await pay.evaluate((button) => button.click())
      }
    } else {
      assert.equal(await pay.count(), 0)
    }
    assert.equal(payments.length, canPay ? 1 : 0)
    assert.equal(orders.length, 1)
    assert.equal(orders[0].headers()['idempotency-key'], attempt.idempotencyKey)
    assert.equal(orders[0].postData(), JSON.stringify(attempt.payload))
    assert.equal(await confirmation.isVisible(), true)
    assert.equal(await page.getByText('Заказ ещё не оплачен.').isVisible(), true)
    assert.equal(page.url(), checkoutUrl)
    assert.equal(context.pages().length, 1)
    assert.equal(await page.evaluate(() => JSON.stringify([localStorage, document.cookie])).then((storage) => storage.includes(token)), false)
    const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), returnKey)
    const navigations = await page.evaluate(() => window.fixturePaymentNavigations)
    assert.equal(navigations.length, shouldNavigate ? 1 : 0)
    if (shouldNavigate) {
      assert.deepEqual(stored, { orderId: 12, paymentAccessToken: token, createdAt: stored.createdAt })
      assert.ok(Number.isSafeInteger(stored.createdAt))
      assert.deepEqual(navigations[0], {
        url: fixturePayment.payLink, cancelled: true, context: stored,
      })
    } else {
      assert.equal(stored, null)
    }
    if (verify) await verify({ page, statusChecks })
    assert.equal(statusReplies.length, 0)
    assert.equal(orders.length, 1)
    assert.equal(payments.length, canPay ? 1 : 0)
    for (const request of statusChecks) {
      assert.equal(request.method(), 'GET')
      assert.equal(request.headers()['x-website-payment-token'], token)
      assert.equal(request.postData(), null)
    }
    const output = [await page.locator('body').innerText(), ...logs, ...requests].join('\n')
    assert.equal(output.includes(token), false)
    assert.equal(output.includes(payment.payLink), false)
    assert.equal(output.includes(fixturePayment.payLink), false)
    assert.deepEqual(unexpected, [])
  }

  await t.test('disabled flag with a token', (subtest) => scenario(subtest, { dist: disabledDist }))
  await t.test('enabled flag without a token', (subtest) => scenario(subtest, { hasToken: false }))
  for (const outcome of [200, 401, 403, 409, 503, 'network']) {
    await t.test(`payment outcome ${outcome}`, (subtest) => scenario(subtest, { outcome }))
  }

  for (const [name, options] of [
    ['wrong host', { paymentOverride: { payLink: 'https://checkout.ozon.ru.example.com/private-fixture' } }],
    ['wrong order ID', { paymentOverride: { orderId: 999 } }],
    ['blocked storage write', { storageFailure: 'throw' }],
    ['ignored storage write', { storageFailure: 'ignore' }],
  ]) {
    await t.test(`${name} blocks navigation and repeat initialization`, (subtest) => scenario(subtest, options))
  }

  const resultUrl = (path) => `https://checkout.fixture.test${path}`
  const storedContext = (page) => page.evaluate((key) => sessionStorage.getItem(key), returnKey)
  const heading = (page, text) => page.getByRole('heading', { name: text, exact: true })

  await t.test('success route verifies pending on load and refresh, then retries using GET only', (subtest) => scenario(subtest, {
    statusReplies: ['pending', 'pending', 503, 'network', 409, 'paid'],
    async verify({ page, statusChecks }) {
      await page.getByRole('link', { name: 'Проверить статус оплаты' }).click()
      assert.equal(new URL(page.url()).pathname, '/payment-success')
      await heading(page, 'Платёж обрабатывается').waitFor()
      assert.equal(statusChecks.length, 1)
      assert.equal(await heading(page, 'Оплата подтверждена').count(), 0)
      await page.reload()
      await heading(page, 'Платёж обрабатывается').waitFor()
      assert.equal(statusChecks.length, 2)
      const retry = page.getByRole('button', { name: 'Проверить ещё раз' })
      for (let count = 3; count <= 5; count++) {
        await retry.evaluate((button) => { button.click(); button.click() })
        await heading(page, 'Не удалось проверить оплату').waitFor()
        assert.equal(statusChecks.length, count)
        assert.ok(await storedContext(page))
        assert.equal(await heading(page, 'Оплата подтверждена').count(), 0)
      }
      await retry.click()
      await heading(page, 'Оплата подтверждена').waitFor()
      assert.equal(statusChecks.length, 6)
      assert.equal(await storedContext(page), null)
    },
  }))

  for (const [reply, text] of [
    ['paid', 'Оплата подтверждена'],
    [401, 'Разрешение на проверку оплаты недействительно или истекло'],
    [403, 'Разрешение на проверку оплаты недействительно или истекло'],
    ['processing', 'Подготовка платежа ещё обрабатывается'],
    ['unavailable', 'Платёж недоступен'],
    ['recovery_required', 'Для проверки платежа нужно больше времени'],
    ['not_started', 'Оплата ещё не начата'],
  ]) {
    await t.test(`failure route renders authoritative outcome ${reply}`, (subtest) => scenario(subtest, {
      statusReplies: [reply],
      async verify({ page, statusChecks }) {
        await page.goto(resultUrl('/payment-failed'))
        await heading(page, text).waitFor()
        assert.equal(statusChecks.length, 1)
        assert.equal(Boolean(await storedContext(page)), reply !== 'paid')
      },
    }))
  }

  for (const expired of [false, true]) {
    await t.test(`result with ${expired ? 'expired' : 'missing'} context makes no status request`, (subtest) => scenario(subtest, {
      hasToken: false,
      async verify({ page, statusChecks }) {
        if (expired) await page.evaluate(({ key, token }) => {
          sessionStorage.setItem(key, JSON.stringify({ orderId: 12, paymentAccessToken: token, createdAt: Date.now() - 3600001 }))
        }, { key: returnKey, token })
        await page.goto(resultUrl('/payment-success'))
        await heading(page, 'Не удалось проверить оплату').waitFor()
        assert.equal(statusChecks.length, 0)
        assert.equal(await storedContext(page), null)
      },
    }))
  }

  await t.test('disabled result route ignores valid context', (subtest) => scenario(subtest, {
    dist: disabledDist,
    async verify({ page, statusChecks }) {
      await page.evaluate(({ key, token }) => {
        sessionStorage.setItem(key, JSON.stringify({ orderId: 12, paymentAccessToken: token, createdAt: Date.now() }))
      }, { key: returnKey, token })
      await page.goto(resultUrl('/payment-failed'))
      await heading(page, 'Проверка оплаты пока недоступна').waitFor()
      assert.equal(statusChecks.length, 0)
    },
  }))

})
