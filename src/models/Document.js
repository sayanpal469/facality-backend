import mongoose from 'mongoose'

const { Schema } = mongoose

export const DOCUMENT_CATEGORY_VALUES = ['agreement', 'amc', 'quotation', 'invoice', 'compliance', 'other']

// A file kept against a client (service agreement, AMC contract, invoice, ...).
// Only the storage URL/key live here — the bytes sit in services/storage.service.js.
const documentSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    title: { type: String, required: true, trim: true },
    category: { type: String, enum: DOCUMENT_CATEGORY_VALUES, default: 'other' },
    notes: { type: String, trim: true, default: '' },
    expiresOn: { type: Date, default: null },
    // Hidden documents (internal costing, drafts) never reach the client app.
    visibleToClient: { type: Boolean, default: true },

    fileUrl: { type: String, required: true },
    storageKey: { type: String, required: true },
    originalName: { type: String, default: '' },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.storageKey
        return ret
      },
    },
  },
)

documentSchema.index({ enterpriseId: 1, clientId: 1, createdAt: -1 })

export const Document = mongoose.model('Document', documentSchema)
