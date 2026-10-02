import mongoose from 'mongoose'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { distanceMeters } from '../utils/geo.js'
import { addDays, localDay } from '../utils/dates.js'
import { Attendance } from '../models/Attendance.js'
import { Employee } from '../models/Employee.js'
import { Enterprise } from '../models/Enterprise.js'
import { Site } from '../models/Site.js'
import { ROLES } from '../constants/enums.js'

const isAdmin = (req) => req.user.role === ROLES.ADMIN

/** Employees the caller may see/mark: everyone for admins, their sites' staff for supervisors. */
function employeeScope(req, extra = {}) {
  const filter = { enterpriseId: req.user.enterpriseId, ...extra }
  if (!isAdmin(req)) filter.assignedSiteIds = { $in: req.scope.siteIds }
  return filter
}

function ownEmployeeId(req) {
  if (!req.user.employeeId) throw ApiError.forbidden('Only staff accounts have attendance')
  return req.user.employeeId
}

// ── Self service (Enterprise App) ────────────────────────────────────────────

export const myAttendance = asyncHandler(async function myAttendance(req, res) {
  const employeeId = ownEmployeeId(req)
  const today = localDay()
  const since = addDays(today, -(req.validatedQuery.days - 1))
  const records = await Attendance.find({ employeeId, date: { $gte: since, $lte: today } })
    .sort({ date: -1 })
    .populate('siteId', 'name')
  return sendResponse(res, 200, { today, todayRecord: records.find((r) => r.date === today) ?? null, records })
})

