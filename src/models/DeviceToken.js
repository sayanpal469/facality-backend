import mongoose from 'mongoose'

const { Schema } = mongoose

// One FCM registration token per app install. A token moves to whichever
// user last registered it (shared devices), and is pruned when FCM reports
// it invalid.
const deviceTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios', 'web'], required: true },
    app: { type: String, enum: ['client', 'enterprise', 'admin'], required: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

export const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema)
