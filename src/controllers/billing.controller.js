import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { generateCode } from '../utils/sequence.js'
import { adminUserIds, clientUserIds, notifyUsers } from '../utils/notifier.js'
import { Invoice, Quotation, invoiceState, quotationState } from '../models/Billing.js'
import { Client } from '../models/Client.js'
import { Site } from '../models/Site.js'
import { Contract } from '../models/Contract.js'
import { Complaint } from '../models/Complaint.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { Enterprise } from '../models/Enterprise.js'
import { billingDocToPdf } from '../services/billingPdf.service.js'
import { requestBaseUrl } from '../services/storage.service.js'
import { signPath, verifySignedPath } from '../utils/signedUrl.js'
import { env } from '../config/env.js'
import { ACTIVITY_ENTITY_TYPE, NOTIFICATION_KIND, ROLES } from '../constants/enums.js'

const isClient = (req) => req.user.role === ROLES.USER
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Client users only ever see quotations that were sent, and invoices that were issued.
function scoped(req, extra = {}, visibleStatuses) {
  const filter = { enterpriseId: req.user.enterpriseId, ...extra }
  if (isClient(req)) {
    filter.clientId = req.user.clientId
    filter.status = { $in: visibleStatuses }
  }
  return filter
}

async function assertLinks(req, clientId, body) {
  const enterpriseId = req.user.enterpriseId
  if (body.siteId && !(await Site.exists({ _id: body.siteId, clientId, enterpriseId }))) throw ApiError.badRequest('Site does not belong to this client')
  if (body.contractId && !(await Contract.exists({ _id: body.contractId, clientId, enterpriseId }))) throw ApiError.badRequest('Contract does not belong to this client')
  if (body.complaintId && !(await Complaint.exists({ _id: body.complaintId, clientId, enterpriseId }))) throw ApiError.badRequest('Complaint does not belong to this client')
  if (body.workOrderIds?.length) {
    const n = await WorkOrder.countDocuments({ _id: { $in: body.workOrderIds }, clientId, enterpriseId })
    if (n !== new Set(body.workOrderIds.map(String)).size) throw ApiError.badRequest('Every work order must belong to this client')
  }
}

async function loadClient(req, clientId) {
  const client = await Client.findOne({ _id: clientId, enterpriseId: req.user.enterpriseId }).select('companyName')
  if (!client) throw ApiError.notFound('Client not found')
  return client
}

const POPULATE = [
  { path: 'clientId', select: 'companyName' },
  { path: 'siteId', select: 'name' },
]

async function notifyClient(req, doc, title, body, entityType) {
  await notifyUsers({
    enterpriseId: req.user.enterpriseId,
    userIds: await clientUserIds(doc.clientId),
    actorId: req.user._id,
    title,
    body,
    kind: NOTIFICATION_KIND.CLIENT,
    linkEntityType: entityType,
    linkEntityId: doc._id,
  })
}

const log = (req, action, entityId, entityLabel) =>
  logActivity({ enterpriseId: req.user.enterpriseId, actorId: req.user._id, action, entityType: ACTIVITY_ENTITY_TYPE.CLIENT, entityId, entityLabel })

// ── Quotations ──────────────────────────────────────────────────────────────

const withQState = (q) => ({ ...q.toObject(), state: quotationState(q) })
const QUOTE_VISIBLE = ['sent', 'accepted', 'rejected']

export const createQuotation = asyncHandler(async function createQuotation(req, res) {
  const client = await loadClient(req, req.body.clientId)
  await assertLinks(req, client._id, req.body)
  const q = await Quotation.create({ ...req.body, enterpriseId: req.user.enterpriseId, code: await generateCode('quotation', req.user.enterpriseId), createdBy: req.user._id })
  await log(req, `drafted quotation ${q.code}`, client._id, client.companyName)
  return sendResponse(res, 201, withQState(await q.populate(POPULATE)), 'Quotation saved as draft')
})

