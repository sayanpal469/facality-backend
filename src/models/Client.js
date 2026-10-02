import mongoose from 'mongoose'
import { ACCOUNT_STATUS_VALUES } from '../constants/enums.js'

const { Schema } = mongoose

const clientSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    address: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    contractNote: { type: String, trim: true, default: '' },
    gstin: { type: String, trim: true, uppercase: true, default: '' }, // printed on quotations/invoices
    status: { type: String, enum: ACCOUNT_STATUS_VALUES, default: 'active' },

    serviceIds: [{ type: Schema.Types.ObjectId, ref: 'ServiceType' }],

    // The client's app login (role: 'user'). Null until credentials are created/shared.
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

clientSchema.index({ enterpriseId: 1, companyName: 1 })
clientSchema.index({ enterpriseId: 1, status: 1 })

// Virtual — sites don't store a denormalized list on Client; look them up by clientId instead.
clientSchema.virtual('sites', {
  ref: 'Site',
  localField: '_id',
  foreignField: 'clientId',
})

clientSchema.set('toJSON', { virtuals: true })

export const Client = mongoose.model('Client', clientSchema)
