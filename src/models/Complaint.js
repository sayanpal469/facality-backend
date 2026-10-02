import mongoose from 'mongoose'
import { COMPLAINT_STATUS, COMPLAINT_STATUS_VALUES, PRIORITY_VALUES } from '../constants/enums.js'

const { Schema } = mongoose

const complaintSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    code: { type: String, required: true, trim: true }, // e.g. "CMP-5100"

    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'ServiceType', required: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    priority: { type: String, enum: PRIORITY_VALUES, default: 'normal' },
    status: { type: String, enum: COMPLAINT_STATUS_VALUES, default: COMPLAINT_STATUS.OPEN, index: true },

    raisedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // the client user who raised it
    assignedEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    workOrderId: { type: Schema.Types.ObjectId, ref: 'WorkOrder', default: null },
    assetId: { type: Schema.Types.ObjectId, ref: 'Asset', default: null, index: true }, // the faulty equipment, if known
    resolutionNote: { type: String, default: null },

    // SLA (targets come from Enterprise.sla for the complaint's priority).
    // "Responded" = first moved out of `open`; "resolved" = reached resolved or later.
    responseDueAt: { type: Date, default: null },
    resolutionDueAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    // Set by the SLA sweep once admins have been alerted, so each breach alerts once.
    slaAlerts: {
      response: { type: Date, default: null },
      resolution: { type: Date, default: null },
    },

    // Human-readable activity feed (raised, assigned, status changes,
    // reopened) shown on the client app's complaint detail screen.
    history: [
      {
        text: { type: String, required: true },
        status: { type: String, enum: COMPLAINT_STATUS_VALUES, default: null },
        actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
)

const RESOLVED_STATUSES = [COMPLAINT_STATUS.RESOLVED, COMPLAINT_STATUS.CLIENT_VERIFICATION, COMPLAINT_STATUS.CLOSED]
const DEFAULT_SLA = {
  urgent: { responseHours: 1, resolutionHours: 8 },
  high: { responseHours: 4, resolutionHours: 24 },
  normal: { responseHours: 8, resolutionHours: 72 },
}

// Keeps the SLA clock in step with every save path (create, assign, status
// change, reopen) rather than relying on each controller to remember it.
complaintSchema.pre('save', async function trackSla() {
  const now = new Date()
  if (this.isNew || this.isModified('priority') || !this.responseDueAt) {
    const enterprise = await mongoose.model('Enterprise').findById(this.enterpriseId).select('sla').lean()
    const target = { ...DEFAULT_SLA[this.priority], ...(enterprise?.sla?.[this.priority] ?? {}) }
    const start = this.createdAt ?? now
    this.responseDueAt = new Date(start.getTime() + target.responseHours * 36e5)
    this.resolutionDueAt = new Date(start.getTime() + target.resolutionHours * 36e5)
  }
  if (this.isModified('status')) {
    if (this.status !== COMPLAINT_STATUS.OPEN && !this.respondedAt) this.respondedAt = now
    if (RESOLVED_STATUSES.includes(this.status)) {
      if (!this.resolvedAt) this.resolvedAt = now
    } else if (this.resolvedAt) {
      // Reopened: the resolution clock is running again.
      this.resolvedAt = null
      this.slaAlerts.resolution = null
    }
  }
})

/** Live SLA state for API responses: met / breached / pending, per clock. */
export function complaintSla(c, now = new Date()) {
  const clock = (due, doneAt) => {
    if (!due) return { dueAt: null, state: 'none' }
    if (doneAt) return { dueAt: due, doneAt, state: doneAt <= due ? 'met' : 'breached' }
    return { dueAt: due, state: now > due ? 'breached' : 'pending' }
  }
  return { response: clock(c.responseDueAt, c.respondedAt), resolution: clock(c.resolutionDueAt, c.resolvedAt) }
}

complaintSchema.index({ enterpriseId: 1, code: 1 }, { unique: true })
complaintSchema.index({ enterpriseId: 1, resolvedAt: 1, resolutionDueAt: 1 })
complaintSchema.index({ enterpriseId: 1, status: 1 })
complaintSchema.index({ enterpriseId: 1, clientId: 1 })
complaintSchema.index({ enterpriseId: 1, siteId: 1 })

export const Complaint = mongoose.model('Complaint', complaintSchema)
