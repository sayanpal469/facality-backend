import { Router } from 'express'
import * as contractController from '../controllers/contract.controller.js'
import * as pmController from '../controllers/pmSchedule.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { attachScope } from '../middleware/scope.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import {
  createContractSchema,
  createPmScheduleSchema,
  listContractsQuerySchema,
  listPmSchedulesQuerySchema,
  renewContractSchema,
  updateContractSchema,
  updatePmScheduleSchema,
} from '../validators/contract.validator.js'

const admin = requireRole(ROLES.ADMIN)

// Contracts: admins manage; client users read their own.
export const contractRoutes = Router()
contractRoutes.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.USER))
contractRoutes.get('/', validate(listContractsQuerySchema, 'query'), contractController.listContracts)
contractRoutes.get('/:id', contractController.getContract)
contractRoutes.post('/', admin, validate(createContractSchema), contractController.createContract)
contractRoutes.patch('/:id', admin, validate(updateContractSchema), contractController.updateContract)
contractRoutes.post('/:id/renew', admin, validate(renewContractSchema), contractController.renewContract)

// Preventive maintenance schedules: admins manage; supervisors see their sites'.
export const pmScheduleRoutes = Router()
pmScheduleRoutes.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER), attachScope)
pmScheduleRoutes.get('/', validate(listPmSchedulesQuerySchema, 'query'), pmController.listPmSchedules)
pmScheduleRoutes.get('/:id', pmController.getPmSchedule)
pmScheduleRoutes.post('/', admin, validate(createPmScheduleSchema), pmController.createPmSchedule)
pmScheduleRoutes.patch('/:id', admin, validate(updatePmScheduleSchema), pmController.updatePmSchedule)
pmScheduleRoutes.post('/:id/generate', admin, pmController.generateNow)
pmScheduleRoutes.delete('/:id', admin, pmController.deletePmSchedule)
