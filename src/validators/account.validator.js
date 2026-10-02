import { z } from 'zod'
import { ROLES } from '../constants/enums.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

// Admin-created login accounts: admin, supervisor, site_manager.
// 'user' (client) accounts are created via the Clients module instead,
// since a client login is always tied 1:1 to a Client company record.
export const createAccountSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    mobile: z.string().trim().optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER]),

    // required when role is supervisor/site_manager
    employeeCode: z.string().trim().optional(),
    serviceId: objectId.optional(),
    assignedSiteIds: z.array(objectId).optional().default([]),
    joiningDate: z.coerce.date().optional(),
  })
  .superRefine((data, ctx) => {
    // employeeCode is auto-generated when omitted — only serviceId/joiningDate are truly required.
    if (data.role !== ROLES.ADMIN) {
      if (!data.serviceId) ctx.addIssue({ code: 'custom', path: ['serviceId'], message: 'Service is required' })
      if (!data.joiningDate) ctx.addIssue({ code: 'custom', path: ['joiningDate'], message: 'Joining date is required' })
    }
  })

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1).optional(),
  mobile: z.string().trim().optional(),
  assignedSiteIds: z.array(objectId).optional(),
  serviceId: objectId.optional(),
})

export const listAccountsQuerySchema = z.object({
  role: z.enum([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER]).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters').optional(),
})

export const setStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
})
