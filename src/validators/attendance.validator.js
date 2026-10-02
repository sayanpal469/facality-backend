import { z } from 'zod'
import { ATTENDANCE_STATUS_VALUES } from '../models/Attendance.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const clockInSchema = z.object({
  siteId: objectId.optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).optional(),
})

export const markAttendanceSchema = z.object({
  date: day,
  siteId: objectId.optional(),
  entries: z
    .array(
      z.object({
        employeeId: objectId,
        status: z.enum(ATTENDANCE_STATUS_VALUES),
        note: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(500),
})

export const rosterQuerySchema = z.object({
  siteId: objectId,
  date: day.optional(),
})

export const myAttendanceQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional().default(30),
})

export const listAttendanceQuerySchema = z.object({
  employeeId: objectId.optional(),
  siteId: objectId.optional(),
  status: z.enum(ATTENDANCE_STATUS_VALUES).optional(),
  dateFrom: day.optional(),
  dateTo: day.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
