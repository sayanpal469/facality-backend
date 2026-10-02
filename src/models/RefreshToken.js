import mongoose from 'mongoose'

const { Schema } = mongoose

// One document per issued refresh token (per device/session), stored hashed.
// Lets us support multi-device login and revoke a single session (or "log out
// everywhere") without invalidating anything derived only from the JWT secret.
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema)
