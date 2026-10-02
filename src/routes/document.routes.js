import { Router } from 'express'
import * as documentController from '../controllers/document.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { uploadDocument } from '../middleware/upload.middleware.js'
import { ROLES } from '../constants/enums.js'
import { listDocumentsQuerySchema, updateDocumentSchema, uploadDocumentSchema } from '../validators/document.validator.js'

const router = Router()

// Admins manage documents; client users can read the ones shared with them.
router.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.USER))

router.get('/', validate(listDocumentsQuerySchema, 'query'), documentController.listDocuments)
router.get('/:id', documentController.getDocument)
router.post('/', requireRole(ROLES.ADMIN), uploadDocument.single('file'), validate(uploadDocumentSchema), documentController.uploadDocument)
router.patch('/:id', requireRole(ROLES.ADMIN), validate(updateDocumentSchema), documentController.updateDocument)
router.delete('/:id', requireRole(ROLES.ADMIN), documentController.deleteDocument)

export default router
