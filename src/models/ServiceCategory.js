import mongoose from 'mongoose'
import { ACCOUNT_STATUS_VALUES } from '../constants/enums.js'

const { Schema } = mongoose

// Categories AND their service types are fully admin-configurable (BRD §4) —
// never hardcoded. ServiceType is its own collection (see ServiceType.js) so
// every other model can hold a plain populate-able serviceId reference.
const serviceCategorySchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ACCOUNT_STATUS_VALUES, default: 'active' },
  },
  { timestamps: true },
)

serviceCategorySchema.index({ enterpriseId: 1, name: 1 }, { unique: true })

export const ServiceCategory = mongoose.model('ServiceCategory', serviceCategorySchema)
