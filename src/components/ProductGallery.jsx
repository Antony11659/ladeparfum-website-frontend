import { useRef, useState } from 'react'
import PerfumePlaceholder from './PerfumePlaceholder.jsx'
import { selectPerfumeImage } from '../services/perfumeApi.js'
import { bottleImages } from '../config/bottleImages.js'

function ProductGallery({ product, volume }) {
  const [slide, setSlide] = useState(0)
  const [failedReference, setFailedReference] = useState(null)
  const [failedBottle, setFailedBottle] = useState(null)
  const touchStart = useRef(null)
  const referenceUrl = selectPerfumeImage(product.images)
  const bottleUrl = bottleImages[volume]

  function handleTouchEnd(event) {
    if (touchStart.current === null) return
    const distance = event.changedTouches[0].clientX - touchStart.current
    if (Math.abs(distance) > 50) setSlide((current) => 1 - current)
    touchStart.current = null
  }

  return (
    <section className="product-gallery" aria-label="Референс и флакон La De Parfum" aria-roledescription="карусель">
      <div className="product-gallery-stage" onTouchStart={(event) => { touchStart.current = event.touches[0].clientX }} onTouchEnd={handleTouchEnd} onTouchCancel={() => { touchStart.current = null }}>
        <figure hidden={slide !== 0} aria-label="Слайд 1 из 2">
          <figcaption>
            <h2>Аромат-референс</h2>
            <p>Изображение оригинального аромата используется только для сравнения.</p>
          </figcaption>
          <div className="product-gallery-image">
            {referenceUrl && failedReference !== referenceUrl ? (
              <img src={referenceUrl} alt={`Аромат-референс: ${product.brand.name} ${product.name}. Не продаваемый флакон.`} onError={() => setFailedReference(referenceUrl)} />
            ) : <PerfumePlaceholder />}
          </div>
        </figure>
        <figure hidden={slide !== 1} aria-label="Слайд 2 из 2">
          <figcaption>
            <h2>Что вы получите{volume ? ` · ${volume} мл` : ''}</h2>
            <p>Флакон La De Parfum. Объём соответствует выбранному.</p>
          </figcaption>
          <div className="product-gallery-image">
            {bottleUrl && failedBottle !== bottleUrl ? (
              <img src={bottleUrl} alt={`Флакон La De Parfum, ${volume} мл — товар, который вы получите`} onError={() => setFailedBottle(bottleUrl)} />
            ) : <div className="product-gallery-unavailable"><PerfumePlaceholder /><p>{volume ? 'Фотография флакона временно недоступна.' : 'Нет доступного объёма для показа флакона.'}</p></div>}
          </div>
        </figure>
      </div>
      <div className="product-gallery-navigation">
        <button type="button" aria-label="Предыдущий слайд" onClick={() => setSlide((current) => 1 - current)}>←</button>
        <div className="product-gallery-dots" role="group" aria-label="Выбор слайда">
          {['Аромат-референс', 'Что вы получите'].map((label, index) => (
            <button key={label} type="button" aria-label={label} aria-pressed={slide === index} onClick={() => setSlide(index)}><span /></button>
          ))}
        </div>
        <button type="button" aria-label="Следующий слайд" onClick={() => setSlide((current) => 1 - current)}>→</button>
      </div>
      <p className="product-gallery-position" aria-live="polite">{slide + 1} / 2 · {slide === 0 ? 'Аромат-референс' : 'Что вы получите'}</p>
    </section>
  )
}

export default ProductGallery
