import { Router } from 'express'
import * as notificationController from '../controllers/notification.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import {
  listNotificationsQuerySchema,
  pushPreferencesSchema,
  registerDeviceSchema,
  unregisterDeviceSchema,
} from '../validators/notification.validator.js'

const router = Router()

router.use(requireAuth)

router.get('/', validate(listNotificationsQuerySchema, 'query'), notificationController.listNotifications)
router.post('/devices', validate(registerDeviceSchema), notificationController.registerDevice)
router.delete('/devices', validate(unregisterDeviceSchema), notificationController.unregisterDevice)
router.get('/preferences', notificationController.getPushPreferences)
router.patch('/preferences', validate(pushPreferencesSchema), notificationController.updatePushPreferences)
router.patch('/:id/read', notificationController.markNotificationRead)
router.patch('/read-all', notificationController.markAllNotificationsRead)

export default router
