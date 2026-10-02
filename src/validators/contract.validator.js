import { z } from 'zod'
import { BILLING_CYCLE_VALUES, CONTRACT_STATE_VALUES, CONTRACT_TYPE_VALUES } from '../models/Contract.js'
import { FREQUENCY_UNIT_VALUES } from '../models/PmSchedule.js'
import { PRIORITY_VALUES } from '../constants/enums.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

const contractFields = z.object({
  clientId: objectId,
  siteIds: z.array(objectId).optional().default([]),
  serviceIds: z.array(objectId).optional().default([]),
  title: z.string().trim().min(1, 'Title is required').max(200),
  type: z.enum(CONTRACT_TYPE_VALUES).optional().default('amc'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  value: z.number().min(0).optional().default(0),
  billingCycle: z.enum(BILLING_CYCLE_VALUES).optional().default('yearly'),
  visitsIncluded: z.number().int().min(0).nullable().optional(),
  terms: z.string().trim().max(5000).optional().default(''),
  documentId: objectId.nullable().optional(),
})

const endAfterStart = (v) => !v.startDate || !v.endDate || v.endDate > v.startDate
const endMessage = { message: 'End date must be after the start date', path: ['endDate'] }

export const createContractSchema = contractFields.refine(endAfterStart, endMessage)

export const updateContractSchema = contractFields
  .omit({ clientId: true })
  .partial()
  .extend({ cancelled: z.boolean().optional() })
  .refine(endAfterStart, endMessage)

export const renewContractSchema = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date(),
    value: z.number().min(0).optional(),
  })
  .refine(endAfterStart, endMessage)

export const listContractsQuerySchema = z.object({
  clientId: objectId.optional(),
  state: z.enum(CONTRACT_STATE_VALUES).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})

const scheduleFields = z.object({
  siteId: objectId,
  serviceId: objectId,
  assetId: objectId.nullable().optional(),
  contractId: objectId.nullable().optional(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000).optional().default(''),
  checklist: z.array(z.string().trim().min(1).max(200)).max(50).optional().default([]),
  priority: z.enum(PRIORITY_VALUES).optional().default('normal'),
  assignedEmployeeId: objectId,
  supervisorId: objectId.nullable().optional(),
  frequencyUnit: z.enum(FREQUENCY_UNIT_VALUES),
  frequencyInterval: z.number().int().min(1).max(365).optional().default(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  leadDays: z.number().int().min(0).max(60).optional().default(3),
  active: z.boolean().optional().default(true),
})

export const createPmScheduleSchema = scheduleFields.refine(endAfterStart, endMessage)

export const updatePmScheduleSchema = scheduleFields
  .omit({ siteId: true })
  .partial()
  .extend({ nextDueDate: z.coerce.date().optional() })
  .refine(endAfterStart, endMessage)

export const listPmSchedulesQuerySchema = z.object({
  clientId: objectId.optional(),
  siteId: objectId.optional(),
  assetId: objectId.optional(),
  contractId: objectId.optional(),
  active: z.enum(['true', 'false']).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
