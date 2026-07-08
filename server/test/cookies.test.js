import { describe, it, expect } from 'vitest'
import { buildSessionCookie, clearSessionCookie, parseCookies } from '../src/auth/cookies.js'

describe('cookies', () => {
  it('builds a session cookie', () => {
    const c = buildSessionCookie('the-token', { secure: true, maxAge: 3600 })
    expect(c).toContain('tf_session=the-token')
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Lax')
    expect(c).toContain('Path=/')
    expect(c).toContain('Max-Age=3600')
    expect(c).toContain('Secure')
  })

  it('omits Secure when not requested', () => {
    const c = buildSessionCookie('tok', { secure: false, maxAge: 60 })
    expect(c).not.toContain('Secure')
  })

  it('clears a session cookie', () => {
    const c = clearSessionCookie()
    expect(c).toContain('tf_session=')
    expect(c).toContain('Max-Age=0')
  })

  it('parses cookie header', () => {
    const cookies = parseCookies('a=1; b=hello%20world; c=3')
    expect(cookies).toEqual({ a: '1', b: 'hello world', c: '3' })
  })

  it('returns empty object for null/empty', () => {
    expect(parseCookies('')).toEqual({})
    expect(parseCookies(null)).toEqual({})
  })
})