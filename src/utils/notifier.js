import { Notification } from '../models/Notification.js'
import { User } from '../models/User.js'
import { Employee } from '../models/Employee.js'
import { Enterprise } from '../models/Enterprise.js'
import { NOTIFICATION_KIND, ROLES } from '../constants/enums.js'
import { env } from '../config/env.js'
import { sendEmail } from '../services/messaging.service.js'
import { pushToUsers } from '../services/push.service.js'

// Which personal push opt-out governs each kind (see User.pushPreferences).
const PUSH_TOPIC = {
  [NOTIFICATION_KIND.WORK_ORDER]: 'workUpdates',
  [NOTIFICATION_KIND.SITE_VISIT]: 'siteVisits',
  [NOTIFICATION_KIND.COMPLAINT]: 'complaints',
}

/**
 * Out-of-app delivery. Admins follow the enterprise's per-kind email/push
 * preferences (Settings → Notifications, default on); everyone else gets a
 * push unless they switched that topic off in their app. Best-effort.
 */
async function deliverExternally({ enterpriseId, userIds, title, body, kind, event, linkEntityType, linkEntityId }) {
  const users = await User.find({ _id: { $in: userIds }, status: 'active' }).select('role email pushPreferences').lean()
  if (users.length === 0) return

  const admins = users.filter((u) => u.role === ROLES.ADMIN)
  let adminPrefs = { email: true, push: true }
  if (admins.length) {
    const enterprise = await Enterprise.findById(enterpriseId).select('notificationPreferences').lean()
    adminPrefs = { ...adminPrefs, ...(enterprise?.notificationPreferences?.[kind] ?? {}) }
    if (adminPrefs.email) {
      const subject = `${env.messaging.appName}: ${title}`
      await Promise.all(admins.map((a) => sendEmail({ to: a.email, subject, text: `${title}\n\n${body}` })))
    }
  }

  const topic = PUSH_TOPIC[kind]
  const pushIds = users
    .filter((u) => (u.role === ROLES.ADMIN ? adminPrefs.push : !topic || u.pushPreferences?.[topic] !== false))
    .map((u) => u._id)
  await pushToUsers(pushIds, {
    title,
    body,
    data: { kind, event: event ?? '', linkEntityType: linkEntityType ?? '', linkEntityId: linkEntityId ? String(linkEntityId) : '' },
  })
}

/**
 * Writes one in-app notification per recipient. Like logActivity, it's
 * called after a mutation succeeds and never throws into the request —
 * a failed notification must not fail the work order / complaint update.
 * The actor is always excluded so nobody is notified about their own action.
 */
export async function notifyUsers({ enterpriseId, userIds, actorId, title, body, kind, event = null, linkEntityType = null, linkEntityId = null }) {
  try {
    const unique = [...new Set((userIds || []).filter(Boolean).map(String))].filter((id) => id !== String(actorId))
    if (unique.length === 0) return
    await Notification.insertMany(
      unique.map((userId) => ({ enterpriseId, userId, title, body, kind, event, linkEntityType, linkEntityId })),
    )
    await deliverExternally({ enterpriseId, userIds: unique, title, body, kind, event, linkEntityType, linkEntityId })
  } catch (err) {
    console.error('[notifier] failed to write notifications:', err.message)
  }
}

/** Active client-app logins for a client. */
export async function clientUserIds(clientId) {
  if (!clientId) return []
  const users = await User.find({ clientId, role: ROLES.USER, status: 'active' }).select('_id').lean()
  return users.map((u) => u._id)
}

/** Enterprise-app logins (supervisor / site_manager) assigned to a site. */
export async function siteStaffUserIds(siteId) {
  if (!siteId) return []
  const employees = await Employee.find({ assignedSiteIds: siteId, status: 'active', userId: { $exists: true, $ne: null } })
    .select('userId')
    .lean()
  return employees.map((e) => e.userId)
}

export async function adminUserIds(enterpriseId) {
  const users = await User.find({ enterpriseId, role: ROLES.ADMIN, status: 'active' }).select('_id').lean()
  return users.map((u) => u._id)
}
