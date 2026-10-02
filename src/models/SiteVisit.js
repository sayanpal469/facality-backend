import mongoose from 'mongoose'
import { VISIT_PURPOSE_VALUES } from '../constants/enums.js'

const { Schema } = mongoose

const siteVisitSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    code: { type: String, required: true, trim: true }, // e.g. "SV-7300"

    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    visitorId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },

    purpose: { type: String, enum: VISIT_PURPOSE_VALUES, required: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, default: null },
    observation: { type: String, trim: true, default: '' },

    // How presence was established at check-in.
    checkInMethod: { type: String, enum: ['qr', 'gps', 'manual'], default: 'manual' },
    checkInLatitude: { type: Number, default: null },
    checkInLongitude: { type: Number, default: null },
    checkInAccuracyM: { type: Number, default: null },
    checkInDistanceM: { type: Number, default: null }, // from the site's pinned location
    locationVerified: { type: Boolean, default: null }, // null = site has no pinned location / no GPS sent
    checkOutLatitude: { type: Number, default: null },
    checkOutLongitude: { type: Number, default: null },

    workOrderId: { type: Schema.Types.ObjectId, ref: 'WorkOrder', default: null },
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', default: null },
  },
  { timestamps: true },
)

siteVisitSchema.index({ enterpriseId: 1, code: 1 }, { unique: true })
siteVisitSchema.index({ enterpriseId: 1, siteId: 1 })
siteVisitSchema.index({ enterpriseId: 1, checkIn: -1 })

export const SiteVisit = mongoose.model('SiteVisit', siteVisitSchema)
