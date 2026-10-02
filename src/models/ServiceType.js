import mongoose from 'mongoose'
import { ACCOUNT_STATUS_VALUES } from '../constants/enums.js'

const { Schema } = mongoose

const serviceTypeSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ServiceCategory', required: true, index: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ACCOUNT_STATUS_VALUES, default: 'active' },
  },
  { timestamps: true },
)

serviceTypeSchema.index({ categoryId: 1, name: 1 }, { unique: true })

export const ServiceType = mongoose.model('ServiceType', serviceTypeSchema)
