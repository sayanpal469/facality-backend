import mongoose from 'mongoose'

const { Schema } = mongoose

// Backs generateCode() — one document per (enterpriseId, key), atomically
// incremented so concurrent requests never collide on the same human-friendly
// code (WO-10245, CMP-5100, SV-7300...).
const counterSchema = new Schema({
  key: { type: String, required: true }, // e.g. "workOrder:<enterpriseId>"
  seq: { type: Number, default: 0 },
})

counterSchema.index({ key: 1 }, { unique: true })

export const Counter = mongoose.model('Counter', counterSchema)
