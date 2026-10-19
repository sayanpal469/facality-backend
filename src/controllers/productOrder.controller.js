import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { generateCode } from '../utils/sequence.js'
import { adminUserIds, clientUserIds, notifyUsers } from '../utils/notifier.js'
import { deliveryQuote, round2 } from '../utils/pricing.js'
import { createDraftInvoice } from '../utils/invoiceDraft.js'
import { Product } from '../models/Product.js'
import { CLIENT_CANCELLABLE, ORDER_TRANSITIONS, ProductOrder } from '../models/ProductOrder.js'
import { Site } from '../models/Site.js'
import { ACTIVITY_ENTITY_TYPE, NOTIFICATION_EVENT, NOTIFICATION_KIND, PRODUCT_ORDER_STATUS, ROLES } from '../constants/enums.js'

const isClient = (req) => req.user.role === ROLES.USER
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const STATUS_LABEL = { placed: 'Placed', confirmed: 'Confirmed', dispatched: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' }

const POPULATE = [
  { path: 'clientId', select: 'companyName contactPerson mobile' },
  { path: 'siteId', select: 'name address contactPerson contactMobile' },
  { path: 'placedBy', select: 'name' },
  { path: 'statusHistory.actorId', select: 'name' },
  { path: 'invoiceId', select: 'code status total' },
]

function scoped(req, extra = {}) {
  const filter = { enterpriseId: req.user.enterpriseId, ...extra }
  if (isClient(req)) filter.clientId = req.user.clientId
  return filter
}

async function loadOrder(req) {
  const order = await ProductOrder.findOne(scoped(req, { _id: req.params.id }))
  if (!order) throw ApiError.notFound('Order not found')
  return order
}

const log = (req, action, order) =>
  logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action,
    entityType: ACTIVITY_ENTITY_TYPE.PRODUCT_ORDER,
    entityId: order._id,
    entityLabel: order.code,
  })

async function notifyClient(req, order, title, body) {
  await notifyUsers({
    enterpriseId: req.user.enterpriseId,
    userIds: await clientUserIds(order.clientId),
    actorId: req.user._id,
    title,
    body,
    kind: NOTIFICATION_KIND.ORDER,
    event: NOTIFICATION_EVENT.ORDER_STATUS,
    linkEntityType: ACTIVITY_ENTITY_TYPE.PRODUCT_ORDER,
    linkEntityId: order._id,
  })
}

async function notifyAdmins(req, order, title, body, event = NOTIFICATION_EVENT.ORDER_STATUS) {
  await notifyUsers({
    enterpriseId: req.user.enterpriseId,
    userIds: await adminUserIds(req.user.enterpriseId),
    actorId: req.user._id,
    title,
    body,
    kind: NOTIFICATION_KIND.CLIENT,
    event,
    linkEntityType: ACTIVITY_ENTITY_TYPE.PRODUCT_ORDER,
    linkEntityId: order._id,
  })
}

/** The client's own site (or any site, for an admin acting on a known client). */
async function loadDeliverySite(req, siteId) {
  const filter = { _id: siteId, enterpriseId: req.user.enterpriseId }
  if (isClient(req)) filter.clientId = req.user.clientId
  const site = await Site.findOne(filter).select('name clientId status').lean()
  if (!site) throw ApiError.badRequest('Choose one of your sites for delivery')
  if (site.status !== 'active') throw ApiError.badRequest('That site is inactive')
  return site
}

/**
 * Prices a cart against the live catalogue. Merges duplicate lines and
 * reports (rather than throws) stock problems so the cart screen can show them.
 */
async function priceCart(req, siteId, cart) {
  const merged = new Map()
  for (const line of cart) merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity)

  const products = await Product.find({ _id: { $in: [...merged.keys()] }, enterpriseId: req.user.enterpriseId }).lean()
  const byId = new Map(products.map((p) => [String(p._id), p]))

  const items = []
  const issues = []
  for (const [productId, quantity] of merged) {
    const p = byId.get(productId)
    if (!p || p.status !== 'active') {
      issues.push({ productId, message: 'This product is no longer available' })
      continue
    }
    if (p.stock < quantity) {
      issues.push({ productId, message: p.stock > 0 ? `Only ${p.stock} left in stock` : 'Out of stock', available: p.stock })
    }
    items.push({
      productId: p._id,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      packSize: p.packSize,
      imageUrl: p.imageUrl,
      unitPrice: p.price,
      quantity,
      amount: round2(p.price * quantity),
      stock: p.stock,
    })
  }
  const subtotal = round2(items.reduce((n, i) => n + i.amount, 0))
  const { transportCharge, distanceKm } = await deliveryQuote(req.user.enterpriseId, siteId, subtotal)
  return { items, issues, subtotal, transportCharge, distanceKm, total: round2(subtotal + transportCharge) }
}

