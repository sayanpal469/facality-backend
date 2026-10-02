import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { generateCode } from '../utils/sequence.js'
import { Contract, RENEWAL_WINDOW_DAYS, contractState } from '../models/Contract.js'
import { PmSchedule } from '../models/PmSchedule.js'
import { Client } from '../models/Client.js'
import { Site } from '../models/Site.js'
import { Document } from '../models/Document.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { ACTIVITY_ENTITY_TYPE, ROLES } from '../constants/enums.js'

const withState = (c) => ({ ...(c.toObject ? c.toObject() : c), state: contractState(c) })

async function assertSitesBelong(req, clientId, siteIds = []) {
  if (!siteIds.length) return
  const n = await Site.countDocuments({ _id: { $in: siteIds }, clientId, enterpriseId: req.user.enterpriseId })
  if (n !== new Set(siteIds.map(String)).size) throw ApiError.badRequest('Every site must belong to this client')
}

async function assertDocumentBelongs(req, clientId, documentId) {
  if (documentId && !(await Document.exists({ _id: documentId, clientId, enterpriseId: req.user.enterpriseId }))) {
    throw ApiError.badRequest('That document does not belong to this client')
  }
}

/** Mongo filter for a derived contract state. */
function stateFilter(state, now = new Date()) {
  const soon = new Date(now.getTime() + RENEWAL_WINDOW_DAYS * 864e5)
  switch (state) {
    case 'cancelled':
      return { cancelled: true }
    case 'upcoming':
      return { cancelled: false, startDate: { $gt: now } }
    case 'expired':
      return { cancelled: false, endDate: { $lt: now } }
    case 'expiring':
      return { cancelled: false, startDate: { $lte: now }, endDate: { $gte: now, $lte: soon } }
    case 'active':
      return { cancelled: false, startDate: { $lte: now }, endDate: { $gt: soon } }
    default:
      return {}
  }
}

export const createContract = asyncHandler(async function createContract(req, res) {
  const client = await Client.findOne({ _id: req.body.clientId, enterpriseId: req.user.enterpriseId }).select('companyName')
  if (!client) throw ApiError.notFound('Client not found')
  await assertSitesBelong(req, client._id, req.body.siteIds)
  await assertDocumentBelongs(req, client._id, req.body.documentId)

  const contract = await Contract.create({ ...req.body, enterpriseId: req.user.enterpriseId, code: await generateCode('contract', req.user.enterpriseId) })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `created contract ${contract.code}`,
    entityType: ACTIVITY_ENTITY_TYPE.CLIENT,
    entityId: client._id,
    entityLabel: client.companyName,
  })

  return sendResponse(res, 201, withState(contract), 'Contract created')
})

export const listContracts = asyncHandler(async function listContracts(req, res) {
  const q = req.validatedQuery
  const filter = { enterpriseId: req.user.enterpriseId, ...stateFilter(q.state) }
  if (req.user.role === ROLES.USER) filter.clientId = req.user.clientId
  else if (q.clientId) filter.clientId = q.clientId
  if (q.search) {
    const rx = { $regex: q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    filter.$or = [{ title: rx }, { code: rx }]
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    Contract.find(filter)
      .sort({ endDate: 1 })
      .skip(skip)
      .limit(limit)
      .populate('clientId', 'companyName')
      .populate('siteIds', 'name')
      .populate('serviceIds', 'name'),
    Contract.countDocuments(filter),
  ])
  return sendResponse(res, 200, items.map(withState), undefined, paginatedMeta({ page, limit, total }))
})

export const getContract = asyncHandler(async function getContract(req, res) {
  const filter = { _id: req.params.id, enterpriseId: req.user.enterpriseId }
  if (req.user.role === ROLES.USER) filter.clientId = req.user.clientId
  const contract = await Contract.findOne(filter)
    .populate('clientId', 'companyName')
    .populate('siteIds', 'name')
    .populate('serviceIds', 'name')
    .populate('documentId', 'title fileUrl')
  if (!contract) throw ApiError.notFound('Contract not found')

  const schedules = await PmSchedule.find({ contractId: contract._id }).select('code title frequencyUnit frequencyInterval nextDueDate active siteId').populate('siteId', 'name').lean()
  const visitsDone = await WorkOrder.countDocuments({
    pmScheduleId: { $in: schedules.map((s) => s._id) },
    createdAt: { $gte: contract.startDate, $lte: contract.endDate },
  })
  return sendResponse(res, 200, { ...withState(contract), schedules, visitsDone })
})

export const updateContract = asyncHandler(async function updateContract(req, res) {
  const contract = await Contract.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!contract) throw ApiError.notFound('Contract not found')
  if (req.body.siteIds) await assertSitesBelong(req, contract.clientId, req.body.siteIds)
  if (req.body.documentId) await assertDocumentBelongs(req, contract.clientId, req.body.documentId)
  const start = req.body.startDate ?? contract.startDate
  const end = req.body.endDate ?? contract.endDate
  if (end <= start) throw ApiError.badRequest('End date must be after the start date')

  const wasCancelled = contract.cancelled
  Object.assign(contract, req.body)
  if (!wasCancelled && contract.cancelled) contract.cancelledAt = new Date()
  if (wasCancelled && !contract.cancelled) contract.cancelledAt = null
  await contract.save()

  // Cancelling a contract stops its preventive maintenance.
  if (!wasCancelled && contract.cancelled) await PmSchedule.updateMany({ contractId: contract._id }, { $set: { active: false } })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: contract.cancelled && !wasCancelled ? `cancelled contract ${contract.code}` : `updated contract ${contract.code}`,
    entityType: ACTIVITY_ENTITY_TYPE.CONTRACT,
    entityId: contract._id,
    entityLabel: contract.title,
  })

  return sendResponse(res, 200, withState(contract), 'Contract updated')
})

/** Creates the next term as a new contract (same scope), starting the day after this one ends. */
export const renewContract = asyncHandler(async function renewContract(req, res) {
  const prev = await Contract.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!prev) throw ApiError.notFound('Contract not found')
  const startDate = req.body.startDate ?? new Date(prev.endDate.getTime() + 864e5)
  if (req.body.endDate <= startDate) throw ApiError.badRequest('End date must be after the start date')

  const next = await Contract.create({
    enterpriseId: prev.enterpriseId,
    clientId: prev.clientId,
    siteIds: prev.siteIds,
    serviceIds: prev.serviceIds,
    code: await generateCode('contract', req.user.enterpriseId),
    title: prev.title,
    type: prev.type,
    startDate,
    endDate: req.body.endDate,
    value: req.body.value ?? prev.value,
    billingCycle: prev.billingCycle,
    visitsIncluded: prev.visitsIncluded,
    terms: prev.terms,
    renewedFromId: prev._id,
  })
  // Keep the maintenance schedules running under the new term.
  await PmSchedule.updateMany({ contractId: prev._id }, { $set: { contractId: next._id } })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: `renewed contract ${prev.code} as ${next.code}`,
    entityType: ACTIVITY_ENTITY_TYPE.CONTRACT,
    entityId: next._id,
    entityLabel: next.title,
  })

  return sendResponse(res, 201, withState(next), 'Contract renewed')
})