export const clockIn = asyncHandler(async function clockIn(req, res) {
  const employeeId = ownEmployeeId(req)
  const today = localDay()
  const { siteId, latitude, longitude, accuracy } = req.body

  const existing = await Attendance.findOne({ employeeId, date: today })
  if (existing?.checkIn) throw ApiError.conflict('You have already clocked in today')

  let site = null
  let distance = null
  let verified = null
  if (siteId) {
    if (!req.scope.siteIds.some((id) => String(id) === siteId)) throw ApiError.forbidden('You are not assigned to this site')
    site = await Site.findById(siteId).select('name latitude longitude geofenceRadiusM')
    if (!site) throw ApiError.notFound('Site not found')

    const enterprise = await Enterprise.findById(req.user.enterpriseId).select('operations').lean()
    const mode = enterprise?.operations?.gpsCheckInMode ?? 'warn'
    const hasFix = latitude !== undefined && longitude !== undefined
    if (mode !== 'off' && site.latitude != null && site.longitude != null) {
      if (!hasFix && mode === 'enforce') throw ApiError.badRequest('Turn on location to clock in at this site')
      if (hasFix) {
        distance = distanceMeters(latitude, longitude, site.latitude, site.longitude)
        verified = distance <= site.geofenceRadiusM + Math.min(accuracy ?? 0, 100)
        if (!verified && mode === 'enforce') throw ApiError.forbidden(`You appear to be ${distance} m from ${site.name} — clock in when you're on site`)
      }
    }
  }

  const record = await Attendance.findOneAndUpdate(
    { employeeId, date: today },
    {
      $set: {
        enterpriseId: req.user.enterpriseId,
        siteId: site?._id ?? null,
        status: 'present',
        checkIn: new Date(),
        checkInLatitude: latitude ?? null,
        checkInLongitude: longitude ?? null,
        checkInDistanceM: distance,
        locationVerified: verified,
        source: 'self',
        markedBy: req.user._id,
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).populate('siteId', 'name')

  return sendResponse(res, 200, record, verified === false ? `Clocked in — ${distance} m from site` : 'Clocked in')
})

export const clockOut = asyncHandler(async function clockOut(req, res) {
  const employeeId = ownEmployeeId(req)
  const record = await Attendance.findOne({ employeeId, date: localDay() })
  if (!record?.checkIn) throw ApiError.badRequest('You have not clocked in today')
  if (record.checkOut) throw ApiError.conflict('You have already clocked out today')
  record.checkOut = new Date()
  await record.save()
  await record.populate('siteId', 'name')
  return sendResponse(res, 200, record, 'Clocked out')
})

// ── Marking staff (supervisors & admins) ────────────────────────────────────

/** Staff assigned to a site with their attendance for the day — the marking sheet. */
export const roster = asyncHandler(async function roster(req, res) {
  const { siteId } = req.validatedQuery
  const date = req.validatedQuery.date ?? localDay()
  if (!isAdmin(req) && !req.scope.siteIds.some((id) => String(id) === siteId)) throw ApiError.forbidden('You are not assigned to this site')

  const employees = await Employee.find({ enterpriseId: req.user.enterpriseId, assignedSiteIds: siteId, status: 'active' })
    .select('name employeeCode serviceId userId')
    .populate('serviceId', 'name')
    .sort({ name: 1 })
    .lean()
  const records = await Attendance.find({ employeeId: { $in: employees.map((e) => e._id) }, date }).lean()
  const byEmployee = new Map(records.map((r) => [String(r.employeeId), r]))

  return sendResponse(res, 200, {
    date,
    siteId,
    rows: employees.map((e) => ({
      employee: { _id: e._id, name: e.name, employeeCode: e.employeeCode, jobType: e.serviceId?.name ?? '', hasLogin: Boolean(e.userId) },
      attendance: byEmployee.get(String(e._id)) ?? null,
    })),
  })
})

export const markAttendance = asyncHandler(async function markAttendance(req, res) {
  const { date, siteId, entries } = req.body
  if (date > localDay()) throw ApiError.badRequest('Attendance cannot be marked for a future date')
  if (siteId && !isAdmin(req) && !req.scope.siteIds.some((id) => String(id) === siteId)) throw ApiError.forbidden('You are not assigned to this site')

  const ids = [...new Set(entries.map((e) => e.employeeId))]
  const allowed = await Employee.find(employeeScope(req, { _id: { $in: ids } })).select('_id').lean()
  if (allowed.length !== ids.length) throw ApiError.forbidden('Some of these employees are not in your team')

  const source = isAdmin(req) ? 'admin' : 'supervisor'
  await Attendance.bulkWrite(
    entries.map((e) => ({
      updateOne: {
        filter: { employeeId: e.employeeId, date },
        update: {
          $set: { enterpriseId: req.user.enterpriseId, status: e.status, source, markedBy: req.user._id, note: e.note ?? '', ...(siteId ? { siteId } : {}) },
          // Clearing a day to absent/leave drops any self clock-in times.
          ...(e.status === 'absent' || e.status === 'leave' ? { $unset: { checkIn: 1, checkOut: 1 } } : {}),
        },
        upsert: true,
      },
    })),
  )

  const records = await Attendance.find({ employeeId: { $in: ids }, date }).lean()
  return sendResponse(res, 200, records, `Attendance saved for ${records.length} employee${records.length === 1 ? '' : 's'}`)
})

// Aggregation pipelines skip Mongoose casting, so id strings must become ObjectIds.
function castForAggregate(filter) {
  const oid = (v) => new mongoose.Types.ObjectId(String(v))
  const match = { ...filter, enterpriseId: oid(filter.enterpriseId) }
  if (filter.siteId) match.siteId = oid(filter.siteId)
  if (typeof filter.employeeId === 'string') match.employeeId = oid(filter.employeeId)
  else if (filter.employeeId?.$in) match.employeeId = { $in: filter.employeeId.$in.map(oid) }
  return match
}

export const listAttendance = asyncHandler(async function listAttendance(req, res) {
  const q = req.validatedQuery
  const filter = { enterpriseId: req.user.enterpriseId }
  if (q.employeeId) filter.employeeId = q.employeeId
  if (q.siteId) filter.siteId = q.siteId
  if (q.status) filter.status = q.status
  if (q.dateFrom || q.dateTo) filter.date = { ...(q.dateFrom ? { $gte: q.dateFrom } : {}), ...(q.dateTo ? { $lte: q.dateTo } : {}) }
  if (!isAdmin(req)) {
    const team = await Employee.find(employeeScope(req)).select('_id').lean()
    const teamIds = team.map((e) => String(e._id))
    if (q.employeeId && !teamIds.includes(q.employeeId)) throw ApiError.forbidden('This employee is not in your team')
    if (!q.employeeId) filter.employeeId = { $in: teamIds }
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total, counts] = await Promise.all([
    Attendance.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .populate('employeeId', 'name employeeCode')
      .populate('siteId', 'name')
      .populate('markedBy', 'name'),
    Attendance.countDocuments(filter),
    Attendance.aggregate([{ $match: castForAggregate(filter) }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ])
  const summary = Object.fromEntries(['present', 'absent', 'half_day', 'leave'].map((s) => [s, counts.find((c) => c._id === s)?.count ?? 0]))

  return sendResponse(res, 200, items, undefined, { ...paginatedMeta({ page, limit, total }), summary })
})