export const listQuotations = asyncHandler(async function listQuotations(req, res) {
  const q = req.validatedQuery
  const filter = scoped(req, {}, QUOTE_VISIBLE)
  if (q.clientId && !isClient(req)) filter.clientId = q.clientId
  if (q.state === 'expired') Object.assign(filter, { status: 'sent', validUntil: { $lt: new Date() } })
  else if (q.state === 'sent') Object.assign(filter, { status: 'sent', validUntil: { $gte: new Date() } })
  else if (q.state) filter.status = isClient(req) && q.state === 'draft' ? '__none__' : q.state
  if (q.search) filter.$or = [{ title: { $regex: escapeRx(q.search), $options: 'i' } }, { code: { $regex: escapeRx(q.search), $options: 'i' } }]

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([Quotation.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate(POPULATE), Quotation.countDocuments(filter)])
  return sendResponse(res, 200, items.map(withQState), undefined, paginatedMeta({ page, limit, total }))
})

export const getQuotation = asyncHandler(async function getQuotation(req, res) {
  const q = await Quotation.findOne(scoped(req, { _id: req.params.id }, QUOTE_VISIBLE)).populate([
    ...POPULATE,
    { path: 'workOrderId', select: 'code title status' },
    { path: 'invoiceId', select: 'code status total' },
    { path: 'complaintId', select: 'code title' },
  ])
  if (!q) throw ApiError.notFound('Quotation not found')
  return sendResponse(res, 200, withQState(q))
})

export const updateQuotation = asyncHandler(async function updateQuotation(req, res) {
  const q = await Quotation.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!q) throw ApiError.notFound('Quotation not found')
  if (q.status !== 'draft' && q.status !== 'sent') throw ApiError.badRequest(`A ${q.status} quotation can't be edited`)
  await assertLinks(req, q.clientId, req.body)
  Object.assign(q, req.body)
  await q.save()
  return sendResponse(res, 200, withQState(await q.populate(POPULATE)), 'Quotation updated')
})

export const sendQuotation = asyncHandler(async function sendQuotation(req, res) {
  const q = await Quotation.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!q) throw ApiError.notFound('Quotation not found')
  if (q.status !== 'draft' && q.status !== 'sent') throw ApiError.badRequest(`This quotation is already ${q.status}`)
  if (q.validUntil < new Date()) throw ApiError.badRequest('Extend the validity date before sending')
  q.status = 'sent'
  q.sentAt = new Date()
  await q.save()
  await notifyClient(req, q, 'New quotation', `${q.code} · ${q.title} — please review and respond in the app.`, 'Quotation')
  await log(req, `sent quotation ${q.code}`, q.clientId, q.title)
  return sendResponse(res, 200, withQState(await q.populate(POPULATE)), 'Quotation sent to client')
})

/** Client accepts/rejects in the app, or an admin records the client's answer. */
export const respondQuotation = asyncHandler(async function respondQuotation(req, res) {
  const q = await Quotation.findOne(scoped(req, { _id: req.params.id }, QUOTE_VISIBLE))
  if (!q) throw ApiError.notFound('Quotation not found')
  if (q.status !== 'sent') throw ApiError.badRequest('Only a sent quotation can be accepted or rejected')
  if (isClient(req) && q.validUntil < new Date()) throw ApiError.badRequest('This quotation has expired — ask for a fresh one')
  q.status = req.body.decision
  q.respondedAt = new Date()
  q.responseNote = req.body.note
  await q.save()

  if (isClient(req)) {
    await notifyUsers({
      enterpriseId: req.user.enterpriseId,
      userIds: await adminUserIds(req.user.enterpriseId),
      actorId: req.user._id,
      title: `Quotation ${q.status}`,
      body: `${q.code} · ${q.title}${q.responseNote ? ` — "${q.responseNote.slice(0, 120)}"` : ''}`,
      kind: NOTIFICATION_KIND.CLIENT,
      linkEntityType: 'Quotation',
      linkEntityId: q._id,
    })
  }
  await log(req, `${q.status === 'accepted' ? 'accepted' : 'rejected'} quotation ${q.code}`, q.clientId, q.title)
  return sendResponse(res, 200, withQState(await q.populate(POPULATE)), `Quotation ${q.status}`)
})

