import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { scopedFilter } from '../utils/scope.js'
import { generateCode } from '../utils/sequence.js'
import { Asset } from '../models/Asset.js'
import { Site } from '../models/Site.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { Complaint } from '../models/Complaint.js'
import { ACTIVITY_ENTITY_TYPE, ROLES } from '../constants/enums.js'

const STATUS_LABEL = { active: 'Active', under_maintenance: 'Under maintenance', faulty: 'Faulty', retired: 'Retired' }

/**
 * Used by the work order / complaint controllers: checks that `assetId`
 * belongs to the same site and appends a lifecycle entry pointing at the
 * new record. Returns the asset id to store, or null.
 */
export async function linkAssetEvent(req, assetId, { siteId, kind, note, workOrderId = null, complaintId = null }) {
  if (!assetId) return null
  const asset = await Asset.findOne({ _id: assetId, enterpriseId: req.user.enterpriseId, siteId })
  if (!asset) throw ApiError.badRequest('That equipment is not installed at this site')
  asset.history.push({ kind, date: new Date(), note, workOrderId, complaintId, byUserId: req.user._id })
  if (kind === 'complaint' && asset.status === 'active') asset.status = 'faulty'
  await asset.save()
  return asset._id
}

/** Asset exists at the site — validation only, used before the owning record is created. */
export async function assertAssetAtSite(req, assetId, siteId) {
  if (!assetId) return
  if (!(await Asset.exists({ _id: assetId, enterpriseId: req.user.enterpriseId, siteId }))) {
    throw ApiError.badRequest('That equipment is not installed at this site')
  }
}

export const createAsset = asyncHandler(async function createAsset(req, res) {
  const site = await Site.findOne({ _id: req.body.siteId, enterpriseId: req.user.enterpriseId }).select('clientId name')
  if (!site) throw ApiError.notFound('Site not found')

  const code = await generateCode('asset', req.user.enterpriseId)
  const asset = await Asset.create({
    ...req.body,
    enterpriseId: req.user.enterpriseId,
    clientId: site.clientId,
    code,
    history: [
      {
        kind: 'installation',
        date: req.body.installDate ?? new Date(),
        note: `Registered at ${site.name}${req.body.location ? ` (${req.body.location})` : ''}`,
        byUserId: req.user._id,
      },
    ],
  })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'added equipment',
    entityType: ACTIVITY_ENTITY_TYPE.ASSET,
    entityId: asset._id,
    entityLabel: `${asset.code} · ${asset.name}`,
  })

  return sendResponse(res, 201, asset, 'Equipment added')
})

export const listAssets = asyncHandler(async function listAssets(req, res) {
  const q = req.validatedQuery
  const filter = scopedFilter(req)
  for (const field of ['siteId', 'serviceId', 'status']) if (q[field]) filter[field] = q[field]
  if (q.clientId && req.user.role !== ROLES.USER) filter.clientId = q.clientId
  if (q.type) filter.type = q.type
  if (q.search) {
    const rx = { $regex: q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    filter.$or = [{ name: rx }, { code: rx }, { serialNumber: rx }, { brand: rx }, { location: rx }]
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    Asset.find(filter)
      .select('-history')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('clientId', 'companyName')
      .populate('siteId', 'name')
      .populate('serviceId', 'name'),
    Asset.countDocuments(filter),
  ])

  return sendResponse(res, 200, items, undefined, paginatedMeta({ page, limit, total }))
})

/** Distinct equipment types in use — feeds the type autocomplete. */
export const listAssetTypes = asyncHandler(async function listAssetTypes(req, res) {
  const types = await Asset.distinct('type', { enterpriseId: req.user.enterpriseId })
  return sendResponse(res, 200, types.sort((a, b) => a.localeCompare(b)))
})

export const getAsset = asyncHandler(async function getAsset(req, res) {
  const asset = await Asset.findOne(scopedFilter(req, { _id: req.params.id }))
    .populate('clientId', 'companyName')
    .populate('siteId', 'name address')
    .populate('serviceId', 'name')
    .populate('history.byUserId', 'name')
    .populate('history.workOrderId', 'code title status')
    .populate('history.complaintId', 'code title status')
  if (!asset) throw ApiError.notFound('Equipment not found')

  const [workOrders, complaints] = await Promise.all([
    WorkOrder.find({ enterpriseId: req.user.enterpriseId, assetId: asset._id }).select('code title status priority dueDate createdAt').sort({ createdAt: -1 }).lean(),
    Complaint.find({ enterpriseId: req.user.enterpriseId, assetId: asset._id }).select('code title status priority createdAt').sort({ createdAt: -1 }).lean(),
  ])

  const out = asset.toObject()
  out.history.sort((a, b) => new Date(b.date) - new Date(a.date))
  return sendResponse(res, 200, { ...out, workOrders, complaints })
})

export const updateAsset = asyncHandler(async function updateAsset(req, res) {
  const asset = await Asset.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!asset) throw ApiError.notFound('Equipment not found')

  const { statusNote, ...patch } = req.body
  const previousStatus = asset.status
  Object.assign(asset, patch)
  if (patch.status && patch.status !== previousStatus) {
    asset.history.push({
      kind: patch.status === 'retired' ? 'replacement' : 'status_change',
      date: new Date(),
      note: `${STATUS_LABEL[previousStatus]} → ${STATUS_LABEL[patch.status]}${statusNote ? ` — ${statusNote}` : ''}`,
      byUserId: req.user._id,
    })
  }
  await asset.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated equipment',
    entityType: ACTIVITY_ENTITY_TYPE.ASSET,
    entityId: asset._id,
    entityLabel: `${asset.code} · ${asset.name}`,
  })

  return sendResponse(res, 200, asset, 'Equipment updated')
})

/** Adds a maintenance / inspection / repair note — admins, or supervisors at their own sites. */
export const addAssetEvent = asyncHandler(async function addAssetEvent(req, res) {
  const asset = await Asset.findOne(scopedFilter(req, { _id: req.params.id }))
  if (!asset) throw ApiError.notFound('Equipment not found')

  const { kind, date, note, workOrderId } = req.body
  if (workOrderId && !(await WorkOrder.exists({ _id: workOrderId, enterpriseId: req.user.enterpriseId, siteId: asset.siteId }))) {
    throw ApiError.badRequest('Work order not found at this site')
  }
  asset.history.push({ kind, date: date ?? new Date(), note, workOrderId: workOrderId ?? null, byUserId: req.user._id })
  // A repair / maintenance entry brings faulty equipment back into service.
  if ((kind === 'repair' || kind === 'maintenance') && asset.status !== 'retired') asset.status = 'active'
  await asset.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `logged ${kind} on equipment`,
    entityType: ACTIVITY_ENTITY_TYPE.ASSET,
    entityId: asset._id,
    entityLabel: `${asset.code} · ${asset.name}`,
  })

  return sendResponse(res, 201, asset, 'History updated')
})

export const deleteAsset = asyncHandler(async function deleteAsset(req, res) {
  const asset = await Asset.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!asset) throw ApiError.notFound('Equipment not found')
  const linked = (await WorkOrder.exists({ assetId: asset._id })) || (await Complaint.exists({ assetId: asset._id }))
  if (linked) throw ApiError.conflict('This equipment has work orders or complaints — mark it retired instead')
  await asset.deleteOne()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'deleted equipment',
    entityType: ACTIVITY_ENTITY_TYPE.ASSET,
    entityId: asset._id,
    entityLabel: `${asset.code} · ${asset.name}`,
  })

  return sendResponse(res, 200, null, 'Equipment deleted')
})
