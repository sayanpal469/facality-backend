import { Router } from 'express'
import * as reportController from '../controllers/report.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { ROLES } from '../constants/enums.js'

const router = Router()

router.use(requireAuth, requireRole(ROLES.ADMIN))

router.get('/work', reportController.workReport)
router.get('/service', reportController.serviceReport)
router.get('/employee', reportController.employeeReport)
router.get('/complaint', reportController.complaintReport)
router.get('/client', reportController.clientReport)
router.get('/:type/export', reportController.exportReport)

export default router
