/**
 * Creates (or repairs) a client-app login, linked to a client company.
 *
 *   npm run create:client-user -- user@gmail.com Demo@12345
 *
 * Safe to re-run: an existing user with that email gets the new password,
 * is re-activated and re-linked to a client; nothing else is touched.
 */
import mongoose from 'mongoose'
import { connectDatabase, disconnectDatabase } from './config/db.js'
import { env } from './config/env.js'
import { ROLES } from './constants/enums.js'
import { Client, Enterprise, User } from './models/index.js'

async function main() {
  const [rawEmail, password] = process.argv.slice(2)
  if (!rawEmail || !password) throw new Error('Usage: npm run create:client-user -- <email> <password>')
  const email = rawEmail.trim().toLowerCase()

  await connectDatabase()

  const enterprise = (await Enterprise.findOne({ name: env.seed.enterpriseName })) ?? (await Enterprise.findOne().sort({ createdAt: 1 }))
  if (!enterprise) throw new Error('No enterprise found — run `npm run seed` first')

  let user = await User.findOne({ email })
  if (user && user.role !== ROLES.USER) throw new Error(`${email} already exists as a "${user.role}" account — use a different email`)

  // Reuse the client this login already belongs to, else one with the same email, else create one.
  let client = (user?.clientId && (await Client.findById(user.clientId))) || (await Client.findOne({ enterpriseId: enterprise._id, email }))
  if (!client) {
    client = await Client.create({
      enterpriseId: enterprise._id,
      companyName: 'Test Client',
      contactPerson: 'Test User',
      mobile: '9000000000',
      email,
      address: 'Kolkata',
      startDate: new Date(),
    })
  }
  client.status = 'active'

  if (!user) user = new User({ enterpriseId: enterprise._id, name: client.contactPerson, email, role: ROLES.USER })
  user.clientId = client._id
  user.status = 'active'
  user.mustChangePassword = false
  user.password = password
  await user.save()

  client.userId = user._id
  await client.save()

  console.log(`[client-user] ${email} can now log in to the client app (client: ${client.companyName}, enterprise: ${enterprise.name})`)
}

main()
  .catch((err) => {
    console.error('[client-user] Failed:', err.message)
    process.exitCode = 1
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await disconnectDatabase()
  })
