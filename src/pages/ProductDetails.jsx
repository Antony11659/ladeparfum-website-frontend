import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCart } from '../context/cartContext.js'
import ProductGallery from '../components/ProductGallery.jsx'
import { fetchPerfumes, fetchPrices } from '../services/perfumeApi.js'
import { bottleImages } from '../config/bottleImages.js'
import './ProductDetails.css'

function ProductDetailsContent({ id }) {
  const { addItem, cartCount } = useCart()
  const [cartMessage, setCartMessage] = useState('')
  const [status, setStatus] = useState('loading')
  const [product, setProduct] = useState(null)
  const [prices, setPrices] = useState([])
  const [priceError, setPriceError] = useState(false)
  const [selectedVolume, setSelectedVolume] = useState(null)
  const [request, setRequest] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function loadProduct() {
      try {
        const perfumes = await fetchPerfumes({ signal: controller.signal })
        if (controller.signal.aborted) return
        const perfume = perfumes.find((item) => String(item.id) === id)
        if (!perfume) {
          setStatus('not-found')
          return
        }
        setProduct(perfume)
        try {
          const priceList = await fetchPrices({ signal: controller.signal })
          if (controller.signal.aborted) return
          setPrices(priceList)
          setPriceError(false)
        } catch {
          if (controller.signal.aborted) return
          setPriceError(true)
          setPrices([])
        }
        setStatus('success')
      } catch {
        if (!controller.signal.aborted) setStatus('error')
      }
    }
    loadProduct()
    return () => controller.abort()
  }, [id, request])

  useEffect(() => { window.scrollTo(0, 0) }, [id])

  function retry() {
    setStatus('loading')
    setRequest((value) => value + 1)
  }

  const availableVolumes = Object.keys(bottleImages).map(Number).filter((volume) => (
    product?.variants?.some((variant) => variant.volume_ml === volume) &&
    prices.some((price) => price.volume_ml === volume && Number.isFinite(price.website_price) && price.website_price > 0)
  )).sort((a, b) => a - b)
  const volume = availableVolumes.includes(selectedVolume) ? selectedVolume : availableVolumes[0]
  const selectedPrice = prices.find((price) => price.volume_ml === volume && Number.isFinite(price.website_price) && price.website_price > 0)?.website_price

  const selectedVariant = product?.variants?.find((variant) => variant.volume_ml === volume)
  const canAddToCart = Number.isSafeInteger(selectedVariant?.id) && selectedVariant.id > 0 && selectedPrice !== undefined

  function addToCart() {
    if (!canAddToCart) return
    addItem(selectedVariant.id)
    setCartMessage(`Товар добавлен в корзину. Всего флаконов: ${cartCount + 1}.`)
  }

  return (
    <main className="product-details section-shell" lang="ru">
      <Link className="product-back" to="/catalog">← В каталог</Link>
      {status === 'loading' && <p className="product-state" role="status">Загружаем аромат и цены…</p>}
      {status === 'error' && <div className="product-state" role="alert"><p>Не удалось загрузить аромат. Проверьте подключение и попробуйте ещё раз.</p><button className="button" type="button" onClick={retry}>Повторить</button></div>}
      {status === 'not-found' && <div className="product-state"><h1>Аромат не найден</h1><p>Вернитесь в каталог, чтобы выбрать другой аромат.</p></div>}
      {status === 'success' && product && (
        <div className="product-details-layout">
          <ProductGallery product={product} volume={volume} />
          <div className="product-details-info">
            <p className="product-details-brand">{product.brand.name}</p>
            <h1>{product.name}</h1>
            <p className="product-inspiration">Аромат по мотивам {product.brand.name} {product.name}</p>
            <p className="product-disclaimer">La De Parfum — самостоятельный продукт, вдохновлённый указанным ароматом. Не является оригинальной продукцией указанного бренда.</p>
            {priceError ? <div className="product-price-error" role="alert"><p>Не удалось загрузить цены. Выбор объёма временно недоступен.</p><button type="button" onClick={retry}>Повторить загрузку цен</button></div> : availableVolumes.length ? (
              <>
                <fieldset className="product-volumes">
                  <legend>Объём флакона La De Parfum</legend>
                  {availableVolumes.map((item) => <button key={item} type="button" aria-pressed={volume === item} onClick={() => setSelectedVolume(item)}>{item} мл</button>)}
                </fieldset>
                <p className="product-details-price" aria-live="polite">{selectedPrice.toLocaleString('ru-RU')} ₽</p>
              </>
            ) : <p className="product-no-volumes">Нет доступных объёмов с актуальной ценой и фотографией флакона.</p>}
            <button className="button product-cart-button" type="button" disabled={!canAddToCart} onClick={addToCart}>В КОРЗИНУ</button>
            <p className="product-cart-note" role="status">{cartMessage}</p>
            {product.fragrance_family && <section className="product-characteristics"><h2>Характеристики аромата-референса</h2><dl><dt>Семейство ароматов</dt><dd>{product.fragrance_family}</dd></dl></section>}
          </div>
        </div>
      )}
    </main>
  )
}

function ProductDetails() {
  const { id } = useParams()
  return <ProductDetailsContent key={id} id={id} />
}

export default ProductDetails
