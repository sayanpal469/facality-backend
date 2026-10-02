import { z } from 'zod'
import { ASSET_EVENT_VALUES, ASSET_STATUS_VALUES } from '../models/Asset.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')
const optionalDate = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable().optional())

export const createAssetSchema = z.object({
  siteId: objectId,
  serviceId: objectId.nullable().optional(),
  name: z.string().trim().min(1, 'Name is required').max(200),
  type: z.string().trim().min(1, 'Type is required').max(100),
  brand: z.string().trim().max(100).optional().default(''),
  modelNumber: z.string().trim().max(100).optional().default(''),
  serialNumber: z.string().trim().max(100).optional().default(''),
  location: z.string().trim().max(200).optional().default(''),
  installDate: optionalDate,
  warrantyUntil: optionalDate,
  status: z.enum(ASSET_STATUS_VALUES).optional().default('active'),
  notes: z.string().trim().max(2000).optional().default(''),
})

export const updateAssetSchema = createAssetSchema
  .omit({ siteId: true })
  .partial()
  .extend({ statusNote: z.string().trim().max(500).optional() })

export const addAssetEventSchema = z.object({
  kind: z.enum(ASSET_EVENT_VALUES.filter((k) => k !== 'status_change' && k !== 'complaint')),
  date: z.coerce.date().optional(),
  note: z.string().trim().min(1, 'Add a short note').max(1000),
  workOrderId: objectId.optional(),
})

export const listAssetsQuerySchema = z.object({
  clientId: objectId.optional(),
  siteId: objectId.optional(),
  serviceId: objectId.optional(),
  status: z.enum(ASSET_STATUS_VALUES).optional(),
  type: z.string().trim().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
