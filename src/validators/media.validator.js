import { z } from 'zod'
import { MEDIA_STAGE } from '../constants/enums.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

// Attach to exactly one owner: a work order, complaint, site visit — or, for
// admins, a bare site. Client/site/service are derived from that owner
// server-side, never trusted from the form.
export const uploadMediaSchema = z
  .object({
    siteId: objectId.optional(),
    workOrderId: objectId.optional(),
    complaintId: objectId.optional(),
    siteVisitId: objectId.optional(),
    stage: z.enum(Object.values(MEDIA_STAGE)).optional(),
    description: z.string().trim().max(500).optional().default(''),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    address: z.string().trim().max(300).optional(),
    capturedAt: z.coerce.date().optional(),
  })
  .refine((v) => v.workOrderId || v.complaintId || v.siteVisitId || v.siteId, {
    message: 'Attach the file to a work order, complaint, site visit or site',
    path: ['workOrderId'],
  })

export const listMediaQuerySchema = z.object({
  clientId: objectId.optional(),
  siteId: objectId.optional(),
  serviceId: objectId.optional(),
  workOrderId: objectId.optional(),
  complaintId: objectId.optional(),
  siteVisitId: objectId.optional(),
  stage: z.enum(Object.values(MEDIA_STAGE)).optional(),
  fileType: z.enum(['photo', 'video']).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
