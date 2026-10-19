import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { generateCode } from '../utils/sequence.js'
import { assertAssetAtSite, linkAssetEvent } from './asset.controller.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { ServiceType } from '../models/ServiceType.js'
import { buildMaterialItems, effectiveQuantity, packageAsPricingInput, refreshPricing } from '../utils/pricing.js'
import { createDraftInvoice } from '../utils/invoiceDraft.js'
import { Complaint } from '../models/Complaint.js'
import { adminUserIds, clientUserIds, notifyUsers, siteStaffUserIds } from '../utils/notifier.js'
import {
  ACTIVITY_ENTITY_TYPE,
  MATERIAL_STATUS,
  NOTIFICATION_EVENT,
  NOTIFICATION_KIND,
  ROLES,
  WORK_ORDER_LOCKED_STATUSES,
  WORK_ORDER_STATUS,
  WORK_ORDER_TERMINAL_STATUSES,
} from '../constants/enums.js'

// Supervisor rejections are stored as progress notes carrying this marker
// (see the enterprise app's work_order_repository.dart) — internal back-and-forth
// the client shouldn't be pinged about.
const REJECTION_MARKER = '⟦NEEDS_CORRECTION⟧'

const STATUS_LABEL = {
  created: 'Created',
  assigned: 'Assigned',
  accepted: 'Accepted',
  site_visit: 'Site visit',
  work_started: 'Work started',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
  verified: 'Verified',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

function recordStatus(workOrder, status, actorId, note = null) {
  workOrder.statusHistory.push({ status, progress: workOrder.progress, note, actorId, at: new Date() })
}

async function notifyClient(req, workOrder, { title, body, event }) {
  await notifyUsers({
    enterpriseId: req.user.enterpriseId,
    userIds: await clientUserIds(workOrder.clientId),
    actorId: req.user._id,
    title,
    body,
    kind: NOTIFICATION_KIND.WORK_ORDER,
    event,
    linkEntityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    linkEntityId: workOrder._id,
  })
}

/** Client-facing copy for a status the work order just moved into. */
function clientStatusNotice(workOrder) {
  const ref = `${workOrder.code} · ${workOrder.title}`
  switch (workOrder.status) {
    case WORK_ORDER_STATUS.WORK_STARTED:
      return { title: 'Work started', body: ref, event: NOTIFICATION_EVENT.WORK_STARTED }
    case WORK_ORDER_STATUS.COMPLETED:
      return { title: 'Work completed', body: `${ref} — pending supervisor verification.`, event: NOTIFICATION_EVENT.WORK_COMPLETED }
    case WORK_ORDER_STATUS.VERIFIED:
      return { title: 'Work verified — please review', body: `${ref} is ready for your approval.`, event: NOTIFICATION_EVENT.WORK_VERIFIED }
    case WORK_ORDER_STATUS.CLOSED:
      return { title: 'Work order closed', body: ref, event: NOTIFICATION_EVENT.WORK_CLOSED }
    case WORK_ORDER_STATUS.CANCELLED:
      return { title: 'Work order cancelled', body: ref, event: NOTIFICATION_EVENT.WORK_CANCELLED }
    default:
      return { title: `Status: ${STATUS_LABEL[workOrder.status] ?? workOrder.status}`, body: ref, event: NOTIFICATION_EVENT.WORK_STATUS }
  }
}

function scopedWorkOrderFilter(req, extra = {}) {
  const filter = { enterpriseId: req.user.enterpriseId, ...extra }
  if (req.user.role === ROLES.USER) filter.clientId = req.user.clientId
  if (req.user.role === ROLES.SUPERVISOR || req.user.role === ROLES.SITE_MANAGER) {
    filter.siteId = { $in: req.scope.siteIds }
  }
  return filter
}

/** Copies admin pricing input onto the work order (keeping the client's answers where nothing changed). */
async function applyPricingInput(req, workOrder, input) {
  const items = await buildMaterialItems(req.user.enterpriseId, input.items, workOrder.pricing?.items ?? [])
  const mode = input.transportMode ?? 'auto'
  if (mode === 'manual' && input.transportCharge === undefined) throw ApiError.badRequest('Enter the transport charge, or switch transport to automatic')
  if (!workOrder.pricing) workOrder.pricing = {}
  workOrder.pricing.serviceCharge = input.serviceCharge
  workOrder.pricing.items = items
  workOrder.pricing.transportMode = mode
  if (mode === 'manual') {
    workOrder.pricing.manualTransportCharge = input.transportCharge
    workOrder.pricing.distanceKm = null
  }
  await refreshPricing(workOrder)
}

async function notifyMaterialsApproval(req, workOrder) {
  const pending = workOrder.pricing.items.filter((i) => i.status === MATERIAL_STATUS.PENDING).length
  await notifyClient(req, workOrder, {
    title: 'Products need your approval',
    body: `${workOrder.code} · ${pending} product${pending === 1 ? '' : 's'} proposed — total ₹${workOrder.pricing.total.toLocaleString('en-IN')}`,
    event: NOTIFICATION_EVENT.MATERIALS_APPROVAL,
  })
}

function isOverdue(wo) {
  return wo.dueDate < new Date() && !WORK_ORDER_TERMINAL_STATUSES.includes(wo.status)
}

export const createWorkOrder = asyncHandler(async function createWorkOrder(req, res) {
  // A work order raised from a complaint services the same equipment unless told otherwise.
  let assetId = req.body.assetId
  if (!assetId && req.body.fromComplaintId) {
    assetId = (await Complaint.findOne({ _id: req.body.fromComplaintId, enterpriseId: req.user.enterpriseId }).select('assetId').lean())?.assetId ?? undefined
  }
  await assertAssetAtSite(req, assetId, req.body.siteId)

  const { pricing: pricingInput, applyServicePackage, ...fields } = req.body
  let pricing = pricingInput
  if (!pricing && applyServicePackage) {
    const serviceType = await ServiceType.findOne({ _id: fields.serviceId, enterpriseId: req.user.enterpriseId })
    if (serviceType) pricing = await packageAsPricingInput(serviceType)
  }

  const code = await generateCode('workOrder', req.user.enterpriseId)
  const workOrder = new WorkOrder({
    ...fields,
    assetId: assetId ?? null,
    code,
    enterpriseId: req.user.enterpriseId,
    statusHistory: [{ status: WORK_ORDER_STATUS.CREATED, progress: 0, actorId: req.user._id }],
  })
  if (pricing) await applyPricingInput(req, workOrder, pricing)
  await workOrder.save()

  await linkAssetEvent(req, assetId, {
    siteId: workOrder.siteId,
    kind: req.body.fromComplaintId ? 'repair' : 'maintenance',
    note: `${workOrder.code} · ${workOrder.title}`,
    workOrderId: workOrder._id,
  })

  if (req.body.fromComplaintId) {
    // Loaded and saved (not updateOne) so the complaint's SLA hook records the response.
    const complaint = await Complaint.findOne({ _id: req.body.fromComplaintId, enterpriseId: req.user.enterpriseId })
    if (complaint) {
      complaint.workOrderId = workOrder._id
      complaint.status = 'assigned'
      await complaint.save()
    }
  }

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'created work order',
    entityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    entityId: workOrder._id,
    entityLabel: workOrder.title,
  })

  await notifyClient(req, workOrder, {
    title: 'New work order',
    body: `${workOrder.code} · ${workOrder.title}`,
    event: NOTIFICATION_EVENT.WORK_CREATED,
  })
  if (workOrder.pricing?.clientStatus === 'pending') await notifyMaterialsApproval(req, workOrder)

  return sendResponse(res, 201, workOrder, 'Work order created')
})

