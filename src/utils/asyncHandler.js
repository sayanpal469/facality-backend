/**
 * Wraps an async route/middleware handler so rejected promises are forwarded
 * to Express's error-handling middleware instead of crashing the process.
 * Express 5 does this automatically for route handlers, but wrapping keeps
 * behavior explicit and safe for any Express version / handler shape.
 */
export function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}
