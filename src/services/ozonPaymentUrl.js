// Step 19 verified this exact HTTPS checkout host with a test-mode order.
const CHECKOUT_HOST = 'checkout.ozon.ru'

export function validateOzonPaymentUrl(payLink) {
  if (typeof payLink !== 'string' || !/^https:\/\/checkout\.ozon\.ru(?=[/?#]|$)/i.test(payLink)
    || /[\s\\]/.test(payLink) || /%(?![a-f0-9]{2})/i.test(payLink)
    || Array.from(payLink).some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || (code >= 127 && code <= 159)
    })) return null

  try {
    const url = new URL(payLink)
    if (url.protocol !== 'https:' || url.hostname !== CHECKOUT_HOST
      || url.username || url.password || url.port) return null
    return payLink
  } catch { return null }
}
