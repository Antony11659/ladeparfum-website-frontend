import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/cartContext.js'
import CartPromo from '../components/CartPromo.jsx'
import { fetchPerfumes, fetchPrices } from '../services/perfumeApi.js'
import { calculateCartTotals, formatRubles, resolveCartLines } from '../services/cartPricing.js'
import { deliveryConfigured, deliveryRequest, normalizeRussianPhone } from '../services/deliveryApi.js'
import { createWebsiteOrder } from '../services/websiteOrdersApi.js'
import { createWebsitePayment, WEBSITE_OZON_PAY_ENABLED } from '../services/websitePaymentsApi.js'
import { savePaymentReturnContext } from '../services/paymentReturnContext.js'
import { validateOzonPaymentUrl } from '../services/ozonPaymentUrl.js'
import { getPendingCheckoutAttempt, createOrReuseCheckoutAttempt, clearCheckoutAttempt } from '../services/checkoutAttempt.js'
import './Cart.css'
import './Checkout.css'

const idle = { status: 'idle' }
const validCoordinates = (value) => typeof value?.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180

function recoverAttempt() {
  try { return { status: 'ready', attempt: getPendingCheckoutAttempt() } } catch {
    return { status: 'error' }
  }
}

function orderErrorMessage(error) {
  if (error.code === 'changed_checkout_data') return 'Данные изменились. Незавершённый запрос сохранён. Можно повторить только исходный запрос.'
  if (error.status === 400) return error.message
  if (error.status === 409) return error.code === 'ORDER_IN_PROGRESS' || error.code === 'IDEMPOTENCY_IN_PROGRESS'
    ? 'Заказ ещё обрабатывается. Повторите исходный запрос позже.'
    : 'Конфликт запроса. Исходные данные сохранены. Не создавайте новый заказ до проверки результата.'
  if (error.outcomeUnknown || error.status === 503) return 'Результат создания заказа неизвестен: заказ мог быть создан. Повторите только исходный запрос, чтобы проверить результат.'
  return 'Не удалось отправить заказ. Исходный запрос не заменён. Проверьте доступность локального хранилища и сервиса заказов.'
}

