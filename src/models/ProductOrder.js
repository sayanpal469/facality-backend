import mongoose from 'mongoose'
import { PRODUCT_ORDER_STATUS, PRODUCT_ORDER_STATUS_VALUES } from '../constants/enums.js'

const { Schema } = mongoose

export const ORDER_PAYMENT_STATUS_VALUES = ['unpaid', 'paid']
export const ORDER_PAYMENT_METHOD_VALUES = ['cash_on_delivery', 'upi', 'bank_transfer', 'card', 'invoice']

// Allowed admin moves; cancelling restores stock.
export const ORDER_TRANSITIONS = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['dispatched', 'cancelled'],
  dispatched: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}
// The client can still back out until the order leaves the store.
export const CLIENT_CANCELLABLE = ['placed', 'confirmed']

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    // Snapshot at order time — later catalogue edits never change a placed order.
    sku: { type: String, default: '' },
    name: { type: String, required: true },
    unit: { type: String, default: 'piece' },
    packSize: { type: String, default: '' },
    imageUrl: { type: String, default: null },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    amount: { type: Number, default: 0 },
  },
  { _id: false },
)

// A client's purchase from the in-app shop, delivered to one of their sites.
const productOrderSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    code: { type: String, required: true, trim: true }, // e.g. "ORD-50001"
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true },
    placedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    items: { type: [orderItemSchema], validate: [(v) => v.length > 0, 'Add at least one product'] },
    subtotal: { type: Number, default: 0 },
    transportCharge: { type: Number, min: 0, default: 0 },
    distanceKm: { type: Number, default: null },
    total: { type: Number, default: 0 },

    status: { type: String, enum: PRODUCT_ORDER_STATUS_VALUES, default: PRODUCT_ORDER_STATUS.PLACED, index: true },
    statusHistory: [
      {
        status: { type: String, enum: PRODUCT_ORDER_STATUS_VALUES, required: true },
        note: { type: String, default: null },
        actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        at: { type: Date, default: Date.now },
      },
    ],
    notes: { type: String, trim: true, default: '' }, // delivery instructions from the client
    expectedDeliveryDate: { type: Date, default: null },
    cancelReason: { type: String, default: null },

    paymentMethod: { type: String, enum: ORDER_PAYMENT_METHOD_VALUES, default: 'cash_on_delivery' },
    paymentStatus: { type: String, enum: ORDER_PAYMENT_STATUS_VALUES, default: 'unpaid' },
    paidAt: { type: Date, default: null },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
  },
  { timestamps: true },
)

productOrderSchema.index({ enterpriseId: 1, code: 1 }, { unique: true })
productOrderSchema.index({ enterpriseId: 1, clientId: 1, createdAt: -1 })

const round2 = (n) => Math.round(n * 100) / 100

productOrderSchema.pre('save', function computeTotals() {
  let subtotal = 0
  for (const item of this.items) {
    item.amount = round2(item.unitPrice * item.quantity)
    subtotal += item.amount
  }
  this.subtotal = round2(subtotal)
  this.total = round2(this.subtotal + (this.transportCharge || 0))
})

export const ProductOrder = mongoose.model('ProductOrder', productOrderSchema)
