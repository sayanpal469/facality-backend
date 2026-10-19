import { Router } from 'express'
import * as serviceController from '../controllers/service.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import {
  createCategorySchema,
  createServiceTypeSchema,
  updateCategorySchema,
  updateServicePackageSchema,
  updateServiceTypeSchema,
} from '../validators/service.validator.js'

const router = Router()

router.use(requireAuth)

router.get('/categories', serviceController.listServiceCategories)
router.post('/categories', requireRole(ROLES.ADMIN), validate(createCategorySchema), serviceController.createServiceCategory)
router.patch('/categories/:id', requireRole(ROLES.ADMIN), validate(updateCategorySchema), serviceController.updateServiceCategory)

router.post('/types', requireRole(ROLES.ADMIN), validate(createServiceTypeSchema), serviceController.createServiceType)
router.patch('/types/:id', requireRole(ROLES.ADMIN), validate(updateServiceTypeSchema), serviceController.updateServiceType)

// Service package: service charge + default products (any signed-in user can view; the client app shows it).
router.get('/types/:id/package', serviceController.getServicePackage)
router.put('/types/:id/package', requireRole(ROLES.ADMIN), validate(updateServicePackageSchema), serviceController.updateServicePackage)

export default router
