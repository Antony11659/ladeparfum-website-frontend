import Icon from './Icon.jsx'
import PerfumePlaceholder from './PerfumePlaceholder.jsx'

function ProductCard({ brand, name, price, variant }) {
  return (
    <article className="product-card">
      <div className="product-image">
        <PerfumePlaceholder variant={variant} />
        <button className="icon-button favorite-button" type="button" aria-label={`В избранное: ${brand} ${name}`}><Icon name="heart" /></button>
        <span className="mock-label">МАКЕТ</span>
      </div>
      <div className="product-info">
        <p className="product-brand">{brand}</p>
        <h3>{name}</h3>
        <p className="product-price">от {price} ₽</p>
        <button className="button product-button" type="button" aria-label={`Подробнее об аромате ${brand} ${name}`}>ПОДРОБНЕЕ <Icon name="arrow" /></button>
      </div>
    </article>
  )
}

export default ProductCard
