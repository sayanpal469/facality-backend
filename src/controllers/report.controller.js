import { asyncHandler } from '../utils/asyncHandler.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { ApiError } from '../utils/ApiError.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { Complaint, complaintSla } from '../models/Complaint.js'
import { Employee } from '../models/Employee.js'
import { SiteVisit } from '../models/SiteVisit.js'
import { Client } from '../models/Client.js'
import { Enterprise } from '../models/Enterprise.js'
import { ServiceCategory } from '../models/ServiceCategory.js'
import { ServiceType } from '../models/ServiceType.js'
import { WORK_ORDER_TERMINAL_STATUSES } from '../constants/enums.js'
import { reportToPdf, reportToXlsx } from '../services/reportExport.service.js'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function parseDate(value, name, endOfDay) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest(`${name} is not a valid date`)
  // A bare date for `dateTo` means "through the end of that day".
  if (endOfDay && DATE_ONLY.test(value)) d.setUTCHours(23, 59, 59, 999)
  return d
}

function dateRangeFilter(query) {
  const range = {}
  if (query.dateFrom) range.$gte = parseDate(query.dateFrom, 'dateFrom', false)
  if (query.dateTo) range.$lte = parseDate(query.dateTo, 'dateTo', true)
  return Object.keys(range).length ? range : undefined
}

/** Filter shared by every report: tenant, optional client, optional created-at range. */
function baseFilter(req, { byClient = true } = {}) {
  const filter = { enterpriseId: req.user.enterpriseId }
  if (byClient && req.query.clientId) filter.clientId = req.query.clientId
  const createdAt = dateRangeFilter(req.query)
  if (createdAt) filter.createdAt = createdAt
  return filter
}

const label = (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '')
const nameOf = (ref, field = 'name') => (ref && typeof ref === 'object' ? ref[field] ?? '' : '')

// Each builder returns { title, summary, rows, columns } — `summary`/`rows` feed the
// JSON endpoint, and `summaryLabels`/`columns` drive the Excel/PDF export.

