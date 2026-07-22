import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../auth'

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  onAuthExpired: vi.fn(),
}))

import { api } from '../../api/client'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('starts uninitialized', () => {
    const auth = useAuthStore()
    expect(auth.user).toBeNull()
    expect(auth.isInitialized).toBeNull()
    expect(auth.isLoggedIn).toBe(false)
  })

  it('init sets isInitialized true when account exists', async () => {
    const auth = useAuthStore()
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { hasAccount: true } } as any)
      .mockResolvedValueOnce({ data: { username: 'admin' } } as any)

    await auth.init()

    expect(auth.isInitialized).toBe(true)
    expect(auth.user).toEqual({ username: 'admin' })
    expect(auth.isLoggedIn).toBe(true)
  })

  it('init sets isInitialized false when no account', async () => {
    const auth = useAuthStore()
    vi.mocked(api.get).mockResolvedValueOnce({ data: { hasAccount: false } } as any)

    await auth.init()

    expect(auth.isInitialized).toBe(false)
    expect(auth.user).toBeNull()
  })

  it('init handles /me failure gracefully', async () => {
    const auth = useAuthStore()
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { hasAccount: true } } as any)
      .mockRejectedValueOnce({ response: { status: 401 } } as any)

    await auth.init()

    expect(auth.isInitialized).toBe(true)
    expect(auth.user).toBeNull()
    expect(auth.isLoggedIn).toBe(false)
  })

  it('login sets user', async () => {
    const auth = useAuthStore()
    vi.mocked(api.post).mockResolvedValue({ data: { username: 'admin' } } as any)

    await auth.login('admin', 'password123')

    expect(auth.user).toEqual({ username: 'admin' })
    expect(auth.isLoggedIn).toBe(true)
  })

  it('setup sets user and isInitialized', async () => {
    const auth = useAuthStore()
    vi.mocked(api.post).mockResolvedValue({} as any)

    await auth.setup('admin', 'password123')

    expect(auth.isInitialized).toBe(true)
    expect(auth.user).toEqual({ username: 'admin' })
  })

  it('logout clears user', async () => {
    const auth = useAuthStore()
    auth.user = { username: 'admin' }
    vi.mocked(api.post).mockResolvedValue({} as any)

    await auth.logout()

    expect(auth.user).toBeNull()
    expect(auth.isLoggedIn).toBe(false)
  })

  it('reset clears user without API call', () => {
    const auth = useAuthStore()
    auth.user = { username: 'admin' }

    auth.reset()

    expect(auth.user).toBeNull()
    expect(auth.isLoggedIn).toBe(false)
  })
})