export const listWorkOrders = asyncHandler(async function listWorkOrders(req, res) {
  const q = req.validatedQuery
  const filter = scopedWorkOrderFilter(req)
  if (q.clientId) filter.clientId = q.clientId
  if (q.siteId) filter.siteId = q.siteId
  if (q.serviceId) filter.serviceId = q.serviceId
  if (q.assignedEmployeeId) filter.assignedEmployeeId = q.assignedEmployeeId
  if (q.status) filter.status = q.status
  if (q.priority) filter.priority = q.priority
  if (q.dateFrom || q.dateTo) {
    filter.createdAt = {}
    if (q.dateFrom) filter.createdAt.$gte = q.dateFrom
    if (q.dateTo) filter.createdAt.$lte = q.dateTo
  }
  if (q.overdue) {
    filter.dueDate = { $lt: new Date() }
    filter.status = { $nin: WORK_ORDER_TERMINAL_STATUSES }
  }
  if (q.search) {
    filter.$or = [{ code: { $regex: q.search, $options: 'i' } }, { title: { $regex: q.search, $options: 'i' } }]
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    WorkOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('clientId', 'companyName')
      .populate('siteId', 'name')
      .populate('serviceId', 'name')
      .populate('assignedEmployeeId', 'name')
      .populate('supervisorId', 'name'),
    WorkOrder.countDocuments(filter),
  ])

  const withOverdue = items.map((w) => ({ ...w.toObject(), isOverdue: isOverdue(w) }))
  return sendResponse(res, 200, withOverdue, undefined, paginatedMeta({ page, limit, total }))
})

