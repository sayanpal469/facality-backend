import { Router } from 'express'
import * as employeeController from '../controllers/employee.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { attachScope } from '../middleware/scope.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import {
  createEmployeeSchema,
  listEmployeesQuerySchema,
  setEmployeeStatusSchema,
  updateEmployeeSchema,
} from '../validators/employee.validator.js'

const router = Router()

router.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER), attachScope)

router.post('/', requireRole(ROLES.ADMIN), validate(createEmployeeSchema), employeeController.createEmployee)
router.get('/', validate(listEmployeesQuerySchema, 'query'), employeeController.listEmployees)
router.get('/:id', employeeController.getEmployee)
router.patch('/:id', requireRole(ROLES.ADMIN), validate(updateEmployeeSchema), employeeController.updateEmployee)
router.patch('/:id/status', requireRole(ROLES.ADMIN), validate(setEmployeeStatusSchema), employeeController.setEmployeeStatus)

export default router
