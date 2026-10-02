import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { User } from '../models/User.js'
import { RefreshToken } from '../models/RefreshToken.js'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../utils/tokens.js'
import { env } from '../config/env.js'
import { OtpCode, OTP_PURPOSE } from '../models/OtpCode.js'
import { isConsoleMessaging, sendEmail, sendSms } from '../services/messaging.service.js'

const OTP_TTL_MS = 10 * 60 * 1000
const OTP_RESEND_COOLDOWN_MS = 60 * 1000
const OTP_MAX_ATTEMPTS = 5
const RESET_TOKEN_TTL = '10m'

const REFRESH_COOKIE = 'refreshToken'
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30d, mirrors JWT_REFRESH_EXPIRES_IN default

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'strict' : 'lax',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/api/auth',
  }
}

async function issueTokenPair(user, req) {
  const accessToken = signAccessToken(user)
  const refreshToken = signRefreshToken(user)
  const decoded = verifyRefreshToken(refreshToken)

  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    userAgent: req.headers['user-agent'] || null,
    ip: req.ip,
    expiresAt: new Date(decoded.exp * 1000),
  })

  return { accessToken, refreshToken }
}

/** Digits only, last 10 — so "+91 98300 12345" and "9830012345" match. */
function normalizeMobile(value) {
  return String(value).replace(/\D/g, '').slice(-10)
}

async function findUserByIdentifier(identifier) {
  const value = identifier.trim()
  if (value.includes('@')) return User.findOne({ email: value.toLowerCase() }).select('+passwordHash')

  const digits = normalizeMobile(value)
  if (digits.length < 10) return null
  // Mobile isn't unique in the schema, so only accept an unambiguous match.
  const pattern = new RegExp(digits.split('').join('\\D*') + '$')
  const matches = await User.find({ mobile: pattern }).select('+passwordHash').limit(2)
  return matches.length === 1 ? matches[0] : null
}

async function completeLogin(user, req, res) {
  const { accessToken, refreshToken } = await issueTokenPair(user, req)

  user.lastLoginAt = new Date()
  await user.save()

  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions())
  return sendResponse(res, 200, { user: user.toSafeJSON(), accessToken, refreshToken }, 'Logged in')
}

export const login = asyncHandler(async function login(req, res) {
  const { email, identifier, password } = req.body

  const user = await findUserByIdentifier(email ?? identifier)
  if (!user) throw ApiError.unauthorized('Invalid email or password')
  if (user.status !== 'active') throw ApiError.forbidden('This account has been deactivated')

  const passwordOk = await user.comparePassword(password)
  if (!passwordOk) throw ApiError.unauthorized('Invalid email or password')

  return completeLogin(user, req, res)
})

function hashOtp(code) {
  return crypto.createHash('sha256').update(`${code}:${env.jwt.accessSecret}`).digest('hex')
}

/**
 * Sends a 6-digit code by SMS (mobile identifier) or email. Always answers
 * the same way whether or not the account exists, so the endpoint can't be
 * used to discover registered numbers/emails.
 */
export const requestOtp = asyncHandler(async function requestOtp(req, res) {
  const { identifier, purpose } = req.body
  const generic = 'If an account exists for these details, a verification code has been sent.'
  const user = await findUserByIdentifier(identifier)
  if (!user || user.status !== 'active') return sendResponse(res, 200, { sent: true }, generic)

  const recent = await OtpCode.findOne({ userId: user._id, purpose, consumedAt: null, createdAt: { $gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) } })
  if (recent) throw ApiError.tooManyRequests('Please wait a minute before requesting another code')

  // A fresh code invalidates any earlier unused ones for the same purpose.
  await OtpCode.updateMany({ userId: user._id, purpose, consumedAt: null }, { consumedAt: new Date() })
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  await OtpCode.create({ userId: user._id, purpose, codeHash: hashOtp(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) })

  const app = env.messaging.appName
  const what = purpose === OTP_PURPOSE.LOGIN ? 'login' : 'password reset'
  const text = `${code} is your ${app} ${what} code. It expires in 10 minutes. Never share it with anyone.`
  const viaSms = !identifier.includes('@')
  if (viaSms) await sendSms({ to: user.mobile, text })
  else await sendEmail({ to: user.email, subject: `${app} ${what} code`, text })

  // Development convenience only: with console messaging there is no real
  // inbox to read the code from.
  const dev = isConsoleMessaging && !env.isProd ? { devCode: code } : {}
  return sendResponse(res, 200, { sent: true, channel: viaSms ? 'sms' : 'email', ...dev }, generic)
})

