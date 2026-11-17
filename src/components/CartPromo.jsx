import { useEffect, useRef, useState } from 'react'
import { activatePromo } from '../services/promoApi.js'

const PROMO_STORAGE_KEY = 'ladeparfum_promo_v1'

function readSavedCode() {
  try {
    return (localStorage.getItem(PROMO_STORAGE_KEY) || '').trim().toUpperCase()
  } catch {
    return ''
  }
}

function CartPromo({ onPricingModeChange }) {
  const [request, setRequest] = useState(() => ({ code: readSavedCode(), attempt: 0 }))
  const [code, setCode] = useState(request.code)
  const [savedCode, setSavedCode] = useState(request.code)
  const [activeCode, setActiveCode] = useState('')
  const [status, setStatus] = useState(request.code ? 'loading' : 'idle')
  const [message, setMessage] = useState('')
  const [storageMessage, setStorageMessage] = useState('')
  const controllerRef = useRef(null)

  // Keep the first argument compatible with Cart's pricing-mode setter.
  // Only an API-validated code is exposed as active; input/saved codes are not.
  useEffect(() => {
    const validatedCode = status === 'success' && activeCode ? activeCode : null
    const pricingMode = validatedCode ? 'discount' : 'website'
    onPricingModeChange(pricingMode, { pricingMode, activeCode: validatedCode, validationStatus: status })
  }, [activeCode, status, onPricingModeChange])

  function storeCode(value) {
    try {
      if (value) localStorage.setItem(PROMO_STORAGE_KEY, value)
      else localStorage.removeItem(PROMO_STORAGE_KEY)
      setStorageMessage('')
    } catch {
      setStorageMessage('Не удалось сохранить изменение промокода в браузере. После обновления страницы потребуется повторная проверка.')
    }
    setSavedCode(value)
  }

  useEffect(() => {
    if (!request.code) return
    const controller = new AbortController()
    controllerRef.current = controller
    activatePromo(request.code, { signal: controller.signal })
      .then(({ valid }) => {
        if (controller.signal.aborted) return
        if (valid) {
          setActiveCode(request.code)
          storeCode(request.code)
          setStatus('success')
          setMessage('Промокод применён. Цены пересчитаны.')
        } else {
          setActiveCode('')
          storeCode('')
          setStatus('invalid')
          setMessage('Промокод недействителен. Проверьте код и попробуйте снова.')
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setActiveCode('')
        setStatus('error')
        setMessage('Не удалось проверить промокод. Пока действуют обычные цены. Повторите проверку.')
      })
    return () => controller.abort()
  }, [request])

  function validateCode(value) {
    const normalized = value.trim().toUpperCase()
    if (!normalized) {
      setMessage('Введите промокод.')
      return
    }
    controllerRef.current?.abort()
    setCode(normalized)
    setActiveCode('')
    setStatus('loading')
    setMessage('')
    setRequest((current) => ({ code: normalized, attempt: current.attempt + 1 }))
  }

  function removeCode() {
    controllerRef.current?.abort()
    setRequest((current) => ({ code: '', attempt: current.attempt + 1 }))
    setCode('')
    setActiveCode('')
    storeCode('')
    setStatus('idle')
    setMessage('Промокод удалён. Действуют обычные цены.')
  }

  return (
    <section className="cart-panel cart-promo" aria-labelledby="cart-promo-title">
      <h2 id="cart-promo-title">ПРОМОКОД</h2>
      <form onSubmit={(event) => { event.preventDefault(); validateCode(code) }}>
        <label htmlFor="cart-promo-code">Введите промокод</label>
        <input id="cart-promo-code" name="promo" placeholder="Введите промокод" value={code} onChange={(event) => setCode(event.target.value)} disabled={status === 'loading'} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
        <button className="button" type="submit" disabled={status === 'loading'}>{status === 'loading' ? 'ПРОВЕРЯЕМ…' : 'ПРИМЕНИТЬ'}</button>
      </form>
      {activeCode && <p className="cart-promo-active">Применён: {activeCode}</p>}
      {status === 'loading' && <p role="status">Проверяем промокод. До подтверждения действуют обычные цены.</p>}
      {message && <p role={status === 'error' || status === 'invalid' ? 'alert' : 'status'}>{message}</p>}
      {status === 'error' && <button className="cart-text-button" type="button" onClick={() => validateCode(request.code)}>Повторить проверку</button>}
      {(activeCode || savedCode || status === 'loading') && <button className="cart-text-button" type="button" onClick={removeCode}>Удалить промокод</button>}
      {storageMessage && <p role="alert">{storageMessage}</p>}
    </section>
  )
}

export default CartPromo
