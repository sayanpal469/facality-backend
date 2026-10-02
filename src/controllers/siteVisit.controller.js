import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { generateCode } from '../utils/sequence.js'
import { SiteVisit } from '../models/SiteVisit.js'
import { Site } from '../models/Site.js'
import { attachMedia } from '../utils/attachMedia.js'
import { distanceMeters } from '../utils/geo.js'
import { Enterprise } from '../models/Enterprise.js'
import { adminUserIds } from '../utils/notifier.js' // geofence alerts
import { clientUserIds, notifyUsers } from '../utils/notifier.js'
import { ACTIVITY_ENTITY_TYPE, NOTIFICATION_EVENT, NOTIFICATION_KIND, ROLES } from '../constants/enums.js'

// Visitor's job type (e.g. "Technical Supervisor") travels with their name.
const VISITOR_POPULATE = { path: 'visitorId', select: 'name mobile serviceId', populate: { path: 'serviceId', select: 'name' } }

function scopedSiteVisitFilter(req, extra = {}) {
  const filter = { enterpriseId: req.user.enterpriseId, ...extra }
  if (req.user.role === ROLES.USER) filter.clientId = req.user.clientId
  if (req.user.role === ROLES.SUPERVISOR || req.user.role === ROLES.SITE_MANAGER) {
    filter.siteId = { $in: req.scope.siteIds }
  }
  return filter
}

/** Enterprise-app check-in: the visit's visitor is always the logged-in supervisor/site_manager. */
export const checkIn = asyncHandler(async function checkIn(req, res) {
  if (!req.scope.siteIds.some((id) => String(id) === String(req.body.siteId))) {
    throw ApiError.forbidden('You are not assigned to this site')
  }

  const site = await Site.findOne({ _id: req.body.siteId, enterpriseId: req.user.enterpriseId })
  if (!site) throw ApiError.notFound('Site not found')

  const enterprise = await Enterprise.findById(req.user.enterpriseId).select('operations').lean()
  const policy = { gpsCheckInMode: 'warn', requireQrCheckIn: false, ...(enterprise?.operations ?? {}) }
  const { latitude, longitude, accuracy, qrCode, ...visitFields } = req.body

  // QR: the scanned poster must belong to this very site.
  if (qrCode !== undefined && qrCode !== site.qrCode) throw ApiError.badRequest('This QR code does not match the selected site')
  if (policy.requireQrCheckIn && !qrCode) throw ApiError.badRequest('Scan the QR code at the site to check in')

  // GPS: compare against the site's pinned location, allowing for fix accuracy.
  const hasFix = latitude !== undefined && longitude !== undefined
  const hasPin = site.latitude != null && site.longitude != null
  let distance = null
  let verified = null
  if (policy.gpsCheckInMode !== 'off' && hasPin) {
    if (!hasFix && policy.gpsCheckInMode === 'enforce') throw ApiError.badRequest('Turn on location to check in at this site')
    if (hasFix) {
      distance = distanceMeters(latitude, longitude, site.latitude, site.longitude)
      verified = distance <= site.geofenceRadiusM + Math.min(accuracy ?? 0, 100)
      if (!verified && policy.gpsCheckInMode === 'enforce') {
        throw ApiError.forbidden(`You appear to be ${distance} m from ${site.name} — check in when you're on site`)
      }
    }
  }

  const code = await generateCode('siteVisit', req.user.enterpriseId)
  const visit = await SiteVisit.create({
    ...visitFields,
    clientId: site.clientId, // derived from the site, never trusted from the client-supplied body
    code,
    enterpriseId: req.user.enterpriseId,
    visitorId: req.scope.employeeId,
    checkIn: new Date(),
    checkInMethod: qrCode ? 'qr' : hasFix ? 'gps' : 'manual',
    checkInLatitude: latitude ?? null,
    checkInLongitude: longitude ?? null,
    checkInAccuracyM: accuracy ?? null,
    checkInDistanceM: distance,
    locationVerified: verified,
  })

  if (verified === false) {
    await notifyUsers({
      enterpriseId: req.user.enterpriseId,
      userIds: await adminUserIds(req.user.enterpriseId),
      actorId: req.user._id,
      title: 'Check-in outside site area',
      body: `${req.user.name} checked in ${distance} m from ${site.name} (${visit.code}).`,
      kind: NOTIFICATION_KIND.EMPLOYEE,
      linkEntityType: ACTIVITY_ENTITY_TYPE.SITE_VISIT,
      linkEntityId: visit._id,
    })
  }

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'logged site visit',
    entityType: ACTIVITY_ENTITY_TYPE.SITE_VISIT,
    entityId: visit._id,
    entityLabel: `${visit.purpose} visit`,
  })

  return sendResponse(res, 201, visit, 'Checked in')
})