/** Links a work order created from an accepted quotation (admin panel creates it via the normal form). */
export const linkQuotationWorkOrder = asyncHandler(async function linkQuotationWorkOrder(req, res) {
  const q = await Quotation.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!q) throw ApiError.notFound('Quotation not found')
  const wo = await WorkOrder.findOne({ _id: req.body.workOrderId, enterpriseId: req.user.enterpriseId, clientId: q.clientId })
  if (!wo) throw ApiError.badRequest('Work order not found for this client')
  q.workOrderId = wo._id
  await q.save()
  return sendResponse(res, 200, withQState(q), 'Work order linked')
})

export const invoiceFromQuotation = asyncHandler(async function invoiceFromQuotation(req, res) {
  const q = await Quotation.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!q) throw ApiError.notFound('Quotation not found')
  if (q.status !== 'accepted') throw ApiError.badRequest('Only an accepted quotation can be invoiced')
  if (q.invoiceId) throw ApiError.conflict('This quotation has already been invoiced')

  const inv = await Invoice.create({
    enterpriseId: q.enterpriseId,
    clientId: q.clientId,
    siteId: q.siteId,
    quotationId: q._id,
    workOrderIds: q.workOrderId ? [q.workOrderId] : [],
    code: await generateCode('invoice', req.user.enterpriseId),
    title: q.title,
    items: q.items.map((i) => i.toObject()),
    notes: q.notes,
    terms: q.terms,
    dueDate: req.body.dueDate,
    createdBy: req.user._id,
  })
  q.invoiceId = inv._id
  await q.save()
  await log(req, `invoiced quotation ${q.code} as ${inv.code}`, q.clientId, q.title)
  return sendResponse(res, 201, { ...inv.toObject(), state: invoiceState(inv) }, 'Draft invoice created')
})

// ── Invoices ────────────────────────────────────────────────────────────────

const withIState = (i) => ({ ...i.toObject(), state: invoiceState(i) })
const INVOICE_VISIBLE = ['issued']

function invoiceStateFilter(state, now = new Date()) {
  switch (state) {
    case 'draft':
    case 'cancelled':
      return { status: state }
    case 'paid':
      return { status: 'issued', balance: { $lte: 0 } }
    case 'overdue':
      return { status: 'issued', balance: { $gt: 0 }, dueDate: { $lt: now } }
    case 'unpaid':
      return { status: 'issued', amountPaid: 0, balance: { $gt: 0 }, dueDate: { $gte: now } }
    case 'partially_paid':
      return { status: 'issued', amountPaid: { $gt: 0 }, balance: { $gt: 0 }, dueDate: { $gte: now } }
    default:
      return {}
  }
}

export const createInvoice = asyncHandler(async function createInvoice(req, res) {
  const client = await loadClient(req, req.body.clientId)
  await assertLinks(req, client._id, req.body)
  const inv = await Invoice.create({ ...req.body, enterpriseId: req.user.enterpriseId, code: await generateCode('invoice', req.user.enterpriseId), createdBy: req.user._id })
  await log(req, `drafted invoice ${inv.code}`, client._id, client.companyName)
  return sendResponse(res, 201, withIState(await inv.populate(POPULATE)), 'Invoice saved as draft')
})

