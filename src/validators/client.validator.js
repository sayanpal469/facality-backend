import { z } from 'zod'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const createClientSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required'),
  contactPerson: z.string().trim().min(1, 'Contact person is required'),
  mobile: z.string().trim().min(6, 'Enter a valid mobile number'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  address: z.string().trim().min(1, 'Address is required'),
  startDate: z.coerce.date(),
  contractNote: z.string().trim().optional().default(''),
  gstin: z.string().trim().max(20).optional(),
  serviceIds: z.array(objectId).optional().default([]),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  createLogin: z.boolean().optional().default(true), // auto-create the client's app login on save
})

export const updateClientSchema = createClientSchema.partial().omit({ createLogin: true })

export const updateClientServicesSchema = z.object({
  serviceIds: z.array(objectId),
})

export const setClientStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
})

export const listClientsQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  serviceId: objectId.optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
