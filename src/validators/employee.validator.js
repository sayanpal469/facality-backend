import { z } from 'zod'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

// Plain staff-directory entries (technicians etc.) — no login created here.
// For supervisor/site_manager LOGIN accounts, use POST /api/accounts instead.
export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  mobile: z.string().trim().optional().default(''),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')).default(''),
  employeeCode: z.string().trim().min(1).optional(), // auto-generated if omitted
  serviceId: objectId,
  assignedSiteIds: z.array(objectId).optional().default([]),
  joiningDate: z.coerce.date(),
  status: z.enum(['active', 'inactive']).optional().default('active'),
})

export const updateEmployeeSchema = createEmployeeSchema.partial()

export const setEmployeeStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
})

export const listEmployeesQuerySchema = z.object({
  serviceId: objectId.optional(),
  siteId: objectId.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
