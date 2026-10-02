import mongoose from 'mongoose'

const { Schema } = mongoose

export const CONTRACT_TYPE_VALUES = ['amc', 'service_agreement', 'warranty']
export const BILLING_CYCLE_VALUES = ['monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time']
export const CONTRACT_STATE_VALUES = ['upcoming', 'active', 'expiring', 'expired', 'cancelled']

/** Days before the end date at which a contract counts as "expiring" and admins are alerted. */
export const RENEWAL_WINDOW_DAYS = 30

// An AMC / service agreement with a client, optionally limited to some sites and services.
const contractSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    siteIds: [{ type: Schema.Types.ObjectId, ref: 'Site' }], // empty = all of the client's sites
    serviceIds: [{ type: Schema.Types.ObjectId, ref: 'ServiceType' }],

    code: { type: String, required: true, trim: true }, // e.g. "CT-1003"
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: CONTRACT_TYPE_VALUES, default: 'amc' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    value: { type: Number, min: 0, default: 0 }, // total contract value (INR)
    billingCycle: { type: String, enum: BILLING_CYCLE_VALUES, default: 'yearly' },
    visitsIncluded: { type: Number, min: 0, default: null }, // preventive visits per contract term, if fixed
    terms: { type: String, trim: true, default: '' },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: null }, // the signed copy
    cancelled: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },

    renewalAlertedAt: { type: Date, default: null },
    renewedFromId: { type: Schema.Types.ObjectId, ref: 'Contract', default: null },
  },
  { timestamps: true },
)

contractSchema.index({ enterpriseId: 1, code: 1 }, { unique: true })
contractSchema.index({ enterpriseId: 1, endDate: 1 })

contractSchema.pre('save', function resetRenewalAlert() {
  if (!this.isNew && this.isModified('endDate')) this.renewalAlertedAt = null
})

/** Lifecycle state derived from dates — never stored, so it can't go stale. */
export function contractState(c, now = new Date()) {
  if (c.cancelled) return 'cancelled'
  if (now < c.startDate) return 'upcoming'
  if (now > c.endDate) return 'expired'
  if (c.endDate - now <= RENEWAL_WINDOW_DAYS * 864e5) return 'expiring'
  return 'active'
}

export const Contract = mongoose.model('Contract', contractSchema)
