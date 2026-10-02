import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { logActivity } from '../utils/activityLogger.js'
import { ServiceCategory } from '../models/ServiceCategory.js'
import { ServiceType } from '../models/ServiceType.js'
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
