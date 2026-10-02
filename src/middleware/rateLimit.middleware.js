import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'

// Automated tests hammer auth endpoints from one IP — limits apply everywhere else.
const skip = () => env.nodeEnv === 'test'

// Strict — login is a manually-triggered, brute-force-sensitive action.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { success: false, statusCode: 429, message: 'Too many attempts. Please try again later.' },
})

// Generous — refresh fires automatically on every tab/page load to silently
// restore a session (React StrictMode's dev double-effect alone doubles this),
// and it's gated by possession of a valid signed refresh token, not a
// guessable credential, so it doesn't need login's strict brute-force limit.
// Sharing that limit caused legitimate sessions to get force-logged-out after
// a handful of page loads/refreshes.
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { success: false, statusCode: 429, message: 'Too many requests. Please try again shortly.' },
})

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { success: false, statusCode: 429, message: 'Too many requests. Please slow down.' },
})
