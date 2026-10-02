import mongoose from 'mongoose'

const { Schema } = mongoose

export const ATTENDANCE_STATUS_VALUES = ['present', 'absent', 'half_day', 'leave']

// One row per employee per calendar day. Supervisors / site managers clock in
// and out themselves from the Enterprise App; field staff without a login
// (technicians, housekeepers) are marked by their supervisor or an admin.
const attendanceSchema = new Schema(
  {
    enterpriseId: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // local calendar day (APP_TIMEZONE)
    status: { type: String, enum: ATTENDANCE_STATUS_VALUES, required: true },

    checkIn: { type: Date, default: null },
    checkOut: { type: Date, default: null },
    checkInLatitude: { type: Number, default: null },
    checkInLongitude: { type: Number, default: null },
    checkInDistanceM: { type: Number, default: null },
    locationVerified: { type: Boolean, default: null },

    source: { type: String, enum: ['self', 'supervisor', 'admin'], required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
)

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true })
attendanceSchema.index({ enterpriseId: 1, date: 1, siteId: 1 })

export const Attendance = mongoose.model('Attendance', attendanceSchema)
