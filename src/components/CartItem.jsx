import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/cartContext.js'
import { bottleImages } from '../config/bottleImages.js'
import { formatRubles } from '../services/cartPricing.js'
import PerfumePlaceholder from './PerfumePlaceholder.jsx'

function CartItem({ item }) {
  const { updateQuantity, removeItem } = useCart()
  const [failedImage, setFailedImage] = useState(null)
  const imageUrl = bottleImages[item.variant?.volume_ml]
  const label = item.product ? `${item.product.name}, ${item.variant.volume_ml} мл` : `вариант ${item.variantId}`

  return (
    <article className="cart-item">
      <div className="cart-item-image">
        {imageUrl && failedImage !== imageUrl ? <img src={imageUrl} alt={`Флакон La De Parfum, ${item.variant.volume_ml} мл`} loading="lazy" onError={() => setFailedImage(imageUrl)} /> : <PerfumePlaceholder />}
      </div>
      <div className="cart-item-info">
        <p className="cart-item-maker">La De Parfum</p>
        {item.product ? <>
          <h3><Link to={`/product/${item.product.id}`}>{item.product.name}</Link></h3>
          <p className="cart-item-reference">По мотивам {item.product.brand.name} {item.product.name}</p>
          <p>{item.variant.volume_ml} мл</p>
        </> : <h3>Вариант № {item.variantId}</h3>}
        {item.error ? <p className="cart-item-error" role="alert">{item.error}</p> : <>
          <p className="cart-unit-price">{formatRubles(item.unitPrice)} / шт.</p>
          <p className="cart-line-total">Сумма: {formatRubles(item.lineTotal)}</p>
        </>}
        <div className="cart-item-actions">
          <div className="cart-quantity" role="group" aria-label={`Количество: ${label}`}>
            <button type="button" aria-label={`Уменьшить количество: ${label}`} disabled={item.quantity === 1} onClick={() => updateQuantity(item.variantId, item.quantity - 1)}>−</button>
            <span aria-live="polite">{item.quantity}</span>
            <button type="button" aria-label={`Увеличить количество: ${label}`} disabled={!Number.isSafeInteger(item.quantity + 1)} onClick={() => updateQuantity(item.variantId, item.quantity + 1)}>+</button>
          </div>
          <button className="cart-remove" type="button" aria-label={`Удалить: ${label}`} onClick={() => removeItem(item.variantId)}>Удалить</button>
        </div>
      </div>
    </article>
  )
}

export default CartItem
