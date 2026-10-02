import { PmSchedule, advanceDate } from '../models/PmSchedule.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { Asset } from '../models/Asset.js'
import { Contract, RENEWAL_WINDOW_DAYS } from '../models/Contract.js'
import { generateCode } from '../utils/sequence.js'
import { adminUserIds, clientUserIds, notifyUsers, siteStaffUserIds } from '../utils/notifier.js'
import { ACTIVITY_ENTITY_TYPE, NOTIFICATION_EVENT, NOTIFICATION_KIND, WORK_ORDER_STATUS } from '../constants/enums.js'

/**
 * Turns one occurrence of a PM schedule into a work order due on the
 * schedule's `nextDueDate`, then moves the schedule to its next occurrence
 * (skipping any windows already in the past, so a long pause doesn't dump a
 * backlog of stale jobs). Returns the new work order.
 */
export async function generateFromSchedule(schedule, { actorId = null, now = new Date() } = {}) {
  const dueDate = schedule.nextDueDate
  const code = await generateCode('workOrder', schedule.enterpriseId)
  const checklist = schedule.checklist?.length ? `\n\nChecklist:\n${schedule.checklist.map((c) => `- ${c}`).join('\n')}` : ''

  const workOrder = await WorkOrder.create({
    enterpriseId: schedule.enterpriseId,
    code,
    clientId: schedule.clientId,
    siteId: schedule.siteId,
    serviceId: schedule.serviceId,
    assetId: schedule.assetId ?? null,
    pmScheduleId: schedule._id,
    title: `${schedule.title} (${schedule.code})`,
    description: `${schedule.description || 'Scheduled preventive maintenance.'}${checklist}`,
    priority: schedule.priority,
    assignedEmployeeId: schedule.assignedEmployeeId,
    supervisorId: schedule.supervisorId ?? null,
    startDate: new Date(Math.max(now.getTime(), dueDate.getTime() - schedule.leadDays * 864e5)),
    dueDate,
    status: WORK_ORDER_STATUS.CREATED,
    statusHistory: [{ status: WORK_ORDER_STATUS.CREATED, progress: 0, actorId }],
  })

  if (schedule.assetId) {
    await Asset.updateOne(
      { _id: schedule.assetId },
      { $push: { history: { kind: 'maintenance', date: now, note: `${workOrder.code} · scheduled by ${schedule.code}`, workOrderId: workOrder._id, byUserId: actorId } } },
    )
  }

  let next = advanceDate(dueDate, schedule.frequencyUnit, schedule.frequencyInterval)
  while (next.getTime() - schedule.leadDays * 864e5 <= now.getTime()) next = advanceDate(next, schedule.frequencyUnit, schedule.frequencyInterval)
  schedule.nextDueDate = next
  schedule.lastGeneratedAt = now
  schedule.generatedCount += 1
  if (schedule.endDate && next > schedule.endDate) schedule.active = false
  await schedule.save()

  const [staff, clients] = await Promise.all([siteStaffUserIds(schedule.siteId), clientUserIds(schedule.clientId)])
  const body = `${workOrder.code} · ${schedule.title}, due ${dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
  await notifyUsers({
    enterpriseId: schedule.enterpriseId,
    userIds: staff,
    actorId,
    title: 'Scheduled maintenance',
    body,
    kind: NOTIFICATION_KIND.WORK_ORDER,
    event: NOTIFICATION_EVENT.PM_WORK_CREATED,
    linkEntityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    linkEntityId: workOrder._id,
  })
  await notifyUsers({
    enterpriseId: schedule.enterpriseId,
    userIds: clients,
    actorId,
    title: 'Maintenance visit scheduled',
    body,
    kind: NOTIFICATION_KIND.WORK_ORDER,
    event: NOTIFICATION_EVENT.WORK_CREATED,
    linkEntityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    linkEntityId: workOrder._id,
  })

  return workOrder
}

/** Scheduler job: generate work orders for every schedule inside its lead window. */
export async function sweepPmSchedules(now = new Date()) {
  const candidates = await PmSchedule.find({ active: true, nextDueDate: { $lte: new Date(now.getTime() + 60 * 864e5) } }).limit(1000)
  let created = 0
  for (const s of candidates) {
    if (s.nextDueDate.getTime() - s.leadDays * 864e5 > now.getTime()) continue
    if (s.endDate && s.nextDueDate > s.endDate) {
      s.active = false
      await s.save()
      continue
    }
    // Claim this occurrence so two sweeps can't both generate it.
    const claimed = await PmSchedule.updateOne(
      { _id: s._id, nextDueDate: s.nextDueDate, lastGeneratedAt: s.lastGeneratedAt, active: true },
      { $set: { lastGeneratedAt: now } },
    )
    if (!claimed.modifiedCount) continue
    try {
      await generateFromSchedule(s, { now })
      created++
    } catch (err) {
      console.error(`[pm] ${s.code} generation failed:`, err.message)
    }
  }
  return created
}

/** Scheduler job: alert admins once when a contract enters its renewal window. */
export async function sweepContractRenewals(now = new Date()) {
  const horizon = new Date(now.getTime() + RENEWAL_WINDOW_DAYS * 864e5)
  const expiring = await Contract.find({ cancelled: false, renewalAlertedAt: null, endDate: { $gte: now, $lte: horizon } })
    .populate('clientId', 'companyName')
    .limit(500)
  let alerted = 0
  for (const c of expiring) {
    const claimed = await Contract.updateOne({ _id: c._id, renewalAlertedAt: null }, { $set: { renewalAlertedAt: now } })
    if (!claimed.modifiedCount) continue
    const days = Math.max(0, Math.ceil((c.endDate - now) / 864e5))
    await notifyUsers({
      enterpriseId: c.enterpriseId,
      userIds: await adminUserIds(c.enterpriseId),
      actorId: null,
      title: `Contract expiring in ${days} day${days === 1 ? '' : 's'}`,
      body: `${c.code} · ${c.title} (${c.clientId?.companyName ?? 'client'}) ends ${c.endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
      kind: NOTIFICATION_KIND.CLIENT,
      event: NOTIFICATION_EVENT.CONTRACT_EXPIRING,
      linkEntityType: ACTIVITY_ENTITY_TYPE.CONTRACT,
      linkEntityId: c._id,
    })
    alerted++
  }
  return alerted
}
