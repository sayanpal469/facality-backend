import crypto from 'node:crypto'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { generateCode } from '../utils/sequence.js'
import { User } from '../models/User.js'
import { Employee } from '../models/Employee.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { ACTIVITY_ENTITY_TYPE, ROLES } from '../constants/enums.js'
import { sendCredentials } from '../services/messaging.service.js'

export const createAccount = asyncHandler(async function createAccount(req, res) {
  const { name, email, mobile, password, role, employeeCode, serviceId, assignedSiteIds, joiningDate } = req.body

  const existing = await User.findOne({ email })
  if (existing) throw ApiError.conflict('An account with this email already exists')

  let employeeDoc = null
  if (role !== ROLES.ADMIN) {
    const code = employeeCode || (await generateCode('employee', req.user.enterpriseId))
    employeeDoc = await Employee.create({
      enterpriseId: req.user.enterpriseId,
      name,
      mobile: mobile || '',
      email,
      employeeCode: code,
      serviceId,
      assignedSiteIds: assignedSiteIds || [],
      joiningDate: joiningDate || new Date(),
    })
  }

  const user = new User({
    enterpriseId: req.user.enterpriseId,
    name,
    email,
    mobile,
    role,
    createdBy: req.user._id,
    employeeId: employeeDoc?._id ?? null,
    // The admin chose this password — the account holder must replace it.
    mustChangePassword: true,
  })
  user.password = password
  await user.save()

  if (employeeDoc) {
    employeeDoc.userId = user._id
    await employeeDoc.save()
  }

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `created a ${role} account`,
    entityType: ACTIVITY_ENTITY_TYPE.ACCOUNT,
    entityId: user._id,
    entityLabel: name,
  })

  const delivery = await sendCredentials(user, password, { isNew: true })
  return sendResponse(res, 201, { user: user.toSafeJSON(), employee: employeeDoc, delivery }, 'Account created')
})

export const listAccounts = asyncHandler(async function listAccounts(req, res) {
  const q = req.validatedQuery
  const filter = { enterpriseId: req.user.enterpriseId, role: { $in: [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER] } }
  if (q.role) filter.role = q.role
  if (q.status) filter.status = q.status
  if (q.search) {
    filter.$or = [
      { name: { $regex: q.search, $options: 'i' } },
      { email: { $regex: q.search, $options: 'i' } },
    ]
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate({ path: 'employeeId', populate: 'serviceId assignedSiteIds' }),
    User.countDocuments(filter),
  ])

  return sendResponse(res, 200, items.map((u) => u.toSafeJSON()), undefined, paginatedMeta({ page, limit, total }))
})

export const getAccount = asyncHandler(async function getAccount(req, res) {
  const user = await User.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId }).populate({
    path: 'employeeId',
    populate: 'serviceId assignedSiteIds',
  })
  if (!user) throw ApiError.notFound('Account not found')
  return sendResponse(res, 200, user.toSafeJSON())
})

export const updateAccount = asyncHandler(async function updateAccount(req, res) {
  const user = await User.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!user) throw ApiError.notFound('Account not found')

  const { name, mobile, assignedSiteIds, serviceId } = req.body
  if (name !== undefined) user.name = name
  if (mobile !== undefined) user.mobile = mobile
  await user.save()

  if (user.employeeId && (assignedSiteIds !== undefined || serviceId !== undefined)) {
    const employee = await Employee.findById(user.employeeId)
    if (employee) {
      if (assignedSiteIds !== undefined) employee.assignedSiteIds = assignedSiteIds
      if (serviceId !== undefined) employee.serviceId = serviceId
      if (name !== undefined) employee.name = name
      if (mobile !== undefined) employee.mobile = mobile
      await employee.save()
    }
  }

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated account details',
    entityType: ACTIVITY_ENTITY_TYPE.ACCOUNT,
    entityId: user._id,
    entityLabel: user.name,
  })

  return sendResponse(res, 200, user.toSafeJSON(), 'Account updated')
})

export const setAccountStatus = asyncHandler(async function setAccountStatus(req, res) {
  const { status } = req.body
  if (String(req.params.id) === String(req.user._id) && status === 'inactive') {
    throw ApiError.badRequest('You cannot deactivate your own account')
  }

  const user = await User.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!user) throw ApiError.notFound('Account not found')

  user.status = status
  await user.save()

  if (status === 'inactive') {
    await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() })
  }
  if (user.employeeId) {
    await Employee.updateOne({ _id: user.employeeId }, { status })
  }

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: status === 'active' ? 'activated account' : 'deactivated account',
    entityType: ACTIVITY_ENTITY_TYPE.ACCOUNT,
    entityId: user._id,
    entityLabel: user.name,
  })

  return sendResponse(res, 200, user.toSafeJSON(), `Account ${status === 'active' ? 'activated' : 'deactivated'}`)
})

export const resetAccountPassword = asyncHandler(async function resetAccountPassword(req, res) {
  const user = await User.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!user) throw ApiError.notFound('Account not found')

  const newPassword = req.body.newPassword || crypto.randomBytes(6).toString('base64url')
  user.password = newPassword
  user.mustChangePassword = true
  await user.save()
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'reset password for account',
    entityType: ACTIVITY_ENTITY_TYPE.ACCOUNT,
    entityId: user._id,
    entityLabel: user.name,
  })

  // Delivered by email/SMS; also returned so the admin can hand it over in person.
  const delivery = await sendCredentials(user, newPassword)
  return sendResponse(res, 200, { temporaryPassword: newPassword, delivery }, 'Password reset')
})
