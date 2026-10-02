import { z } from 'zod'
import { COMPLAINT_STATUS_VALUES, PRIORITY_VALUES } from '../constants/enums.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const createComplaintSchema = z.object({
  // Optional because a client-role user's own clientId is inferred server-side;
  // admin/supervisor callers must supply it (enforced in the controller).
  clientId: objectId.optional(),
  siteId: objectId,
  serviceId: objectId,
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().trim().optional().default(''),
  priority: z.enum(PRIORITY_VALUES).optional().default('normal'),
  // "Raise concern" on a work order links the complaint to it.
  workOrderId: objectId.optional(),
  assetId: objectId.optional(),
})

export const reopenComplaintSchema = z.object({ reason: z.string().trim().min(1, 'Tell us what still needs fixing').max(1000) })

export const assignComplaintSchema = z.object({ assignedEmployeeId: objectId })
export const updateComplaintStatusSchema = z.object({
  status: z.enum(COMPLAINT_STATUS_VALUES),
  resolutionNote: z.string().trim().optional(),
})

export const listComplaintsQuerySchema = z.object({
  clientId: objectId.optional(),
  siteId: objectId.optional(),
  serviceId: objectId.optional(),
  assignedEmployeeId: objectId.optional(),
  status: z.enum(COMPLAINT_STATUS_VALUES).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  sla: z.enum(['breached']).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
