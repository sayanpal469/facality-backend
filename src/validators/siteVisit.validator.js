import { z } from 'zod'
import { VISIT_PURPOSE_VALUES } from '../constants/enums.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const createSiteVisitSchema = z.object({
  siteId: objectId,
  purpose: z.enum(VISIT_PURPOSE_VALUES),
  observation: z.string().trim().optional().default(''),
  workOrderId: objectId.optional(),
  complaintId: objectId.optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).max(100_000).optional(),
  qrCode: z.string().trim().max(100).optional(),
})

export const checkOutSchema = z.object({
  observation: z.string().trim().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

export const listSiteVisitsQuerySchema = z.object({
  clientId: objectId.optional(),
  siteId: objectId.optional(),
  visitorId: objectId.optional(),
  workOrderId: objectId.optional(),
  complaintId: objectId.optional(),
  purpose: z.enum(VISIT_PURPOSE_VALUES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
