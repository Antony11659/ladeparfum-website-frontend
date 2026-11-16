import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/cartContext.js'
import CartItem from '../components/CartItem.jsx'
import CartPromo from '../components/CartPromo.jsx'
import { fetchPerfumes, fetchPrices } from '../services/perfumeApi.js'
import { calculateCartTotals, formatRubles, resolveCartLines } from '../services/cartPricing.js'
import './Cart.css'

function Cart() {
  const { cartItems, cartCount, storageError } = useCart()
  const [data, setData] = useState({ status: 'loading', perfumes: [], prices: [] })
  const [request, setRequest] = useState(0)
  const [pricingMode, setPricingMode] = useState('website')
  const hasItems = cartItems.length > 0

  useEffect(() => {
    if (!hasItems) return
    const controller = new AbortController()
    Promise.all([fetchPerfumes({ signal: controller.signal }), fetchPrices({ signal: controller.signal })])
      .then(([perfumes, prices]) => {
        if (!controller.signal.aborted) setData({ status: 'success', perfumes, prices })
      })
      .catch(() => {
        if (!controller.signal.aborted) setData({ status: 'error', perfumes: [], prices: [] })
      })
    return () => controller.abort()
  }, [hasItems, request])

  useEffect(() => { window.scrollTo(0, 0) }, [])

  const lines = data.status === 'success' ? resolveCartLines(cartItems, data.perfumes, data.prices, pricingMode) : []
  const totals = calculateCartTotals(lines)

  function retry() {
    setData({ status: 'loading', perfumes: [], prices: [] })
    setRequest((current) => current + 1)
  }

  return (
    <main className="cart-page section-shell" lang="ru">
      <h1>КОРЗИНА</h1>
      {storageError && <p className="cart-error" role="alert">Не удалось сохранить корзину в браузере. После обновления страницы изменения могут быть потеряны.</p>}
      {!hasItems ? <div className="cart-empty">
        <h2>Ваша корзина пуста</h2>
        <p>Добавьте ароматы из каталога, чтобы оформить заказ.</p>
        <Link className="button" to="/catalog">ПЕРЕЙТИ В КАТАЛОГ</Link>
      </div> : <>
        <p className="cart-intro">В корзине — флаконы La De Parfum. Ароматы вдохновлены указанными референсами и не являются оригинальной продукцией этих брендов.</p>
        <div className="cart-layout">
          <section className="cart-items" aria-labelledby="cart-items-title" aria-busy={data.status === 'loading'}>
            <h2 id="cart-items-title">ВАШИ ТОВАРЫ</h2>
            {data.status === 'loading' && <p className="cart-state" role="status">Загружаем товары и актуальные цены…</p>}
            {data.status === 'error' && <div className="cart-error" role="alert"><p>Не удалось загрузить товары и цены. Сумма заказа недоступна.</p><button className="button" type="button" onClick={retry}>Повторить</button></div>}
            {data.status === 'success' && lines.map((item) => <CartItem key={item.variantId} item={item} />)}
            {data.status === 'error' && cartItems.map((item) => <CartItem key={item.variantId} item={{ ...item, error: 'Данные товара временно недоступны.' }} />)}
          </section>
          <div className="cart-sidebar">
            <CartPromo onPricingModeChange={setPricingMode} />
            <section className="cart-panel cart-summary" aria-labelledby="cart-summary-title">
              <h2 id="cart-summary-title">ВАШ ЗАКАЗ</h2>
              <p className="cart-summary-count">Товары ({cartCount} шт.)</p>
              <dl aria-live="polite">
                <div><dt>Стоимость товаров</dt><dd>{totals ? formatRubles(totals.subtotal) : 'Недоступна'}</dd></div>
                <div><dt>Скидка</dt><dd>{totals ? formatRubles(totals.discount === 0 ? 0 : -totals.discount) : 'Недоступна'}</dd></div>
                <div className="cart-summary-total"><dt>ИТОГО</dt><dd>{totals ? formatRubles(totals.total) : 'Недоступно'}</dd></div>
              </dl>
              {data.status === 'success' && !totals && <p className="cart-error" role="alert">Не удалось рассчитать сумму. Проверьте недоступные товары или цены.</p>}
              <p className="cart-summary-note">Предварительная стоимость. Доставка будет рассчитана при оформлении заказа.</p>
              {data.status === 'success' && totals ? <Link className="button cart-checkout" to="/checkout">ОФОРМИТЬ ЗАКАЗ</Link> : <button className="button cart-checkout" type="button" disabled>ОФОРМИТЬ ЗАКАЗ</button>}
              <p id="cart-checkout-note" className="cart-summary-note">На следующем шаге можно проверить доставку. Оплата пока недоступна.</p>
            </section>
          </div>
        </div>
      </>}
    </main>
  )
}

export default Cart
