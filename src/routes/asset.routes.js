import { Router } from 'express'
import * as assetController from '../controllers/asset.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { attachScope } from '../middleware/scope.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import { addAssetEventSchema, createAssetSchema, listAssetsQuerySchema, updateAssetSchema } from '../validators/asset.validator.js'

const router = Router()

// Everyone reads within their scope; only admins create/edit, supervisors may log history.
router.use(requireAuth, attachScope)

router.get('/', validate(listAssetsQuerySchema, 'query'), assetController.listAssets)
router.get('/types', assetController.listAssetTypes)
router.get('/:id', assetController.getAsset)
router.post('/', requireRole(ROLES.ADMIN), validate(createAssetSchema), assetController.createAsset)
router.patch('/:id', requireRole(ROLES.ADMIN), validate(updateAssetSchema), assetController.updateAsset)
router.post('/:id/history', requireRole(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER), validate(addAssetEventSchema), assetController.addAssetEvent)
router.delete('/:id', requireRole(ROLES.ADMIN), assetController.deleteAsset)

export default router
