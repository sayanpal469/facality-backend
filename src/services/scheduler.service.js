import { env } from '../config/env.js'
import { Complaint } from '../models/Complaint.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { adminUserIds, notifyUsers, siteStaffUserIds } from '../utils/notifier.js'
import { sweepContractRenewals, sweepPmSchedules } from './maintenance.service.js'
import { ACTIVITY_ENTITY_TYPE, NOTIFICATION_EVENT, NOTIFICATION_KIND, WORK_ORDER_TERMINAL_STATUSES } from '../constants/enums.js'

/**
 * Periodic background jobs. Each job is idempotent (it stamps what it has
 * already handled), so running the sweep twice — or on two instances — only
 * ever alerts once. Jobs are exported individually so tests can drive them.
 */

const hours = (ms) => Math.max(1, Math.round(ms / 36e5))

async function recipients(enterpriseId, siteId) {
  const [admins, staff] = await Promise.all([adminUserIds(enterpriseId), siteStaffUserIds(siteId)])
  return [...admins, ...staff]
}

/** Alerts admins + site staff once per complaint for each missed SLA clock. */
export async function sweepComplaintSla(now = new Date()) {
  let alerted = 0
  const clocks = [
    {
      key: 'response',
      filter: { respondedAt: null, responseDueAt: { $lt: now }, 'slaAlerts.response': null },
      title: (c) => `SLA missed: ${c.code} not picked up`,
      body: (c) => `${c.title} (${c.priority}) has waited ${hours(now - c.createdAt)}h without a response.`,
    },
    {
      key: 'resolution',
      filter: { resolutionDueAt: { $lt: now }, 'slaAlerts.resolution': null },
      title: (c) => `SLA missed: ${c.code} not resolved`,
      body: (c) => `${c.title} (${c.priority}) is past its ${hours(c.resolutionDueAt - c.createdAt)}h resolution target.`,
    },
  ]
  for (const clock of clocks) {
    const due = await Complaint.find({ resolvedAt: null, ...clock.filter }).select('enterpriseId siteId code title priority createdAt resolutionDueAt').limit(500).lean()
    for (const c of due) {
      // Claim first so a concurrent sweep can't double-alert.
      const claimed = await Complaint.updateOne({ _id: c._id, [`slaAlerts.${clock.key}`]: null }, { $set: { [`slaAlerts.${clock.key}`]: now } })
      if (!claimed.modifiedCount) continue
      await notifyUsers({
        enterpriseId: c.enterpriseId,
        userIds: await recipients(c.enterpriseId, c.siteId),
        actorId: null,
        title: clock.title(c),
        body: clock.body(c),
        kind: NOTIFICATION_KIND.OVERDUE,
        event: NOTIFICATION_EVENT.SLA_BREACHED,
        linkEntityType: ACTIVITY_ENTITY_TYPE.COMPLAINT,
        linkEntityId: c._id,
      })
      alerted++
    }
  }
  return alerted
}

/** Alerts once when an open work order passes its due date. */
export async function sweepOverdueWorkOrders(now = new Date()) {
  const due = await WorkOrder.find({ dueDate: { $lt: now }, status: { $nin: WORK_ORDER_TERMINAL_STATUSES }, overdueAlertedAt: null })
    .select('enterpriseId siteId code title dueDate')
    .limit(500)
    .lean()
  let alerted = 0
  for (const w of due) {
    const claimed = await WorkOrder.updateOne({ _id: w._id, overdueAlertedAt: null }, { $set: { overdueAlertedAt: now } })
    if (!claimed.modifiedCount) continue
    await notifyUsers({
      enterpriseId: w.enterpriseId,
      userIds: await recipients(w.enterpriseId, w.siteId),
      actorId: null,
      title: `Overdue: ${w.code}`,
      body: `${w.title} was due ${w.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`,
      kind: NOTIFICATION_KIND.OVERDUE,
      event: NOTIFICATION_EVENT.WORK_OVERDUE,
      linkEntityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
      linkEntityId: w._id,
    })
    alerted++
  }
  return alerted
}

const jobs = [sweepPmSchedules, sweepComplaintSla, sweepOverdueWorkOrders, sweepContractRenewals]

export async function runAllJobs(now = new Date()) {
  for (const job of jobs) {
    try {
      await job(now)
    } catch (err) {
      console.error(`[scheduler] ${job.name} failed:`, err.message)
    }
  }
}

let timer = null

export function startScheduler() {
  if (timer || env.scheduler.intervalMinutes <= 0) return
  const tick = () => runAllJobs().catch(() => {})
  timer = setInterval(tick, env.scheduler.intervalMinutes * 60_000)
  timer.unref()
  setTimeout(tick, 10_000).unref() // first pass shortly after boot
  console.log(`[scheduler] running every ${env.scheduler.intervalMinutes} min`)
}

export function stopScheduler() {
  if (timer) clearInterval(timer)
  timer = null
}
