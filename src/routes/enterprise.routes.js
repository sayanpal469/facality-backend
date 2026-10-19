import { Router } from 'express'
import * as enterpriseController from '../controllers/enterprise.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { uploadImage } from '../middleware/upload.middleware.js'
import { ROLES } from '../constants/enums.js'
import { notificationPrefsSchema, updateCommerceSchema, updateEnterpriseSchema, updateOperationsSchema } from '../validators/enterprise.validator.js'

const router = Router()

router.use(requireAuth)

router.get('/', enterpriseController.getEnterprise)
router.patch('/', requireRole(ROLES.ADMIN), validate(updateEnterpriseSchema), enterpriseController.updateEnterprise)
router.post('/logo', requireRole(ROLES.ADMIN), uploadImage.single('file'), enterpriseController.uploadLogo)
router.delete('/logo', requireRole(ROLES.ADMIN), enterpriseController.removeLogo)
router.patch(
  '/notification-preferences',
  requireRole(ROLES.ADMIN),
  validate(notificationPrefsSchema),
  enterpriseController.updateNotificationPreferences,
)

router.patch('/commerce', requireRole(ROLES.ADMIN), validate(updateCommerceSchema), enterpriseController.updateCommerce)
router.patch('/operations', requireRole(ROLES.ADMIN), validate(updateOperationsSchema), enterpriseController.updateOperations)

export default router
