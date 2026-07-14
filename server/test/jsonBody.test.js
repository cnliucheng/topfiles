import { describe, it, expect } from 'vitest'
import { readJsonBody } from '../src/utils/jsonBody.js'
import { Readable } from 'node:stream'

function reqFrom(str) {
  const r = new Readable({ read() {} })
  r.push(str)
  r.push(null)
  return r
}

describe('readJsonBody', () => {
  it('parses a json body', async () => {
    expect(await readJsonBody(reqFrom('{"a":1}'))).toEqual({ a: 1 })
  })

  it('returns empty object for empty body', async () => {
    expect(await readJsonBody(reqFrom(''))).toEqual({})
  })

  it('rejects oversized body with 413', async () => {
    const req = reqFrom('x'.repeat(1024 * 1024 + 2048))
    await expect(readJsonBody(req)).rejects.toMatchObject({ statusCode: 413, code: 'CONTENT_TOO_LARGE' })
  })

  it('rejects invalid json with 400', async () => {
    const req = reqFrom('{not json')
    await expect(readJsonBody(req)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_JSON' })
  })
})
