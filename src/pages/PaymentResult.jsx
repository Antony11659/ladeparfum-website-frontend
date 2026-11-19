import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getWebsitePaymentStatus, WEBSITE_OZON_PAY_ENABLED } from '../services/websitePaymentsApi.js'
import { clearPaymentReturnContext, readPaymentReturnContext } from '../services/paymentReturnContext.js'

const messages = {
  checking: 'Проверяем оплату…',
  disabled: 'Проверка оплаты пока недоступна',
  missing: 'Не удалось проверить оплату',
  authorization: 'Разрешение на проверку оплаты недействительно или истекло',
  error: 'Не удалось проверить оплату',
  paid: 'Оплата подтверждена',
  pending: 'Платёж обрабатывается',
  processing: 'Подготовка платежа ещё обрабатывается',
  recovery_required: 'Для проверки платежа нужно больше времени',
  unavailable: 'Платёж недоступен',
  not_started: 'Оплата ещё не начата',
}

async function checkPayment() {
  const context = readPaymentReturnContext()
  if (!context) return 'missing'
  try {
    const status = await getWebsitePaymentStatus(context)
    if (status === 'paid') clearPaymentReturnContext(context)
    return status
  } catch (error) {
    return [401, 403].includes(error.status) ? 'authorization' : 'error'
  }
}

export default function PaymentResult() {
  const [status, setStatus] = useState(WEBSITE_OZON_PAY_ENABLED ? 'checking' : 'disabled')
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    if (!WEBSITE_OZON_PAY_ENABLED) return
    // Reuse the initial request when StrictMode replays the effect.
    request.current ??= checkPayment()
    let active = true
    request.current.then((result) => { if (active) setStatus(result) })
    return () => { active = false }
  }, [attempt])

  function retry() {
    if (!request.current || status === 'checking') return
    request.current = null
    setStatus('checking')
    setAttempt(attempt + 1)
  }

  const canRetry = !['paid', 'disabled', 'missing', 'authorization'].includes(status)
  return <main className="checkout-page section-shell" lang="ru">
    <h1>СТАТУС ОПЛАТЫ</h1>
    <section className="cart-panel checkout-order-success">
      <div role="status">
        <h2>{messages[status]}</h2>
        {status === 'missing' && <p>Откройте страницу в той же вкладке, где была подготовлена оплата. Срок проверки мог истечь.</p>}
        {status === 'recovery_required' && <p>Попробуйте проверить статус позже или обратитесь за помощью.</p>}
      </div>
      {canRetry && <button className="button" type="button" disabled={status === 'checking'} onClick={retry}>Проверить ещё раз</button>}
      <Link className="button" to="/catalog">ПЕРЕЙТИ В КАТАЛОГ</Link>
    </section>
  </main>
}
