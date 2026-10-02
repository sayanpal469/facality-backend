import mongoose from 'mongoose'

const { Schema } = mongoose

// Root of the multi-tenant hierarchy (BRD §9). Every other collection carries
// an enterpriseId so one enterprise can never see another's data — even
// though v1 ships with a single enterprise, the isolation is real from day one.
const enterpriseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    logoUrl: { type: String, default: null },
    logoKey: { type: String, default: null }, // storage key, for replacing/deleting the file
    supportEmail: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    // Field operations policy (Settings → Operations).
    operations: {
      // off: GPS ignored · warn: recorded + admins alerted when outside · enforce: check-in refused when outside
      gpsCheckInMode: { type: String, enum: ['off', 'warn', 'enforce'], default: 'warn' },
      requireQrCheckIn: { type: Boolean, default: false },
    },
    // Complaint SLA targets in hours, per priority.
    sla: {
      urgent: { responseHours: { type: Number, default: 1 }, resolutionHours: { type: Number, default: 8 } },
      high: { responseHours: { type: Number, default: 4 }, resolutionHours: { type: Number, default: 24 } },
      normal: { responseHours: { type: Number, default: 8 }, resolutionHours: { type: Number, default: 72 } },
    },
    notificationPreferences: {
      type: Map,
      of: new Schema({ email: Boolean, push: Boolean }, { _id: false }),
      default: undefined,
    },
  },
  { timestamps: true },
)

export const Enterprise = mongoose.model('Enterprise', enterpriseSchema)
