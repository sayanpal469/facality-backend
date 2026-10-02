import { Router } from 'express'
import * as activityLogController from '../controllers/activityLog.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import { listActivityLogsQuerySchema } from '../validators/activityLog.validator.js'

const router = Router()

router.use(requireAuth, requireRole(ROLES.ADMIN))
router.get('/', validate(listActivityLogsQuerySchema, 'query'), activityLogController.listActivityLogs)

export default router
