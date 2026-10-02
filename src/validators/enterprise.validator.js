import { z } from 'zod'
import { NOTIFICATION_KIND } from '../constants/enums.js'

export const updateEnterpriseSchema = z.object({
  name: z.string().trim().min(1, 'Enterprise name is required').max(120).optional(),
  supportEmail: z.string().trim().toLowerCase().email('Enter a valid email address').optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  gstin: z.string().trim().max(20).optional(),
})

const channelPrefs = z.object({ email: z.boolean(), push: z.boolean() })

// Admin-facing kinds only — client/staff notifications aren't configured here.
export const ADMIN_NOTIFICATION_KINDS = [
  NOTIFICATION_KIND.COMPLAINT,
  NOTIFICATION_KIND.OVERDUE,
  NOTIFICATION_KIND.VERIFICATION,
  NOTIFICATION_KIND.EMPLOYEE,
  NOTIFICATION_KIND.CLIENT,
]

export const notificationPrefsSchema = z.object({
  preferences: z.partialRecord(z.enum(ADMIN_NOTIFICATION_KINDS), channelPrefs),
})

const slaTarget = z.object({
  responseHours: z.number().positive().max(24 * 30),
  resolutionHours: z.number().positive().max(24 * 90),
})

export const updateOperationsSchema = z.object({
  operations: z
    .object({
      gpsCheckInMode: z.enum(['off', 'warn', 'enforce']),
      requireQrCheckIn: z.boolean(),
    })
    .partial()
    .optional(),
  sla: z.object({ urgent: slaTarget, high: slaTarget, normal: slaTarget }).partial().optional(),
})
