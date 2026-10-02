import { z } from 'zod'
import { PRIORITY_VALUES, WORK_ORDER_STATUS_VALUES } from '../constants/enums.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const createWorkOrderSchema = z.object({
  clientId: objectId,
  siteId: objectId,
  serviceId: objectId,
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().trim().optional().default(''),
  priority: z.enum(PRIORITY_VALUES).optional().default('normal'),
  assignedEmployeeId: objectId,
  supervisorId: objectId.optional(),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date(),
  fromComplaintId: objectId.optional(),
  assetId: objectId.optional(),
})

export const updateWorkOrderSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
})

export const reassignWorkOrderSchema = z.object({ assignedEmployeeId: objectId })
export const changePrioritySchema = z.object({ priority: z.enum(PRIORITY_VALUES) })
export const cancelWorkOrderSchema = z.object({ reason: z.string().trim().min(1, 'A reason is required') })
export const overrideStatusSchema = z.object({
  status: z.enum(WORK_ORDER_STATUS_VALUES),
  reason: z.string().trim().min(1, 'A reason is required'),
})
export const clientApproveSchema = z.object({ note: z.string().trim().max(500).optional() }).default({})
export const addProgressUpdateSchema = z.object({ note: z.string().trim().min(1, 'Note is required') })
export const advanceStatusSchema = z.object({
  status: z.enum(WORK_ORDER_STATUS_VALUES),
  progress: z.number().min(0).max(100).optional(),
})

export const listWorkOrdersQuerySchema = z.object({
  clientId: objectId.optional(),
  siteId: objectId.optional(),
  serviceId: objectId.optional(),
  assignedEmployeeId: objectId.optional(),
  status: z.enum(WORK_ORDER_STATUS_VALUES).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  overdue: z.coerce.boolean().optional(),
  search: z.string().trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
