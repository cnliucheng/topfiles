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

  it('recognizes common editable formats', () => {
    expect(sniffMime('notes.csv')).toBe('text/csv; charset=utf-8')
    expect(sniffMime('notes.tsv')).toBe('text/tab-separated-values; charset=utf-8')
    expect(sniffMime('schema.sql')).toBe('application/sql; charset=utf-8')
    expect(sniffMime('config.toml')).toBe('application/toml; charset=utf-8')
    expect(sniffMime('component.tsx')).toBe('text/typescript; charset=utf-8')
  })
})
