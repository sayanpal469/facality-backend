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
  // Explicit pricing wins; otherwise applyServicePackage copies the service's package.
  pricing: z.lazy(() => workOrderPricingSchema).optional(),
  applyServicePackage: z.boolean().optional().default(false),
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

// Service charge + bundled products + transport (see utils/pricing.js).
export const workOrderPricingSchema = z.object({
  serviceCharge: z.number().min(0).max(1e8),
  items: z
    .array(
      z.object({
        productId: objectId,
        quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10000),
        unitPrice: z.number().min(0).max(1e8).optional(), // defaults to the catalogue price
      }),
    )
    .max(50)
    .default([]),
  transportMode: z.enum(['auto', 'manual']).optional().default('auto'),
  transportCharge: z.number().min(0).max(1e7).optional(), // required for manual mode
})

export const respondPricingSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: objectId,
        approvedQuantity: z.number().int().min(0).max(10000), // 0 = reject
        note: z.string().trim().max(300).optional(),
      }),
    )
    .min(1, 'Respond to at least one product')
    .max(50),
})

export const workOrderInvoiceSchema = z.object({ dueDate: z.coerce.date() })