export const getWorkOrder = asyncHandler(async function getWorkOrder(req, res) {
  const workOrder = await WorkOrder.findOne(scopedWorkOrderFilter(req, { _id: req.params.id }))
    .populate('clientId', 'companyName')
    .populate('siteId', 'name address')
    .populate({ path: 'serviceId', select: 'name categoryId', populate: { path: 'categoryId', select: 'name' } })
    .populate({ path: 'assignedEmployeeId', select: 'name mobile serviceId', populate: { path: 'serviceId', select: 'name' } })
    .populate('supervisorId', 'name mobile')
    .populate('assetId', 'code name type brand modelNumber location installDate status')
    .populate('updates.authorId', 'name')
    .populate('statusHistory.actorId', 'name')

  if (!workOrder) throw ApiError.notFound('Work order not found')
  return sendResponse(res, 200, { ...workOrder.toObject(), isOverdue: isOverdue(workOrder) })
})

export const updateWorkOrder = asyncHandler(async function updateWorkOrder(req, res) {
  const workOrder = await WorkOrder.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!workOrder) throw ApiError.notFound('Work order not found')
  if (WORK_ORDER_TERMINAL_STATUSES.includes(workOrder.status)) {
    throw ApiError.badRequest('This work order is closed and can no longer be edited')
  }

  Object.assign(workOrder, req.body)
  await workOrder.save()

  return sendResponse(res, 200, workOrder, 'Work order updated')
})

export const reassignWorkOrder = asyncHandler(async function reassignWorkOrder(req, res) {
  const workOrder = await WorkOrder.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!workOrder) throw ApiError.notFound('Work order not found')

  workOrder.assignedEmployeeId = req.body.assignedEmployeeId
  await workOrder.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'reassigned work order',
    entityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    entityId: workOrder._id,
    entityLabel: workOrder.title,
  })

  return sendResponse(res, 200, workOrder, 'Work order reassigned')
})

export const changeWorkOrderPriority = asyncHandler(async function changeWorkOrderPriority(req, res) {
  const workOrder = await WorkOrder.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!workOrder) throw ApiError.notFound('Work order not found')

  workOrder.priority = req.body.priority
  await workOrder.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'changed work order priority',
    entityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    entityId: workOrder._id,
    entityLabel: workOrder.title,
  })

  return sendResponse(res, 200, workOrder, 'Priority updated')
})

export const cancelWorkOrder = asyncHandler(async function cancelWorkOrder(req, res) {
  const workOrder = await WorkOrder.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!workOrder) throw ApiError.notFound('Work order not found')
  if (WORK_ORDER_TERMINAL_STATUSES.includes(workOrder.status)) {
    throw ApiError.badRequest('This work order is already closed')
  }

  workOrder.status = WORK_ORDER_STATUS.CANCELLED
  workOrder.cancelReason = req.body.reason
  recordStatus(workOrder, WORK_ORDER_STATUS.CANCELLED, req.user._id, req.body.reason)
  await workOrder.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `cancelled work order (${req.body.reason})`,
    entityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    entityId: workOrder._id,
    entityLabel: workOrder.title,
  })

  await notifyClient(req, workOrder, clientStatusNotice(workOrder))

  return sendResponse(res, 200, workOrder, 'Work order cancelled')
})

