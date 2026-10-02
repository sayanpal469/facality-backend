import { z } from 'zod'

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})

export const registerDeviceSchema = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(['android', 'ios', 'web']),
  app: z.enum(['client', 'enterprise', 'admin']),
})

export const unregisterDeviceSchema = z.object({ token: z.string().trim().min(10).max(4096) })

export const pushPreferencesSchema = z
  .object({ workUpdates: z.boolean(), siteVisits: z.boolean(), complaints: z.boolean() })
  .partial()
