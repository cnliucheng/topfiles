import { toErrorResponse } from '../errors.js'

export function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export function sendError(res, err) {
  if (err.statusCode) {
    return sendJson(res, err.statusCode, toErrorResponse(err))
  }
  return sendJson(res, 500, toErrorResponse(err))
}