export const overrideWorkOrderStatus = asyncHandler(async function overrideWorkOrderStatus(req, res) {
  const workOrder = await WorkOrder.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!workOrder) throw ApiError.notFound('Work order not found')

  const fromStatus = workOrder.status
  workOrder.status = req.body.status
  if (['completed', 'verified', 'closed'].includes(req.body.status)) workOrder.progress = 100
  workOrder.overrideHistory.push({ fromStatus, toStatus: req.body.status, reason: req.body.reason, actorId: req.user._id })
  recordStatus(workOrder, req.body.status, req.user._id, req.body.reason)
  await workOrder.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `overrode status from "${fromStatus}" to "${req.body.status}" (${req.body.reason})`,
    entityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    entityId: workOrder._id,
    entityLabel: workOrder.title,
  })

  if (fromStatus !== workOrder.status) await notifyClient(req, workOrder, clientStatusNotice(workOrder))

  return sendResponse(res, 200, workOrder, 'Status overridden')
})

/** Enterprise-app facing: technician/supervisor moves the work order forward one step, with a note. */
export const advanceWorkOrderStatus = asyncHandler(async function advanceWorkOrderStatus(req, res) {
  const workOrder = await WorkOrder.findOne(scopedWorkOrderFilter(req, { _id: req.params.id }))
  if (!workOrder) throw ApiError.notFound('Work order not found')
  if (WORK_ORDER_LOCKED_STATUSES.includes(workOrder.status)) {
    throw ApiError.badRequest('This work order is already closed')
  }

  const fromStatus = workOrder.status
  workOrder.status = req.body.status
  if (req.body.progress !== undefined) workOrder.progress = req.body.progress
  const statusChanged = fromStatus !== workOrder.status
  if (statusChanged) recordStatus(workOrder, workOrder.status, req.user._id)
  await workOrder.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `moved work order to "${req.body.status}"`,
    entityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    entityId: workOrder._id,
    entityLabel: workOrder.title,
  })

  if (statusChanged) {
    await notifyClient(req, workOrder, clientStatusNotice(workOrder))
    if (workOrder.status === WORK_ORDER_STATUS.ON_HOLD) {
      await notifyUsers({
        enterpriseId: req.user.enterpriseId,
        userIds: await adminUserIds(req.user.enterpriseId),
        actorId: req.user._id,
        title: 'Work put on hold',
        body: `${req.user.name} flagged a blocker on ${workOrder.code} · ${workOrder.title}`,
        kind: NOTIFICATION_KIND.EMPLOYEE,
        event: NOTIFICATION_EVENT.WORK_STATUS,
        linkEntityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
        linkEntityId: workOrder._id,
      })
    }
    if (workOrder.status === WORK_ORDER_STATUS.COMPLETED) {
      await notifyUsers({
        enterpriseId: req.user.enterpriseId,
        userIds: await siteStaffUserIds(workOrder.siteId),
        actorId: req.user._id,
        title: 'Work awaiting verification',
        body: `${workOrder.code} · ${workOrder.title}`,
        kind: NOTIFICATION_KIND.VERIFICATION,
        linkEntityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
        linkEntityId: workOrder._id,
      })
    }
  }

  return sendResponse(res, 200, workOrder, 'Status updated')
})

/**
 * Client-app facing: the client signs off on work a supervisor has already
 * verified, closing the work order (Verified → Closed in the BRD lifecycle).
 */
export const clientApproveWorkOrder = asyncHandler(async function clientApproveWorkOrder(req, res) {
  const workOrder = await WorkOrder.findOne(scopedWorkOrderFilter(req, { _id: req.params.id }))
  if (!workOrder) throw ApiError.notFound('Work order not found')
  if (workOrder.status !== WORK_ORDER_STATUS.VERIFIED) {
    throw ApiError.badRequest('Only verified work can be approved')
  }

  workOrder.status = WORK_ORDER_STATUS.CLOSED
  workOrder.progress = 100
  recordStatus(workOrder, WORK_ORDER_STATUS.CLOSED, req.user._id, req.body?.note || 'Approved by client')
  await workOrder.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'approved completed work',
    entityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    entityId: workOrder._id,
    entityLabel: workOrder.title,
  })

  await notifyUsers({
    enterpriseId: req.user.enterpriseId,
    userIds: [...(await adminUserIds(req.user.enterpriseId)), ...(await siteStaffUserIds(workOrder.siteId))],
    actorId: req.user._id,
    title: 'Client approved work',
    body: `${workOrder.code} · ${workOrder.title}`,
    kind: NOTIFICATION_KIND.CLIENT,
    event: NOTIFICATION_EVENT.WORK_CLOSED,
    linkEntityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    linkEntityId: workOrder._id,
  })

  return sendResponse(res, 200, workOrder, 'Work approved')
})

