import mongoose from 'mongoose'
import { ACCOUNT_STATUS_VALUES } from '../constants/enums.js'

const { Schema } = mongoose

export const PRODUCT_UNIT_VALUES = ['piece', 'pack', 'packet', 'box', 'bottle', 'can', 'jar', 'tin', 'bag', 'roll', 'coil', 'length', 'ream', 'set', 'pair', 'kg', 'litre']

/** Below this many units in stock, the shop shows "Only N left". */
export const LOW_STOCK_THRESHOLD = 5

// A sellable item in the enterprise's catalogue. Clients buy these directly
// from the in-app shop (ProductOrder), and admins bundle them into services
// (ServiceType.includedProducts → WorkOrder.pricing). Prices are final,
// tax-inclusive INR amounts.
const productSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: 'General' },
    brand: { type: String, trim: true, default: '' },
    unit: { type: String, enum: PRODUCT_UNIT_VALUES, default: 'piece' },
    packSize: { type: String, trim: true, default: '' }, // e.g. "1 kg", "5 L", "pack of 10"
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, min: 0, default: null }, // printed price, shown struck-through when above `price`
    stock: { type: Number, min: 0, default: 0 },
    imageUrl: { type: String, trim: true, default: null },
    imageKey: { type: String, default: null }, // storage key when the image was uploaded (not an external link)
    serviceIds: [{ type: Schema.Types.ObjectId, ref: 'ServiceType' }], // services this product is used for
    status: { type: String, enum: ACCOUNT_STATUS_VALUES, default: 'active' },
  },
  { timestamps: true },
)

productSchema.index({ enterpriseId: 1, sku: 1 }, { unique: true })
productSchema.index({ enterpriseId: 1, status: 1, category: 1 })
productSchema.index({ enterpriseId: 1, serviceIds: 1 })

productSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.imageKey
    return ret
  },
})

export const Product = mongoose.model('Product', productSchema)
