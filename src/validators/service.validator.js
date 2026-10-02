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
