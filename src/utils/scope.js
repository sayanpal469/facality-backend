import { ROLES } from '../constants/enums.js'

/**
 * Generic data-boundary filter for any collection that carries
 * `enterpriseId`, `clientId` and a site reference (see scope.middleware.js):
 * clients see only their own rows, supervisors/site managers only their
 * assigned sites' rows, admins everything in their enterprise.
 */
export function scopedFilter(req, extra = {}, siteField = 'siteId') {
  const filter = { enterpriseId: req.user.enterpriseId, ...extra }
  if (req.user.role === ROLES.USER) filter.clientId = req.user.clientId
  if (req.user.role === ROLES.SUPERVISOR || req.user.role === ROLES.SITE_MANAGER) {
    filter[siteField] = { $in: req.scope.siteIds }
  }
  return filter
}