function Checkout() {
  const { cartItems, cartCount, storageError, clearCart } = useCart()
  const [data, setData] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [promo, setPromo] = useState({ pricingMode: 'website', activeCode: null, validationStatus: 'idle', revision: 0 })
  const pricingMode = promo.pricingMode
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [client, setClient] = useState(idle)
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [deliverySubmitted, setDeliverySubmitted] = useState(false)
  const [selected, setSelected] = useState(null)
  const [suggestions, setSuggestions] = useState(idle)
  const [addressAttempt, setAddressAttempt] = useState(0)
  const [pickup, setPickup] = useState(idle)
  const [confirmed, setConfirmed] = useState(false)
  const [estimate, setEstimate] = useState(idle)
  const [pending, setPending] = useState(recoverAttempt)
  const [orderState, setOrderState] = useState(idle)
  const [paymentState, setPaymentState] = useState(idle)
  const paymentLock = useRef(false)
  const submissionLock = useRef(false)
  const orderController = useRef(null)
  const promoTransition = useRef(false)
  const generation = useRef(0)
  const operations = useRef(new Set())
  const phoneValue = normalizeRussianPhone(phone)
  const hasItems = cartItems.length > 0
  const lines = data.status === 'success' ? resolveCartLines(cartItems, data.perfumes, data.prices, pricingMode) : []
  const totals = calculateCartTotals(lines)
  const pricingKey = JSON.stringify([cartItems, pricingMode, totals?.total, city, promo.activeCode, promo.validationStatus, promo.revision])
  const delivery = estimate.status === 'success' && estimate.key === pricingKey ? estimate.delivery : null
  const eligible = client.status === 'success' && client.phone === phoneValue && Boolean(name.trim())
  const submitting = orderState.status === 'loading'
  const promoReady = (promo.validationStatus === 'success' && Boolean(promo.activeCode) && pricingMode === 'discount')
    || (['idle', 'invalid'].includes(promo.validationStatus) && !promo.activeCode && pricingMode === 'website')
  const checkoutReady = Boolean(hasItems && data.status === 'success' && totals && lines.length === cartItems.length
    && cartItems.every((item) => Number.isSafeInteger(item.variantId) && item.variantId > 0 && Number.isSafeInteger(item.quantity) && item.quantity > 0)
    && eligible && city.trim() && address.trim() && selected && pickup.status === 'success' && confirmed && delivery
    && promoReady && suggestions.status !== 'loading' && pending.status === 'ready' && !submitting)

  const handlePromoChange = useCallback((mode, details) => {
    promoTransition.current = false
    setPromo((current) => {
      if (current.pricingMode === mode && current.activeCode === details.activeCode && current.validationStatus === details.validationStatus) return current
      // A revision also rejects an in-flight estimate if the promo changes and
      // later returns to its previous value, even when prices are identical.
      return { ...details, revision: current.revision + 1 }
    })
  }, [])

  function markPromoTransition(event) {
    const button = event.target.closest('button')
    if (event.type === 'click' && !button) return
    if ((event.type === 'submit' || button?.type === 'submit') && !event.currentTarget.querySelector('input')?.value.trim()) return
    if (promoTransition.current) return
    // CartPromo reports status in an effect. Block submission synchronously
    // during that gap, including Enter, retry and removal of a promo.
    promoTransition.current = true
    setPromo((current) => ({ pricingMode: 'website', activeCode: null, validationStatus: 'loading', revision: current.revision + 1 }))
  }

  useEffect(() => {
    window.scrollTo(0, 0)
    const active = operations.current
    return () => { active.forEach((controller) => controller.abort()); orderController.current?.abort() }
  }, [])

  useEffect(() => {
    if (!hasItems) return
    const controller = new AbortController()
    const timeout = AbortSignal.timeout(12000)
    Promise.all([fetchPerfumes({ signal: AbortSignal.any([controller.signal, timeout]) }), fetchPrices({ signal: AbortSignal.any([controller.signal, timeout]) })])
      .then(([perfumes, prices]) => { if (!controller.signal.aborted) setData({ status: 'success', perfumes, prices }) })
      .catch(() => { if (!controller.signal.aborted) setData({ status: 'error' }) })
    return () => controller.abort()
  }, [hasItems, attempt])

  useEffect(() => {
    if (!eligible || selected || address.trim().length < 2 || !deliveryConfigured) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setSuggestions({ status: 'loading' })
      deliveryRequest(`address-suggestions?query=${encodeURIComponent(address.trim())}`, null, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return
          if (!Array.isArray(result.suggestions)) throw new Error('Некорректный ответ сервиса адресов.')
          setSuggestions({ status: 'success', items: result.suggestions.filter((item) => typeof item?.address === 'string' && validCoordinates(item)) })
        })
        .catch((error) => { if (!controller.signal.aborted) setSuggestions({ status: 'error', message: error.message }) })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [address, selected, eligible, addressAttempt])

  function invalidate() {
    generation.current += 1
    operations.current.forEach((controller) => controller.abort())
    setPickup(idle)
    setConfirmed(false)
    setEstimate(idle)
  }

  async function run(setState, task) {
    const version = generation.current
    const controller = new AbortController()
    operations.current.add(controller)
    setState({ status: 'loading' })
    try {
      const result = await task(controller.signal)
      if (!controller.signal.aborted && version === generation.current) setState({ ...result, status: 'success' })
    } catch (error) {
      if (!controller.signal.aborted && version === generation.current) setState({ status: 'error', message: error.message })
    } finally { operations.current.delete(controller) }
  }

  function checkCustomer(event) {
    event.preventDefault()
    setSubmitted(true)
    invalidate()
    if (!name.trim() || !phoneValue) return
    run(setClient, async (signal) => {
      const result = await deliveryRequest('check-client', { phone: phoneValue }, signal)
      if (result.canBeDelivered !== true) throw new Error('Доставка Ozon для этого номера недоступна. Проверьте номер или попробуйте позже.')
      return { phone: phoneValue }
    })
  }

  function normalizePhoneOnBlur() {
    if (!phoneValue || phoneValue === phone) return
    setPhone(phoneValue)
    invalidate()
    setClient(idle)
  }

  function verifyPickup() {
    setDeliverySubmitted(true)
    invalidate()
    if (!city.trim()) return
    run(setPickup, async (signal) => {
      const result = await deliveryRequest('verify-pvz', { latitude: selected.latitude, longitude: selected.longitude }, signal)
      if (result.found === false) throw new Error('Рядом с выбранным адресом пункт выдачи Ozon не найден. Попробуйте другой адрес.')
      const point = result.point
      if (result.found !== true || !point || !['string', 'number'].includes(typeof point.deliveryPointId) || !String(point.deliveryPointId).trim() || typeof point.name !== 'string' || typeof point.address !== 'string') throw new Error('Не удалось получить данные пункта выдачи. Выберите другой адрес или повторите попытку.')
      return { point }
    })
  }

  function confirmPickup() {
    setDeliverySubmitted(true)
    if (!city.trim()) return
    setConfirmed(true)
    if (!eligible || !totals || !pickup.point) return
    const key = pricingKey
    const version = generation.current
    run(setEstimate, async (signal) => {
      const result = await deliveryRequest('checkout', { phone: phoneValue, deliveryPointId: pickup.point.deliveryPointId, declaredValue: totals.total }, signal)
      if (result.available !== true) throw new Error('Доставка недоступна. Попробуйте другой адрес или повторите расчёт.')
      if (typeof result.delivery?.customerDeliveryPrice !== 'number' || !Number.isFinite(result.delivery.customerDeliveryPrice) || result.delivery.customerDeliveryPrice < 0) throw new Error('Стоимость доставки недоступна. Повторите расчёт.')
      return { key, version, delivery: result.delivery }
    })
  }

  async function submitOrder(recoverOriginal = false) {
    // React state updates alone do not prevent two clicks in the same tick.
    if (submissionLock.current || orderState.status === 'success') return
    if (!recoverOriginal && (!checkoutReady || promoTransition.current || estimate.version !== generation.current)) return
    if (pending.status !== 'ready') return
    submissionLock.current = true
    let saved
    try {
      if (recoverOriginal) {
        // Recovery deliberately ignores the current form/cart. Never create a
        // replacement key if the saved attempt disappeared or changed.
        saved = getPendingCheckoutAttempt()
        if (!saved || saved.idempotencyKey !== pending.attempt?.idempotencyKey) throw new Error('Attempt changed')
      } else {
        const payload = {
          customer: { name: name.trim(), phone: phoneValue, city: city.trim(), address: address.trim(), comment: comment.trim() || null },
          delivery: { provider: 'ozon', deliveryPointId: String(pickup.point.deliveryPointId) },
          items: cartItems.map(({ variantId, quantity }) => ({ variantId, quantity })),
          promoCode: promo.validationStatus === 'success' ? promo.activeCode : null,
        }
        saved = createOrReuseCheckoutAttempt(payload).attempt
      }
      setPending({ status: 'ready', attempt: saved })
      setOrderState({ status: 'loading' })
      const controller = new AbortController()
      orderController.current = controller
      // The helper has persisted the exact payload and UUID before this call.
      const confirmation = await createWebsiteOrder({ payload: saved.payload, idempotencyKey: saved.idempotencyKey, signal: controller.signal })
      let cleanupWarning = false
      try {
        if (!clearCheckoutAttempt(saved.idempotencyKey)) cleanupWarning = true
      } catch { cleanupWarning = true }
      clearCart()
      setPending({ status: 'ready', attempt: null })
      setOrderState({ status: 'success', ...confirmation, cleanupWarning })
      // Keep the synchronous lock after success, including cart clearing.
    } catch (error) {
      setPending(recoverAttempt())
      setOrderState({ status: 'error', message: orderErrorMessage(error), retryAfter: error.retryAfter })
      submissionLock.current = false
    } finally { orderController.current = null }
  }

  const canPay = WEBSITE_OZON_PAY_ENABLED && orderState.status === 'success' && Boolean(orderState.paymentAccessToken)

  async function initializePayment() {
    if (!canPay || paymentLock.current || paymentState.status === 'success') return
    paymentLock.current = true
    setPaymentState({ status: 'loading' })
    const context = {
      orderId: orderState.order.id,
      paymentAccessToken: orderState.paymentAccessToken,
    }
    let payment
    try {
      payment = await createWebsitePayment(context)
    } catch (error) {
      const initialized = error.kind === 'invalid_response' && error.status === 200
      if (!initialized) paymentLock.current = false
      setPaymentState({ status: initialized ? 'blocked' : 'error', message: error.message })
      return
    }

    // A payment was initialized. Do not send another initialization request
    // if validation, storage or navigation fails afterward.
    const destination = validateOzonPaymentUrl(payment.payLink)
    if (!destination) {
      setPaymentState({ status: 'blocked', message: 'Не удалось открыть страницу оплаты: получена недействительная ссылка.' })
      return
    }
    if (!savePaymentReturnContext(context)) {
      setPaymentState({ status: 'blocked', message: 'Не удалось сохранить разрешение на проверку оплаты в этой вкладке.' })
      return
    }
    try {
      window.location.assign(destination)
      setPaymentState({ status: 'success' })
    } catch {
      setPaymentState({ status: 'blocked', canCheck: true, message: 'Не удалось открыть страницу оплаты.' })
    }
  }

  const stateMessage = (state) => state.status === 'error' ? <p className="cart-error" role="alert">{state.message}</p> : state.status === 'loading' ? <p role="status">Проверяем…</p> : null

  return <main className="checkout-page section-shell" lang="ru">
    <h1>ОФОРМЛЕНИЕ ЗАКАЗА</h1>
    {orderState.status === 'success' ? <section className="cart-panel checkout-order-success" role="status">
      <h2>Заказ № {orderState.order.orderNumber} создан</h2>
      <p>Итого: {formatRubles(orderState.order.total)}</p>
      <p>Заказ ещё не оплачен.</p>
      {canPay && <>
        <button type="button" className="button" disabled={['loading', 'success', 'blocked'].includes(paymentState.status)} onClick={initializePayment}>ПЕРЕЙТИ К ОПЛАТЕ</button>
        {paymentState.status === 'loading' && <p>Подготавливаем оплату…</p>}
        {paymentState.status === 'success' && <p>Оплата подготовлена.</p>}
        {(paymentState.status === 'success' || paymentState.canCheck)
          && <Link className="button" to="/payment-success">Проверить статус оплаты</Link>}
        {['error', 'blocked'].includes(paymentState.status) && <p className="cart-error" role="alert">{paymentState.message}</p>}
      </>}
      {(orderState.cleanupWarning || storageError) && <p className="cart-error">Заказ создан, но не удалось полностью очистить локальные данные. Не оформляйте его повторно.</p>}
      <Link className="button" to="/catalog">ПЕРЕЙТИ В КАТАЛОГ</Link>
    </section> : <>
    {pending.status === 'error' && <section className="cart-panel" role="alert"><p>Не удалось восстановить незавершённый запрос: хранилище недоступно или данные повреждены. Новый заказ заблокирован, чтобы избежать дубликата.</p><button type="button" className="button" onClick={() => setPending(recoverAttempt())}>ПОВТОРИТЬ ПРОВЕРКУ ХРАНИЛИЩА</button></section>}
    {pending.attempt && <section className="cart-panel checkout-recovery">
      <h2>НЕЗАВЕРШЁННЫЙ ЗАПРОС</h2>
      <p>Сохранён исходный запрос. Повторная отправка использует те же данные и ключ, даже если форма или корзина изменились.</p>
      <p className="checkout-note">Имя, телефон и адрес хранятся в этом браузере для восстановления запроса. На общем устройстве они доступны другим пользователям и скриптам сайта.</p>
      <button type="button" className="button" disabled={submitting} onClick={() => submitOrder(true)}>ПОВТОРИТЬ ИСХОДНЫЙ ЗАПРОС</button>
    </section>}
    {submitting && <p role="status">Создаём заказ… Не закрывайте страницу.</p>}
    {orderState.status === 'error' && <div className="cart-error" role="alert"><p>{orderState.message}</p>{orderState.retryAfter && <p>Retry-After: {orderState.retryAfter}</p>}</div>}
    {!hasItems ? <div className="cart-empty"><h2>Ваша корзина пуста</h2><p>Добавьте ароматы, чтобы перейти к оформлению.</p><Link className="button" to="/catalog">ПЕРЕЙТИ В КАТАЛОГ</Link></div> : <>
      <Link className="checkout-back" to="/cart">Вернуться в корзину</Link>
      {storageError && <p className="cart-error" role="alert">Не удалось сохранить корзину в браузере.</p>}
      <fieldset className="checkout-layout checkout-fields" disabled={submitting}><div className="checkout-details">
        <section className="cart-panel"><h2>КОНТАКТНЫЕ ДАННЫЕ</h2>
          <form onSubmit={checkCustomer} noValidate>
            <label htmlFor="checkout-name">Ваше имя</label><input id="checkout-name" autoComplete="given-name" required maxLength={100} value={name} aria-invalid={submitted && !name.trim()} onChange={(event) => { setName(event.target.value); invalidate(); setClient(idle) }} />
            {submitted && !name.trim() && <p className="checkout-field-error" role="alert">Введите ваше имя.</p>}
            <label htmlFor="checkout-phone">Телефон</label><input id="checkout-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+7 (999) 123-45-67" required maxLength={24} value={phone} aria-invalid={submitted && !phoneValue} onBlur={normalizePhoneOnBlur} onChange={(event) => { setPhone(event.target.value); invalidate(); setClient(idle) }} />
            {submitted && !phoneValue && <p className="checkout-field-error" role="alert">Введите российский номер: +7 или 8 и ещё 10 цифр.</p>}
            <label htmlFor="checkout-comment">Комментарий к заказу (необязательно)</label><textarea id="checkout-comment" maxLength={2000} rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
            <button className="button" disabled={client.status === 'loading'}>ПЕРЕЙТИ К ДОСТАВКЕ</button>
          </form>
          {stateMessage(client)}
          {!deliveryConfigured && <p className="cart-error" role="alert">Сервис доставки пока не настроен. Проверка адреса и стоимости временно недоступна.</p>}
        </section>
        <section className="cart-panel"><h2>ДОСТАВКА OZON</h2>
          {!eligible ? <p className="checkout-note">Заполните контактные данные и перейдите к доставке.</p> : <>
            <label htmlFor="checkout-address">Адрес для поиска пункта выдачи</label>
            <input id="checkout-address" autoComplete="off" value={address} onChange={(event) => { invalidate(); setSelected(null); setSuggestions(idle); setAddress(event.target.value) }} aria-describedby="checkout-address-help" />
            <p id="checkout-address-help" className="checkout-note">Введите не менее двух символов и выберите адрес из списка.</p>
            {stateMessage(suggestions)}
            {suggestions.status === 'error' && <button className="cart-text-button" onClick={() => setAddressAttempt((value) => value + 1)}>Повторить поиск</button>}
            {suggestions.status === 'success' && !selected && (suggestions.items.length ? <ul className="checkout-suggestions" aria-label="Варианты адреса">{suggestions.items.map((item, index) => <li key={`${item.address}-${index}`}><button type="button" onClick={() => { invalidate(); setSelected(item); setAddress(item.address); setCity(typeof item.city === 'string' ? item.city.trim() : ''); setSuggestions(idle) }}>{item.address}</button></li>)}</ul> : <p role="status">Адреса не найдены. Уточните запрос.</p>)}
            <label htmlFor="checkout-city">Город или населённый пункт</label>
            <input id="checkout-city" name="city" autoComplete="address-level2" required maxLength={200} value={city} aria-invalid={deliverySubmitted && !city.trim()} aria-describedby="checkout-city-help" onChange={(event) => { setCity(event.target.value); invalidate() }} />
            <p id="checkout-city-help" className="checkout-note">Проверьте город из выбранного адреса. Если он не указан, введите его вручную.</p>
            {deliverySubmitted && !city.trim() && <p className="checkout-field-error" role="alert">Введите город или населённый пункт.</p>}
            {selected && <button type="button" className="button" disabled={pickup.status === 'loading'} onClick={verifyPickup}>НАЙТИ ПУНКТ ВЫДАЧИ</button>}
            {stateMessage(pickup)}
            {pickup.status === 'success' && <div className="checkout-pickup"><h3>{pickup.point.name}</h3><p>{pickup.point.address}</p>
              {Number.isFinite(pickup.point.distanceMeters) && <p>Расстояние: {Math.round(pickup.point.distanceMeters)} м</p>}
              {Number.isFinite(pickup.point.storagePeriodDays) && <p>Срок хранения: {pickup.point.storagePeriodDays} дн.</p>}
              <button type="button" className="button" disabled={!totals || estimate.status === 'loading'} onClick={confirmPickup}>{confirmed ? 'ПОВТОРИТЬ РАСЧЁТ' : 'ПОДТВЕРДИТЬ ПУНКТ'}</button>
              {confirmed && <p>Пункт выдачи подтверждён.</p>}
            </div>}
            {stateMessage(estimate)}
            {delivery && <div className="checkout-delivery" role="status"><p>Доставка доступна</p>{Number.isFinite(delivery.estimatedDeliveryDays) && <p>Ориентировочный срок: {delivery.estimatedDeliveryDays} дн.</p>}<p>Стоимость доставки: {formatRubles(delivery.customerDeliveryPrice)}</p></div>}
            {confirmed && estimate.status === 'success' && !delivery && <p role="status">Корзина или промокод изменились. Повторите расчёт доставки.</p>}
          </>}
        </section>
      </div><aside className="checkout-sidebar">
        <div onClickCapture={markPromoTransition} onSubmitCapture={markPromoTransition}><CartPromo onPricingModeChange={handlePromoChange} /></div>
        <section className="cart-panel cart-summary"><h2>ВАШ ЗАКАЗ</h2><p>Товары ({cartCount} шт.)</p>
          {data.status === 'loading' && <p role="status">Загружаем актуальные цены…</p>}
          {(data.status === 'error' || (data.status === 'success' && !totals)) && <div className="cart-error" role="alert"><p>Не удалось рассчитать стоимость товаров. Проверьте корзину или повторите загрузку.</p><button type="button" className="cart-text-button" onClick={() => { setData({ status: 'loading' }); setAttempt((value) => value + 1) }}>Повторить</button></div>}
          <dl><div><dt>Стоимость товаров</dt><dd>{totals ? formatRubles(totals.subtotal) : 'Недоступна'}</dd></div><div><dt>Скидка по промокоду</dt><dd>{totals ? formatRubles(-totals.discount) : 'Недоступна'}</dd></div><div><dt>Доставка</dt><dd>{delivery ? formatRubles(delivery.customerDeliveryPrice) : 'Не рассчитана'}</dd></div><div className="cart-summary-total"><dt>ПРЕДВАРИТЕЛЬНО ИТОГО</dt><dd>{totals && delivery && Number.isFinite(totals.total + delivery.customerDeliveryPrice) ? formatRubles(totals.total + delivery.customerDeliveryPrice) : 'Не рассчитано'}</dd></div></dl>
          <p className="checkout-note">Предварительная оценка. Окончательная сумма будет подтверждена при оформлении заказа.</p>
        </section>
        <section className="cart-panel"><h2>ПОДТВЕРЖДЕНИЕ ЗАКАЗА</h2><button className="button" type="button" disabled={!checkoutReady} onClick={() => submitOrder()}>ПОДТВЕРДИТЬ ЗАКАЗ</button><p className="checkout-note">Для подтверждения заполните контакты и город, проверьте пункт выдачи и рассчитайте доставку. Промокод должен быть проверен или удалён. Недействительный код не используется.</p><p className="checkout-note">Подтверждение создаёт неоплаченный заказ.{!WEBSITE_OZON_PAY_ENABLED && ' Оплата пока недоступна.'}</p></section>
      </aside></fieldset>
    </>}
    </>}
  </main>
}
export default Checkout
