import ProductCard from '../components/ProductCard.jsx'

const products = [
  { brand: 'Louis Vuitton', name: 'Imagination', price: 690, variant: 'violet' },
  { brand: 'Creed', name: 'Aventus', price: 790, variant: 'dark' },
  { brand: 'Tom Ford', name: 'Oud Wood', price: 890, variant: 'amber' },
  { brand: 'Parfums de Marly', name: 'Delina', price: 790, variant: 'rose' },
]

function BestsellersSection() {
  return (
    <section className="section-shell section-space" aria-labelledby="bestsellers-title">
      <div className="section-heading"><h2 id="bestsellers-title">БЕСТСЕЛЛЕРЫ</h2><span className="gold-star" aria-hidden="true">✦</span></div>
      <p className="section-note">Примеры ароматов и цен · изображения условные</p>
      <div className="product-grid">{products.map((product) => <ProductCard key={product.name} {...product} />)}</div>
    </section>
  )
}

export default BestsellersSection
