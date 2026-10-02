import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { env } from '../config/env.js'

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, enterpriseId: user.enterpriseId?.toString() },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn },
  )
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret)
}

export function signRefreshToken(user) {
  // jti makes every issued token byte-distinct even when two are signed for
  // the same user within the same second (JWT `iat` only has 1s resolution) —
  // without it, rapid login+refresh calls could mint identical tokens and
  // collide on the RefreshToken collection's unique tokenHash index.
  return jwt.sign({ sub: user._id.toString(), jti: crypto.randomUUID() }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  })
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret)
}

/** Refresh tokens are stored hashed (never in plaintext) so a DB leak alone can't be replayed. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}
