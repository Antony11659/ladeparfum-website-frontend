export async function activatePromo(code, { signal } = {}) {
  const response = await fetch('https://api.adminparfuma.ru/promo/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    signal,
  })
  if (response.status === 400) return { valid: false }
  if (!response.ok) throw new Error(`Ошибка API промокодов: ${response.status}`)
  const result = await response.json()
  if (result?.success === true && result.pricingMode === 'discount') return { valid: true }
  if (result?.success === false) return { valid: false }
  throw new Error('Некорректный ответ API промокодов')
}
