import { asyncHandler } from '../utils/asyncHandler.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { ActivityLog } from '../models/ActivityLog.js'

export const listActivityLogs = asyncHandler(async function listActivityLogs(req, res) {
  const q = req.validatedQuery
  const filter = { enterpriseId: req.user.enterpriseId }
  if (q.entityType) filter.entityType = q.entityType
  if (q.actorId) filter.actorId = q.actorId
  if (q.entityId) filter.entityId = q.entityId
  if (q.dateFrom || q.dateTo) {
    filter.createdAt = {}
    if (q.dateFrom) filter.createdAt.$gte = q.dateFrom
    if (q.dateTo) filter.createdAt.$lte = q.dateTo
  }
  if (q.search) {
    filter.$or = [{ action: { $regex: q.search, $options: 'i' } }, { entityLabel: { $regex: q.search, $options: 'i' } }]
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actorId', 'name role'),
    ActivityLog.countDocuments(filter),
  ])

  return sendResponse(res, 200, items, undefined, paginatedMeta({ page, limit, total }))
})
