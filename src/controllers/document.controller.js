import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { deleteFile, requestBaseUrl, saveFile } from '../services/storage.service.js'
import { Document } from '../models/Document.js'
import { Client } from '../models/Client.js'
import { Site } from '../models/Site.js'
import { ACTIVITY_ENTITY_TYPE, ROLES } from '../constants/enums.js'

/** Admins see every document in the enterprise; client users only their own, visible ones. */
function documentFilter(req, extra = {}) {
  const filter = { enterpriseId: req.user.enterpriseId, ...extra }
  if (req.user.role === ROLES.USER) {
    filter.clientId = req.user.clientId
    filter.visibleToClient = true
  }
  return filter
}

export const uploadDocument = asyncHandler(async function uploadDocument(req, res) {
  if (!req.file) throw ApiError.badRequest('No file uploaded (field name must be "file")')
  const b = req.body

  const client = await Client.findOne({ _id: b.clientId, enterpriseId: req.user.enterpriseId }).select('companyName')
  if (!client) throw ApiError.notFound('Client not found')
  if (b.siteId && !(await Site.exists({ _id: b.siteId, clientId: client._id }))) {
    throw ApiError.badRequest('Site does not belong to this client')
  }

  const { key, url } = await saveFile({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    folder: `documents/${req.user.enterpriseId}`,
    baseUrl: requestBaseUrl(req),
  })

  const document = await Document.create({
    enterpriseId: req.user.enterpriseId,
    clientId: client._id,
    siteId: b.siteId ?? null,
    title: b.title,
    category: b.category,
    notes: b.notes,
    expiresOn: b.expiresOn ?? null,
    visibleToClient: b.visibleToClient,
    fileUrl: url,
    storageKey: key,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    uploadedBy: req.user._id,
  })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `uploaded document "${document.title}"`,
    entityType: ACTIVITY_ENTITY_TYPE.CLIENT,
    entityId: client._id,
    entityLabel: client.companyName,
  })

  return sendResponse(res, 201, document, 'Document uploaded')
})

export const listDocuments = asyncHandler(async function listDocuments(req, res) {
  const q = req.validatedQuery
  const filter = documentFilter(req)
  for (const field of ['siteId', 'category']) if (q[field]) filter[field] = q[field]
  if (q.clientId && req.user.role !== ROLES.USER) filter.clientId = q.clientId
  if (q.search) filter.title = { $regex: q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    Document.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('uploadedBy', 'name')
      .populate('clientId', 'companyName')
      .populate('siteId', 'name'),
    Document.countDocuments(filter),
  ])

  return sendResponse(res, 200, items, undefined, paginatedMeta({ page, limit, total }))
})

export const getDocument = asyncHandler(async function getDocument(req, res) {
  const document = await Document.findOne(documentFilter(req, { _id: req.params.id }))
    .populate('uploadedBy', 'name')
    .populate('siteId', 'name')
  if (!document) throw ApiError.notFound('Document not found')
  return sendResponse(res, 200, document)
})

export const updateDocument = asyncHandler(async function updateDocument(req, res) {
  const document = await Document.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!document) throw ApiError.notFound('Document not found')
  Object.assign(document, req.body)
  await document.save()
  return sendResponse(res, 200, document, 'Document updated')
})

export const deleteDocument = asyncHandler(async function deleteDocument(req, res) {
  const document = await Document.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId }).populate('clientId', 'companyName')
  if (!document) throw ApiError.notFound('Document not found')

  await document.deleteOne()
  await deleteFile(document.storageKey)

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `deleted document "${document.title}"`,
    entityType: ACTIVITY_ENTITY_TYPE.CLIENT,
    entityId: document.clientId?._id,
    entityLabel: document.clientId?.companyName,
  })

  return sendResponse(res, 200, null, 'Document deleted')
})
