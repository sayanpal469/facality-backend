import fs from 'node:fs'
import { env } from '../config/env.js'
import { DeviceToken } from '../models/DeviceToken.js'

/**
 * Firebase Cloud Messaging. Initialised lazily from the service account in
 * env; without one, pushes are logged instead (development). Never throws.
 */

let messaging = null
let initialised = false

async function fcm() {
  if (initialised) return messaging
  initialised = true
  const { serviceAccountJson, serviceAccountPath } = env.push
  const raw = serviceAccountJson || (serviceAccountPath && fs.existsSync(serviceAccountPath) ? fs.readFileSync(serviceAccountPath, 'utf8') : '')
  if (!raw) return null
  try {
    const { initializeApp, cert } = await import('firebase-admin/app')
    const { getMessaging } = await import('firebase-admin/messaging')
    const app = initializeApp({ credential: cert(JSON.parse(raw)) }, 'push')
    messaging = getMessaging(app)
  } catch (err) {
    console.error('[push] Firebase init failed — pushes disabled:', err.message)
  }
  return messaging
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
])

/**
 * @param {Array<string>} userIds
 * @param {{ title: string, body: string, data?: Record<string, string> }} payload
 */
export async function pushToUsers(userIds, { title, body, data = {} }) {
  try {
    if (!userIds?.length) return 0
    const devices = await DeviceToken.find({ userId: { $in: userIds } }).select('token').lean()
    if (devices.length === 0) return 0
    const tokens = devices.map((d) => d.token)

    const client = await fcm()
    if (!client) {
      console.log(`[push] (not configured) → ${tokens.length} device(s): ${title} — ${body}`)
      return 0
    }

    // FCM data values must be strings.
    const stringData = Object.fromEntries(Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
    let sent = 0
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500)
      const res = await client.sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        data: stringData,
        android: { priority: 'high', notification: { channelId: 'updates' } },
        apns: { payload: { aps: { sound: 'default' } } },
      })
      sent += res.successCount
      const dead = res.responses.map((r, j) => (!r.success && INVALID_TOKEN_CODES.has(r.error?.code) ? batch[j] : null)).filter(Boolean)
      if (dead.length) await DeviceToken.deleteMany({ token: { $in: dead } })
    }
    return sent
  } catch (err) {
    console.error('[push] send failed:', err.message)
    return 0
  }
}