async function buildWorkReport(req) {
  const filter = baseFilter(req)
  const workOrders = await WorkOrder.find(filter)
    .select('code title status priority progress dueDate createdAt clientId siteId serviceId assignedEmployeeId')
    .populate('clientId', 'companyName')
    .populate('siteId', 'name')
    .populate('serviceId', 'name')
    .populate('assignedEmployeeId', 'name')
    .sort({ createdAt: -1 })
    .lean()
  const now = new Date()
  const open = (w) => !WORK_ORDER_TERMINAL_STATUSES.includes(w.status)
  const summary = {
    total: workOrders.length,
    completed: workOrders.filter((w) => ['completed', 'verified', 'closed'].includes(w.status)).length,
    pending: workOrders.filter(open).length,
    overdue: workOrders.filter((w) => w.dueDate < now && open(w)).length,
    cancelled: workOrders.filter((w) => w.status === 'cancelled').length,
  }
  const rows = workOrders.map((w) => ({
    id: w._id,
    code: w.code,
    title: w.title,
    status: w.status,
    priority: w.priority,
    progress: w.progress,
    client: nameOf(w.clientId, 'companyName'),
    site: nameOf(w.siteId),
    service: nameOf(w.serviceId),
    assignee: nameOf(w.assignedEmployeeId),
    createdAt: w.createdAt,
    dueDate: w.dueDate,
    overdue: w.dueDate < now && open(w),
  }))
  return {
    title: 'Work Report',
    summary,
    summaryLabels: { total: 'Total work', completed: 'Completed', pending: 'Pending', overdue: 'Overdue', cancelled: 'Cancelled' },
    rows,
    columns: [
      { header: 'Code', key: 'code', width: 12 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Client', key: 'client', width: 20 },
      { header: 'Site', key: 'site', width: 18 },
      { header: 'Service', key: 'service', width: 16 },
      { header: 'Assignee', key: 'assignee', width: 16 },
      { header: 'Status', key: 'statusLabel', width: 13 },
      { header: 'Priority', key: 'priorityLabel', width: 9 },
      { header: 'Done %', key: 'progress', width: 9 },
      { header: 'Created', key: 'createdAt', width: 12 },
      { header: 'Due', key: 'dueDate', width: 12 },
    ],
    exportRows: rows.map((r) => ({ ...r, statusLabel: label(r.status) + (r.overdue ? ' (overdue)' : ''), priorityLabel: label(r.priority) })),
  }
}

async function buildServiceReport(req) {
  const enterpriseId = req.user.enterpriseId
  const filter = baseFilter(req)
  const [categories, types] = await Promise.all([ServiceCategory.find({ enterpriseId }).lean(), ServiceType.find({ enterpriseId }).lean()])

  const rows = await Promise.all(
    categories.map(async (cat) => {
      const ids = types.filter((t) => String(t.categoryId) === String(cat._id)).map((t) => t._id)
      const [workOrders, completed, complaints] = await Promise.all([
        WorkOrder.countDocuments({ ...filter, serviceId: { $in: ids } }),
        WorkOrder.countDocuments({ ...filter, serviceId: { $in: ids }, status: { $in: ['completed', 'verified', 'closed'] } }),
        Complaint.countDocuments({ ...filter, serviceId: { $in: ids } }),
      ])
      return { service: cat.name, types: ids.length, workOrders, completed, complaints }
    }),
  )

  return {
    title: 'Service Report',
    summary: { activeCategories: categories.filter((c) => c.status === 'active').length, totalTypes: types.length },
    summaryLabels: { activeCategories: 'Active categories', totalTypes: 'Service types' },
    rows,
    columns: [
      { header: 'Service Category', key: 'service', width: 28 },
      { header: 'Service Types', key: 'types', width: 12 },
      { header: 'Work Orders', key: 'workOrders', width: 12 },
      { header: 'Completed', key: 'completed', width: 12 },
      { header: 'Complaints', key: 'complaints', width: 12 },
    ],
  }
}

async function buildEmployeeReport(req) {
  const enterpriseId = req.user.enterpriseId
  const filter = baseFilter(req)
  const employees = await Employee.find({ enterpriseId }).select('name employeeCode serviceId').populate('serviceId', 'name').lean()

  const rows = await Promise.all(
    employees.map(async (e) => {
      const [assigned, completed, pending, visits] = await Promise.all([
        WorkOrder.countDocuments({ ...filter, assignedEmployeeId: e._id }),
        WorkOrder.countDocuments({ ...filter, assignedEmployeeId: e._id, status: { $in: ['completed', 'verified', 'closed'] } }),
        WorkOrder.countDocuments({ ...filter, assignedEmployeeId: e._id, status: { $nin: WORK_ORDER_TERMINAL_STATUSES } }),
        SiteVisit.countDocuments({ ...filter, visitorId: e._id }),
      ])
      return { employee: e.name, employeeCode: e.employeeCode, jobType: nameOf(e.serviceId), assigned, completed, pending, visits }
    }),
  )
  rows.sort((a, b) => b.assigned - a.assigned)

  return {
    title: 'Employee Report',
    summary: { totalEmployees: employees.length },
    summaryLabels: { totalEmployees: 'Total employees' },
    rows,
    columns: [
      { header: 'Employee', key: 'employee', width: 24 },
      { header: 'Code', key: 'employeeCode', width: 12 },
      { header: 'Job Type', key: 'jobType', width: 16 },
      { header: 'Assigned', key: 'assigned', width: 10 },
      { header: 'Completed', key: 'completed', width: 10 },
      { header: 'Pending', key: 'pending', width: 10 },
      { header: 'Site Visits', key: 'visits', width: 10 },
    ],
  }
}

async function buildComplaintReport(req) {
  const filter = baseFilter(req)
  const complaints = await Complaint.find(filter)
    .select('code title status priority createdAt updatedAt resolvedAt responseDueAt resolutionDueAt respondedAt clientId siteId serviceId assignedEmployeeId')
    .populate('clientId', 'companyName')
    .populate('siteId', 'name')
    .populate('serviceId', 'name')
    .populate('assignedEmployeeId', 'name')
    .sort({ createdAt: -1 })
    .lean()
  const isResolved = (c) => ['resolved', 'client_verification', 'closed'].includes(c.status)
  const resolvedAt = (c) => c.resolvedAt ?? c.updatedAt
  const resolvedOnes = complaints.filter(isResolved)
  const avgResolutionHours = resolvedOnes.length
    ? Math.round(resolvedOnes.reduce((sum, c) => sum + (resolvedAt(c) - c.createdAt) / 36e5, 0) / resolvedOnes.length)
    : 0

  // SLA compliance counts only clocks that have finished or already failed.
  const slas = complaints.map((c) => complaintSla(c))
  const pct = (clock) => {
    const decided = slas.filter((s) => s[clock].state === 'met' || s[clock].state === 'breached')
    return decided.length ? Math.round((decided.filter((s) => s[clock].state === 'met').length / decided.length) * 100) : 100
  }
  const slaLabel = (s) => (s.resolution.state === 'breached' || s.response.state === 'breached' ? 'Breached' : s.resolution.state === 'met' ? 'Met' : 'On track')

  const rows = complaints.map((c, i) => ({
    id: c._id,
    code: c.code,
    title: c.title,
    status: c.status,
    priority: c.priority,
    client: nameOf(c.clientId, 'companyName'),
    site: nameOf(c.siteId),
    service: nameOf(c.serviceId),
    assignee: nameOf(c.assignedEmployeeId),
    createdAt: c.createdAt,
    resolutionHours: isResolved(c) ? Math.round((resolvedAt(c) - c.createdAt) / 36e5) : null,
    sla: slaLabel(slas[i]),
  }))

  return {
    title: 'Complaint Report',
    summary: {
      total: complaints.length,
      open: complaints.filter((c) => c.status === 'open').length,
      resolved: resolvedOnes.length,
      avgResolutionHours,
      responseSlaPct: pct('response'),
      resolutionSlaPct: pct('resolution'),
      slaBreached: slas.filter((s) => s.response.state === 'breached' || s.resolution.state === 'breached').length,
    },
    summaryLabels: {
      total: 'Total complaints',
      open: 'Open',
      resolved: 'Resolved',
      avgResolutionHours: 'Avg. resolution (h)',
      responseSlaPct: 'Response SLA met %',
      resolutionSlaPct: 'Resolution SLA met %',
    },
    rows,
    columns: [
      { header: 'Code', key: 'code', width: 12 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Client', key: 'client', width: 20 },
      { header: 'Site', key: 'site', width: 18 },
      { header: 'Service', key: 'service', width: 16 },
      { header: 'Assignee', key: 'assignee', width: 16 },
      { header: 'Status', key: 'statusLabel', width: 14 },
      { header: 'Priority', key: 'priorityLabel', width: 9 },
      { header: 'Raised', key: 'createdAt', width: 12 },
      { header: 'Fix hrs', key: 'resolutionHours', width: 9 },
      { header: 'SLA', key: 'sla', width: 10 },
    ],
    exportRows: rows.map((r) => ({ ...r, statusLabel: label(r.status), priorityLabel: label(r.priority) })),
  }
}

async function buildClientReport(req) {
  const enterpriseId = req.user.enterpriseId
  const filter = baseFilter(req, { byClient: false })
  const clientFilter = { enterpriseId }
  if (req.query.clientId) clientFilter._id = req.query.clientId
  const clients = await Client.find(clientFilter).select('companyName serviceIds status').lean()

  const rows = await Promise.all(
    clients.map(async (c) => {
      const [workOrders, complaints, visits] = await Promise.all([
        WorkOrder.countDocuments({ ...filter, clientId: c._id }),
        Complaint.countDocuments({ ...filter, clientId: c._id }),
        SiteVisit.countDocuments({ ...filter, clientId: c._id }),
      ])
      return { client: c.companyName, status: c.status, services: c.serviceIds.length, workOrders, complaints, visits }
    }),
  )

  return {
    title: 'Client Report',
    summary: { totalClients: clients.length, active: clients.filter((c) => c.status === 'active').length },
    summaryLabels: { totalClients: 'Total clients', active: 'Active' },
    rows,
    columns: [
      { header: 'Client', key: 'client', width: 28 },
      { header: 'Status', key: 'statusLabel', width: 10 },
      { header: 'Services', key: 'services', width: 10 },
      { header: 'Work Orders', key: 'workOrders', width: 12 },
      { header: 'Complaints', key: 'complaints', width: 12 },
      { header: 'Site Visits', key: 'visits', width: 12 },
    ],
    exportRows: rows.map((r) => ({ ...r, statusLabel: label(r.status) })),
  }
}

const BUILDERS = {
  work: buildWorkReport,
  service: buildServiceReport,
  employee: buildEmployeeReport,
  complaint: buildComplaintReport,
  client: buildClientReport,
}

function jsonHandler(builder) {
  return asyncHandler(async (req, res) => {
    const { summary, rows } = await builder(req)
    return sendResponse(res, 200, { summary, rows })
  })
}

export const workReport = jsonHandler(buildWorkReport)
export const serviceReport = jsonHandler(buildServiceReport)
export const employeeReport = jsonHandler(buildEmployeeReport)
export const complaintReport = jsonHandler(buildComplaintReport)
export const clientReport = jsonHandler(buildClientReport)

const fmtDay = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/** GET /reports/:type/export?format=xlsx|pdf — the same report as a file download. */
export const exportReport = asyncHandler(async function exportReport(req, res) {
  const builder = BUILDERS[req.params.type]
  if (!builder) throw ApiError.notFound('Unknown report type')
  const format = req.query.format === 'pdf' ? 'pdf' : 'xlsx'

  const [built, enterprise, client] = await Promise.all([
    builder(req),
    Enterprise.findById(req.user.enterpriseId).select('name').lean(),
    req.query.clientId ? Client.findOne({ _id: req.query.clientId, enterpriseId: req.user.enterpriseId }).select('companyName').lean() : null,
  ])

  const range = dateRangeFilter(req.query)
  const period = range
    ? `${range.$gte ? fmtDay(range.$gte) : 'Beginning'} – ${range.$lte ? fmtDay(range.$lte) : 'Today'}`
    : 'All time'
  const subtitle = [enterprise?.name, client ? `Client: ${client.companyName}` : 'All clients', period, `Generated ${new Date().toLocaleString('en-IN')}`]
    .filter(Boolean)
    .join('  ·  ')

  const report = {
    title: built.title,
    subtitle,
    summary: Object.entries(built.summaryLabels).map(([key, l]) => ({ label: l, value: built.summary[key] ?? 0 })),
    columns: built.columns,
    rows: built.exportRows ?? built.rows,
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `${req.params.type}-report-${stamp}.${format}`
  const buffer = format === 'pdf' ? await reportToPdf(report) : await reportToXlsx(report)
  res.setHeader(
    'Content-Type',
    format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Length', buffer.length)
  return res.end(buffer)
})
