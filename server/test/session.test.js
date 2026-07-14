import { describe, it, expect } from 'vitest'
import { authenticate } from '../src/auth/session.js'
import { signSession } from '../src/auth/jwt.js'

const SECRET = new TextEncoder().encode('secret-secret-secret-secret-32b')

function mockReq(cookie) {
  return { headers: cookie ? { cookie } : {} }
}

describe('authenticate', () => {
  it('sets req.user when cookie is a valid session', async () => {
    const token = await signSession({ username: 'alice' }, SECRET)
    const req = mockReq(`tf_session=${token}`)
    await authenticate(req, SECRET)
    expect(req.user.username).toBe('alice')
  })

  it('throws 401 without cookie', async () => {
    await expect(authenticate(mockReq(), SECRET)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 with a forged (non-JWT) cookie', async () => {
    const req = mockReq('tf_session=not-a-jwt')
    await expect(authenticate(req, SECRET)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 with a token signed by a different secret', async () => {
    const wrong = new TextEncoder().encode('wrong-wrong-wrong-wrong-wrong-32b')
    const token = await signSession({ username: 'alice' }, wrong)
    const req = mockReq(`tf_session=${token}`)
    await expect(authenticate(req, SECRET)).rejects.toMatchObject({ statusCode: 401 })
  })
})
