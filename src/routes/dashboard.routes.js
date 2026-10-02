import { Router } from 'express'
import * as dashboardController from '../controllers/dashboard.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { ROLES } from '../constants/enums.js'

const router = Router()

router.use(requireAuth, requireRole(ROLES.ADMIN))

router.get('/stats', dashboardController.getStats)
router.get('/attention', dashboardController.getAttention)
router.get('/recent-activity', dashboardController.getRecentActivity)
router.get('/trends', dashboardController.getTrends)

export default router
