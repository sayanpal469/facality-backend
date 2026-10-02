import { Router } from 'express'
import * as siteVisitController from '../controllers/siteVisit.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { attachScope } from '../middleware/scope.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import { checkOutSchema, createSiteVisitSchema, listSiteVisitsQuerySchema } from '../validators/siteVisit.validator.js'

const router = Router()

router.use(requireAuth, attachScope)

router.post('/', requireRole(ROLES.SUPERVISOR, ROLES.SITE_MANAGER), validate(createSiteVisitSchema), siteVisitController.checkIn)
router.patch(
  '/:id/check-out',
  requireRole(ROLES.SUPERVISOR, ROLES.SITE_MANAGER),
  validate(checkOutSchema),
  siteVisitController.checkOut,
)
router.get('/', validate(listSiteVisitsQuerySchema, 'query'), siteVisitController.listSiteVisits)
router.get('/:id', siteVisitController.getSiteVisit)

export default router
