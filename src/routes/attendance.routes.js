import { Router } from 'express'
import * as attendanceController from '../controllers/attendance.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { attachScope } from '../middleware/scope.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import {
  clockInSchema,
  listAttendanceQuerySchema,
  markAttendanceSchema,
  myAttendanceQuerySchema,
  rosterQuerySchema,
} from '../validators/attendance.validator.js'

const router = Router()

router.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER), attachScope)

const staffOnly = requireRole(ROLES.SUPERVISOR, ROLES.SITE_MANAGER)
router.get('/me', staffOnly, validate(myAttendanceQuerySchema, 'query'), attendanceController.myAttendance)
router.post('/clock-in', staffOnly, validate(clockInSchema), attendanceController.clockIn)
router.post('/clock-out', staffOnly, attendanceController.clockOut)

router.get('/roster', validate(rosterQuerySchema, 'query'), attendanceController.roster)
router.put('/mark', validate(markAttendanceSchema), attendanceController.markAttendance)
router.get('/', validate(listAttendanceQuerySchema, 'query'), attendanceController.listAttendance)

export default router
