import crypto from 'node:crypto'
import { env } from '../config/env.js'

// Reversible AES-256-GCM encryption for the few values the admin must be able
// to read back (the temporary password issued to a client login). Never use
// this for anything a user chose themselves — those stay bcrypt-only.
const key = crypto.createHash('sha256').update(env.credentialsSecret).digest()

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.')
}

export function decryptSecret(payload) {
  if (!payload) return null
  try {
    const [iv, tag, data] = payload.split('.').map((s) => Buffer.from(s, 'base64url'))
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null // key rotated or value tampered with
  }
}
