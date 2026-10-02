import { asyncHandler } from '../utils/asyncHandler.js'
import { sendResponse } from '../utils/ApiResponse.js'
import { getPagination, paginatedMeta } from '../utils/pagination.js'
import { Notification } from '../models/Notification.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { User } from '../models/User.js'

export const listNotifications = asyncHandler(async function listNotifications(req, res) {
  const { page, limit, skip } = getPagination(req.validatedQuery)
  const filter = { userId: req.user._id }

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, read: false }),
  ])

  return sendResponse(res, 200, items, undefined, { ...paginatedMeta({ page, limit, total }), unreadCount })
})

export const markNotificationRead = asyncHandler(async function markNotificationRead(req, res) {
  await Notification.updateOne({ _id: req.params.id, userId: req.user._id }, { read: true })
  return sendResponse(res, 200, null, 'Marked as read')
})

export const markAllNotificationsRead = asyncHandler(async function markAllNotificationsRead(req, res) {
  await Notification.updateMany({ userId: req.user._id, read: false }, { read: true })
  return sendResponse(res, 200, null, 'All marked as read')
})

/** Registers (or re-assigns) this install's FCM token to the signed-in user. */
export const registerDevice = asyncHandler(async function registerDevice(req, res) {
  const { token, platform, app } = req.body
  await DeviceToken.findOneAndUpdate(
    { token },
    { userId: req.user._id, platform, app, lastSeenAt: new Date() },
    { upsert: true, setDefaultsOnInsert: true },
  )
  return sendResponse(res, 200, null, 'Device registered')
})

/** Called on logout so a shared device stops receiving this user's pushes. */
export const unregisterDevice = asyncHandler(async function unregisterDevice(req, res) {
  await DeviceToken.deleteOne({ token: req.body.token, userId: req.user._id })
  return sendResponse(res, 200, null, 'Device unregistered')
})

export const getPushPreferences = asyncHandler(async function getPushPreferences(req, res) {
  const user = await User.findById(req.user._id).select('pushPreferences').lean()
  return sendResponse(res, 200, user.pushPreferences)
})

export const updatePushPreferences = asyncHandler(async function updatePushPreferences(req, res) {
  const set = Object.fromEntries(Object.entries(req.body).map(([k, v]) => [`pushPreferences.${k}`, v]))
  const user = await User.findByIdAndUpdate(req.user._id, { $set: set }, { new: true }).select('pushPreferences').lean()
  return sendResponse(res, 200, user.pushPreferences, 'Preferences saved')
})
