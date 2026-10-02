import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { logActivity } from '../utils/activityLogger.js'
import { deleteFile, requestBaseUrl, saveFile } from '../services/storage.service.js'
import { Enterprise } from '../models/Enterprise.js'
import { ACTIVITY_ENTITY_TYPE } from '../constants/enums.js'
import { ADMIN_NOTIFICATION_KINDS } from '../validators/enterprise.validator.js'

const DEFAULT_PREFS = { email: true, push: true }

function toJSON(enterprise) {
  const obj = enterprise.toObject()
  const prefs = {}
  for (const kind of ADMIN_NOTIFICATION_KINDS) {
    prefs[kind] = enterprise.notificationPreferences?.get(kind) ?? DEFAULT_PREFS
  }
  delete obj.logoKey
  return { ...obj, notificationPreferences: prefs }
}

async function loadOwn(req) {
  const enterprise = await Enterprise.findById(req.user.enterpriseId)
  if (!enterprise) throw ApiError.notFound('Enterprise not found')
  return enterprise
}

/** Any signed-in user — the apps show the enterprise's name/logo. */
export const getEnterprise = asyncHandler(async function getEnterprise(req, res) {
  return sendResponse(res, 200, toJSON(await loadOwn(req)))
})

export const updateEnterprise = asyncHandler(async function updateEnterprise(req, res) {
  const enterprise = await loadOwn(req)
  Object.assign(enterprise, req.body)
  await enterprise.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated company profile',
    entityType: ACTIVITY_ENTITY_TYPE.SETTINGS,
    entityId: enterprise._id,
    entityLabel: enterprise.name,
  })

  return sendResponse(res, 200, toJSON(enterprise), 'Company profile updated')
})

export const uploadLogo = asyncHandler(async function uploadLogo(req, res) {
  if (!req.file) throw ApiError.badRequest('No file uploaded (field name must be "file")')
  const enterprise = await loadOwn(req)

  const { key, url } = await saveFile({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    folder: `branding/${enterprise._id}`,
    baseUrl: requestBaseUrl(req),
  })
  const previousKey = enterprise.logoKey
  enterprise.logoUrl = url
  enterprise.logoKey = key
  await enterprise.save()
  await deleteFile(previousKey)

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated company logo',
    entityType: ACTIVITY_ENTITY_TYPE.SETTINGS,
    entityId: enterprise._id,
    entityLabel: enterprise.name,
  })

  return sendResponse(res, 200, toJSON(enterprise), 'Logo updated')
})

export const removeLogo = asyncHandler(async function removeLogo(req, res) {
  const enterprise = await loadOwn(req)
  await deleteFile(enterprise.logoKey)
  enterprise.logoUrl = null
  enterprise.logoKey = null
  await enterprise.save()
  return sendResponse(res, 200, toJSON(enterprise), 'Logo removed')
})

export const updateNotificationPreferences = asyncHandler(async function updateNotificationPreferences(req, res) {
  const enterprise = await loadOwn(req)
  const next = new Map(enterprise.notificationPreferences ?? [])
  for (const [kind, prefs] of Object.entries(req.body.preferences)) next.set(kind, prefs)
  enterprise.notificationPreferences = next
  await enterprise.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated notification preferences',
    entityType: ACTIVITY_ENTITY_TYPE.SETTINGS,
    entityId: enterprise._id,
    entityLabel: enterprise.name,
  })

  return sendResponse(res, 200, toJSON(enterprise), 'Notification preferences saved')
})

export const updateOperations = asyncHandler(async function updateOperations(req, res) {
  const enterprise = await loadOwn(req)
  if (req.body.operations) enterprise.set('operations', { ...enterprise.operations?.toObject?.(), ...req.body.operations })
  if (req.body.sla) {
    for (const [priority, target] of Object.entries(req.body.sla)) enterprise.set(`sla.${priority}`, target)
  }
  await enterprise.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated operations & SLA settings',
    entityType: ACTIVITY_ENTITY_TYPE.SETTINGS,
    entityId: enterprise._id,
    entityLabel: enterprise.name,
  })

  return sendResponse(res, 200, toJSON(enterprise), 'Operations settings saved')
})
