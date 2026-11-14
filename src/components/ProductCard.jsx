import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import PerfumePlaceholder from './PerfumePlaceholder.jsx'

function ProductCard({ id, brand, name, price, variant, presentation, imageUrl }) {
  const [failedImage, setFailedImage] = useState(null)
  const isCatalog = presentation === 'catalog'
  const showImage = isCatalog && imageUrl && failedImage !== imageUrl
  const content = (
    <>
      <div className="product-image">
        {showImage ? <img src={imageUrl} alt={`${brand} ${name}`} loading="lazy" onError={() => setFailedImage(imageUrl)} /> : <PerfumePlaceholder variant={variant} />}
        {isCatalog ? <span className="icon-button favorite-button" aria-hidden="true"><Icon name="heart" /></span> : <button className="icon-button favorite-button" type="button" aria-label={`В избранное: ${brand} ${name}`}><Icon name="heart" /></button>}
        {!isCatalog && <span className="mock-label">МАКЕТ</span>}
      </div>
      <div className="product-info">
        <p className="product-brand">{brand}</p>
        <h3>{name}</h3>
        {!isCatalog && <>
        <p className="product-price">от {price} ₽</p>
        <button className="button product-button" type="button" aria-label={`Подробнее об аромате ${brand} ${name}`}>ПОДРОБНЕЕ <Icon name="arrow" /></button>
        </>}
      </div>
    </>
  )
  return (
    <article className={`product-card${isCatalog ? ' product-card--catalog' : ''}`}>
      {isCatalog ? <Link className="product-card-link" to={`/product/${id}`}>{content}</Link> : content}
    </article>
  )
}

export default ProductCard