export const addProgressUpdate = asyncHandler(async function addProgressUpdate(req, res) {
  const workOrder = await WorkOrder.findOne(scopedWorkOrderFilter(req, { _id: req.params.id }))
  if (!workOrder) throw ApiError.notFound('Work order not found')

  workOrder.updates.push({ authorId: req.user._id, note: req.body.note })
  await workOrder.save()

  if (!req.body.note.startsWith(REJECTION_MARKER)) {
    await notifyClient(req, workOrder, {
      title: `Progress update · ${workOrder.progress}%`,
      body: `${workOrder.code}: ${req.body.note.slice(0, 140)}`,
      event: NOTIFICATION_EVENT.PROGRESS_UPDATE,
    })
  }

  return sendResponse(res, 201, workOrder.updates.at(-1), 'Update added')
})

// ── Pricing: service charge + bundled products + transport ─────────────────

// Once the work is closed or called off the price is final.
const PRICING_LOCKED = [WORK_ORDER_STATUS.CLOSED, WORK_ORDER_STATUS.CANCELLED]

/** Admin sets/replaces the job's price breakdown (prefilled from the service package in the panel). */
export const setWorkOrderPricing = asyncHandler(async function setWorkOrderPricing(req, res) {
  const workOrder = await WorkOrder.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!workOrder) throw ApiError.notFound('Work order not found')
  if (PRICING_LOCKED.includes(workOrder.status)) throw ApiError.badRequest(`A ${workOrder.status} work order's pricing can't be changed`)
  if (workOrder.pricing?.invoiceId) throw ApiError.badRequest('This work order has been invoiced — edit the invoice instead')

  const pendingBefore = new Set((workOrder.pricing?.items ?? []).filter((i) => i.status === MATERIAL_STATUS.PENDING).map((i) => String(i._id)))
  await applyPricingInput(req, workOrder, req.body)
  await workOrder.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `set pricing (₹${workOrder.pricing.total.toLocaleString('en-IN')})`,
    entityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    entityId: workOrder._id,
    entityLabel: workOrder.title,
  })

  // Only ping the client when something new is waiting on them.
  const newlyPending = workOrder.pricing.items.some((i) => i.status === MATERIAL_STATUS.PENDING && !pendingBefore.has(String(i._id)))
  if (newlyPending) await notifyMaterialsApproval(req, workOrder)

  return sendResponse(res, 200, workOrder, 'Pricing saved')
})

export const removeWorkOrderPricing = asyncHandler(async function removeWorkOrderPricing(req, res) {
  const workOrder = await WorkOrder.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!workOrder) throw ApiError.notFound('Work order not found')
  if (PRICING_LOCKED.includes(workOrder.status)) throw ApiError.badRequest(`A ${workOrder.status} work order's pricing can't be changed`)
  if (workOrder.pricing?.invoiceId) throw ApiError.badRequest('This work order has been invoiced')
  workOrder.pricing = null
  await workOrder.save()
  return sendResponse(res, 200, workOrder, 'Pricing removed')
})

/**
 * Client-app facing: approve each bundled product in full, in part
 * (approvedQuantity < proposed) or reject it (0). Answers can be changed
 * until the work is completed.
 */
