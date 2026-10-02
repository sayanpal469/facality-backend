import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import QRCode from 'qrcode'
import { Site, newSiteQrCode } from '../models/Site.js'
import { Client } from '../models/Client.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { Complaint } from '../models/Complaint.js'
import { Employee } from '../models/Employee.js'
import { Attendance } from '../models/Attendance.js'
import { localDay } from '../utils/dates.js'
import { ACTIVITY_ENTITY_TYPE, ROLES, WORK_ORDER_STATUS, WORK_ORDER_TERMINAL_STATUSES } from '../constants/enums.js'

const DONE_STATUSES = [WORK_ORDER_STATUS.COMPLETED, WORK_ORDER_STATUS.VERIFIED, WORK_ORDER_STATUS.CLOSED]

function scopedSiteFilter(req, extra = {}) {
  const filter = { enterpriseId: req.user.enterpriseId, ...extra }
  if (req.user.role === ROLES.USER) filter.clientId = req.user.clientId
  if (req.user.role === ROLES.SUPERVISOR || req.user.role === ROLES.SITE_MANAGER) {
    filter._id = { $in: req.scope.siteIds }
  }
  return filter
}

export const createSite = asyncHandler(async function createSite(req, res) {
  const client = await Client.findOne({ _id: req.body.clientId, enterpriseId: req.user.enterpriseId })
  if (!client) throw ApiError.notFound('Client not found')

  const site = await Site.create({ ...req.body, enterpriseId: req.user.enterpriseId })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'added a new site',
    entityType: ACTIVITY_ENTITY_TYPE.SITE,
    entityId: site._id,
    entityLabel: site.name,
  })

  return sendResponse(res, 201, site, 'Site created')
})

export const listSites = asyncHandler(async function listSites(req, res) {
  const q = req.validatedQuery
  const filter = scopedSiteFilter(req)
  if (q.clientId) filter.clientId = q.clientId
  if (q.status) filter.status = q.status
  if (q.search) {
    filter.$or = [{ name: { $regex: q.search, $options: 'i' } }, { address: { $regex: q.search, $options: 'i' } }]
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    Site.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('clientId', 'companyName').populate('serviceIds', 'name'),
    Site.countDocuments(filter),
  ])

  return sendResponse(res, 200, items, undefined, paginatedMeta({ page, limit, total }))
})

export const getSite = asyncHandler(async function getSite(req, res) {
  const site = await Site.findOne(scopedSiteFilter(req, { _id: req.params.id }))
    .populate('clientId', 'companyName')
    .populate('serviceIds')
  if (!site) throw ApiError.notFound('Site not found')
  return sendResponse(res, 200, site)
})

export const updateSite = asyncHandler(async function updateSite(req, res) {
  const site = await Site.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!site) throw ApiError.notFound('Site not found')

  Object.assign(site, req.body)
  await site.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated site details',
    entityType: ACTIVITY_ENTITY_TYPE.SITE,
    entityId: site._id,
    entityLabel: site.name,
  })

  return sendResponse(res, 200, site, 'Site updated')
})

export const updateSiteServices = asyncHandler(async function updateSiteServices(req, res) {
  const site = await Site.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!site) throw ApiError.notFound('Site not found')

  site.serviceIds = req.body.serviceIds
  await site.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated services at site',
    entityType: ACTIVITY_ENTITY_TYPE.SITE,
    entityId: site._id,
    entityLabel: site.name,
  })

  return sendResponse(res, 200, site, 'Services updated')
})

/**
 * Client-app "My Services" for one site: every service assigned to the site
 * with its live work/complaint counts, the staff deployed for it, and a short
 * history of finished work. A service with no work orders but deployed staff
 * (housekeeping, gardening, ...) is reported as `kind: 'staffing'`.
 */
