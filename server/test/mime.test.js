import { describe, it, expect } from 'vitest'
import { sniffMime } from '../src/utils/mime.js'

describe('sniffMime', () => {
  it('returns text/plain for unknown', () => {
    expect(sniffMime('foo')).toBe('text/plain; charset=utf-8')
    expect(sniffMime('foo.unknownext')).toBe('text/plain; charset=utf-8')
  })

  it('handles common types', () => {
    expect(sniffMime('a.md')).toContain('text')
    expect(sniffMime('a.json')).toContain('json')
    expect(sniffMime('a.html')).toContain('html')
    expect(sniffMime('a.js')).toContain('javascript')
    expect(sniffMime('a.css')).toContain('css')
    expect(sniffMime('a.png')).toBe('image/png')
  })

  it('is case-insensitive', () => {
    expect(sniffMime('A.MD')).toContain('text')
  })
})
