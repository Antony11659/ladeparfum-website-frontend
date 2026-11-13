import Icon from '../components/Icon.jsx'

const categories = [
  { name: 'ЖЕНСКИЕ', detail: 'Нежность и характер', style: 'women' },
  { name: 'МУЖСКИЕ', detail: 'Глубина и выразительность', style: 'men' },
  { name: 'УНИСЕКС', detail: 'Свобода быть собой', style: 'unisex' },
]

function CategoriesSection() {
  return (
    <section className="section-shell section-space" aria-labelledby="categories-title">
      <div className="section-heading"><h2 id="categories-title">ВЫБЕРИТЕ НАПРАВЛЕНИЕ</h2></div>
      <div className="category-grid">
        {categories.map((category) => (
          <div className={`category-card category-card--${category.style}`} key={category.name}>
            <span className="category-art" aria-hidden="true">✦</span>
            <h3>{category.name}</h3>
            <p>{category.detail}</p>
            <Icon name="arrow" />
          </div>
        ))}
      </div>
    </section>
  )
}

export default CategoriesSection
