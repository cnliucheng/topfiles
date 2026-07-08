import { describe, it, expect } from 'vitest'
import { matchRoute } from '../src/utils/router.js'

const routes = {
  'GET /api/setup/status': () => 'status',
  'GET /api/files/:id': () => 'file',
  'GET /u/:filename': () => 'share',
}

describe('matchRoute', () => {
  it('matches exact path', () => {
    const m = matchRoute('GET', '/api/setup/status', routes)
    expect(m).toBeTruthy()
    expect(m.handler()).toBe('status')
    expect(m.params).toEqual({})
  })

  it('matches single param', () => {
    const m = matchRoute('GET', '/api/files/42', routes)
    expect(m.params).toEqual({ id: '42' })
  })

  it('decodes URI components', () => {
    const m = matchRoute('GET', '/u/my%20notes.md', routes)
    expect(m.params).toEqual({ filename: 'my notes.md' })
  })

  it('returns null for method mismatch', () => {
    expect(matchRoute('POST', '/api/setup/status', routes)).toBeNull()
  })

  it('returns null for path mismatch', () => {
    expect(matchRoute('GET', '/api/unknown', routes)).toBeNull()
  })

  it('returns null for param count mismatch', () => {
    expect(matchRoute('GET', '/api/files/42/extra', routes)).toBeNull()
  })
})