/** Validates and consumes a code; throws a uniform error on any failure. */
async function consumeOtp(identifier, purpose, code) {
  const invalid = ApiError.unauthorized('Invalid or expired code')
  const user = await findUserByIdentifier(identifier)
  if (!user || user.status !== 'active') throw invalid

  const otp = await OtpCode.findOne({ userId: user._id, purpose, consumedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 })
  if (!otp) throw invalid
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    otp.consumedAt = new Date()
    await otp.save()
    throw ApiError.unauthorized('Too many incorrect attempts — request a new code')
  }

  const ok = crypto.timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(hashOtp(code)))
  if (!ok) {
    otp.attempts += 1
    await otp.save()
    throw invalid
  }

  otp.consumedAt = new Date()
  await otp.save()
  return user
}

export const verifyOtpLogin = asyncHandler(async function verifyOtpLogin(req, res) {
  const user = await consumeOtp(req.body.identifier, OTP_PURPOSE.LOGIN, req.body.code)
  return completeLogin(user, req, res)
})

/** Step 1 of reset: trade a valid code for a short-lived, single-purpose reset token. */
export const verifyResetOtp = asyncHandler(async function verifyResetOtp(req, res) {
  const user = await consumeOtp(req.body.identifier, OTP_PURPOSE.RESET, req.body.code)
  const resetToken = jwt.sign({ sub: user._id.toString(), purpose: 'password_reset', pwd: user.passwordHash.slice(-12) }, env.jwt.accessSecret, {
    expiresIn: RESET_TOKEN_TTL,
  })
  return sendResponse(res, 200, { resetToken }, 'Code verified')
})

/** Step 2 of reset: set the new password. The token dies once the password changes. */
export const resetPassword = asyncHandler(async function resetPassword(req, res) {
  let decoded
  try {
    decoded = jwt.verify(req.body.resetToken, env.jwt.accessSecret)
  } catch {
    throw ApiError.unauthorized('This reset link has expired — request a new code')
  }
  if (decoded.purpose !== 'password_reset') throw ApiError.unauthorized('Invalid reset token')

  const user = await User.findById(decoded.sub).select('+passwordHash')
  // `pwd` pins the token to the password it was issued against → single use.
  if (!user || user.status !== 'active' || user.passwordHash.slice(-12) !== decoded.pwd) {
    throw ApiError.unauthorized('This reset link has already been used')
  }

  user.password = req.body.newPassword
  user.mustChangePassword = false
  await user.save()
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() })

  return sendResponse(res, 200, null, 'Password updated. Please log in with your new password.')
})

export const refresh = asyncHandler(async function refresh(req, res) {
  const incoming = req.body.refreshToken || req.cookies?.[REFRESH_COOKIE]
  if (!incoming) throw ApiError.unauthorized('Missing refresh token')

  let decoded
  try {
    decoded = verifyRefreshToken(incoming)
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token')
  }

  const tokenHash = hashToken(incoming)
  const stored = await RefreshToken.findOne({ tokenHash, userId: decoded.sub })
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Refresh token has been revoked or expired')
  }

  const user = await User.findById(decoded.sub)
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Account no longer active')

  // Rotate: revoke the used token, issue a fresh pair.
  stored.revokedAt = new Date()
  await stored.save()

  const { accessToken, refreshToken } = await issueTokenPair(user, req)
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions())
  return sendResponse(res, 200, { accessToken, refreshToken }, 'Token refreshed')
})

export const logout = asyncHandler(async function logout(req, res) {
  const incoming = req.body.refreshToken || req.cookies?.[REFRESH_COOKIE]
  if (incoming) {
    const tokenHash = hashToken(incoming)
    await RefreshToken.updateOne({ tokenHash }, { revokedAt: new Date() })
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
  return sendResponse(res, 200, null, 'Logged out')
})

export const logoutAllDevices = asyncHandler(async function logoutAllDevices(req, res) {
  await RefreshToken.updateMany({ userId: req.user._id, revokedAt: null }, { revokedAt: new Date() })
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
  return sendResponse(res, 200, null, 'Logged out of all devices')
})

export const me = asyncHandler(async function me(req, res) {
  return sendResponse(res, 200, { user: req.user.toSafeJSON() })
})

export const changePassword = asyncHandler(async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body

  const user = await User.findById(req.user._id).select('+passwordHash')
  const ok = await user.comparePassword(currentPassword)
  if (!ok) throw ApiError.badRequest('Current password is incorrect')

  user.password = newPassword
  user.mustChangePassword = false
  await user.save()

  // Force re-login everywhere else after a password change.
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() })

  return sendResponse(res, 200, null, 'Password changed. Please log in again.')
})
