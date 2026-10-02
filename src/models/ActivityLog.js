import mongoose from 'mongoose'
import { ACTIVITY_ENTITY_TYPE } from '../constants/enums.js'

const { Schema } = mongoose

// Append-only audit trail (BRD §8: "every significant action ... Deletions/edits
// must also be logged"). Never updated or deleted once written — controllers
// call activityLogger.log(...) after a mutation succeeds; nothing else writes here.
const activityLogSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, enum: Object.values(ACTIVITY_ENTITY_TYPE), required: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    entityLabel: { type: String, trim: true, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

activityLogSchema.index({ enterpriseId: 1, createdAt: -1 })
activityLogSchema.index({ enterpriseId: 1, entityType: 1 })
activityLogSchema.index({ enterpriseId: 1, actorId: 1 })

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema)
