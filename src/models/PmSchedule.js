import mongoose from 'mongoose'
import { PRIORITY_VALUES } from '../constants/enums.js'

const { Schema } = mongoose

export const FREQUENCY_UNIT_VALUES = ['day', 'week', 'month', 'year']

// A recurring preventive-maintenance job. The scheduler turns each due
// occurrence into an ordinary work order `leadDays` before it is due.
const pmScheduleSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'ServiceType', required: true },
    assetId: { type: Schema.Types.ObjectId, ref: 'Asset', default: null },
    contractId: { type: Schema.Types.ObjectId, ref: 'Contract', default: null },

    code: { type: String, required: true, trim: true }, // e.g. "PM-104"
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    checklist: [{ type: String, trim: true }],
    priority: { type: String, enum: PRIORITY_VALUES, default: 'normal' },
    assignedEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    supervisorId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },

    frequencyUnit: { type: String, enum: FREQUENCY_UNIT_VALUES, required: true },
    frequencyInterval: { type: Number, min: 1, max: 365, default: 1 }, // every N units
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    leadDays: { type: Number, min: 0, max: 60, default: 3 },
    nextDueDate: { type: Date, required: true },
    active: { type: Boolean, default: true },

    lastGeneratedAt: { type: Date, default: null },
    generatedCount: { type: Number, default: 0 },
  },
  { timestamps: true },
)

pmScheduleSchema.index({ enterpriseId: 1, code: 1 }, { unique: true })
pmScheduleSchema.index({ active: 1, nextDueDate: 1 })

/** `date` moved forward by one period of the schedule's frequency. */
export function advanceDate(date, unit, interval) {
  const d = new Date(date)
  if (unit === 'day') d.setUTCDate(d.getUTCDate() + interval)
  else if (unit === 'week') d.setUTCDate(d.getUTCDate() + 7 * interval)
  else if (unit === 'month') {
    // Clamp to the month's last day (31 Jan + 1 month = 28/29 Feb, not 2/3 Mar).
    const day = d.getUTCDate()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() + interval)
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(day, lastDay))
  } else d.setUTCFullYear(d.getUTCFullYear() + interval)
  return d
}

export const PmSchedule = mongoose.model('PmSchedule', pmScheduleSchema)
