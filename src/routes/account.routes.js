import { Router } from 'express'
import * as accountController from '../controllers/account.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import {
  createAccountSchema,
  listAccountsQuerySchema,
  resetPasswordSchema,
  setStatusSchema,
  updateAccountSchema,
} from '../validators/account.validator.js'

const router = Router()

// Every route here is admin-only: this is how admin/supervisor/site_manager
// LOGIN accounts get created and managed.
router.use(requireAuth, requireRole(ROLES.ADMIN))

router.post('/', validate(createAccountSchema), accountController.createAccount)
router.get('/', validate(listAccountsQuerySchema, 'query'), accountController.listAccounts)
router.get('/:id', accountController.getAccount)
router.patch('/:id', validate(updateAccountSchema), accountController.updateAccount)
router.patch('/:id/status', validate(setStatusSchema), accountController.setAccountStatus)
router.post('/:id/reset-password', validate(resetPasswordSchema), accountController.resetAccountPassword)

export default router
