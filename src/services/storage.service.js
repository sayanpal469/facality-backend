import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { env } from '../config/env.js'

/**
 * Where uploaded files live. MongoDB only ever stores the resulting URL and
 * key (BRD §11) — never the bytes. `local` writes under UPLOAD_DIR (served at
 * /uploads by app.js) for development; `s3` targets AWS S3 or any
 * S3-compatible store such as Cloudflare R2 for production.
 */

let s3Client = null
function s3() {
  if (!s3Client) {
    const { region, endpoint, accessKeyId, secretAccessKey } = env.storage.s3
    s3Client = new S3Client({
      region,
      endpoint,
      credentials: accessKeyId ? { accessKeyId, secretAccessKey } : undefined,
      forcePathStyle: Boolean(endpoint),
    })
  }
  return s3Client
}

function buildKey(folder, originalName) {
  const ext = path.extname(originalName || '').toLowerCase().replace(/[^.a-z0-9]/g, '')
  const day = new Date().toISOString().slice(0, 10)
  return `${folder}/${day}/${Date.now()}-${crypto.randomUUID()}${ext}`
}

/**
 * @param {{ buffer: Buffer, originalName: string, mimeType: string, folder: string, baseUrl?: string }} file
 * @returns {Promise<{ key: string, url: string }>}
 */
export async function saveFile({ buffer, originalName, mimeType, folder, baseUrl }) {
  const key = buildKey(folder, originalName)

  if (env.storage.driver === 's3') {
    const { bucket, publicUrl } = env.storage.s3
    await s3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }))
    return { key, url: `${publicUrl}/${key}` }
  }

  const fullPath = path.join(env.upload.dir, key)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, buffer)
  const base = env.publicBaseUrl || baseUrl || ''
  return { key, url: `${base}/uploads/${key}` }
}

/** Best-effort — a missing file must never fail the calling request. */
export async function deleteFile(key) {
  if (!key) return
  try {
    if (env.storage.driver === 's3') {
      await s3().send(new DeleteObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }))
    } else {
      await fs.unlink(path.join(env.upload.dir, key))
    }
  } catch (err) {
    console.error('[storage] delete failed:', err.message)
  }
}

export function requestBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`
}
