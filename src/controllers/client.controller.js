import crypto from 'node:crypto'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { Client } from '../models/Client.js'
import { Site } from '../models/Site.js'
import { User } from '../models/User.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { ACTIVITY_ENTITY_TYPE, ROLES } from '../constants/enums.js'
import { sendCredentials } from '../services/messaging.service.js'

export const createClient = asyncHandler(async function createClient(req, res) {
  const { createLogin, ...body } = req.body

  const client = await Client.create({ ...body, enterpriseId: req.user.enterpriseId })

  let user = null
  let temporaryPassword = null
  if (createLogin) {
    const existing = await User.findOne({ email: body.email })
    if (existing) {
      throw ApiError.conflict('An account with this email already exists — cannot auto-create a login for this client')
    }
    temporaryPassword = crypto.randomBytes(6).toString('base64url')
    user = new User({
      enterpriseId: req.user.enterpriseId,
      name: body.contactPerson,
      email: body.email,
      mobile: body.mobile,
      role: ROLES.USER,
      clientId: client._id,
      createdBy: req.user._id,
      mustChangePassword: true,
    })
    user.password = temporaryPassword
    await user.save()
    client.userId = user._id
    await client.save()
  }

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'created client',
    entityType: ACTIVITY_ENTITY_TYPE.CLIENT,
    entityId: client._id,
    entityLabel: client.companyName,
  })

  const delivery = user ? await sendCredentials(user, temporaryPassword, { isNew: true }) : null
  return sendResponse(
    res,
    201,
    { client, login: user ? { email: user.email, temporaryPassword, delivery } : null },
    'Client created',
  )
})

export const listClients = asyncHandler(async function listClients(req, res) {
  const q = req.validatedQuery
  const filter = { enterpriseId: req.user.enterpriseId }
  if (q.status) filter.status = q.status
  if (q.serviceId) filter.serviceIds = q.serviceId
  if (q.search) {
    filter.$or = [
      { companyName: { $regex: q.search, $options: 'i' } },
      { contactPerson: { $regex: q.search, $options: 'i' } },
      { mobile: { $regex: q.search, $options: 'i' } },
    ]
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    Client.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('serviceIds', 'name'),
    Client.countDocuments(filter),
  ])

  // Sites count per client, computed in one aggregation rather than N+1 queries.
  const siteCounts = await Site.aggregate([
    { $match: { clientId: { $in: items.map((c) => c._id) } } },
    { $group: { _id: '$clientId', count: { $sum: 1 } } },
  ])
  const countByClient = new Map(siteCounts.map((s) => [String(s._id), s.count]))
  const withCounts = items.map((c) => ({ ...c.toObject(), sitesCount: countByClient.get(String(c._id)) || 0 }))

  return sendResponse(res, 200, withCounts, undefined, paginatedMeta({ page, limit, total }))
})

export const getClient = asyncHandler(async function getClient(req, res) {
  const filter = { _id: req.params.id, enterpriseId: req.user.enterpriseId }
  if (req.user.role === ROLES.USER) filter._id = req.user.clientId // clients may only ever fetch themselves

  const client = await Client.findOne(filter).populate('serviceIds')
  if (!client) throw ApiError.notFound('Client not found')

  const sites = await Site.find({ clientId: client._id })
  return sendResponse(res, 200, { ...client.toObject(), sites })
})

export const updateClient = asyncHandler(async function updateClient(req, res) {
  const client = await Client.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!client) throw ApiError.notFound('Client not found')

  Object.assign(client, req.body)
  await client.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated client details',
    entityType: ACTIVITY_ENTITY_TYPE.CLIENT,
    entityId: client._id,
    entityLabel: client.companyName,
  })

  return sendResponse(res, 200, client, 'Client updated')
})

export const setClientStatus = asyncHandler(async function setClientStatus(req, res) {
  const client = await Client.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!client) throw ApiError.notFound('Client not found')

  client.status = req.body.status
  await client.save()

  if (client.userId) {
    await User.updateOne({ _id: client.userId }, { status: client.status })
    if (client.status === 'inactive') {
      await RefreshToken.updateMany({ userId: client.userId, revokedAt: null }, { revokedAt: new Date() })
    }
  }

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: client.status === 'active' ? 'activated client' : 'deactivated client',
    entityType: ACTIVITY_ENTITY_TYPE.CLIENT,
    entityId: client._id,
    entityLabel: client.companyName,
  })

  return sendResponse(res, 200, client, `Client ${client.status === 'active' ? 'activated' : 'deactivated'}`)
})

export const updateClientServices = asyncHandler(async function updateClientServices(req, res) {
  const client = await Client.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!client) throw ApiError.notFound('Client not found')

  client.serviceIds = req.body.serviceIds
  await client.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated services assigned to client',
    entityType: ACTIVITY_ENTITY_TYPE.CLIENT,
    entityId: client._id,
    entityLabel: client.companyName,
  })

  return sendResponse(res, 200, client, 'Services updated')
})

export const resetClientPassword = asyncHandler(async function resetClientPassword(req, res) {
  const client = await Client.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!client) throw ApiError.notFound('Client not found')
  if (!client.userId) throw ApiError.badRequest('This client has no login to reset')

  const user = await User.findById(client.userId)
  const newPassword = crypto.randomBytes(6).toString('base64url')
  user.password = newPassword
  user.mustChangePassword = true
  await user.save()
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'reset password for client login',
    entityType: ACTIVITY_ENTITY_TYPE.CLIENT,
    entityId: client._id,
    entityLabel: client.companyName,
  })

  const delivery = await sendCredentials(user, newPassword)
  return sendResponse(res, 200, { email: user.email, temporaryPassword: newPassword, delivery }, 'Password reset')
})
