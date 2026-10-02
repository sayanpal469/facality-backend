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
  updateServiceTypeSchema,
} from '../validators/service.validator.js'

const router = Router()

router.use(requireAuth)

router.get('/categories', serviceController.listServiceCategories)
router.post('/categories', requireRole(ROLES.ADMIN), validate(createCategorySchema), serviceController.createServiceCategory)
router.patch('/categories/:id', requireRole(ROLES.ADMIN), validate(updateCategorySchema), serviceController.updateServiceCategory)

router.post('/types', requireRole(ROLES.ADMIN), validate(createServiceTypeSchema), serviceController.createServiceType)
router.patch('/types/:id', requireRole(ROLES.ADMIN), validate(updateServiceTypeSchema), serviceController.updateServiceType)

export default router
