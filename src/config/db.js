import mongoose from 'mongoose'
import { env } from './env.js'

let memoryServer = null

/**
 * Connects to MongoDB. When USE_MEMORY_DB=true, boots an in-process,
 * throwaway MongoDB instance instead — handy for trying the API without
 * installing MongoDB, but data does not persist across restarts.
 */
export async function connectDatabase() {
  mongoose.set('strictQuery', true)

  let uri = env.mongoUri

  if (env.useMemoryDb) {
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    memoryServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } })
    uri = memoryServer.getUri('facility_management')
    console.log('[db] Using in-memory MongoDB instance (USE_MEMORY_DB=true) — data will not persist.')
  }

  await mongoose.connect(uri)
  // Mask credentials — the URI often embeds the DB user's password.
  console.log(`[db] Connected to MongoDB (${env.useMemoryDb ? 'in-memory' : uri.replace(/\/\/[^@/]+@/, '//***@')})`)

  mongoose.connection.on('error', (err) => {
    console.error('[db] Connection error:', err)
  })

  return mongoose.connection
}

export async function disconnectDatabase() {
  await mongoose.disconnect()
  if (memoryServer) {
    await memoryServer.stop()
    memoryServer = null
  }
}
