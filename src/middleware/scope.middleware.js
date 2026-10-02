import { asyncHandler } from '../utils/asyncHandler.js'
import { Employee } from '../models/Employee.js'
import { ROLES } from '../constants/enums.js'

/**
 * Computes each request's data boundary and attaches it as req.scope:
 *   - admin            → whole enterprise
 *   - user (client)     → only their own client's data (req.scope.clientId)
 *   - supervisor / site_manager → only their assigned sites (req.scope.siteIds)
 *
 * Controllers merge req.scope into their Mongo filters so a supervisor can
 * never even see, let alone touch, another site's work orders — enforced at
 * the query layer, not just hidden in the UI (BRD §10 Security Requirements).
 */
export const attachScope = asyncHandler(async function attachScope(req, res, next) {
  const user = req.user
  const scope = { enterpriseId: user.enterpriseId }

  if (user.role === ROLES.USER) {
    scope.clientId = user.clientId
  } else if (user.role === ROLES.SUPERVISOR || user.role === ROLES.SITE_MANAGER) {
    const employee = await Employee.findById(user.employeeId).select('assignedSiteIds').lean()
    scope.siteIds = employee?.assignedSiteIds ?? []
    scope.employeeId = user.employeeId
  }
  // admin: no extra restriction beyond enterpriseId

  req.scope = scope
  next()
})
