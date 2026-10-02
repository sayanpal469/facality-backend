import { pathToFileURL } from 'node:url'
import { connectDatabase, disconnectDatabase } from './config/db.js'
import { env } from './config/env.js'
import { Enterprise } from './models/Enterprise.js'
import { User } from './models/User.js'
import { ServiceCategory } from './models/ServiceCategory.js'
import { ServiceType } from './models/ServiceType.js'
import { ROLES } from './constants/enums.js'

// Default service categories/types from the BRD (§4) — admin can edit/extend
// freely afterwards; this just means the system isn't empty on first login.
const DEFAULT_CATEGORIES = [
  { name: 'Housekeeping', types: ['Housekeeper', 'Housekeeping Supervisor'] },
  { name: 'General Support', types: ['Office Boy', 'Pantry Boy', 'Peon', 'Helper', 'Labour'] },
  {
    name: 'Technical Services',
    types: ['Electrician', 'Plumber', 'CCTV Operator', 'WTP Operator', 'STP Operator', 'BMS Operator', 'DG Operator'],
  },
  { name: 'Gardening', types: ['Gardener', 'Gardening Supervisor'] },
  { name: 'Management & Supervision', types: ['Group Leader', 'Technical Supervisor', 'General Supervisor', 'Facility Manager'] },
]

/**
 * Idempotent: safe to call every time the server boots (used automatically
 * for USE_MEMORY_DB, where each process gets a throwaway database) as well
 * as manually via `npm run seed` against a real, persistent MongoDB.
 */
export async function seedDatabase() {
  let enterprise = await Enterprise.findOne({ name: env.seed.enterpriseName })
  if (!enterprise) {
    enterprise = await Enterprise.create({ name: env.seed.enterpriseName })
    console.log(`[seed] Created enterprise "${enterprise.name}"`)
  }

  const existingAdmin = await User.findOne({ email: env.seed.adminEmail })
  if (!existingAdmin) {
    const admin = new User({
      enterpriseId: enterprise._id,
      name: env.seed.adminName,
      email: env.seed.adminEmail,
      role: ROLES.ADMIN,
    })
    admin.password = env.seed.adminPassword
    await admin.save()
    console.log(`[seed] Created admin account → email: ${env.seed.adminEmail}  password: ${env.seed.adminPassword}`)
  }

  const existingCategories = await ServiceCategory.countDocuments({ enterpriseId: enterprise._id })
  if (existingCategories === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      const category = await ServiceCategory.create({ enterpriseId: enterprise._id, name: cat.name })
      await ServiceType.insertMany(cat.types.map((name) => ({ enterpriseId: enterprise._id, categoryId: category._id, name })))
    }
    console.log(`[seed] Created ${DEFAULT_CATEGORIES.length} default service categories`)
  }

  return { enterprise }
}

// Run directly (`npm run seed`) rather than imported. Compared as file:// URLs
// (not raw path strings) since Windows paths use backslashes and wouldn't match otherwise.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  connectDatabase()
    .then(() => seedDatabase())
    .then(() => {
      console.log('[seed] Done.')
      return disconnectDatabase()
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] Failed:', err)
      process.exit(1)
    })
}
