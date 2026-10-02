import { Router } from 'express'
import * as authController from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { authRateLimiter, refreshRateLimiter } from '../middleware/rateLimit.middleware.js'
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  requestOtpSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} from '../validators/auth.validator.js'

const router = Router()

router.post('/login', authRateLimiter, validate(loginSchema), authController.login)
router.post('/refresh', refreshRateLimiter, validate(refreshSchema), authController.refresh)
router.post('/otp/request', authRateLimiter, validate(requestOtpSchema), authController.requestOtp)
router.post('/otp/verify', authRateLimiter, validate(verifyOtpSchema), authController.verifyOtpLogin)
router.post('/password/verify-otp', authRateLimiter, validate(verifyOtpSchema), authController.verifyResetOtp)
router.post('/password/reset', authRateLimiter, validate(resetPasswordSchema), authController.resetPassword)
router.post('/logout', authController.logout)
router.post('/logout-all', requireAuth, authController.logoutAllDevices)
router.get('/me', requireAuth, authController.me)
router.post('/change-password', requireAuth, validate(changePasswordSchema), authController.changePassword)

export default router
