const PERFUMES_URL = 'https://api.adminparfuma.ru/perfumes/'

export async function fetchPerfumes({ signal } = {}) {
  const response = await fetch(PERFUMES_URL, { signal })
  if (!response.ok) throw new Error(`Ошибка API: ${response.status}`)

  const perfumes = await response.json()
  if (!Array.isArray(perfumes) || !perfumes.every((perfume) => (
    perfume && (typeof perfume.id === 'number' || typeof perfume.id === 'string') &&
    typeof perfume.name === 'string' && typeof perfume.gender === 'string' &&
    perfume.brand && typeof perfume.brand.name === 'string' &&
    Array.isArray(perfume.images)
  ))) {
    throw new Error('Некорректный ответ каталога')
  }
  return perfumes
}

export function selectPerfumeImage(images = []) {
  const availableImages = images.filter((image) => image && typeof image.image_url === 'string' && image.image_url.trim())
  const primaryImage = availableImages.find((image) => image.is_primary === true)
  const firstImage = [...availableImages].sort((a, b) => (
    (Number.isFinite(a.sort_order) ? a.sort_order : Infinity) -
    (Number.isFinite(b.sort_order) ? b.sort_order : Infinity)
  ))[0]
  return (primaryImage || firstImage)?.image_url
}

export async function fetchPrices({ signal } = {}) {
  const response = await fetch('https://api.adminparfuma.ru/prices/', { signal })
  if (!response.ok) throw new Error(`Ошибка API цен: ${response.status}`)
  const prices = await response.json()
  if (!Array.isArray(prices) || !prices.every((price) => price && typeof price === 'object')) {
    throw new Error('Некорректный ответ API цен')
  }
  return prices
}