/** Reserves stock line by line; undoes what it took if any line can't be filled. */
async function reserveStock(items) {
  const taken = []
  for (const item of items) {
    const res = await Product.updateOne({ _id: item.productId, status: 'active', stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity } })
    if (res.modifiedCount === 0) {
      await releaseStock(taken)
      throw ApiError.conflict(`"${item.name}" just went out of stock — update your cart and try again`)
    }
    taken.push(item)
  }
}

async function releaseStock(items) {
  await Promise.all(items.map((i) => Product.updateOne({ _id: i.productId }, { $inc: { stock: i.quantity } })))
}

export const quoteOrder = asyncHandler(async function quoteOrder(req, res) {
  await loadDeliverySite(req, req.body.siteId)
  return sendResponse(res, 200, await priceCart(req, req.body.siteId, req.body.items))
})

export const createOrder = asyncHandler(async function createOrder(req, res) {
  const site = await loadDeliverySite(req, req.body.siteId)
  const quote = await priceCart(req, site._id, req.body.items)
  if (quote.issues.length) throw ApiError.badRequest('Some items in your cart need attention', quote.issues.map((i) => ({ path: i.productId, message: i.message })))

  const items = quote.items.map(({ stock, ...line }) => line)
  await reserveStock(items)

  let order
  try {
    order = await ProductOrder.create({
      enterpriseId: req.user.enterpriseId,
      code: await generateCode('productOrder', req.user.enterpriseId),
      clientId: site.clientId,
      siteId: site._id,
      placedBy: req.user._id,
      items,
      transportCharge: quote.transportCharge,
      distanceKm: quote.distanceKm,
      notes: req.body.notes,
      paymentMethod: req.body.paymentMethod,
      statusHistory: [{ status: PRODUCT_ORDER_STATUS.PLACED, actorId: req.user._id }],
    })
  } catch (err) {
    await releaseStock(items)
    throw err
  }

  await log(req, `placed order ${order.code}`, order)
  await notifyAdmins(
    req,
    order,
    'New product order',
    `${order.code} · ${items.length} item${items.length === 1 ? '' : 's'} · ₹${order.total.toLocaleString('en-IN')} for ${site.name}`,
    NOTIFICATION_EVENT.ORDER_PLACED,
  )

  return sendResponse(res, 201, await order.populate(POPULATE), 'Order placed')
})

export const listOrders = asyncHandler(async function listOrders(req, res) {
  const q = req.validatedQuery
  const filter = scoped(req)
  if (q.clientId && !isClient(req)) filter.clientId = q.clientId
  if (q.siteId) filter.siteId = q.siteId
  if (q.status) filter.status = q.status
  if (q.paymentStatus) filter.paymentStatus = q.paymentStatus
  if (q.search) {
    const rx = { $regex: escapeRx(q.search), $options: 'i' }
    filter.$or = [{ code: rx }, { 'items.name': rx }]
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total, counts] = await Promise.all([
    ProductOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('clientId', 'companyName')
      .populate('siteId', 'name'),
    ProductOrder.countDocuments(filter),
    ProductOrder.aggregate([{ $match: scoped(req) }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ])
  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.count]))
  return sendResponse(res, 200, items, undefined, { ...paginatedMeta({ page, limit, total }), byStatus })
})

export const getOrder = asyncHandler(async function getOrder(req, res) {
  const order = await loadOrder(req)
  return sendResponse(res, 200, await order.populate(POPULATE))
})

