import mongoose from 'mongoose'
import { MEDIA_STAGE, MEDIA_TYPE } from '../constants/enums.js'

const { Schema } = mongoose

// Only metadata + a URL live in MongoDB — the actual file is never stored
// here (BRD §11). `fileUrl`/`storageKey` come from services/storage.service.js
// (local disk in dev, AWS S3 / Cloudflare R2 in production).
const mediaSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },

    fileUrl: { type: String, required: true },
    storageKey: { type: String, default: null },
    fileType: { type: String, enum: Object.values(MEDIA_TYPE), required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },

    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'ServiceType', default: null },
    workOrderId: { type: Schema.Types.ObjectId, ref: 'WorkOrder', default: null, index: true },
    siteVisitId: { type: Schema.Types.ObjectId, ref: 'SiteVisit', default: null, index: true },
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', default: null, index: true },

    // GPS stamp captured by the in-app camera, when available.
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    address: { type: String, default: null },
    capturedAt: { type: Date, default: null },

    stage: { type: String, enum: Object.values(MEDIA_STAGE), default: null },
    description: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

mediaSchema.index({ enterpriseId: 1, createdAt: -1 })

export const Media = mongoose.model('Media', mediaSchema)
