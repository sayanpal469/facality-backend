import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { generateCode } from '../utils/sequence.js'
import { Complaint, complaintSla } from '../models/Complaint.js'
import { Client } from '../models/Client.js'
import { Employee } from '../models/Employee.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { attachMedia } from '../utils/attachMedia.js'
import { assertAssetAtSite, linkAssetEvent } from './asset.controller.js'
import { adminUserIds, clientUserIds, notifyUsers, siteStaffUserIds } from '../utils/notifier.js'
import { ACTIVITY_ENTITY_TYPE, COMPLAINT_STATUS, NOTIFICATION_EVENT, NOTIFICATION_KIND, ROLES } from '../constants/enums.js'

const STATUS_TEXT = {
  open: 'Complaint reopened',
  assigned: 'Assigned to a technician',
  acknowledged: 'Complaint acknowledged',
  work_started: 'Work started on the complaint',
  resolved: 'Marked as resolved — awaiting your confirmation',
  client_verification: 'Pending client verification',
  closed: 'Complaint closed',
}

// Statuses from which the client may confirm (close) or reopen.
const CLIENT_ACTIONABLE = [COMPLAINT_STATUS.RESOLVED, COMPLAINT_STATUS.CLIENT_VERIFICATION]

function pushHistory(complaint, text, actorId, status = null) {
  complaint.history.push({ text, status, actorId, at: new Date() })
}

/**
 * Adds `workOrderCode` alongside the raw `workOrderId` (which the admin panel
 * expects unpopulated) so the client app can show / link "WO-10245".
 */
async function withWorkOrderCodes(complaints) {
  const list = Array.isArray(complaints) ? complaints : [complaints]
  const ids = list.map((c) => c.workOrderId).filter(Boolean)
  const codes = new Map()
  if (ids.length) {
    const wos = await WorkOrder.find({ _id: { $in: ids } }).select('code').lean()
    for (const w of wos) codes.set(String(w._id), w.code)
  }
  const out = list.map((c) => ({
    ...c.toObject(),
    workOrderCode: c.workOrderId ? codes.get(String(c.workOrderId)) ?? null : null,
    sla: complaintSla(c),
  }))
  await attachMedia(out, 'complaintId')
  return Array.isArray(complaints) ? out : out[0]
}

async function notifyClientOfComplaint(req, complaint, { title, body, event }) {
  await notifyUsers({
    enterpriseId: req.user.enterpriseId,
    userIds: await clientUserIds(complaint.clientId),
    actorId: req.user._id,
    title,
    body,
    kind: NOTIFICATION_KIND.COMPLAINT,
    event,
    linkEntityType: ACTIVITY_ENTITY_TYPE.COMPLAINT,
    linkEntityId: complaint._id,
  })
}

async function notifyEnterpriseOfComplaint(req, complaint, { title, body, event }) {
  await notifyUsers({
    enterpriseId: req.user.enterpriseId,
    userIds: [...(await adminUserIds(req.user.enterpriseId)), ...(await siteStaffUserIds(complaint.siteId))],
    actorId: req.user._id,
    title,
    body,
    kind: NOTIFICATION_KIND.COMPLAINT,
    event,
    linkEntityType: ACTIVITY_ENTITY_TYPE.COMPLAINT,
    linkEntityId: complaint._id,
  })
}

function scopedComplaintFilter(req, extra = {}) {
  const filter = { enterpriseId: req.user.enterpriseId, ...extra }
  if (req.user.role === ROLES.USER) filter.clientId = req.user.clientId
  if (req.user.role === ROLES.SUPERVISOR || req.user.role === ROLES.SITE_MANAGER) {
    filter.siteId = { $in: req.scope.siteIds }
  }
  return filter
}

