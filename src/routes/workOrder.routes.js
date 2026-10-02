import { Router } from 'express'
import * as workOrderController from '../controllers/workOrder.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { attachScope } from '../middleware/scope.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import {
  addProgressUpdateSchema,
  advanceStatusSchema,
  cancelWorkOrderSchema,
  changePrioritySchema,
  clientApproveSchema,
  createWorkOrderSchema,
  listWorkOrdersQuerySchema,
  overrideStatusSchema,
  reassignWorkOrderSchema,
  updateWorkOrderSchema,
} from '../validators/workOrder.validator.js'

const router = Router()

router.use(requireAuth, attachScope)

router.post('/', requireRole(ROLES.ADMIN), validate(createWorkOrderSchema), workOrderController.createWorkOrder)
router.get('/', validate(listWorkOrdersQuerySchema, 'query'), workOrderController.listWorkOrders)
router.get('/:id', workOrderController.getWorkOrder)
router.patch('/:id', requireRole(ROLES.ADMIN), validate(updateWorkOrderSchema), workOrderController.updateWorkOrder)
router.patch('/:id/reassign', requireRole(ROLES.ADMIN), validate(reassignWorkOrderSchema), workOrderController.reassignWorkOrder)
router.patch('/:id/priority', requireRole(ROLES.ADMIN), validate(changePrioritySchema), workOrderController.changeWorkOrderPriority)
router.patch('/:id/cancel', requireRole(ROLES.ADMIN), validate(cancelWorkOrderSchema), workOrderController.cancelWorkOrder)
router.patch('/:id/override-status', requireRole(ROLES.ADMIN), validate(overrideStatusSchema), workOrderController.overrideWorkOrderStatus)

// Enterprise-app facing (supervisor/site_manager progressing their own assigned work).
router.patch(
  '/:id/status',
  requireRole(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER),
  validate(advanceStatusSchema),
  workOrderController.advanceWorkOrderStatus,
)
// Client-app facing: the client signs off on verified work.
router.patch('/:id/client-approve', requireRole(ROLES.USER), validate(clientApproveSchema), workOrderController.clientApproveWorkOrder)

router.post(
  '/:id/updates',
  requireRole(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER),
  validate(addProgressUpdateSchema),
  workOrderController.addProgressUpdate,
)

export default router
