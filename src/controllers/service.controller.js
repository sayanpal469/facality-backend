import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { logActivity } from '../utils/activityLogger.js'
import { ServiceCategory } from '../models/ServiceCategory.js'
import { ServiceType } from '../models/ServiceType.js'
import { Product } from '../models/Product.js'
import { round2 } from '../utils/pricing.js'
import { ACTIVITY_ENTITY_TYPE } from '../constants/enums.js'

export const listServiceCategories = asyncHandler(async function listServiceCategories(req, res) {
  const categories = await ServiceCategory.find({ enterpriseId: req.user.enterpriseId }).sort({ name: 1 }).lean()
  const types = await ServiceType.find({ enterpriseId: req.user.enterpriseId }).sort({ name: 1 }).lean()

  const typesByCategory = new Map()
  for (const t of types) {
    const key = String(t.categoryId)
    if (!typesByCategory.has(key)) typesByCategory.set(key, [])
    typesByCategory.get(key).push(t)
  }

  // Package totals at today's catalogue prices, for the services list.
  const productIds = [...new Set(types.flatMap((t) => (t.includedProducts ?? []).map((i) => String(i.productId))))]
  const prices = new Map((await Product.find({ _id: { $in: productIds }, status: 'active' }).select('price').lean()).map((p) => [String(p._id), p.price]))
  for (const t of types) {
    const productsTotal = (t.includedProducts ?? []).reduce((n, i) => n + (prices.get(String(i.productId)) ?? 0) * i.quantity, 0)
    t.serviceCharge = t.serviceCharge ?? 0
    t.includedCount = (t.includedProducts ?? []).length
    t.packageTotal = round2(t.serviceCharge + productsTotal)
    delete t.includedProducts
  }

  const withTypes = categories.map((c) => ({ ...c, types: typesByCategory.get(String(c._id)) || [] }))
  return sendResponse(res, 200, withTypes)
})

export const createServiceCategory = asyncHandler(async function createServiceCategory(req, res) {
  const category = await ServiceCategory.create({ ...req.body, enterpriseId: req.user.enterpriseId })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'created service category',
    entityType: ACTIVITY_ENTITY_TYPE.SERVICE,
    entityId: category._id,
    entityLabel: category.name,
  })

  return sendResponse(res, 201, { ...category.toObject(), types: [] }, 'Category created')
})

export const updateServiceCategory = asyncHandler(async function updateServiceCategory(req, res) {
  const category = await ServiceCategory.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!category) throw ApiError.notFound('Service category not found')

  Object.assign(category, req.body)
  const statusChanged = category.isModified('status')
  await category.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: statusChanged ? (category.status === 'active' ? 'activated service category' : 'deactivated service category') : 'renamed service category',
    entityType: ACTIVITY_ENTITY_TYPE.SERVICE,
    entityId: category._id,
    entityLabel: category.name,
  })

  return sendResponse(res, 200, category, 'Category updated')
})

export const createServiceType = asyncHandler(async function createServiceType(req, res) {
  const category = await ServiceCategory.findOne({ _id: req.body.categoryId, enterpriseId: req.user.enterpriseId })
  if (!category) throw ApiError.notFound('Service category not found')

  const type = await ServiceType.create({ ...req.body, enterpriseId: req.user.enterpriseId })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'added service type',
    entityType: ACTIVITY_ENTITY_TYPE.SERVICE,
    entityId: type._id,
    entityLabel: type.name,
  })

  return sendResponse(res, 201, type, 'Service type created')
})

export const updateServiceType = asyncHandler(async function updateServiceType(req, res) {
  const type = await ServiceType.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!type) throw ApiError.notFound('Service type not found')

  Object.assign(type, req.body)
  await type.save()

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated service type',
    entityType: ACTIVITY_ENTITY_TYPE.SERVICE,
    entityId: type._id,
    entityLabel: type.name,
  })

  return sendResponse(res, 200, type, 'Service type updated')
})

/** A service's package priced at today's catalogue prices. */
async function packageView(type) {
  await type.populate({ path: 'includedProducts.productId', select: 'sku name unit packSize price mrp imageUrl stock status category' })
  const items = type.includedProducts
    .filter((i) => i.productId) // product since deleted
    .map((i) => ({
      product: i.productId,
      quantity: i.quantity,
      amount: i.productId.status === 'active' ? round2(i.productId.price * i.quantity) : 0,
    }))
  const productsTotal = round2(items.reduce((n, i) => n + i.amount, 0))
  return {
    serviceId: type._id,
    name: type.name,
    status: type.status,
    description: type.description ?? '',
    serviceCharge: type.serviceCharge ?? 0,
    items,
    productsTotal,
    total: round2((type.serviceCharge ?? 0) + productsTotal),
  }
}

export const getServicePackage = asyncHandler(async function getServicePackage(req, res) {
  const type = await ServiceType.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!type) throw ApiError.notFound('Service type not found')
  return sendResponse(res, 200, await packageView(type))
})

export const updateServicePackage = asyncHandler(async function updateServicePackage(req, res) {
  const type = await ServiceType.findOne({ _id: req.params.id, enterpriseId: req.user.enterpriseId })
  if (!type) throw ApiError.notFound('Service type not found')

  const ids = req.body.items.map((i) => i.productId)
  if (new Set(ids).size !== ids.length) throw ApiError.badRequest('Each product can only be added once — change its quantity instead')
  const found = await Product.countDocuments({ _id: { $in: ids }, enterpriseId: req.user.enterpriseId })
  if (found !== ids.length) throw ApiError.badRequest('One or more products were not found')

  type.serviceCharge = req.body.serviceCharge
  if (req.body.description !== undefined) type.description = req.body.description
  type.includedProducts = req.body.items
  await type.save()

  // A product bundled into a service is, by definition, used for it — tag it so the shop's service filter finds it.
  if (ids.length) await Product.updateMany({ _id: { $in: ids } }, { $addToSet: { serviceIds: type._id } })

  await logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action: 'updated service package',
    entityType: ACTIVITY_ENTITY_TYPE.SERVICE,
    entityId: type._id,
    entityLabel: type.name,
  })

  return sendResponse(res, 200, await packageView(type), 'Service package saved')
})
