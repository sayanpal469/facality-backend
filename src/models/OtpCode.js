import mongoose from 'mongoose'

const { Schema } = mongoose

export const OTP_PURPOSE = Object.freeze({ LOGIN: 'login', RESET: 'reset' })

// One-time codes for OTP login and password reset. Only a hash is stored;
// documents expire automatically via the TTL index.
const otpCodeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: Object.values(OTP_PURPOSE), required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const OtpCode = mongoose.model('OtpCode', otpCodeSchema)
