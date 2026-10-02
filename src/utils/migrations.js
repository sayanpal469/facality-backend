import { Site, newSiteQrCode } from '../models/Site.js'
import { Complaint } from '../models/Complaint.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { COMPLAINT_STATUS, WORK_ORDER_TERMINAL_STATUSES } from '../constants/enums.js'

const RESOLVED = [COMPLAINT_STATUS.RESOLVED, COMPLAINT_STATUS.CLIENT_VERIFICATION, COMPLAINT_STATUS.CLOSED]

/**
 * Idempotent data fixes run on every boot (after connecting): backfills
 * fields introduced after records already existed.
 */
export async function runMigrations() {
  const sites = await Site.find({ $or: [{ qrCode: null }, { qrCode: { $exists: false } }] }).select('_id')
  for (const s of sites) {
    await Site.updateOne({ _id: s._id }, { qrCode: newSiteQrCode() })
  }
  if (sites.length) console.log(`[migrations] issued QR codes for ${sites.length} site(s)`)

  await backfillComplaintSla()
  await backfillOverdueAlerts()
}

/** SLA clocks for complaints raised before SLA tracking existed. */
async function backfillComplaintSla() {
  const now = new Date()
  const old = await Complaint.find({ responseDueAt: { $exists: false } })
  for (const c of old) {
    const firstMove = c.history.find((h) => h.status && h.status !== COMPLAINT_STATUS.OPEN)
    const resolved = RESOLVED.includes(c.status) ? c.history.findLast((h) => RESOLVED.includes(h.status)) : null
    c.respondedAt = c.status === COMPLAINT_STATUS.OPEN ? null : (firstMove?.at ?? c.updatedAt)
    c.resolvedAt = resolved ? resolved.at : RESOLVED.includes(c.status) ? c.updatedAt : null
    c.responseDueAt = null // recomputed by the model's SLA hook
    await c.save({ timestamps: false })
    // Historic breaches are not news — don't let the first sweep alert on them.
    const alerts = {}
    if (!c.respondedAt && c.responseDueAt < now) alerts['slaAlerts.response'] = now
    if (!c.resolvedAt && c.resolutionDueAt < now) alerts['slaAlerts.resolution'] = now
    if (Object.keys(alerts).length) await Complaint.updateOne({ _id: c._id }, { $set: alerts })
  }
  if (old.length) console.log(`[migrations] backfilled SLA for ${old.length} complaint(s)`)
}

async function backfillOverdueAlerts() {
  const res = await WorkOrder.updateMany(
    { overdueAlertedAt: { $exists: false }, dueDate: { $lt: new Date() }, status: { $nin: WORK_ORDER_TERMINAL_STATUSES } },
    { $set: { overdueAlertedAt: new Date() } },
  )
  if (res.modifiedCount) console.log(`[migrations] marked ${res.modifiedCount} already-overdue work order(s) as alerted`)
}
