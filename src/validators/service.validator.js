import { z } from 'zod'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required'),
  status: z.enum(['active', 'inactive']).optional().default('active'),
})

export const updateCategorySchema = createCategorySchema.partial()

export const createServiceTypeSchema = z.object({
  categoryId: objectId,
  name: z.string().trim().min(1, 'Service type name is required'),
  status: z.enum(['active', 'inactive']).optional().default('active'),
})

export const updateServiceTypeSchema = createServiceTypeSchema.partial().omit({ categoryId: true })

const objectIdRef = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const updateServicePackageSchema = z.object({
  description: z.string().trim().max(1000).optional(),
  serviceCharge: z.number().min(0).max(1e8),
  items: z
    .array(z.object({ productId: objectIdRef, quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10000) }))
    .max(50)
    .default([]),
})
