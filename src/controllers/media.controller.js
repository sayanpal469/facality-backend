import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { scopedFilter } from '../utils/scope.js'
import { deleteFile, requestBaseUrl, saveFile } from '../services/storage.service.js'
import { Media } from '../models/Media.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { Complaint } from '../models/Complaint.js'
import { SiteVisit } from '../models/SiteVisit.js'
import { Site } from '../models/Site.js'
import { ACTIVITY_ENTITY_TYPE, ROLES } from '../constants/enums.js'

/**
 * Resolves the upload's owner inside the caller's scope and derives
 * client/site/service from it — a supervisor can only attach evidence to
 * their own sites' records, a client only to their own complaints.
 */
async function resolveOwner(req) {
  const b = req.body
  if (req.user.role === ROLES.USER && !b.complaintId) {
    throw ApiError.forbidden('Clients can only attach photos/videos to their own complaints')
  }

  if (b.workOrderId) {
    const wo = await WorkOrder.findOne(scopedFilter(req, { _id: b.workOrderId })).select('clientId siteId serviceId code title')
    if (!wo) throw ApiError.notFound('Work order not found')
    return { clientId: wo.clientId, siteId: wo.siteId, serviceId: wo.serviceId, workOrderId: wo._id, label: wo.code, entityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER, entityId: wo._id }
  }
  if (b.complaintId) {
    const c = await Complaint.findOne(scopedFilter(req, { _id: b.complaintId })).select('clientId siteId serviceId workOrderId code')
    if (!c) throw ApiError.notFound('Complaint not found')
    return { clientId: c.clientId, siteId: c.siteId, serviceId: c.serviceId, complaintId: c._id, label: c.code, entityType: ACTIVITY_ENTITY_TYPE.COMPLAINT, entityId: c._id }
  }
  if (b.siteVisitId) {
    const v = await SiteVisit.findOne(scopedFilter(req, { _id: b.siteVisitId })).select('clientId siteId workOrderId code')
    if (!v) throw ApiError.notFound('Site visit not found')
    return { clientId: v.clientId, siteId: v.siteId, siteVisitId: v._id, workOrderId: v.workOrderId, label: v.code, entityType: ACTIVITY_ENTITY_TYPE.SITE_VISIT, entityId: v._id }
  }
  const site = await Site.findOne(scopedFilter(req, { _id: b.siteId }, '_id')).select('clientId name')
  if (!site) throw ApiError.notFound('Site not found')
  return { clientId: site.clientId, siteId: site._id, label: site.name, entityType: ACTIVITY_ENTITY_TYPE.SITE, entityId: site._id }
}

export const uploadMedia = asyncHandler(async function uploadMedia(req, res) {
  if (!req.file) throw ApiError.badRequest('No file uploaded (field name must be "file")')

  const owner = await resolveOwner(req)
  const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'photo'
  const { key, url } = await saveFile({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    folder: `media/${req.user.enterpriseId}`,
    baseUrl: requestBaseUrl(req),
  })

  const { label, entityType, entityId, ...links } = owner
  const media = await Media.create({
    enterpriseId: req.user.enterpriseId,
    uploadedBy: req.user._id,
    ...links,
    stage: req.body.stage ?? null,
    description: req.body.description,
    latitude: req.body.latitude ?? null,
    longitude: req.body.longitude ?? null,
    address: req.body.address ?? null,
    capturedAt: req.body.capturedAt ?? null,
    fileUrl: url,
    storageKey: key,
    fileType,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
  })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `uploaded a ${fileType}${media.stage ? ` (${media.stage})` : ''}`,
    entityType,
    entityId,
    entityLabel: label,
  })

  return sendResponse(res, 201, media, 'File uploaded')
})

export const listMedia = asyncHandler(async function listMedia(req, res) {
  const q = req.validatedQuery
  const filter = scopedFilter(req)
  for (const field of ['clientId', 'siteId', 'serviceId', 'workOrderId', 'complaintId', 'siteVisitId', 'fileType', 'stage']) {
    if (q[field]) filter[field] = q[field]
  }
  if (q.search) filter.description = { $regex: q.search, $options: 'i' }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    Media.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('uploadedBy', 'name')
      .populate('clientId', 'companyName')
      .populate('siteId', 'name')
      .populate('serviceId', 'name'),
    Media.countDocuments(filter),
  ])

  return sendResponse(res, 200, items, undefined, paginatedMeta({ page, limit, total }))
})

export const getMedia = asyncHandler(async function getMedia(req, res) {
  const media = await Media.findOne(scopedFilter(req, { _id: req.params.id }))
  if (!media) throw ApiError.notFound('Media not found')
  return sendResponse(res, 200, media)
})

export const deleteMedia = asyncHandler(async function deleteMedia(req, res) {
  const media = await Media.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!media) throw ApiError.notFound('Media not found')

  await media.deleteOne()
  // Older rows predate storageKey — derive it from the local URL.
  await deleteFile(media.storageKey ?? media.fileUrl.split('/uploads/')[1])

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `deleted a ${media.fileType}`,
    entityType: media.workOrderId ? ACTIVITY_ENTITY_TYPE.WORK_ORDER : ACTIVITY_ENTITY_TYPE.SITE,
    entityId: media.workOrderId ?? media.siteId,
    entityLabel: media.description || media.fileType,
  })

  return sendResponse(res, 200, null, 'Media deleted')
})
