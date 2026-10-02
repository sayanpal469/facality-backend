import { ApiError } from '../utils/ApiError.js'
import { env } from '../config/env.js'

export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`))
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500
  let message = err.message || 'Internal server error'
  let details = err.details

  // Translate common non-ApiError failures into clean, predictable responses.
  if (err.name === 'ValidationError') {
    statusCode = 400
    message = 'Validation failed'
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }))
  } else if (err.name === 'CastError') {
    statusCode = 400
    message = `Invalid value for "${err.path}"`
  } else if (err.code === 11000) {
    statusCode = 409
    const field = Object.keys(err.keyPattern || {}).join(', ') || 'field'
    message = `A record with this ${field} already exists`
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401
    message = 'Invalid or expired token'
  }

  if (!err.isOperational && statusCode >= 500) {
    console.error('[error]', err)
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    ...(details ? { details } : {}),
    ...(env.isProd ? {} : { stack: err.stack }),
  })
}
