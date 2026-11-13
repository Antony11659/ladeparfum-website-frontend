import Icon from '../components/Icon.jsx'
import PerfumePlaceholder from '../components/PerfumePlaceholder.jsx'

function HeroSection() {
  return (
    <section className="hero section-shell" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow">ИСКУССТВО АРОМАТА</p>
        <h1 id="hero-title">Аромат, который<br /><em>расскажет о вас</em></h1>
        <p className="hero-description">Откройте мир исключительных ароматов.</p>
        <button className="button" type="button">ОТКРЫТЬ КАТАЛОГ <Icon name="arrow" /></button>
      </div>
      <figure className="hero-figure">
        <PerfumePlaceholder hero />
        <figcaption>Визуальный макет · не изображение товара</figcaption>
      </figure>
    </section>
  )
}

export default HeroSection
