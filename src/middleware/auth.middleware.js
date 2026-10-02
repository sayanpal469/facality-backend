import { ApiError } from '../utils/ApiError.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { verifyAccessToken } from '../utils/tokens.js'
import { User } from '../models/User.js'

/**
 * Requires a valid access token. Populates req.user (full Mongo doc, minus
 * passwordHash) and req.auth (the raw decoded JWT payload: sub/role/enterpriseId).
 */
export const requireAuth = asyncHandler(async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) throw ApiError.unauthorized('Missing access token')

  let payload
  try {
    payload = verifyAccessToken(token)
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token')
  }

  const user = await User.findById(payload.sub)
  if (!user) throw ApiError.unauthorized('Account no longer exists')
  if (user.status !== 'active') throw ApiError.forbidden('Account is inactive')

  req.user = user
  req.auth = payload
  next()
})

/** Attaches req.user if a valid token is present, but never rejects the request. */
export const optionalAuth = asyncHandler(async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return next()

  try {
    const payload = verifyAccessToken(token)
    const user = await User.findById(payload.sub)
    if (user && user.status === 'active') {
      req.user = user
      req.auth = payload
    }
  } catch {
    // ignore — request proceeds unauthenticated
  }
  next()
})
