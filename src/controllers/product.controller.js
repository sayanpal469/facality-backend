import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { logActivity } from '../utils/activityLogger.js'
import { generateCode } from '../utils/sequence.js'
import { deleteFile, requestBaseUrl, saveFile } from '../services/storage.service.js'
import { LOW_STOCK_THRESHOLD, PRODUCT_UNIT_VALUES, Product } from '../models/Product.js'
import { ProductOrder } from '../models/ProductOrder.js'
import { ServiceType } from '../models/ServiceType.js'
import { WorkOrder } from '../models/WorkOrder.js'
import { ACTIVITY_ENTITY_TYPE, ROLES } from '../constants/enums.js'

const isAdmin = (req) => req.user.role === ROLES.ADMIN
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const SORTS = {
  name: { name: 1 },
  price_asc: { price: 1, name: 1 },
  price_desc: { price: -1, name: 1 },
  newest: { createdAt: -1 },
  stock: { stock: 1, name: 1 },
}

/** Shop-facing extras derived from stock/MRP. */
function present(product) {
  const p = product.toJSON ? product.toJSON() : { ...product }
  delete p.imageKey
  const discountPercent = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0
  return { ...p, inStock: p.stock > 0, lowStock: p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD, discountPercent }
}

const log = (req, action, product) =>
  logActivity({
    enterpriseId: req.user.enterpriseId,
    actorId: req.user._id,
    action,
    entityType: ACTIVITY_ENTITY_TYPE.PRODUCT,
    entityId: product._id,
    entityLabel: product.name,
  })

async function assertServices(req, serviceIds) {
  if (!serviceIds?.length) return
  const n = await ServiceType.countDocuments({ _id: { $in: serviceIds }, enterpriseId: req.user.enterpriseId })
  if (n !== new Set(serviceIds.map(String)).size) throw ApiError.badRequest('One or more services were not found')
}

async function loadProduct(req) {
  const filter = { _id: req.params.id, enterpriseId: req.user.enterpriseId }
  if (!isAdmin(req)) filter.status = 'active'
  const product = await Product.findOne(filter)
  if (!product) throw ApiError.notFound('Product not found')
  return product
}

export const listProducts = asyncHandler(async function listProducts(req, res) {
  const q = req.validatedQuery
  const filter = { enterpriseId: req.user.enterpriseId }
  // Only admins see inactive products.
  if (!isAdmin(req)) filter.status = 'active'
  else if (q.status) filter.status = q.status
  if (q.category) filter.category = q.category
  if (q.serviceId) filter.serviceIds = q.serviceId
  if (q.inStock === 'true') filter.stock = { $gt: 0 }
  if (q.inStock === 'false') filter.stock = { $lte: 0 }
  if (q.ids) filter._id = { $in: q.ids.split(',').filter((id) => /^[0-9a-fA-F]{24}$/.test(id)) }
  if (q.search) {
    const rx = { $regex: escapeRx(q.search), $options: 'i' }
    filter.$or = [{ name: rx }, { sku: rx }, { brand: rx }, { category: rx }]
  }

  const { page, limit, skip } = getPagination(q)
  const [items, total] = await Promise.all([
    Product.find(filter).sort(SORTS[q.sort] ?? SORTS.name).skip(skip).limit(limit).populate('serviceIds', 'name'),
    Product.countDocuments(filter),
  ])
  return sendResponse(res, 200, items.map(present), undefined, paginatedMeta({ page, limit, total }))
})

