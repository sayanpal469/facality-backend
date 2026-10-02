import { z } from 'zod'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const createSiteSchema = z.object({
  clientId: objectId,
  name: z.string().trim().min(1, 'Site name is required'),
  address: z.string().trim().min(1, 'Address is required'),
  contactPerson: z.string().trim().optional().default(''),
  contactMobile: z.string().trim().optional().default(''),
  serviceIds: z.array(objectId).optional().default([]),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  geofenceRadiusM: z.number().int().min(20).max(5000).optional(),
})

export const updateSiteSchema = createSiteSchema.partial().omit({ clientId: true })

export const updateSiteServicesSchema = z.object({
  serviceIds: z.array(objectId),
})

export const listSitesQuerySchema = z.object({
  clientId: objectId.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
