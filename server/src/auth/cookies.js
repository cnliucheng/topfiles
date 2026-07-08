const COOKIE_NAME = 'tf_session'

export function buildSessionCookie(token, { secure, maxAge }) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0`
}

export function parseCookies(header) {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';')
      .map(c => c.trim())
      .filter(Boolean)
      .map(c => {
        const i = c.indexOf('=')
        return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]
      })
  )
}