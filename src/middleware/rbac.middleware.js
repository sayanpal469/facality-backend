import { ApiError } from '../utils/ApiError.js'

/** Route-level gate: only the listed roles may proceed. Requires requireAuth to run first. */
export function requireRole(...roles) {
  return function rbacMiddleware(req, res, next) {
    if (!req.user) return next(ApiError.unauthorized())
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`This action requires one of these roles: ${roles.join(', ')}`))
    }
    next()
  }
}
