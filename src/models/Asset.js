import mongoose from 'mongoose'

const { Schema } = mongoose

export const ASSET_STATUS_VALUES = ['active', 'under_maintenance', 'faulty', 'retired']
export const ASSET_EVENT_VALUES = ['installation', 'inspection', 'maintenance', 'complaint', 'repair', 'replacement', 'status_change', 'note']

// Lifecycle entries (BRD: Installation → Maintenance → Complaint → Repair → Replacement).
const assetEventSchema = new Schema(
  {
    kind: { type: String, enum: ASSET_EVENT_VALUES, required: true },
    date: { type: Date, required: true },
    note: { type: String, trim: true, default: '' },
    workOrderId: { type: Schema.Types.ObjectId, ref: 'WorkOrder', default: null },
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', default: null },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

// A piece of equipment installed at a site (CCTV camera, DG set, AC unit, ...).
const assetSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'ServiceType', default: null },

    code: { type: String, required: true, trim: true }, // e.g. "AST-1004"
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true }, // e.g. "CCTV Camera"
    brand: { type: String, trim: true, default: '' },
    modelNumber: { type: String, trim: true, default: '' },
    serialNumber: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '' }, // where on the site, e.g. "Main gate"
    installDate: { type: Date, default: null },
    warrantyUntil: { type: Date, default: null },
    status: { type: String, enum: ASSET_STATUS_VALUES, default: 'active', index: true },
    notes: { type: String, trim: true, default: '' },

    history: [assetEventSchema],
  },
  { timestamps: true },
)

assetSchema.index({ enterpriseId: 1, code: 1 }, { unique: true })
assetSchema.index({ enterpriseId: 1, siteId: 1, status: 1 })

export const Asset = mongoose.model('Asset', assetSchema)
