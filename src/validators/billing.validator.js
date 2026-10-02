import { z } from 'zod'
import { PAYMENT_METHOD_VALUES } from '../models/Billing.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

const lineItem = z.object({
  description: z.string().trim().min(1, 'Describe each line item').max(500),
  quantity: z.number().positive('Quantity must be more than zero').max(1e6),
  unit: z.string().trim().max(20).optional().default('nos'),
  rate: z.number().min(0).max(1e9),
  taxPercent: z.number().min(0).max(100).optional().default(18),
})

const docFields = {
  clientId: objectId,
  siteId: objectId.nullable().optional(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  items: z.array(lineItem).min(1, 'Add at least one line item').max(200),
  notes: z.string().trim().max(2000).optional().default(''),
  terms: z.string().trim().max(5000).optional().default(''),
}

export const createQuotationSchema = z.object({
  ...docFields,
  validUntil: z.coerce.date(),
  complaintId: objectId.nullable().optional(),
})
export const updateQuotationSchema = createQuotationSchema.omit({ clientId: true }).partial()

export const respondQuotationSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
  note: z.string().trim().max(1000).optional().default(''),
})

export const createInvoiceSchema = z.object({
  ...docFields,
  dueDate: z.coerce.date(),
  contractId: objectId.nullable().optional(),
  workOrderIds: z.array(objectId).max(100).optional().default([]),
})
export const updateInvoiceSchema = createInvoiceSchema.omit({ clientId: true }).partial()

export const invoiceFromQuotationSchema = z.object({ dueDate: z.coerce.date() })

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  date: z.coerce.date().optional(),
  method: z.enum(PAYMENT_METHOD_VALUES).optional().default('bank_transfer'),
  reference: z.string().trim().max(100).optional().default(''),
  note: z.string().trim().max(500).optional().default(''),
})

export const listBillingQuerySchema = z.object({
  clientId: objectId.optional(),
  state: z.string().trim().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
