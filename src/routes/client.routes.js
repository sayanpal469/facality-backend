import { Router } from 'express'
import * as clientController from '../controllers/client.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import {
  createClientSchema,
  listClientsQuerySchema,
  setClientStatusSchema,
  updateClientSchema,
  updateClientServicesSchema,
} from '../validators/client.validator.js'

const router = Router()

router.use(requireAuth)

router.post('/', requireRole(ROLES.ADMIN), validate(createClientSchema), clientController.createClient)
router.get('/', requireRole(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER), validate(listClientsQuerySchema, 'query'), clientController.listClients)
router.get('/:id', requireRole(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER, ROLES.USER), clientController.getClient)
router.patch('/:id', requireRole(ROLES.ADMIN), validate(updateClientSchema), clientController.updateClient)
router.patch('/:id/status', requireRole(ROLES.ADMIN), validate(setClientStatusSchema), clientController.setClientStatus)
router.patch('/:id/services', requireRole(ROLES.ADMIN), validate(updateClientServicesSchema), clientController.updateClientServices)
router.post('/:id/reset-password', requireRole(ROLES.ADMIN), clientController.resetClientPassword)

export default router
