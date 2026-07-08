import { describe, it, expect, beforeEach } from 'vitest'
import { RateLimiter } from '../src/utils/rateLimit.js'

describe('RateLimiter', () => {
  let limiter
  beforeEach(() => { limiter = new RateLimiter() })

  it('allows up to max in window', () => {
    expect(limiter.allow('k', 3, 1000)).toBe(true)
    expect(limiter.allow('k', 3, 1000)).toBe(true)
    expect(limiter.allow('k', 3, 1000)).toBe(true)
    expect(limiter.allow('k', 3, 1000)).toBe(false)
  })

  it('isolates keys', () => {
    limiter.allow('a', 1, 1000)
    expect(limiter.allow('b', 1, 1000)).toBe(true)
  })

  it('refills after window', async () => {
    expect(limiter.allow('k', 1, 50)).toBe(true)
    expect(limiter.allow('k', 1, 50)).toBe(false)
    await new Promise(r => setTimeout(r, 80))
    expect(limiter.allow('k', 1, 50)).toBe(true)
  })
})
