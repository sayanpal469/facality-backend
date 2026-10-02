import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { scopedFilter } from '../utils/scope.js'
import { generateCode } from '../utils/sequence.js'
import { PmSchedule } from '../models/PmSchedule.js'
import { Site } from '../models/Site.js'
import { Asset } from '../models/Asset.js'
import { Employee } from '../models/Employee.js'
import { Contract } from '../models/Contract.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { generateFromSchedule } from '../services/maintenance.service.js'
import { ACTIVITY_ENTITY_TYPE } from '../constants/enums.js'

/** Validates every linked record belongs to the schedule's site/client/enterprise. */
async function assertLinks(req, { siteId, clientId }, body) {
  const enterpriseId = req.user.enterpriseId
  if (body.assetId && !(await Asset.exists({ _id: body.assetId, enterpriseId, siteId }))) throw ApiError.badRequest('That equipment is not at this site')
  if (body.contractId && !(await Contract.exists({ _id: body.contractId, enterpriseId, clientId }))) throw ApiError.badRequest('That contract is not with this client')
  for (const key of ['assignedEmployeeId', 'supervisorId']) {
    if (body[key] && !(await Employee.exists({ _id: body[key], enterpriseId }))) throw ApiError.badRequest('Employee not found')
  }
}

const POPULATE = [
  { path: 'clientId', select: 'companyName' },
  { path: 'siteId', select: 'name' },
  { path: 'serviceId', select: 'name' },
  { path: 'assetId', select: 'code name' },
  { path: 'contractId', select: 'code title' },
  { path: 'assignedEmployeeId', select: 'name' },
]

export const createPmSchedule = asyncHandler(async function createPmSchedule(req, res) {
  const site = await Site.findOne({ _id: req.body.siteId, enterpriseId: req.user.enterpriseId }).select('clientId name')
  if (!site) throw ApiError.notFound('Site not found')
  await assertLinks(req, { siteId: site._id, clientId: site.clientId }, req.body)

  const schedule = await PmSchedule.create({
    ...req.body,
    enterpriseId: req.user.enterpriseId,
    clientId: site.clientId,
    code: await generateCode('pmSchedule', req.user.enterpriseId),
    nextDueDate: req.body.startDate,
  })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `created maintenance schedule ${schedule.code}`,
    entityType: ACTIVITY_ENTITY_TYPE.PM_SCHEDULE,
    entityId: schedule._id,
    entityLabel: schedule.title,
  })

  return sendResponse(res, 201, await schedule.populate(POPULATE), 'Maintenance schedule created')
})

export const listPmSchedules = asyncHandler(async function listPmSchedules(req, res) {
  const q = req.validatedQuery
  const filter = scopedFilter(req)
  for (const field of ['siteId', 'assetId', 'contractId']) if (q[field]) filter[field] = q[field]
  if (q.clientId && !filter.clientId) filter.clientId = q.clientId
  if (q.active) filter.active = q.active === 'true'
  if (q.search) {
    const rx = { $regex: q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    filter.$or = [{ title: rx }, { code: rx }]
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    PmSchedule.find(filter).sort({ active: -1, nextDueDate: 1 }).skip(skip).limit(limit).populate(POPULATE),
    PmSchedule.countDocuments(filter),
  ])
  return sendResponse(res, 200, items, undefined, paginatedMeta({ page, limit, total }))
})

export const getPmSchedule = asyncHandler(async function getPmSchedule(req, res) {
  const schedule = await PmSchedule.findOne(scopedFilter(req, { _id: req.params.id })).populate([...POPULATE, { path: 'supervisorId', select: 'name' }])
  if (!schedule) throw ApiError.notFound('Maintenance schedule not found')
  const workOrders = await WorkOrder.find({ pmScheduleId: schedule._id }).select('code title status dueDate createdAt').sort({ dueDate: -1 }).limit(100).lean()
  return sendResponse(res, 200, { ...schedule.toObject(), workOrders })
})

export const updatePmSchedule = asyncHandler(async function updatePmSchedule(req, res) {
  const schedule = await PmSchedule.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!schedule) throw ApiError.notFound('Maintenance schedule not found')
  await assertLinks(req, { siteId: schedule.siteId, clientId: schedule.clientId }, req.body)
  const end = req.body.endDate === undefined ? schedule.endDate : req.body.endDate
  const start = req.body.startDate ?? schedule.startDate
  if (end && end <= start) throw ApiError.badRequest('End date must be after the start date')

  // A new start date before anything was generated resets the first occurrence.
  if (req.body.startDate && schedule.generatedCount === 0 && !req.body.nextDueDate) schedule.nextDueDate = req.body.startDate
  Object.assign(schedule, req.body)
  await schedule.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `updated maintenance schedule ${schedule.code}`,
    entityType: ACTIVITY_ENTITY_TYPE.PM_SCHEDULE,
    entityId: schedule._id,
    entityLabel: schedule.title,
  })

  return sendResponse(res, 200, await schedule.populate(POPULATE), 'Maintenance schedule updated')
})

/** Admin "Create work order now" for the next occurrence, ignoring the lead window. */
export const generateNow = asyncHandler(async function generateNow(req, res) {
  const schedule = await PmSchedule.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!schedule) throw ApiError.notFound('Maintenance schedule not found')
  if (!schedule.active) throw ApiError.badRequest('This schedule is paused')

  const workOrder = await generateFromSchedule(schedule, { actorId: req.user._id })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `generated ${workOrder.code} from ${schedule.code}`,
    entityType: ACTIVITY_ENTITY_TYPE.WORK_ORDER,
    entityId: workOrder._id,
    entityLabel: workOrder.title,
  })

  return sendResponse(res, 201, workOrder, `${workOrder.code} created`)
})

export const deletePmSchedule = asyncHandler(async function deletePmSchedule(req, res) {
  const schedule = await PmSchedule.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!schedule) throw ApiError.notFound('Maintenance schedule not found')
  if (schedule.generatedCount > 0) throw ApiError.conflict('This schedule has created work orders — pause it instead')
  await schedule.deleteOne()
  return sendResponse(res, 200, null, 'Maintenance schedule deleted')
})
