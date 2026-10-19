import http from 'node:http'
import app from './app.js'
import { env } from './config/env.js'
import { connectDatabase, disconnectDatabase } from './config/db.js'
import { seedDatabase } from './seed.js'
import { seedProducts } from './seedProducts.js'
import { runMigrations } from './utils/migrations.js'
import { startScheduler, stopScheduler } from './services/scheduler.service.js'

async function main() {
  await connectDatabase()

  if (env.useMemoryDb) {
    // A fresh in-memory Mongo instance starts empty every time — seed it
    // automatically so `npm run dev:memory` is immediately usable.
    const { enterprise } = await seedDatabase()
    await seedProducts({ enterpriseId: enterprise._id })
  }
  await runMigrations()
  startScheduler()

  const server = http.createServer(app)
  server.listen(env.port, () => {
    console.log(`[server] Listening on http://localhost:${env.port} (${env.nodeEnv})`)
  })

  const shutdown = async (signal) => {
    console.log(`[server] Received ${signal}, shutting down...`)
    stopScheduler()
    server.close(async () => {
      await disconnectDatabase()
      process.exit(0)
    })
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[server] Failed to start:', err)
  process.exit(1)
})