export const getSiteServicesSummary = asyncHandler(async function getSiteServicesSummary(req, res) {
  const site = await Site.findOne(scopedSiteFilter(req, { _id: req.params.id })).populate({
    path: 'serviceIds',
    select: 'name status categoryId',
    populate: { path: 'categoryId', select: 'name' },
  })
  if (!site) throw ApiError.notFound('Site not found')

  const serviceIds = site.serviceIds.map((svc) => svc._id)
  const [workOrders, openComplaints, staff] = await Promise.all([
    WorkOrder.find({ enterpriseId: req.user.enterpriseId, siteId: site._id, serviceId: { $in: serviceIds } })
      .select('code title status serviceId updatedAt')
      .sort({ updatedAt: -1 })
      .lean(),
    Complaint.aggregate([
      { $match: { enterpriseId: site.enterpriseId, siteId: site._id, status: { $ne: 'closed' } } },
      { $group: { _id: '$serviceId', count: { $sum: 1 } } },
    ]),
    Employee.find({ enterpriseId: req.user.enterpriseId, assignedSiteIds: site._id, serviceId: { $in: serviceIds }, status: 'active' })
      .select('name serviceId')
      .lean(),
  ])

  const complaintCount = new Map(openComplaints.map((c) => [String(c._id), c.count]))
  const todays = await Attendance.find({ employeeId: { $in: staff.map((e) => e._id) }, date: localDay() }).select('employeeId status').lean()
  const statusToday = new Map(todays.map((a) => [String(a.employeeId), a.status]))
  // null = not marked yet today (the client app shows no badge rather than "absent").
  const presentToday = (e) => {
    const s = statusToday.get(String(e._id))
    return s ? s === 'present' || s === 'half_day' : null
  }

  const summary = site.serviceIds.map((svc) => {
    const id = String(svc._id)
    const wos = workOrders.filter((w) => String(w.serviceId) === id)
    const svcStaff = staff.filter((e) => String(e.serviceId) === id)
    return {
      _id: svc._id,
      name: svc.name,
      category: svc.categoryId?.name ?? '',
      active: svc.status === 'active',
      kind: wos.length === 0 && svcStaff.length > 0 ? 'staffing' : 'work',
      ongoingWorks: wos.filter((w) => !WORK_ORDER_TERMINAL_STATUSES.includes(w.status)).length,
      completedWorks: wos.filter((w) => DONE_STATUSES.includes(w.status)).length,
      openComplaints: complaintCount.get(id) ?? 0,
      staff: svcStaff.map((e) => ({ _id: e._id, name: e.name, role: svc.name, presentToday: presentToday(e) })),
      presentStaff: svcStaff.some((e) => presentToday(e) !== null) ? svcStaff.filter((e) => presentToday(e) === true).length : null,
      history: wos
        .filter((w) => DONE_STATUSES.includes(w.status))
        .slice(0, 10)
        .map((w) => ({ date: w.updatedAt, title: w.title, description: `${w.code} · ${w.status.replace('_', ' ')}`, workOrderId: w._id })),
    }
  })

  return sendResponse(res, 200, summary)
})

/** Enterprise app: resolve a scanned QR poster to the site (within the caller's scope). */
export const getSiteByQr = asyncHandler(async function getSiteByQr(req, res) {
  const site = await Site.findOne(scopedSiteFilter(req, { qrCode: req.params.code }))
    .populate('clientId', 'companyName')
    .populate('serviceIds', 'name')
  if (!site) throw ApiError.notFound('This QR code does not belong to any of your sites')
  return sendResponse(res, 200, site)
})

/** The site's QR code as a PNG data URL, for printing. */
export const getSiteQr = asyncHandler(async function getSiteQr(req, res) {
  const site = await Site.findOne(scopedSiteFilter(req, { _id: req.params.id })).select('name address qrCode')
  if (!site) throw ApiError.notFound('Site not found')
  if (!site.qrCode) {
    site.qrCode = newSiteQrCode()
    await site.save()
  }
  const dataUrl = await QRCode.toDataURL(site.qrCode, { width: 512, margin: 2, errorCorrectionLevel: 'M' })
  return sendResponse(res, 200, { qrCode: site.qrCode, dataUrl, name: site.name, address: site.address })
})

/** Invalidates a lost/defaced poster by issuing a new code. */
export const regenerateSiteQr = asyncHandler(async function regenerateSiteQr(req, res) {
  const site = await Site.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!site) throw ApiError.notFound('Site not found')
  site.qrCode = newSiteQrCode()
  await site.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'regenerated site QR code',
    entityType: ACTIVITY_ENTITY_TYPE.SITE,
    entityId: site._id,
    entityLabel: site.name,
  })

  const dataUrl = await QRCode.toDataURL(site.qrCode, { width: 512, margin: 2, errorCorrectionLevel: 'M' })
  return sendResponse(res, 200, { qrCode: site.qrCode, dataUrl, name: site.name, address: site.address }, 'New QR code issued')
})
