import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { ACCOUNT_STATUS_VALUES } from '../constants/enums.js'

const { Schema } = mongoose

const siteSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true, default: '' },
    contactMobile: { type: String, trim: true, default: '' },
    status: { type: String, enum: ACCOUNT_STATUS_VALUES, default: 'active' },
    serviceIds: [{ type: Schema.Types.ObjectId, ref: 'ServiceType' }],
    // Printed on the site's QR poster; staff scan it to open the site and check in.
    qrCode: { type: String, default: null },

    // Geofence for GPS-verified check-in (null = not configured).
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    geofenceRadiusM: { type: Number, default: 200, min: 20, max: 5000 },
  },
  { timestamps: true },
)

export function newSiteQrCode() {
  return `FMSITE-${crypto.randomBytes(8).toString('hex').toUpperCase()}`
}

siteSchema.pre('validate', function assignQrCode() {
  if (!this.qrCode) this.qrCode = newSiteQrCode()
})

siteSchema.index({ enterpriseId: 1, clientId: 1 })
siteSchema.index({ qrCode: 1 }, { unique: true, sparse: true })

export const Site = mongoose.model('Site', siteSchema)