export const checkOut = asyncHandler(async function checkOut(req, res) {
  const visit = await SiteVisit.findOne({
    _id: req.params.id,
    enterpriseId: req.user.enterpriseId,
    visitorId: req.scope.employeeId,
  })
  if (!visit) throw ApiError.notFound('Site visit not found')
  if (visit.checkOut) throw ApiError.badRequest('Already checked out')

  visit.checkOut = new Date()
  if (req.body.observation !== undefined) visit.observation = req.body.observation
  if (req.body.latitude !== undefined) visit.checkOutLatitude = req.body.latitude
  if (req.body.longitude !== undefined) visit.checkOutLongitude = req.body.longitude
  await visit.save()

  const site = await Site.findById(visit.siteId).select('name').lean()
  await notifyUsers({
    enterpriseId: req.user.enterpriseId,
    userIds: await clientUserIds(visit.clientId),
    actorId: req.user._id,
    title: `Site visit completed · ${visit.purpose}`,
    body: `${req.user.name} checked out of ${site?.name ?? 'your site'}.`,
    kind: NOTIFICATION_KIND.SITE_VISIT,
    event: NOTIFICATION_EVENT.SITE_VISIT_COMPLETED,
    linkEntityType: visit.workOrderId ? ACTIVITY_ENTITY_TYPE.WORK_ORDER : ACTIVITY_ENTITY_TYPE.SITE_VISIT,
    linkEntityId: visit.workOrderId ?? visit._id,
  })

  return sendResponse(res, 200, visit, 'Checked out')
})

export const listSiteVisits = asyncHandler(async function listSiteVisits(req, res) {
  const q = req.validatedQuery
  const filter = scopedSiteVisitFilter(req)
  if (q.clientId) filter.clientId = q.clientId
  if (q.siteId) filter.siteId = q.siteId
  if (q.visitorId) filter.visitorId = q.visitorId
  if (q.workOrderId) filter.workOrderId = q.workOrderId
  if (q.complaintId) filter.complaintId = q.complaintId
  if (q.purpose) filter.purpose = q.purpose

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    SiteVisit.find(filter)
      .sort({ checkIn: -1 })
      .skip(skip)
      .limit(limit)
      .populate('clientId', 'companyName')
      .populate('siteId', 'name')
      .populate(VISITOR_POPULATE),
    SiteVisit.countDocuments(filter),
  ])

  const withMedia = await attachMedia(items.map((v) => v.toObject()), 'siteVisitId')
  return sendResponse(res, 200, withMedia, undefined, paginatedMeta({ page, limit, total }))
})

export const getSiteVisit = asyncHandler(async function getSiteVisit(req, res) {
  const visit = await SiteVisit.findOne(scopedSiteVisitFilter(req, { _id: req.params.id }))
    .populate('clientId', 'companyName')
    .populate('siteId', 'name address')
    .populate(VISITOR_POPULATE)

  if (!visit) throw ApiError.notFound('Site visit not found')
  return sendResponse(res, 200, await attachMedia(visit.toObject(), 'siteVisitId'))
})