/** Admin moves the order along placed → confirmed → dispatched → delivered. */
export const updateOrderStatus = asyncHandler(async function updateOrderStatus(req, res) {
  const order = await loadOrder(req)
  const next = req.body.status
  if (next === order.status) throw ApiError.badRequest(`The order is already ${STATUS_LABEL[next].toLowerCase()}`)
  if (!ORDER_TRANSITIONS[order.status].includes(next)) {
    throw ApiError.badRequest(`A ${STATUS_LABEL[order.status].toLowerCase()} order can't be moved to "${STATUS_LABEL[next]}"`)
  }
  if (next === PRODUCT_ORDER_STATUS.CANCELLED) {
    if (!req.body.note) throw ApiError.badRequest('Give a reason for cancelling')
    await releaseStock(order.items)
    order.cancelReason = req.body.note
  }
  if (next === PRODUCT_ORDER_STATUS.DELIVERED && order.paymentMethod === 'cash_on_delivery') {
    order.paymentStatus = 'paid'
    order.paidAt = new Date()
  }
  if (req.body.expectedDeliveryDate !== undefined) order.expectedDeliveryDate = req.body.expectedDeliveryDate
  order.status = next
  order.statusHistory.push({ status: next, note: req.body.note ?? null, actorId: req.user._id })
  await order.save()

  await log(req, `marked order ${order.code} as ${STATUS_LABEL[next].toLowerCase()}`, order)
  const eta = order.expectedDeliveryDate && next !== 'delivered' && next !== 'cancelled' ? ` · expected ${order.expectedDeliveryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''
  await notifyClient(req, order, `Order ${STATUS_LABEL[next].toLowerCase()}`, `${order.code}${req.body.note ? ` — ${req.body.note}` : ''}${eta}`)

  return sendResponse(res, 200, await order.populate(POPULATE), 'Order updated')
})

/** Client backs out before dispatch (admins cancel via the status endpoint). */
export const cancelOrder = asyncHandler(async function cancelOrder(req, res) {
  const order = await loadOrder(req)
  if (!CLIENT_CANCELLABLE.includes(order.status)) {
    throw ApiError.badRequest(order.status === 'cancelled' ? 'This order is already cancelled' : 'This order has already left the store and can no longer be cancelled')
  }
  await releaseStock(order.items)
  order.status = PRODUCT_ORDER_STATUS.CANCELLED
  order.cancelReason = req.body.reason
  order.statusHistory.push({ status: PRODUCT_ORDER_STATUS.CANCELLED, note: req.body.reason, actorId: req.user._id })
  await order.save()

  await log(req, `cancelled order ${order.code}`, order)
  await notifyAdmins(req, order, 'Order cancelled by client', `${order.code} — ${req.body.reason}`)
  return sendResponse(res, 200, await order.populate(POPULATE), 'Order cancelled')
})

/** Admin: adjust transport, delivery date or payment. */
export const updateOrder = asyncHandler(async function updateOrder(req, res) {
  const order = await loadOrder(req)
  if (req.body.transportCharge !== undefined && !['placed', 'confirmed'].includes(order.status)) {
    throw ApiError.badRequest('Transport can only be changed before the order is dispatched')
  }
  const wasPaid = order.paymentStatus === 'paid'
  Object.assign(order, req.body)
  if (!wasPaid && order.paymentStatus === 'paid') order.paidAt = new Date()
  if (wasPaid && order.paymentStatus === 'unpaid') order.paidAt = null
  await order.save()
  await log(req, `updated order ${order.code}`, order)
  return sendResponse(res, 200, await order.populate(POPULATE), 'Order updated')
})

export const invoiceOrder = asyncHandler(async function invoiceOrder(req, res) {
  const order = await loadOrder(req)
  if (order.status === PRODUCT_ORDER_STATUS.CANCELLED) throw ApiError.badRequest("A cancelled order can't be invoiced")
  if (order.invoiceId) throw ApiError.conflict('This order already has an invoice')

  const lines = order.items.map((i) => ({ description: `${i.name}${i.packSize ? ` (${i.packSize})` : ''}`, quantity: i.quantity, unit: i.unit, rate: i.unitPrice, taxPercent: 0 }))
  if (order.transportCharge > 0) lines.push({ description: `Transport${order.distanceKm != null ? ` (~${order.distanceKm} km)` : ''}`, quantity: 1, unit: 'trip', rate: order.transportCharge, taxPercent: 0 })

  const invoice = await createDraftInvoice(req, {
    clientId: order.clientId,
    siteId: order.siteId,
    title: `Products — order ${order.code}`,
    items: lines,
    dueDate: req.body.dueDate,
    notes: 'Prices are inclusive of GST.',
  })
  order.invoiceId = invoice._id
  if (order.paymentMethod === 'cash_on_delivery' && order.paymentStatus === 'unpaid') order.paymentMethod = 'invoice'
  await order.save()

  await log(req, `invoiced order ${order.code} as ${invoice.code}`, order)
  return sendResponse(res, 201, invoice, 'Draft invoice created')
})
