import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { ACCOUNT_STATUS_VALUES, ROLE_VALUES } from '../constants/enums.js'

const { Schema } = mongoose

const userSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    mobile: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },

    role: { type: String, enum: ROLE_VALUES, required: true, index: true },
    status: { type: String, enum: ACCOUNT_STATUS_VALUES, default: 'active' },

    // Exactly one of these is populated, depending on role.
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', default: null }, // role === 'user'
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null }, // role in [supervisor, site_manager]

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastLoginAt: { type: Date, default: null },
    mustChangePassword: { type: Boolean, default: false },

    // Push opt-outs by topic (in-app notifications are always kept).
    pushPreferences: {
      workUpdates: { type: Boolean, default: true },
      siteVisits: { type: Boolean, default: true },
      complaints: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
)

userSchema.index({ enterpriseId: 1, role: 1 })

// Virtual `password` setter — callers assign a plaintext password via
// `user.password = '...'` and the pre-save hook hashes it into passwordHash.
// This keeps "passwordHash always holds a hash" true everywhere else in the code.
userSchema.virtual('password').set(function setPassword(plainPassword) {
  this._plainPassword = plainPassword
  this.passwordHash = plainPassword // placeholder so isModified('passwordHash') triggers
})

userSchema.pre('save', async function hashPasswordIfChanged() {
  if (!this._plainPassword) return
  this.passwordHash = await bcrypt.hash(this._plainPassword, 12)
  this._plainPassword = undefined
})

userSchema.methods.comparePassword = function comparePassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash)
}

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject({ virtuals: true })
  delete obj.passwordHash
  delete obj.__v
  return obj
}

export const User = mongoose.model('User', userSchema)
