import mongoose from 'mongoose'
import { ACCOUNT_STATUS_VALUES } from '../constants/enums.js'

const { Schema } = mongoose

// Employee is the staff directory for EVERY field role (Electrician, Plumber,
// Housekeeper, Supervisor, Facility Manager, ...) — what a work order or
// complaint is actually assigned to. Only the supervisor / site_manager
// designations get an app login: for those, userId points at their User
// account (role: 'supervisor' | 'site_manager'). Plain technicians have
// userId: null — they're tracked for assignment/reporting but don't sign in,
// matching the four login roles (admin/user/supervisor/site_manager) requested.
const employeeSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    // No `default: null` here on purpose — a sparse unique index only skips
    // documents where the field is truly ABSENT, not ones explicitly set to
    // null. Giving it a default would make every plain technician's document
    // collide on the same "null" slot in the unique index.
    userId: { type: Schema.Types.ObjectId, ref: 'User' },

    name: { type: String, required: true, trim: true },
    mobile: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },

    employeeCode: { type: String, required: true, trim: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'ServiceType', required: true }, // job type, e.g. Electrician / Facility Manager
    assignedSiteIds: [{ type: Schema.Types.ObjectId, ref: 'Site' }],
    joiningDate: { type: Date, required: true },
    status: { type: String, enum: ACCOUNT_STATUS_VALUES, default: 'active' },
  },
  { timestamps: true },
)

employeeSchema.index({ enterpriseId: 1, employeeCode: 1 }, { unique: true })
employeeSchema.index({ userId: 1 }, { unique: true, sparse: true })
employeeSchema.index({ enterpriseId: 1, serviceId: 1 })

export const Employee = mongoose.model('Employee', employeeSchema)
