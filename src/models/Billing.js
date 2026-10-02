import mongoose from 'mongoose'

const { Schema } = mongoose

const round2 = (n) => Math.round(n * 100) / 100

const lineItemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, trim: true, default: 'nos' },
    rate: { type: Number, required: true, min: 0 },
    taxPercent: { type: Number, min: 0, max: 100, default: 18 }, // GST
    amount: { type: Number, default: 0 }, // quantity × rate, before tax
  },
  { _id: false },
)

// Totals are always recomputed from the lines on save — never trusted from the client.
function computeTotals() {
  let subtotal = 0
  let taxTotal = 0
  for (const item of this.items) {
    item.amount = round2(item.quantity * item.rate)
    subtotal += item.amount
    taxTotal += (item.amount * item.taxPercent) / 100
  }
  this.subtotal = round2(subtotal)
  this.taxTotal = round2(taxTotal)
  this.total = round2(subtotal + taxTotal)
}

const common = {
  enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  siteId: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
  code: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  items: { type: [lineItemSchema], validate: [(v) => v.length > 0, 'Add at least one line item'] },
  subtotal: { type: Number, default: 0 },
  taxTotal: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  notes: { type: String, trim: true, default: '' },
  terms: { type: String, trim: true, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}

// ── Quotation ───────────────────────────────────────────────────────────────

export const QUOTATION_STATUS_VALUES = ['draft', 'sent', 'accepted', 'rejected']

const quotationSchema = new Schema(
  {
    ...common,
    validUntil: { type: Date, required: true },
    status: { type: String, enum: QUOTATION_STATUS_VALUES, default: 'draft', index: true },
    sentAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    responseNote: { type: String, trim: true, default: '' },
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', default: null },
    workOrderId: { type: Schema.Types.ObjectId, ref: 'WorkOrder', default: null },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
  },
  { timestamps: true },
)
quotationSchema.pre('save', computeTotals)
quotationSchema.index({ enterpriseId: 1, code: 1 }, { unique: true })

/** "expired" is derived: a sent quotation past its validity that nobody answered. */
export function quotationState(q, now = new Date()) {
  if (q.status === 'sent' && q.validUntil < now) return 'expired'
  return q.status
}

export const Quotation = mongoose.model('Quotation', quotationSchema)

// ── Invoice ─────────────────────────────────────────────────────────────────

export const INVOICE_STATUS_VALUES = ['draft', 'issued', 'cancelled']
export const PAYMENT_METHOD_VALUES = ['bank_transfer', 'upi', 'cheque', 'cash', 'card', 'other']

const paymentSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true },
    method: { type: String, enum: PAYMENT_METHOD_VALUES, default: 'bank_transfer' },
    reference: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

const invoiceSchema = new Schema(
  {
    ...common,
    contractId: { type: Schema.Types.ObjectId, ref: 'Contract', default: null },
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', default: null },
    workOrderIds: [{ type: Schema.Types.ObjectId, ref: 'WorkOrder' }],
    issueDate: { type: Date, default: null },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: INVOICE_STATUS_VALUES, default: 'draft', index: true },
    payments: [paymentSchema],
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
  },
  { timestamps: true },
)
invoiceSchema.pre('save', function totalsAndBalance() {
  computeTotals.call(this)
  this.amountPaid = round2(this.payments.reduce((n, p) => n + p.amount, 0))
  this.balance = round2(this.total - this.amountPaid)
})
invoiceSchema.index({ enterpriseId: 1, code: 1 }, { unique: true })

/** Payment state for issued invoices: unpaid / partially_paid / paid / overdue. */
export function invoiceState(inv, now = new Date()) {
  if (inv.status !== 'issued') return inv.status
  if (inv.balance <= 0) return 'paid'
  if (inv.dueDate < now) return 'overdue'
  return inv.amountPaid > 0 ? 'partially_paid' : 'unpaid'
}

export const Invoice = mongoose.model('Invoice', invoiceSchema)
