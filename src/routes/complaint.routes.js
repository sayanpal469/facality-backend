import { Router } from 'express'
import * as complaintController from '../controllers/complaint.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { attachScope } from '../middleware/scope.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import {
  assignComplaintSchema,
  createComplaintSchema,
  listComplaintsQuerySchema,
  reopenComplaintSchema,
  updateComplaintStatusSchema,
} from '../validators/complaint.validator.js'

const router = Router()

router.use(requireAuth, attachScope)

router.post('/', validate(createComplaintSchema), complaintController.createComplaint)
router.get('/', validate(listComplaintsQuerySchema, 'query'), complaintController.listComplaints)
router.get('/:id', complaintController.getComplaint)
router.patch(
  '/:id/assign',
  requireRole(ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.SITE_MANAGER),
  validate(assignComplaintSchema),
  complaintController.assignComplaint,
)
router.patch('/:id/status', validate(updateComplaintStatusSchema), complaintController.updateComplaintStatus)
router.patch('/:id/reopen', requireRole(ROLES.USER), validate(reopenComplaintSchema), complaintController.reopenComplaint)

export default router
