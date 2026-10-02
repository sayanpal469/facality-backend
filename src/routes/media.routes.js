import { Router } from 'express'
import * as mediaController from '../controllers/media.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { attachScope } from '../middleware/scope.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { upload } from '../middleware/upload.middleware.js'
import { ROLES } from '../constants/enums.js'
import { listMediaQuerySchema, uploadMediaSchema } from '../validators/media.validator.js'

const router = Router()

router.use(requireAuth, attachScope)

// Clients may upload too, but only onto their own complaints (enforced in the controller).
router.post(
  '/',
  requireRole(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER, ROLES.USER),
  upload.single('file'),
  validate(uploadMediaSchema),
  mediaController.uploadMedia,
)
router.get('/', validate(listMediaQuerySchema, 'query'), mediaController.listMedia)
router.get('/:id', mediaController.getMedia)
router.delete('/:id', requireRole(ROLES.ADMIN), mediaController.deleteMedia)

export default router