export const listInvoices = asyncHandler(async function listInvoices(req, res) {
  const q = req.validatedQuery
  const filter = scoped(req, {}, INVOICE_VISIBLE)
  if (q.clientId && !isClient(req)) filter.clientId = q.clientId
  if (q.state) {
    const sf = invoiceStateFilter(q.state)
    if (isClient(req) && sf.status && sf.status !== 'issued') sf.status = '__none__'
    Object.assign(filter, sf)
  }
  if (q.search) filter.$or = [{ title: { $regex: escapeRx(q.search), $options: 'i' } }, { code: { $regex: escapeRx(q.search), $options: 'i' } }]

  const { page, limit, skip } = getPagination(q)
  const [items, total, outstanding] = await Promise.all([
    Invoice.find(filter).select('-payments').sort({ createdAt: -1 }).skip(skip).limit(limit).populate(POPULATE),
    Invoice.countDocuments(filter),
    Invoice.aggregate([
      { $match: { enterpriseId: req.user.enterpriseId, status: 'issued', ...(isClient(req) ? { clientId: req.user.clientId } : {}) } },
      { $group: { _id: null, balance: { $sum: '$balance' }, overdue: { $sum: { $cond: [{ $lt: ['$dueDate', new Date()] }, '$balance', 0] } } } },
    ]),
  ])
  return sendResponse(res, 200, items.map(withIState), undefined, {
    ...paginatedMeta({ page, limit, total }),
    outstanding: outstanding[0]?.balance ?? 0,
    overdue: outstanding[0]?.overdue ?? 0,
  })
})

export const getInvoice = asyncHandler(async function getInvoice(req, res) {
  const inv = await Invoice.findOne(scoped(req, { _id: req.params.id }, INVOICE_VISIBLE)).populate([
    ...POPULATE,
    { path: 'contractId', select: 'code title' },
    { path: 'quotationId', select: 'code title' },
    { path: 'workOrderIds', select: 'code title status' },
    { path: 'payments.recordedBy', select: 'name' },
  ])
  if (!inv) throw ApiError.notFound('Invoice not found')
  return sendResponse(res, 200, withIState(inv))
})

export const updateInvoice = asyncHandler(async function updateInvoice(req, res) {
  const inv = await Invoice.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!inv) throw ApiError.notFound('Invoice not found')
  if (inv.status !== 'draft') throw ApiError.badRequest('Only a draft invoice can be edited — cancel and re-issue instead')
  await assertLinks(req, inv.clientId, req.body)
  Object.assign(inv, req.body)
  await inv.save()
  return sendResponse(res, 200, withIState(await inv.populate(POPULATE)), 'Invoice updated')
})