/** Categories with product counts (for shop filters) plus the allowed units. */
export const listProductMeta = asyncHandler(async function listProductMeta(req, res) {
  const match = { enterpriseId: req.user.enterpriseId }
  if (!isAdmin(req)) match.status = 'active'
  const [categories, brands] = await Promise.all([
    Product.aggregate([{ $match: match }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Product.distinct('brand', match),
  ])
  return sendResponse(res, 200, {
    categories: categories.map((c) => ({ name: c._id, count: c.count })),
    brands: brands.filter(Boolean).sort(),
    units: PRODUCT_UNIT_VALUES,
  })
})

export const getProduct = asyncHandler(async function getProduct(req, res) {
  const product = await loadProduct(req)
  await product.populate('serviceIds', 'name')
  const data = present(product)
  // Packages this product is part of — lets the admin see the impact of a price change.
  if (isAdmin(req)) {
    data.usedInServices = await ServiceType.find({ enterpriseId: req.user.enterpriseId, 'includedProducts.productId': product._id }).select('name').lean()
  }
  return sendResponse(res, 200, data)
})

export const createProduct = asyncHandler(async function createProduct(req, res) {
  await assertServices(req, req.body.serviceIds)
  const sku = req.body.sku || (await generateCode('product', req.user.enterpriseId))
  const product = await Product.create({ ...req.body, sku, enterpriseId: req.user.enterpriseId })
  await log(req, `added product ${product.sku}`, product)
  return sendResponse(res, 201, present(await product.populate('serviceIds', 'name')), 'Product created')
})

export const updateProduct = asyncHandler(async function updateProduct(req, res) {
  const product = await loadProduct(req)
  if (req.body.serviceIds) await assertServices(req, req.body.serviceIds)
  const nextPrice = req.body.price ?? product.price
  const nextMrp = req.body.mrp === undefined ? product.mrp : req.body.mrp
  if (nextMrp != null && nextMrp < nextPrice) throw ApiError.badRequest('MRP cannot be lower than the selling price')

  // Swapping an uploaded image for an external link frees the stored file.
  if (req.body.imageUrl !== undefined && product.imageKey && req.body.imageUrl !== product.imageUrl) {
    await deleteFile(product.imageKey)
    product.imageKey = null
  }
  Object.assign(product, req.body)
  const statusChanged = product.isModified('status')
  await product.save()

  await log(req, statusChanged ? `${product.status === 'active' ? 'activated' : 'deactivated'} product ${product.sku}` : `updated product ${product.sku}`, product)
  return sendResponse(res, 200, present(await product.populate('serviceIds', 'name')), 'Product updated')
})

export const adjustStock = asyncHandler(async function adjustStock(req, res) {
  const product = await loadProduct(req)
  if (product.stock + req.body.delta < 0) throw ApiError.badRequest(`Only ${product.stock} in stock — can't remove ${-req.body.delta}`)
  const updated = await Product.findOneAndUpdate(
    { _id: product._id, stock: { $gte: -req.body.delta } },
    { $inc: { stock: req.body.delta } },
    { returnDocument: 'after' },
  ).populate('serviceIds', 'name')
  if (!updated) throw ApiError.conflict('Stock changed meanwhile — refresh and try again')
  await log(req, `${req.body.delta > 0 ? 'added' : 'removed'} ${Math.abs(req.body.delta)} stock of ${product.sku}${req.body.note ? ` (${req.body.note})` : ''}`, product)
  return sendResponse(res, 200, present(updated), 'Stock updated')
})

export const uploadProductImage = asyncHandler(async function uploadProductImage(req, res) {
  if (!req.file) throw ApiError.badRequest('No file uploaded (field name must be "file")')
  const product = await loadProduct(req)
  const { key, url } = await saveFile({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    folder: `products/${req.user.enterpriseId}`,
    baseUrl: requestBaseUrl(req),
  })
  const previousKey = product.imageKey
  product.imageUrl = url
  product.imageKey = key
  await product.save()
  await deleteFile(previousKey)
  await log(req, `updated image of ${product.sku}`, product)
  return sendResponse(res, 200, present(await product.populate('serviceIds', 'name')), 'Image updated')
})

/**
 * Hard delete only for products nobody has ordered or been billed for;
 * otherwise deactivate (keeps history intact). Packages drop the product.
 */
export const deleteProduct = asyncHandler(async function deleteProduct(req, res) {
  const product = await loadProduct(req)
  const [orders, workOrders] = await Promise.all([
    ProductOrder.exists({ 'items.productId': product._id }),
    WorkOrder.exists({ 'pricing.items.productId': product._id }),
  ])
  if (orders || workOrders) {
    throw ApiError.conflict('This product is on existing orders or work orders — deactivate it instead')
  }
  await ServiceType.updateMany({ enterpriseId: req.user.enterpriseId }, { $pull: { includedProducts: { productId: product._id } } })
  await product.deleteOne()
  await deleteFile(product.imageKey)
  await log(req, `deleted product ${product.sku}`, product)
  return sendResponse(res, 200, { _id: product._id }, 'Product deleted')
})
