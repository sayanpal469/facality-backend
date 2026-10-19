import { z } from 'zod'
import { PRODUCT_UNIT_VALUES } from '../models/Product.js'
import { ORDER_PAYMENT_METHOD_VALUES, ORDER_PAYMENT_STATUS_VALUES } from '../models/ProductOrder.js'
import { PRODUCT_ORDER_STATUS_VALUES } from '../constants/enums.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')
const money = z.number().min(0).max(1e8)
const imageUrl = z.string().trim().url('Enter a valid image URL').max(2000)

// ── Products ────────────────────────────────────────────────────────────────

const productFields = z.object({
  sku: z.string().trim().max(40).optional(), // generated (PRD-1001…) when left blank
  name: z.string().trim().min(1, 'Product name is required').max(150),
  description: z.string().trim().max(2000).optional().default(''),
  category: z.string().trim().min(1).max(60).optional().default('General'),
  brand: z.string().trim().max(60).optional().default(''),
  unit: z.enum(PRODUCT_UNIT_VALUES).optional().default('piece'),
  packSize: z.string().trim().max(40).optional().default(''),
  price: money,
  mrp: money.nullable().optional(),
  stock: z.number().int().min(0).max(1e7).optional().default(0),
  imageUrl: imageUrl.nullable().optional(),
  serviceIds: z.array(objectId).max(100).optional().default([]),
  status: z.enum(['active', 'inactive']).optional().default('active'),
})

const mrpNotBelowPrice = (v) => v.mrp == null || v.price == null || v.mrp >= v.price
const mrpMessage = { message: 'MRP cannot be lower than the selling price', path: ['mrp'] }

export const createProductSchema = productFields.refine(mrpNotBelowPrice, mrpMessage)

export const updateProductSchema = z
  .object({
    sku: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(2000),
    category: z.string().trim().min(1).max(60),
    brand: z.string().trim().max(60),
    unit: z.enum(PRODUCT_UNIT_VALUES),
    packSize: z.string().trim().max(40),
    price: money,
    mrp: money.nullable(),
    stock: z.number().int().min(0).max(1e7),
    imageUrl: imageUrl.nullable(),
    serviceIds: z.array(objectId).max(100),
    status: z.enum(['active', 'inactive']),
  })
  .partial()

export const adjustStockSchema = z.object({
  delta: z.number().int().min(-1e7).max(1e7).refine((n) => n !== 0, 'Enter a non-zero adjustment'),
  note: z.string().trim().max(200).optional().default(''),
})

export const listProductsQuerySchema = z.object({
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  serviceId: objectId.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  ids: z.string().trim().optional(), // comma-separated ids (cart refresh)
  sort: z.enum(['name', 'price_asc', 'price_desc', 'newest', 'stock']).optional().default('name'),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})

// ── Shop orders ─────────────────────────────────────────────────────────────

const cartLine = z.object({ productId: objectId, quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10000) })
const cart = z.array(cartLine).min(1, 'Your cart is empty').max(100)

export const quoteOrderSchema = z.object({ siteId: objectId, items: cart })

export const createOrderSchema = z.object({
  siteId: objectId,
  items: cart,
  notes: z.string().trim().max(1000).optional().default(''),
  paymentMethod: z.enum(ORDER_PAYMENT_METHOD_VALUES).optional().default('cash_on_delivery'),
})

export const updateOrderStatusSchema = z.object({
  status: z.enum(PRODUCT_ORDER_STATUS_VALUES),
  note: z.string().trim().max(500).optional(),
  expectedDeliveryDate: z.coerce.date().nullable().optional(),
})

export const cancelOrderSchema = z.object({ reason: z.string().trim().min(1, 'A reason is required').max(500) })

export const updateOrderSchema = z
  .object({
    transportCharge: money,
    expectedDeliveryDate: z.coerce.date().nullable(),
    paymentStatus: z.enum(ORDER_PAYMENT_STATUS_VALUES),
    paymentMethod: z.enum(ORDER_PAYMENT_METHOD_VALUES),
  })
  .partial()

export const listOrdersQuerySchema = z.object({
  clientId: objectId.optional(),
  siteId: objectId.optional(),
  status: z.enum(PRODUCT_ORDER_STATUS_VALUES).optional(),
  paymentStatus: z.enum(ORDER_PAYMENT_STATUS_VALUES).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})

export const createInvoiceFromSchema = z.object({ dueDate: z.coerce.date() })
