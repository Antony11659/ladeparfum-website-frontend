import { useEffect, useState } from 'react'
import ProductCard from '../components/ProductCard.jsx'
import { fetchPerfumes, selectPerfumeImage } from '../services/perfumeApi.js'
import './Catalog.css'

const genders = [
  { value: '', label: 'Все' },
  { value: 'F', label: 'Женские' },
  { value: 'M', label: 'Мужские' },
  { value: 'U', label: 'Унисекс' },
]

function perfumeCount(count) {
  const lastTwo = count % 100
  const last = count % 10
  const word = lastTwo >= 11 && lastTwo <= 14 ? 'ароматов' : last === 1 ? 'аромат' : last >= 2 && last <= 4 ? 'аромата' : 'ароматов'
  return `Найдено ${count} ${word}`
}

function Catalog() {
  const [perfumes, setPerfumes] = useState([])
  const [status, setStatus] = useState('loading')
  const [request, setRequest] = useState(0)
  const [search, setSearch] = useState('')
  const [gender, setGender] = useState('')
  const [brand, setBrand] = useState('')
  const [sorting, setSorting] = useState('asc')
  const [visibleCount, setVisibleCount] = useState(20)

  useEffect(() => {
    const controller = new AbortController()
    fetchPerfumes({ signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        setPerfumes(data)
        setStatus('success')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })
    return () => controller.abort()
  }, [request])

  function changeFilter(setValue, value) {
    setValue(value)
    setVisibleCount(20)
  }

  const brands = [...new Set(perfumes.map((perfume) => perfume.brand.name))]
    .sort((a, b) => a.localeCompare(b, ['ru', 'en']))
  const query = search.trim().toLocaleLowerCase()
  const matches = perfumes.filter((perfume) => (
    // The live API currently uses W; accept the documented F value too.
    (!gender || perfume.gender === gender || (gender === 'F' && perfume.gender === 'W')) &&
    (!brand || perfume.brand.name === brand) &&
    (!query || perfume.name.toLocaleLowerCase().includes(query) || perfume.brand.name.toLocaleLowerCase().includes(query))
  )).sort((a, b) => (
    (sorting === 'asc' ? 1 : -1) * a.name.localeCompare(b.name, ['ru', 'en'])
  ))

  function renderBrandFilter(id, label = 'Бренд') {
    return (
      <div className="catalog-brand-filter">
        <label htmlFor={id}>{label}</label>
        <select id={id} value={brand} onChange={(event) => changeFilter(setBrand, event.target.value)}>
          <option value="">Все бренды</option>
          {brands.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        {brand && <button type="button" onClick={() => changeFilter(setBrand, '')}>Сбросить бренд</button>}
      </div>
    )
  }

  return (
    <main className="catalog section-shell" lang="ru">
      <h1>КАТАЛОГ</h1>
      <label className="catalog-search">
        <span className="catalog-label">Поиск по названию или бренду</span>
        <input type="search" placeholder="Поиск аромата..." value={search} onChange={(event) => changeFilter(setSearch, event.target.value)} />
      </label>
      <div className="catalog-genders" role="group" aria-label="Категория аромата">
        {genders.map((item) => (
          <button key={item.value} type="button" aria-pressed={gender === item.value} onClick={() => changeFilter(setGender, item.value)}>{item.label}</button>
        ))}
      </div>
      <div className="catalog-layout">
        <aside className="catalog-sidebar" aria-labelledby="catalog-filters-title">
          <h2 id="catalog-filters-title">ФИЛЬТРЫ</h2>
          {renderBrandFilter('catalog-sidebar-brand', 'Бренды')}
        </aside>
        <div className="catalog-products">
          <div className="catalog-results-header">
            <p className="catalog-count" role="status">{status === 'loading' ? 'Загрузка ароматов…' : status === 'success' ? perfumeCount(matches.length) : 'Каталог недоступен'}</p>
            <div className="catalog-controls">
              <details className="catalog-filters">
                <summary>Фильтры{brand ? ' · 1' : ''}</summary>
                {renderBrandFilter('catalog-brand')}
              </details>
              <label className="catalog-sort">
                <span>Сортировка</span>
                <select value={sorting} onChange={(event) => changeFilter(setSorting, event.target.value)}>
                  <option value="asc">Название: А–Я</option>
                  <option value="desc">Название: Я–А</option>
                </select>
              </label>
            </div>
          </div>
          {status === 'loading' && <div className="catalog-message" role="status">Загружаем каталог ароматов…</div>}
          {status === 'error' && (
            <div className="catalog-message" role="alert">
              <p>Не удалось загрузить каталог. Проверьте подключение к интернету и попробуйте ещё раз.</p>
              <button className="button" type="button" onClick={() => { setStatus('loading'); setRequest((value) => value + 1) }}>Повторить</button>
            </div>
          )}
          {status === 'success' && (matches.length ? (
            <>
              <div className="catalog-grid">
                {matches.slice(0, visibleCount).map((perfume) => (
                  <ProductCard id={perfume.id} key={perfume.id} presentation="catalog" brand={perfume.brand.name} name={perfume.name} imageUrl={selectPerfumeImage(perfume.images)} />
                ))}
              </div>
              {visibleCount < matches.length && <button className="button catalog-more" type="button" onClick={() => setVisibleCount((count) => count + 20)}>ПОКАЗАТЬ ЕЩЁ</button>}
            </>
          ) : <p className="catalog-message">Ароматы не найдены. Попробуйте изменить поиск или фильтры.</p>)}
        </div>
      </div>
    </main>
  )
}

export default Catalog
