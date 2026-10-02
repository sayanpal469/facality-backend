import { asyncHandler } from '../utils/asyncHandler.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { Complaint } from '../models/Complaint.js'
import { SiteVisit } from '../models/SiteVisit.js'
import { ActivityLog } from '../models/ActivityLog.js'
import { WORK_ORDER_TERMINAL_STATUSES } from '../constants/enums.js'

export const getStats = asyncHandler(async function getStats(req, res) {
  const enterpriseId = req.user.enterpriseId
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  const [
    assigned,
    completed,
    pending,
    overdue,
    visitsToday,
    complaintsOpen,
    complaintsInProgress,
    complaintsResolved,
    complaintsSlaBreached,
  ] = await Promise.all([
    WorkOrder.countDocuments({ enterpriseId, status: 'assigned' }),
    WorkOrder.countDocuments({ enterpriseId, status: { $in: ['completed', 'verified', 'closed'] } }),
    WorkOrder.countDocuments({ enterpriseId, status: { $nin: WORK_ORDER_TERMINAL_STATUSES } }),
    WorkOrder.countDocuments({ enterpriseId, dueDate: { $lt: now }, status: { $nin: WORK_ORDER_TERMINAL_STATUSES } }),
    SiteVisit.countDocuments({ enterpriseId, checkIn: { $gte: startOfToday } }),
    Complaint.countDocuments({ enterpriseId, status: 'open' }),
    Complaint.countDocuments({ enterpriseId, status: { $in: ['assigned', 'acknowledged', 'work_started'] } }),
    Complaint.countDocuments({ enterpriseId, status: { $in: ['resolved', 'client_verification', 'closed'] } }),
    Complaint.countDocuments({
      enterpriseId,
      resolvedAt: null,
      $or: [{ respondedAt: null, responseDueAt: { $lt: now } }, { resolutionDueAt: { $lt: now } }],
    }),
  ])

  return sendResponse(res, 200, {
    workOrders: { assigned, completed, pending, overdue },
    siteVisitsToday: visitsToday,
    complaints: { open: complaintsOpen, inProgress: complaintsInProgress, resolved: complaintsResolved, slaBreached: complaintsSlaBreached },
  })
})

export const getAttention = asyncHandler(async function getAttention(req, res) {
  const enterpriseId = req.user.enterpriseId
  const now = new Date()

  const [overdueWorkOrders, unassignedComplaints, awaitingVerification] = await Promise.all([
    WorkOrder.find({ enterpriseId, dueDate: { $lt: now }, status: { $nin: WORK_ORDER_TERMINAL_STATUSES } })
      .sort({ dueDate: 1 })
      .limit(5)
      .populate('clientId', 'companyName')
      .populate('siteId', 'name'),
    Complaint.find({ enterpriseId, status: 'open' }).sort({ createdAt: 1 }).limit(5).populate('clientId', 'companyName'),
    WorkOrder.find({ enterpriseId, status: 'completed' }).sort({ updatedAt: 1 }).limit(5).populate('assignedEmployeeId', 'name'),
  ])

  return sendResponse(res, 200, { overdueWorkOrders, unassignedComplaints, awaitingVerification })
})

export const getRecentActivity = asyncHandler(async function getRecentActivity(req, res) {
  const limit = Math.min(50, Number(req.query.limit) || 12)
  const items = await ActivityLog.find({ enterpriseId: req.user.enterpriseId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actorId', 'name')

  return sendResponse(res, 200, items)
})

export const getTrends = asyncHandler(async function getTrends(req, res) {
  const enterpriseId = req.user.enterpriseId
  const weeks = 8
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000)

  const completedByWeek = await WorkOrder.aggregate([
    { $match: { enterpriseId, status: { $in: ['completed', 'verified', 'closed'] }, updatedAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateTrunc: { date: '$updatedAt', unit: 'week' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ])

  const complaintsByService = await Complaint.aggregate([
    { $match: { enterpriseId } },
    { $lookup: { from: 'servicetypes', localField: 'serviceId', foreignField: '_id', as: 'service' } },
    { $unwind: '$service' },
    { $lookup: { from: 'servicecategories', localField: 'service.categoryId', foreignField: '_id', as: 'category' } },
    { $unwind: '$category' },
    { $group: { _id: '$category.name', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ])

  return sendResponse(res, 200, {
    workCompletedOverTime: completedByWeek.map((w) => ({ week: w._id, completed: w.count })),
    complaintsByService: complaintsByService.map((c) => ({ service: c._id, count: c.count })),
  })
})
