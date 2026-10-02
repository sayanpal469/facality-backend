import { z } from 'zod'

// `email` is what the admin panel / enterprise app send; the client app sends
// `identifier`, which may be an email or a registered mobile number.
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
    identifier: z.string().trim().min(1).optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((v) => v.email || v.identifier, { message: 'Email or mobile number is required', path: ['email'] })

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(), // falls back to the httpOnly cookie if omitted
})

const identifier = z.string().trim().min(3, 'Enter your mobile number or email')
const newPassword = z.string().min(8, 'New password must be at least 8 characters').max(128)

export const requestOtpSchema = z.object({
  identifier,
  purpose: z.enum(['login', 'reset']).default('login'),
})

export const verifyOtpSchema = z.object({
  identifier,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(1),
  newPassword,
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
})
