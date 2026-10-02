import { z } from 'zod'
import { DOCUMENT_CATEGORY_VALUES } from '../models/Document.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

// Multipart form fields arrive as strings.
const formBoolean = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean())
const optionalDate = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable().optional())

export const uploadDocumentSchema = z.object({
  clientId: objectId,
  siteId: z.preprocess((v) => (v === '' ? undefined : v), objectId.optional()),
  title: z.string().trim().min(1, 'Title is required').max(200),
  category: z.enum(DOCUMENT_CATEGORY_VALUES).optional().default('other'),
  notes: z.string().trim().max(1000).optional().default(''),
  expiresOn: optionalDate,
  visibleToClient: formBoolean.optional().default(true),
})

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: z.enum(DOCUMENT_CATEGORY_VALUES).optional(),
  notes: z.string().trim().max(1000).optional(),
  expiresOn: optionalDate,
  visibleToClient: z.boolean().optional(),
})

export const listDocumentsQuerySchema = z.object({
  clientId: objectId.optional(),
  siteId: objectId.optional(),
  category: z.enum(DOCUMENT_CATEGORY_VALUES).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