export const issueInvoice = asyncHandler(async function issueInvoice(req, res) {
  const inv = await Invoice.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!inv) throw ApiError.notFound('Invoice not found')
  if (inv.status !== 'draft') throw ApiError.badRequest(`This invoice is already ${inv.status}`)
  inv.status = 'issued'
  inv.issueDate = new Date()
  await inv.save()
  await notifyClient(
    req,
    inv,
    'New invoice',
    `${inv.code} · Rs. ${inv.total.toLocaleString('en-IN')} due ${inv.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
    'Invoice',
  )
  await log(req, `issued invoice ${inv.code}`, inv.clientId, inv.title)
  return sendResponse(res, 200, withIState(await inv.populate(POPULATE)), 'Invoice issued')
})

export const recordPayment = asyncHandler(async function recordPayment(req, res) {
  const inv = await Invoice.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!inv) throw ApiError.notFound('Invoice not found')
  if (inv.status !== 'issued') throw ApiError.badRequest('Payments can only be recorded against an issued invoice')
  if (req.body.amount > inv.balance + 0.005) throw ApiError.badRequest(`Amount is more than the balance due (Rs. ${inv.balance})`)
  inv.payments.push({ ...req.body, date: req.body.date ?? new Date(), recordedBy: req.user._id })
  await inv.save()
  await log(req, `recorded Rs. ${req.body.amount} payment on ${inv.code}`, inv.clientId, inv.title)
  return sendResponse(res, 201, withIState(await inv.populate(POPULATE)), inv.balance <= 0 ? 'Invoice fully paid' : 'Payment recorded')
})

export const removePayment = asyncHandler(async function removePayment(req, res) {
  const inv = await Invoice.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!inv) throw ApiError.notFound('Invoice not found')
  const payment = inv.payments.id(req.params.paymentId)
  if (!payment) throw ApiError.notFound('Payment not found')
  payment.deleteOne()
  await inv.save()
  await log(req, `removed a payment from ${inv.code}`, inv.clientId, inv.title)
  return sendResponse(res, 200, withIState(await inv.populate(POPULATE)), 'Payment removed')
})

export const cancelInvoice = asyncHandler(async function cancelInvoice(req, res) {
  const inv = await Invoice.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!inv) throw ApiError.notFound('Invoice not found')
  if (inv.status === 'cancelled') throw ApiError.badRequest('Already cancelled')
  if (inv.amountPaid > 0) throw ApiError.badRequest('Remove recorded payments before cancelling')
  inv.status = 'cancelled'
  await inv.save()
  await Quotation.updateOne({ invoiceId: inv._id }, { $set: { invoiceId: null } })
  await log(req, `cancelled invoice ${inv.code}`, inv.clientId, inv.title)
  return sendResponse(res, 200, withIState(inv), 'Invoice cancelled')
})

// ── PDFs ────────────────────────────────────────────────────────────────────

async function sendPdf(req, res, kind, doc) {
  const [enterprise, client, site] = await Promise.all([
    Enterprise.findById(doc.enterpriseId).select('name address phone supportEmail gstin logoUrl').lean(),
    Client.findById(doc.clientId).select('companyName contactPerson address gstin').lean(),
    doc.siteId ? Site.findById(doc.siteId).select('name address').lean() : null,
  ])
  const buffer = await billingDocToPdf(kind, doc, { enterprise, client, site })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${doc.code}.pdf"`)
  res.setHeader('Content-Length', buffer.length)
  return res.end(buffer)
}

export const quotationPdf = asyncHandler(async function quotationPdf(req, res) {
  const q = await Quotation.findOne(scoped(req, { _id: req.params.id }, QUOTE_VISIBLE)).lean()
  if (!q) throw ApiError.notFound('Quotation not found')
  return sendPdf(req, res, 'quotation', q)
})

export const invoicePdf = asyncHandler(async function invoicePdf(req, res) {
  const inv = await Invoice.findOne(scoped(req, { _id: req.params.id }, INVOICE_VISIBLE)).lean()
  if (!inv) throw ApiError.notFound('Invoice not found')
  return sendPdf(req, res, 'invoice', inv)
})

const PDF_KINDS = { quotations: { model: Quotation, kind: 'quotation', visible: QUOTE_VISIBLE }, invoices: { model: Invoice, kind: 'invoice', visible: INVOICE_VISIBLE } }

/** GET /:kind/:id/pdf-link — a 10-minute URL the apps can open in the browser. */
export const pdfLink = (collection) =>
  asyncHandler(async function pdfLink(req, res) {
    const { model, visible } = PDF_KINDS[collection]
    if (!(await model.exists(scoped(req, { _id: req.params.id }, visible)))) throw ApiError.notFound('Document not found')
    const path = `/public/pdf/${collection}/${req.params.id}`
    return sendResponse(res, 200, { url: `${env.publicBaseUrl || requestBaseUrl(req)}/api${path}?${signPath(path)}` })
  })

/** Unauthenticated, signature-checked PDF download (see pdfLink). */
export const publicPdf = asyncHandler(async function publicPdf(req, res) {
  const cfg = PDF_KINDS[req.params.kind]
  if (!cfg || !verifySignedPath(`/public/pdf/${req.params.kind}/${req.params.id}`, req.query)) throw ApiError.forbidden('This link has expired — open the document again from the app')
  const doc = await cfg.model.findById(req.params.id).lean()
  if (!doc) throw ApiError.notFound('Document not found')
  return sendPdf(req, res, cfg.kind, doc)
})