export const createComplaint = asyncHandler(async function createComplaint(req, res) {
  let clientId = req.body.clientId
  if (req.user.role === ROLES.USER) {
    clientId = req.user.clientId // clients may only ever raise complaints for themselves
  } else if (!clientId) {
    throw ApiError.badRequest('clientId is required')
  }

  const client = await Client.findOne({ _id: clientId, enterpriseId: req.user.enterpriseId })
  if (!client) throw ApiError.notFound('Client not found')

  if (req.body.workOrderId) {
    const linked = await WorkOrder.exists({ _id: req.body.workOrderId, enterpriseId: req.user.enterpriseId, clientId })
    if (!linked) throw ApiError.badRequest('Linked work order not found for this client')
  }

  await assertAssetAtSite(req, req.body.assetId, req.body.siteId)

  const code = await generateCode('complaint', req.user.enterpriseId)
  const complaint = await Complaint.create({
    ...req.body,
    clientId,
    code,
    enterpriseId: req.user.enterpriseId,
    raisedBy: req.user.role === ROLES.USER ? req.user._id : null,
    history: [{ text: `Complaint raised by ${req.user.name}`, status: COMPLAINT_STATUS.OPEN, actorId: req.user._id }],
  })

  await linkAssetEvent(req, req.body.assetId, {
    siteId: complaint.siteId,
    kind: 'complaint',
    note: `${complaint.code} · ${complaint.title}`,
    complaintId: complaint._id,
  })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'raised a complaint',
    entityType: ACTIVITY_ENTITY_TYPE.COMPLAINT,
    entityId: complaint._id,
    entityLabel: complaint.title,
  })

  await notifyEnterpriseOfComplaint(req, complaint, {
    title: `New complaint · ${complaint.priority.toUpperCase()}`,
    body: `${complaint.code} · ${complaint.title} (${client.companyName})`,
    event: NOTIFICATION_EVENT.COMPLAINT_RAISED,
  })

  return sendResponse(res, 201, await withWorkOrderCodes(complaint), 'Complaint raised')
})

export const listComplaints = asyncHandler(async function listComplaints(req, res) {
  const q = req.validatedQuery
  const filter = scopedComplaintFilter(req)
  if (q.clientId) filter.clientId = q.clientId
  if (q.siteId) filter.siteId = q.siteId
  if (q.serviceId) filter.serviceId = q.serviceId
  if (q.assignedEmployeeId) filter.assignedEmployeeId = q.assignedEmployeeId
  if (q.status) filter.status = q.status
  if (q.priority) filter.priority = q.priority
  if (q.sla === 'breached') {
    // Still unresolved and past a deadline — the ones someone needs to act on now.
    const now = new Date()
    filter.resolvedAt = null
    filter.$and = [{ $or: [{ respondedAt: null, responseDueAt: { $lt: now } }, { resolutionDueAt: { $lt: now } }] }]
  }
  if (q.search) {
    filter.$or = [{ code: { $regex: q.search, $options: 'i' } }, { title: { $regex: q.search, $options: 'i' } }]
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    Complaint.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('clientId', 'companyName')
      .populate('siteId', 'name')
      .populate('serviceId', 'name')
      .populate('assignedEmployeeId', 'name'),
    Complaint.countDocuments(filter),
  ])

  return sendResponse(res, 200, await withWorkOrderCodes(items), undefined, paginatedMeta({ page, limit, total }))
})

export const getComplaint = asyncHandler(async function getComplaint(req, res) {
  const complaint = await Complaint.findOne(scopedComplaintFilter(req, { _id: req.params.id }))
    .populate('clientId', 'companyName')
    .populate('siteId', 'name')
    .populate('serviceId', 'name')
    .populate('assignedEmployeeId', 'name mobile')
    .populate('assetId', 'code name type brand location')
    .populate('history.actorId', 'name')

  if (!complaint) throw ApiError.notFound('Complaint not found')
  return sendResponse(res, 200, await withWorkOrderCodes(complaint))
})

export const assignComplaint = asyncHandler(async function assignComplaint(req, res) {
  const complaint = await Complaint.findOne(scopedComplaintFilter(req, { _id: req.params.id }))
  if (!complaint) throw ApiError.notFound('Complaint not found')

  const employee = await Employee.findOne({ _id: req.body.assignedEmployeeId, enterpriseId: req.user.enterpriseId }).select('name')
  if (!employee) throw ApiError.notFound('Employee not found')

  const wasUnassigned = !complaint.assignedEmployeeId
  complaint.assignedEmployeeId = req.body.assignedEmployeeId
  if (complaint.status === 'open') complaint.status = 'assigned'
  pushHistory(complaint, `${wasUnassigned ? 'Assigned' : 'Reassigned'} to ${employee.name}`, req.user._id, complaint.status)
  await complaint.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: wasUnassigned ? 'assigned complaint' : 'reassigned complaint',
    entityType: ACTIVITY_ENTITY_TYPE.COMPLAINT,
    entityId: complaint._id,
    entityLabel: complaint.title,
  })

  await notifyClientOfComplaint(req, complaint, {
    title: 'Complaint assigned',
    body: `${complaint.code} is now being handled by ${employee.name}.`,
    event: NOTIFICATION_EVENT.COMPLAINT_ASSIGNED,
  })

  return sendResponse(res, 200, complaint, wasUnassigned ? 'Complaint assigned' : 'Complaint reassigned')
})

