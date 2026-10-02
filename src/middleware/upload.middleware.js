import fs from 'node:fs'
import multer from 'multer'
import { env } from '../config/env.js'
import { ApiError } from '../utils/ApiError.js'

export const MEDIA_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp',
]

export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

export const DOCUMENT_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
]

fs.mkdirSync(env.upload.dir, { recursive: true })

/**
 * Files are held in memory only long enough for services/storage.service.js
 * to persist them (local disk or S3/R2) — so swapping the storage backend
 * never touches the routes.
 */
function makeUpload(allowed, maxMb = env.upload.maxMb) {
  const allowedSet = new Set(allowed)
  return multer({
    storage: multer.memoryStorage(),
    fileFilter(req, file, cb) {
      if (!allowedSet.has(file.mimetype)) return cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`))
      cb(null, true)
    },
    limits: { fileSize: maxMb * 1024 * 1024 },
  })
}

export const upload = makeUpload(MEDIA_MIME)
export const uploadImage = makeUpload(IMAGE_MIME, 5)
export const uploadDocument = makeUpload(DOCUMENT_MIME, 25)
