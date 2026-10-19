import mongoose from 'mongoose'
import { ACCOUNT_STATUS_VALUES } from '../constants/enums.js'

const { Schema } = mongoose

const serviceTypeSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ServiceCategory', required: true, index: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ACCOUNT_STATUS_VALUES, default: 'active' },

    // Service package (Services → Package): the visit/service charge plus the
    // products that normally go with it. Copied onto each work order as an
    // editable snapshot (WorkOrder.pricing) for the client to approve.
    description: { type: String, trim: true, default: '' },
    serviceCharge: { type: Number, min: 0, default: 0 },
    includedProducts: [
      {
        _id: false,
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        quantity: { type: Number, min: 1, required: true },
      },
    ],
  },
  { timestamps: true },
)

serviceTypeSchema.index({ categoryId: 1, name: 1 }, { unique: true })

export const ServiceType = mongoose.model('ServiceType', serviceTypeSchema)