export const updateComplaintStatus = asyncHandler(async function updateComplaintStatus(req, res) {
  const complaint = await Complaint.findOne(scopedComplaintFilter(req, { _id: req.params.id }))
  if (!complaint) throw ApiError.notFound('Complaint not found')

  // Clients may only confirm/close their own complaint once resolved — not skip the queue.
  const isClient = req.user.role === ROLES.USER
  if (isClient && (!['client_verification', 'closed'].includes(req.body.status) || !CLIENT_ACTIONABLE.includes(complaint.status))) {
    throw ApiError.forbidden('You can only confirm or close a resolved complaint')
  }

  const fromStatus = complaint.status
  complaint.status = req.body.status
  if (req.body.resolutionNote !== undefined) complaint.resolutionNote = req.body.resolutionNote
  if (fromStatus !== complaint.status) {
    const text = isClient && complaint.status === COMPLAINT_STATUS.CLOSED ? `Resolution confirmed by ${req.user.name}` : STATUS_TEXT[complaint.status]
    pushHistory(complaint, text, req.user._id, complaint.status)
  }
  await complaint.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: req.body.status === 'closed' ? 'closed complaint' : `updated complaint status to "${req.body.status}"`,
    entityType: ACTIVITY_ENTITY_TYPE.COMPLAINT,
    entityId: complaint._id,
    entityLabel: complaint.title,
  })

  if (fromStatus !== complaint.status) {
    if (isClient) {
      await notifyEnterpriseOfComplaint(req, complaint, {
        title: complaint.status === COMPLAINT_STATUS.CLOSED ? 'Client confirmed resolution' : 'Complaint status updated by client',
        body: `${complaint.code} · ${complaint.title}`,
        event: NOTIFICATION_EVENT.COMPLAINT_STATUS,
      })
    } else {
      const resolved = complaint.status === COMPLAINT_STATUS.RESOLVED
      await notifyClientOfComplaint(req, complaint, {
        title: resolved ? 'Complaint resolved — please confirm' : STATUS_TEXT[complaint.status],
        body: `${complaint.code} · ${complaint.title}`,
        event: resolved ? NOTIFICATION_EVENT.COMPLAINT_RESOLVED : NOTIFICATION_EVENT.COMPLAINT_STATUS,
      })
    }
  }

  return sendResponse(res, 200, await withWorkOrderCodes(complaint), 'Complaint updated')
})

/** Client-app facing: the fix didn't hold — send a resolved complaint back into the work queue. */
export const reopenComplaint = asyncHandler(async function reopenComplaint(req, res) {
  const complaint = await Complaint.findOne(scopedComplaintFilter(req, { _id: req.params.id }))
  if (!complaint) throw ApiError.notFound('Complaint not found')
  if (!CLIENT_ACTIONABLE.includes(complaint.status)) {
    throw ApiError.badRequest('Only a resolved complaint can be reopened')
  }

  complaint.status = complaint.assignedEmployeeId ? COMPLAINT_STATUS.WORK_STARTED : COMPLAINT_STATUS.OPEN
  complaint.resolutionNote = null
  pushHistory(complaint, `Reopened by ${req.user.name}: ${req.body.reason}`, req.user._id, complaint.status)
  await complaint.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `reopened complaint (${req.body.reason})`,
    entityType: ACTIVITY_ENTITY_TYPE.COMPLAINT,
    entityId: complaint._id,
    entityLabel: complaint.title,
  })

  await notifyEnterpriseOfComplaint(req, complaint, {
    title: 'Complaint reopened by client',
    body: `${complaint.code}: ${req.body.reason.slice(0, 140)}`,
    event: NOTIFICATION_EVENT.COMPLAINT_REOPENED,
  })

  return sendResponse(res, 200, await withWorkOrderCodes(complaint), 'Complaint reopened')
})
