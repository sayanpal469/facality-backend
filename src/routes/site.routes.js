import { Router } from 'express'
import * as siteController from '../controllers/site.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { attachScope } from '../middleware/scope.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import { createSiteSchema, listSitesQuerySchema, updateSiteSchema, updateSiteServicesSchema } from '../validators/site.validator.js'

const router = Router()

router.use(requireAuth, attachScope)

router.post('/', requireRole(ROLES.ADMIN), validate(createSiteSchema), siteController.createSite)
router.get('/', validate(listSitesQuerySchema, 'query'), siteController.listSites)
router.get('/by-qr/:code', siteController.getSiteByQr)
router.get('/:id', siteController.getSite)
router.get('/:id/qr', requireRole(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER), siteController.getSiteQr)
router.post('/:id/qr/regenerate', requireRole(ROLES.ADMIN), siteController.regenerateSiteQr)
router.get('/:id/services-summary', siteController.getSiteServicesSummary)
router.patch('/:id', requireRole(ROLES.ADMIN), validate(updateSiteSchema), siteController.updateSite)
router.patch('/:id/services', requireRole(ROLES.ADMIN), validate(updateSiteServicesSchema), siteController.updateSiteServices)

export default router
