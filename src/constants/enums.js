// Central place for every enum used across models/validators/controllers so
// the same string literals aren't repeated (and risk drifting) everywhere.

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  USER: 'user', // client-app login (the client's point of contact)
  SUPERVISOR: 'supervisor', // enterprise-app login
  SITE_MANAGER: 'site_manager', // enterprise-app login
})
export const ROLE_VALUES = Object.values(ROLES)

// Roles that log into the Enterprise App (field-facing).
export const ENTERPRISE_APP_ROLES = [ROLES.SUPERVISOR, ROLES.SITE_MANAGER]

export const ACCOUNT_STATUS = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive' })
export const ACCOUNT_STATUS_VALUES = Object.values(ACCOUNT_STATUS)

export const PRIORITY = Object.freeze({ NORMAL: 'normal', HIGH: 'high', URGENT: 'urgent' })
export const PRIORITY_VALUES = Object.values(PRIORITY)

export const WORK_ORDER_STATUS = Object.freeze({
  CREATED: 'created',
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  SITE_VISIT: 'site_visit',
  WORK_STARTED: 'work_started',
  IN_PROGRESS: 'in_progress',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  VERIFIED: 'verified',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
})
export const WORK_ORDER_STATUS_VALUES = Object.values(WORK_ORDER_STATUS)
export const WORK_ORDER_TERMINAL_STATUSES = [
  WORK_ORDER_STATUS.COMPLETED,
  WORK_ORDER_STATUS.VERIFIED,
  WORK_ORDER_STATUS.CLOSED,
  WORK_ORDER_STATUS.CANCELLED,
]
// Narrower than WORK_ORDER_TERMINAL_STATUSES — deliberately excludes
// COMPLETED, since "completed" means "submitted, awaiting verification" and
// a supervisor/site_manager must still be able to move it onward from there
// (approve to VERIFIED, or send back to IN_PROGRESS on rejection) via
// advanceWorkOrderStatus. Only these three are truly end-of-line.
export const WORK_ORDER_LOCKED_STATUSES = [WORK_ORDER_STATUS.VERIFIED, WORK_ORDER_STATUS.CLOSED, WORK_ORDER_STATUS.CANCELLED]

export const COMPLAINT_STATUS = Object.freeze({
  OPEN: 'open',
  ASSIGNED: 'assigned',
  ACKNOWLEDGED: 'acknowledged',
  WORK_STARTED: 'work_started',
  RESOLVED: 'resolved',
  CLIENT_VERIFICATION: 'client_verification',
  CLOSED: 'closed',
})
export const COMPLAINT_STATUS_VALUES = Object.values(COMPLAINT_STATUS)

export const VISIT_PURPOSE = Object.freeze({
  INSPECTION: 'Inspection',
  MAINTENANCE: 'Maintenance',
  COMPLAINT: 'Complaint',
  INSTALLATION: 'Installation',
  VERIFICATION: 'Verification',
  ROUTINE_VISIT: 'Routine Visit',
})
export const VISIT_PURPOSE_VALUES = Object.values(VISIT_PURPOSE)

export const MEDIA_TYPE = Object.freeze({ PHOTO: 'photo', VIDEO: 'video' })
export const MEDIA_STAGE = Object.freeze({ BEFORE: 'before', DURING: 'during', AFTER: 'after' })

export const ACTIVITY_ENTITY_TYPE = Object.freeze({
  CLIENT: 'Client',
  SITE: 'Site',
  SERVICE: 'Service',
  EMPLOYEE: 'Employee',
  WORK_ORDER: 'Work Order',
  COMPLAINT: 'Complaint',
  SITE_VISIT: 'Site Visit',
  SETTINGS: 'Settings',
  ACCOUNT: 'Account',
  ASSET: 'Asset',
  CONTRACT: 'Contract',
  PM_SCHEDULE: 'Maintenance Schedule',
})

export const NOTIFICATION_KIND = Object.freeze({
  COMPLAINT: 'complaint',
  OVERDUE: 'overdue',
  VERIFICATION: 'verification',
  EMPLOYEE: 'employee',
  CLIENT: 'client',
  WORK_ORDER: 'work_order', // client-app facing
  SITE_VISIT: 'site_visit', // client-app facing
})

// Finer-grained than `kind` — lets the mobile apps pick the right icon/copy
// without parsing titles. Optional on every notification.
export const NOTIFICATION_EVENT = Object.freeze({
  WORK_CREATED: 'work_created',
  WORK_STARTED: 'work_started',
  PROGRESS_UPDATE: 'progress_update',
  WORK_COMPLETED: 'work_completed',
  WORK_VERIFIED: 'work_verified',
  WORK_CLOSED: 'work_closed',
  WORK_CANCELLED: 'work_cancelled',
  WORK_STATUS: 'work_status',
  COMPLAINT_RAISED: 'complaint_raised',
  COMPLAINT_ASSIGNED: 'complaint_assigned',
  COMPLAINT_STATUS: 'complaint_status',
  COMPLAINT_RESOLVED: 'complaint_resolved',
  COMPLAINT_REOPENED: 'complaint_reopened',
  SITE_VISIT_COMPLETED: 'site_visit_completed',
  MEDIA_UPLOADED: 'media_uploaded',
  WORK_OVERDUE: 'work_overdue',
  SLA_BREACHED: 'sla_breached',
  PM_WORK_CREATED: 'pm_work_created',
  CONTRACT_EXPIRING: 'contract_expiring',
})
