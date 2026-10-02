import { z } from 'zod'
import { ACTIVITY_ENTITY_TYPE } from '../constants/enums.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const listActivityLogsQuerySchema = z.object({
  entityType: z.enum(Object.values(ACTIVITY_ENTITY_TYPE)).optional(),
  actorId: objectId.optional(),
  entityId: objectId.optional(),
  search: z.string().trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
