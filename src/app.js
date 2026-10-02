import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import { env } from './config/env.js'
import routes from './routes/index.js'
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js'
import { apiRateLimiter } from './middleware/rateLimit.middleware.js'
import { sanitizeInput } from './middleware/sanitize.middleware.js'

const app = express()

app.set('trust proxy', 1)

// Uploaded images/videos are embedded by the admin panel and the apps from
// other origins, so resources must be loadable cross-origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(
  cors({
    origin: env.clientOrigins,
    credentials: true,
    // Lets the admin panel read the filename of report/document downloads.
    exposedHeaders: ['Content-Disposition'],
  }),
)
app.use(compression())
app.use(morgan(env.isProd ? 'combined' : 'dev'))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(sanitizeInput)

// Static file serving for locally-stored uploads (STORAGE_DRIVER=local — see services/storage.service.js).
// Public path is always /uploads, whatever directory UPLOAD_DIR points at.
app.use('/uploads', express.static(env.upload.dir))

app.use('/api', apiRateLimiter, routes)
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Teamgenix facality API' })
})

app.use(notFoundHandler)
app.use(errorHandler)

export default app
