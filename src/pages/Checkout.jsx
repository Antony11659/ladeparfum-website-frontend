import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/cartContext.js'
import CartPromo from '../components/CartPromo.jsx'
import { fetchPerfumes, fetchPrices } from '../services/perfumeApi.js'
import { calculateCartTotals, formatRubles, resolveCartLines } from '../services/cartPricing.js'
import { deliveryConfigured, deliveryRequest, normalizeRussianPhone } from '../services/deliveryApi.js'
import './Cart.css'
import './Checkout.css'

const idle = { status: 'idle' }
const validCoordinates = (value) => typeof value?.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180

function Checkout() {
  const { cartItems, cartCount, storageError } = useCart()
  const [data, setData] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [pricingMode, setPricingMode] = useState('website')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [client, setClient] = useState(idle)
  const [address, setAddress] = useState('')
  const [selected, setSelected] = useState(null)
  const [suggestions, setSuggestions] = useState(idle)
  const [addressAttempt, setAddressAttempt] = useState(0)
  const [pickup, setPickup] = useState(idle)
  const [confirmed, setConfirmed] = useState(false)
  const [estimate, setEstimate] = useState(idle)
  const generation = useRef(0)
  const operations = useRef(new Set())
  const phoneValue = normalizeRussianPhone(phone)
  const hasItems = cartItems.length > 0
  const lines = data.status === 'success' ? resolveCartLines(cartItems, data.perfumes, data.prices, pricingMode) : []
  const totals = calculateCartTotals(lines)
  const pricingKey = JSON.stringify([cartItems, pricingMode, totals?.total])
  const delivery = estimate.status === 'success' && estimate.key === pricingKey ? estimate.delivery : null
  const eligible = client.status === 'success' && client.phone === phoneValue && Boolean(name.trim())

  useEffect(() => {
    window.scrollTo(0, 0)
    const active = operations.current
    return () => { active.forEach((controller) => controller.abort()) }
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

  function verifyPickup() {
    invalidate()
    run(setPickup, async (signal) => {
      const result = await deliveryRequest('verify-pvz', { latitude: selected.latitude, longitude: selected.longitude }, signal)
      if (result.found === false) throw new Error('Рядом с выбранным адресом пункт выдачи Ozon не найден. Попробуйте другой адрес.')
      const point = result.point
      if (result.found !== true || !point || !['string', 'number'].includes(typeof point.deliveryPointId) || !String(point.deliveryPointId).trim() || typeof point.name !== 'string' || typeof point.address !== 'string') throw new Error('Не удалось получить данные пункта выдачи. Выберите другой адрес или повторите попытку.')
      return { point }
    })
  }

  function confirmPickup() {
    setConfirmed(true)
    if (!eligible || !totals || !pickup.point) return
    const key = pricingKey
    run(setEstimate, async (signal) => {
      const result = await deliveryRequest('checkout', { phone: phoneValue, deliveryPointId: pickup.point.deliveryPointId, declaredValue: totals.total }, signal)
      if (result.available !== true) throw new Error('Доставка недоступна. Попробуйте другой адрес или повторите расчёт.')
      if (typeof result.delivery?.customerDeliveryPrice !== 'number' || !Number.isFinite(result.delivery.customerDeliveryPrice) || result.delivery.customerDeliveryPrice < 0) throw new Error('Стоимость доставки недоступна. Повторите расчёт.')
      return { key, delivery: result.delivery }
    })
  }

  const stateMessage = (state) => state.status === 'error' ? <p className="cart-error" role="alert">{state.message}</p> : state.status === 'loading' ? <p role="status">Проверяем…</p> : null

  return <main className="checkout-page section-shell" lang="ru">
    <h1>ОФОРМЛЕНИЕ ЗАКАЗА</h1>
    {!hasItems ? <div className="cart-empty"><h2>Ваша корзина пуста</h2><p>Добавьте ароматы, чтобы перейти к оформлению.</p><Link className="button" to="/catalog">ПЕРЕЙТИ В КАТАЛОГ</Link></div> : <>
      <Link className="checkout-back" to="/cart">Вернуться в корзину</Link>
      {storageError && <p className="cart-error" role="alert">Не удалось сохранить корзину в браузере.</p>}
      <div className="checkout-layout"><div className="checkout-details">
        <section className="cart-panel"><h2>КОНТАКТНЫЕ ДАННЫЕ</h2>
          <form onSubmit={checkCustomer} noValidate>
            <label htmlFor="checkout-name">Ваше имя</label><input id="checkout-name" autoComplete="given-name" required maxLength={100} value={name} aria-invalid={submitted && !name.trim()} onChange={(event) => { setName(event.target.value); invalidate(); setClient(idle) }} />
            {submitted && !name.trim() && <p className="checkout-field-error" role="alert">Введите ваше имя.</p>}
            <label htmlFor="checkout-phone">Телефон</label><input id="checkout-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+7 (999) 123-45-67" required maxLength={24} value={phone} aria-invalid={submitted && !phoneValue} onChange={(event) => { setPhone(event.target.value); invalidate(); setClient(idle) }} />
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
            {suggestions.status === 'success' && !selected && (suggestions.items.length ? <ul className="checkout-suggestions" aria-label="Варианты адреса">{suggestions.items.map((item, index) => <li key={`${item.address}-${index}`}><button type="button" onClick={() => { invalidate(); setSelected(item); setAddress(item.address); setSuggestions(idle) }}>{item.address}</button></li>)}</ul> : <p role="status">Адреса не найдены. Уточните запрос.</p>)}
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
        <CartPromo onPricingModeChange={setPricingMode} />
        <section className="cart-panel cart-summary"><h2>ВАШ ЗАКАЗ</h2><p>Товары ({cartCount} шт.)</p>
          {data.status === 'loading' && <p role="status">Загружаем актуальные цены…</p>}
          {(data.status === 'error' || (data.status === 'success' && !totals)) && <div className="cart-error" role="alert"><p>Не удалось рассчитать стоимость товаров. Проверьте корзину или повторите загрузку.</p><button type="button" className="cart-text-button" onClick={() => { setData({ status: 'loading' }); setAttempt((value) => value + 1) }}>Повторить</button></div>}
          <dl><div><dt>Стоимость товаров</dt><dd>{totals ? formatRubles(totals.subtotal) : 'Недоступна'}</dd></div><div><dt>Скидка по промокоду</dt><dd>{totals ? formatRubles(-totals.discount) : 'Недоступна'}</dd></div><div><dt>Доставка</dt><dd>{delivery ? formatRubles(delivery.customerDeliveryPrice) : 'Не рассчитана'}</dd></div><div className="cart-summary-total"><dt>ПРЕДВАРИТЕЛЬНО ИТОГО</dt><dd>{totals && delivery && Number.isFinite(totals.total + delivery.customerDeliveryPrice) ? formatRubles(totals.total + delivery.customerDeliveryPrice) : 'Не рассчитано'}</dd></div></dl>
          <p className="checkout-note">Предварительная оценка. Окончательная сумма будет подтверждена при оформлении заказа.</p>
        </section>
        <section className="cart-panel"><h2>ОПЛАТА</h2><h3>Ozon Pay</h3><p className="checkout-note">Оплата будет проходить безопасно на платёжной странице Ozon Pay.</p><button className="button" type="button" disabled aria-describedby="checkout-payment-note">ПЕРЕЙТИ К ОПЛАТЕ</button><p id="checkout-payment-note" className="checkout-note">Скоро. Создание заказа и оплата пока недоступны.</p></section>
      </aside></div>
    </>}
  </main>
}
export default Checkout
