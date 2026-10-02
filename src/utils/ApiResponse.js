export class ApiResponse {
  constructor(statusCode, data, message = 'Success', meta) {
    this.success = statusCode < 400
    this.statusCode = statusCode
    this.message = message
    this.data = data
    if (meta) this.meta = meta
  }
}

export function sendResponse(res, statusCode, data, message, meta) {
  return res.status(statusCode).json(new ApiResponse(statusCode, data, message, meta))
}
