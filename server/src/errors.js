export class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

export function toErrorResponse(err) {
  if (err instanceof AppError) {
    return { error: { code: err.code, message: err.message } }
  }
  return { error: { code: 'INTERNAL', message: '服务器开小差' } }
}