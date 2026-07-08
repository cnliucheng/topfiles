import { describe, it, expect } from 'vitest'
import { signSession, verifySession } from '../src/auth/jwt.js'

const SECRET = new TextEncoder().encode('test-secret-32-bytes-long-12345')

describe('jwt', () => {
  it('signs and verifies a session token', async () => {
    const token = await signSession({ username: 'alice' }, SECRET)
    const payload = await verifySession(token, SECRET)
    expect(payload.username).toBe('alice')
    expect(payload.sub).toBe('user:1')
  })

  it('rejects tampered token', async () => {
    const token = await signSession({ username: 'alice' }, SECRET)
    await expect(verifySession(token + 'x', SECRET)).rejects.toThrow()
  })

  it('rejects expired token', async () => {
    const token = await signSession({ username: 'alice' }, SECRET, '-1s')
    await expect(verifySession(token, SECRET)).rejects.toThrow()
  })
})
