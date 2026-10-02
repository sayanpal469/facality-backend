import mongoose from 'mongoose'
import { NOTIFICATION_EVENT, NOTIFICATION_KIND } from '../constants/enums.js'

const { Schema } = mongoose

const notificationSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // recipient
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    kind: { type: String, enum: Object.values(NOTIFICATION_KIND), required: true },
    event: { type: String, enum: [...Object.values(NOTIFICATION_EVENT), null], default: null },
    read: { type: Boolean, default: false },
    linkEntityType: { type: String, default: null },
    linkEntityId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
)

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 })

export const Notification = mongoose.model('Notification', notificationSchema)
