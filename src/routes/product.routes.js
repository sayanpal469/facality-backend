import { Router } from 'express'
import * as productController from '../controllers/product.controller.js'
import * as orderController from '../controllers/productOrder.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { uploadImage } from '../middleware/upload.middleware.js'
import { ROLES } from '../constants/enums.js'
import {
  adjustStockSchema,
  cancelOrderSchema,
  createInvoiceFromSchema,
  createOrderSchema,
  createProductSchema,
  listOrdersQuerySchema,
  listProductsQuerySchema,
  quoteOrderSchema,
  updateOrderSchema,
  updateOrderStatusSchema,
  updateProductSchema,
} from '../validators/product.validator.js'

const admin = requireRole(ROLES.ADMIN)

// Product catalogue: admins manage it; every signed-in user can browse active products.
export const productRoutes = Router()
productRoutes.use(requireAuth)
productRoutes.get('/', validate(listProductsQuerySchema, 'query'), productController.listProducts)
productRoutes.get('/meta', productController.listProductMeta)
productRoutes.get('/:id', productController.getProduct)
productRoutes.post('/', admin, validate(createProductSchema), productController.createProduct)
productRoutes.patch('/:id', admin, validate(updateProductSchema), productController.updateProduct)
productRoutes.post('/:id/stock', admin, validate(adjustStockSchema), productController.adjustStock)
productRoutes.post('/:id/image', admin, uploadImage.single('file'), productController.uploadProductImage)
productRoutes.delete('/:id', admin, productController.deleteProduct)

// Shop orders: clients place and track their own; admins fulfil them.
export const productOrderRoutes = Router()
productOrderRoutes.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.USER))
productOrderRoutes.post('/quote', validate(quoteOrderSchema), orderController.quoteOrder)
productOrderRoutes.post('/', requireRole(ROLES.USER), validate(createOrderSchema), orderController.createOrder)
productOrderRoutes.get('/', validate(listOrdersQuerySchema, 'query'), orderController.listOrders)
productOrderRoutes.get('/:id', orderController.getOrder)
productOrderRoutes.patch('/:id/cancel', requireRole(ROLES.USER), validate(cancelOrderSchema), orderController.cancelOrder)
productOrderRoutes.patch('/:id/status', admin, validate(updateOrderStatusSchema), orderController.updateOrderStatus)
productOrderRoutes.patch('/:id', admin, validate(updateOrderSchema), orderController.updateOrder)
productOrderRoutes.post('/:id/invoice', admin, validate(createInvoiceFromSchema), orderController.invoiceOrder)
