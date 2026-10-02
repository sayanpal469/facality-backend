import crypto from 'node:crypto'
import { env } from '../config/env.js'

// Short-lived signed links let the mobile apps hand a PDF URL to the system
// browser, which can't send our Authorization header.

const sign = (payload) => crypto.createHmac('sha256', env.jwt.accessSecret).update(payload).digest('base64url')

/** Query string (`exp=…&sig=…`) authorising GET `path` for `ttlSeconds`. */
export function signPath(path, ttlSeconds = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  return `exp=${exp}&sig=${sign(`${path}:${exp}`)}`
}

export function verifySignedPath(path, { exp, sig }) {
  const expNum = Number(exp)
  if (!expNum || !sig || expNum < Date.now() / 1000) return false
  const expected = Buffer.from(sign(`${path}:${expNum}`))
  const given = Buffer.from(String(sig))
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}
