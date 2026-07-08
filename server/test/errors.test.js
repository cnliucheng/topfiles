import { describe, it, expect } from 'vitest'
import { AppError, toErrorResponse } from '../src/errors.js'
import { sendJson, sendError } from '../src/utils/json.js'

describe('errors', () => {
  it('AppError has statusCode, code, message', () => {
    const e = new AppError(401, 'UNAUTHENTICATED', '请先登录')
    expect(e.statusCode).toBe(401)
    expect(e.code).toBe('UNAUTHENTICATED')
    expect(e.message).toBe('请先登录')
    expect(e instanceof Error).toBe(true)
  })

  it('toErrorResponse converts AppError', () => {
    const e = new AppError(404, 'NOT_FOUND', 'x')
    expect(toErrorResponse(e)).toEqual({ error: { code: 'NOT_FOUND', message: 'x' } })
  })

  it('toErrorResponse handles unknown errors', () => {
    const e = new Error('boom')
    expect(toErrorResponse(e)).toEqual({ error: { code: 'INTERNAL', message: '服务器开小差' } })
  })
})

describe('json helpers', () => {
  function mockRes() {
    const headers = {}
    return {
      writeHead(status, h) { this.statusCode = status; Object.assign(headers, h); return this },
      end(body) { this.body = body; return this },
      statusCode: 200,
      headers,
      body: null,
    }
  }

  it('sendJson writes JSON', () => {
    const res = mockRes()
    sendJson(res, 201, { ok: true })
    expect(res.statusCode).toBe(201)
    expect(res.headers['Content-Type']).toContain('application/json')
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })

  it('sendError from AppError', () => {
    const res = mockRes()
    sendError(res, new AppError(409, 'CONFLICT', 'dup'))
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body)).toEqual({ error: { code: 'CONFLICT', message: 'dup' } })
  })

  it('sendError from plain Error returns 500', () => {
    const res = mockRes()
    sendError(res, new Error('x'))
    expect(res.statusCode).toBe(500)
  })
})
