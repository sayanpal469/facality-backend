import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { generateCode } from '../utils/sequence.js'
import { Employee } from '../models/Employee.js'
import { ACTIVITY_ENTITY_TYPE, ROLES } from '../constants/enums.js'

function scopedEmployeeFilter(req, extra = {}) {
  const filter = { enterpriseId: req.user.enterpriseId, ...extra }
  if (req.user.role === ROLES.SUPERVISOR || req.user.role === ROLES.SITE_MANAGER) {
    filter.assignedSiteIds = { $in: req.scope.siteIds }
  }
  return filter
}

export const createEmployee = asyncHandler(async function createEmployee(req, res) {
  const code = req.body.employeeCode || (await generateCode('employee', req.user.enterpriseId))
  const employee = await Employee.create({ ...req.body, employeeCode: code, enterpriseId: req.user.enterpriseId })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'added new employee',
    entityType: ACTIVITY_ENTITY_TYPE.EMPLOYEE,
    entityId: employee._id,
    entityLabel: employee.name,
  })

  return sendResponse(res, 201, employee, 'Employee created')
})

export const listEmployees = asyncHandler(async function listEmployees(req, res) {
  const q = req.validatedQuery
  const filter = scopedEmployeeFilter(req)
  if (q.serviceId) filter.serviceId = q.serviceId
  if (q.siteId) filter.assignedSiteIds = q.siteId
  if (q.status) filter.status = q.status
  if (q.search) {
    filter.$or = [
      { name: { $regex: q.search, $options: 'i' } },
      { employeeCode: { $regex: q.search, $options: 'i' } },
      { mobile: { $regex: q.search, $options: 'i' } },
    ]
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    Employee.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('serviceId', 'name').populate('assignedSiteIds', 'name'),
    Employee.countDocuments(filter),
  ])

  return sendResponse(res, 200, items, undefined, paginatedMeta({ page, limit, total }))
})

export const getEmployee = asyncHandler(async function getEmployee(req, res) {
  const employee = await Employee.findOne(scopedEmployeeFilter(req, { _id: req.params.id }))
    .populate('serviceId')
    .populate('assignedSiteIds', 'name')
    .populate('userId', 'name email role status')
  if (!employee) throw ApiError.notFound('Employee not found')
  return sendResponse(res, 200, employee)
})

export const updateEmployee = asyncHandler(async function updateEmployee(req, res) {
  const employee = await Employee.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!employee) throw ApiError.notFound('Employee not found')

  Object.assign(employee, req.body)
  await employee.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated employee details',
    entityType: ACTIVITY_ENTITY_TYPE.EMPLOYEE,
    entityId: employee._id,
    entityLabel: employee.name,
  })

  return sendResponse(res, 200, employee, 'Employee updated')
})

export const setEmployeeStatus = asyncHandler(async function setEmployeeStatus(req, res) {
  const employee = await Employee.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!employee) throw ApiError.notFound('Employee not found')

  employee.status = req.body.status
  await employee.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: employee.status === 'active' ? 'activated employee' : 'deactivated employee',
    entityType: ACTIVITY_ENTITY_TYPE.EMPLOYEE,
    entityId: employee._id,
    entityLabel: employee.name,
  })

  return sendResponse(res, 200, employee, `Employee ${employee.status === 'active' ? 'activated' : 'deactivated'}`)
})
