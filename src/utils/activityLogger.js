import { ActivityLog } from '../models/ActivityLog.js'

/**
 * Records one audit-trail entry. Called from controllers after a mutation
 * succeeds. Never throws into the caller's request flow — logging failures
 * are swallowed (and reported) so they can't take down the actual operation.
 */
export async function logActivity({ enterpriseId, actorId, action, entityType, entityId, entityLabel }) {
  try {
    await ActivityLog.create({ enterpriseId, actorId, action, entityType, entityId, entityLabel })
  } catch (err) {
    console.error('[activityLogger] failed to write activity log:', err.message)
  }
}