export const respondWorkOrderPricing = asyncHandler(async function respondWorkOrderPricing(req, res) {
  const workOrder = await WorkOrder.findOne(scopedWorkOrderFilter(req, { _id: req.params.id }))
  if (!workOrder) throw ApiError.notFound('Work order not found')
  if (!workOrder.pricing?.items?.length) throw ApiError.badRequest('This work order has no products to approve')
  if (WORK_ORDER_TERMINAL_STATUSES.includes(workOrder.status)) throw ApiError.badRequest('This work is already complete — product choices can no longer be changed')
  if (workOrder.pricing.invoiceId) throw ApiError.badRequest('This work order has already been invoiced')

  const now = new Date()
  for (const answer of req.body.items) {
    const item = workOrder.pricing.items.id(answer.itemId)
    if (!item) throw ApiError.badRequest('One of the products is no longer on this work order — refresh and try again')
    if (answer.approvedQuantity > item.quantity) throw ApiError.badRequest(`You can approve at most ${item.quantity} of "${item.name}"`)
    item.approvedQuantity = answer.approvedQuantity
    item.status = answer.approvedQuantity === 0 ? MATERIAL_STATUS.REJECTED : MATERIAL_STATUS.APPROVED
    if (answer.note !== undefined) item.clientNote = answer.note
    item.respondedAt = now
  }
  await refreshPricing(workOrder)
  workOrder.pricing.respondedAt = now
  workOrder.pricing.respondedBy = req.user._id
  await workOrder.save()

  const items = workOrder.pricing.items
  const approved = items.filter((i) => i.status === MATERIAL_STATUS.APPROVED)
  const partial = approved.filter((i) => i.approvedQuantity < i.quantity).length
  const rejected = items.filter((i) => i.status === MATERIAL_STATUS.REJECTED).length
  const summary = [`${approved.length} approved`, partial ? `${partial} reduced` : null, rejected ? `${rejected} rejected` : null].filter(Boolean).join(', ')

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `reviewed products (${summary})`,
    entityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    entityId: workOrder._id,
    entityLabel: workOrder.title,
  })

  await notifyUsers({
    enterpriseId: req.user.enterpriseId,
    userIds: [...(await adminUserIds(req.user.enterpriseId)), ...(await siteStaffUserIds(workOrder.siteId))],
    actorId: req.user._id,
    title: 'Client reviewed products',
    body: `${workOrder.code} · ${summary} — new total ₹${workOrder.pricing.total.toLocaleString('en-IN')}`,
    kind: NOTIFICATION_KIND.CLIENT,
    event: NOTIFICATION_EVENT.MATERIALS_RESPONDED,
    linkEntityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    linkEntityId: workOrder._id,
  })

  return sendResponse(res, 200, workOrder, 'Thanks — your choices were saved')
})

/** Draft invoice from the job's pricing: service charge, approved products, transport. */
export const invoiceWorkOrder = asyncHandler(async function invoiceWorkOrder(req, res) {
  const workOrder = await WorkOrder.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId }).populate('serviceId', 'name')
  if (!workOrder) throw ApiError.notFound('Work order not found')
  const p = workOrder.pricing
  if (!p) throw ApiError.badRequest('Add pricing to this work order first')
  if (p.invoiceId) throw ApiError.conflict('This work order already has an invoice')
  if (workOrder.status === WORK_ORDER_STATUS.CANCELLED) throw ApiError.badRequest("A cancelled work order can't be invoiced")
  if (p.clientStatus === 'pending') throw ApiError.badRequest('The client has not reviewed the proposed products yet')

  const lines = []
  if (p.serviceCharge > 0) lines.push({ description: `Service charge — ${workOrder.serviceId?.name ?? 'service'}`, quantity: 1, unit: 'job', rate: p.serviceCharge, taxPercent: 0 })
  for (const item of p.items) {
    const qty = effectiveQuantity(item)
    if (qty > 0) lines.push({ description: `${item.name}${item.packSize ? ` (${item.packSize})` : ''}`, quantity: qty, unit: item.unit, rate: item.unitPrice, taxPercent: 0 })
  }
  if (p.transportCharge > 0) lines.push({ description: `Transport for products${p.distanceKm != null ? ` (~${p.distanceKm} km)` : ''}`, quantity: 1, unit: 'trip', rate: p.transportCharge, taxPercent: 0 })
  if (!lines.length) throw ApiError.badRequest('Nothing to invoice — the total is zero')

  const invoice = await createDraftInvoice(req, {
    clientId: workOrder.clientId,
    siteId: workOrder.siteId,
    title: `${workOrder.code} · ${workOrder.title}`,
    items: lines,
    dueDate: req.body.dueDate,
    notes: 'Prices are inclusive of GST.',
    workOrderIds: [workOrder._id],
  })
  p.invoiceId = invoice._id
  await workOrder.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `invoiced as ${invoice.code}`,
    entityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    entityId: workOrder._id,
    entityLabel: workOrder.title,
  })

  return sendResponse(res, 201, invoice, 'Draft invoice created')
})
