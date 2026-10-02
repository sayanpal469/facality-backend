import 'dotenv/config'

function bool(value, fallback = false) {
  if (value === undefined) return fallback
  return value === 'true' || value === '1'
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 5000,
  clientOrigins: (process.env.CLIENT_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()),

  // Calendar days (attendance, "today" counts) are computed in this zone.
  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',

  // Background sweep (SLA/overdue alerts, preventive-maintenance work orders). 0 disables it.
  scheduler: {
    intervalMinutes: Number(process.env.SCHEDULER_INTERVAL_MINUTES ?? (process.env.NODE_ENV === 'test' ? 0 : 5)),
  },

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/facility_management',
  useMemoryDb: bool(process.env.USE_MEMORY_DB, false),

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  seed: {
    enterpriseName: process.env.SEED_ENTERPRISE_NAME || 'Demo Facility Enterprise',
    adminName: process.env.SEED_ADMIN_NAME || 'Admin',
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
  },

  // Absolute base the API is reachable at (e.g. https://api.example.com).
  // Used for locally-stored file URLs; falls back to the request's own host.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxMb: Number(process.env.MAX_UPLOAD_MB) || 50,
  },

  // Outbound email/SMS (OTP codes, temporary passwords). The `console`
  // drivers just log the message — fine for development, never for production.
  messaging: {
    appName: process.env.APP_NAME || 'Facility Service',
    emailDriver: process.env.EMAIL_DRIVER || 'console',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: bool(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'no-reply@example.com',
    },
    smsDriver: process.env.SMS_DRIVER || 'console',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_FROM || '',
    },
    // Country code prepended to 10-digit local mobiles before sending SMS.
    defaultCountryCode: process.env.SMS_DEFAULT_COUNTRY_CODE || '+91',
  },

  // Firebase Cloud Messaging. Provide the service-account JSON either inline
  // (FIREBASE_SERVICE_ACCOUNT_JSON) or as a file path (FIREBASE_SERVICE_ACCOUNT_PATH).
  // Without either, pushes are only logged.
  push: {
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
  },

  // STORAGE_DRIVER=s3 stores files in AWS S3 or any S3-compatible bucket
  // (Cloudflare R2: set S3_ENDPOINT to the account's R2 endpoint, region "auto").
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    s3: {
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      publicUrl: (process.env.S3_PUBLIC_URL || '').replace(/\/$/, ''),
    },
  },
}
