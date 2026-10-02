// Shared harness for the API test suite (`npm test`). Each test file runs in
// its own process (node --test), boots the real app on a random port against
// a throwaway in-memory MongoDB, and talks to it over HTTP like the apps do.
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.NODE_ENV = 'test'
process.env.USE_MEMORY_DB = 'true'
process.env.STORAGE_DRIVER = 'local'
process.env.EMAIL_DRIVER = 'console'
process.env.SMS_DRIVER = 'console'
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-uploads-'))
process.env.PUBLIC_BASE_URL = ''
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = ''
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = ''
process.env.SEED_ADMIN_EMAIL = 'admin@teamgenix.in'
process.env.SEED_ADMIN_PASSWORD = 'Admin@12345'

let server
let base

/** Boots the API; returns its base URL (e.g. http://127.0.0.1:53211/api). */
export async function startApi() {
  // Imported lazily so the env overrides above apply to config/env.js.
  const quiet = console.log
  console.log = () => {}
  const { default: app } = await import('../src/app.js')
  const { connectDatabase } = await import('../src/config/db.js')
  const { seedDatabase } = await import('../src/seed.js')
  await connectDatabase()
  await seedDatabase()
  console.log = quiet
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  base = `http://127.0.0.1:${server.address().port}/api`
  return base
}

export async function stopApi() {
  const { disconnectDatabase } = await import('../src/config/db.js')
  await new Promise((resolve) => server.close(resolve))
  await disconnectDatabase()
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true })
}

export async function api(method, urlPath, token, body) {
  const isForm = body instanceof FormData
  const res = await fetch(base + urlPath, {
    method,
    headers: {
      ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  })
  const type = res.headers.get('content-type') || ''
  const json = type.includes('json') ? await res.json() : {}
  return { status: res.status, body: json, data: json.data, headers: res.headers }
}

export async function login(credentials) {
  const r = await api('POST', '/auth/login', null, credentials)
  return r.data?.accessToken
}

export const ADMIN = { email: 'admin@teamgenix.in', password: 'Admin@12345' }

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
export function pngForm(fields = {}) {
  const form = new FormData()
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'evidence.png')
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v))
  return form
}

let counter = 0
/**
 * A fresh, isolated world: admin token, service type ids, a client with its
 * app login, one site, a technician and a supervisor assigned to that site.
 */
export async function makeWorld() {
  const tag = `${Date.now()}${counter++}`
  const admin = await login(ADMIN)
  const cats = (await api('GET', '/services/categories', admin)).data
  const types = Object.fromEntries(cats.flatMap((c) => c.types).map((t) => [t.name, t._id]))
  const mobile = `9${tag.slice(-9)}`
  const created = (
    await api('POST', '/clients', admin, {
      companyName: `Client ${tag}`,
      contactPerson: `Contact ${tag}`,
      mobile,
      email: `client${tag}@test.dev`,
      address: 'Kolkata',
      startDate: '2026-01-01',
      serviceIds: [types.Electrician],
    })
  ).data
  const site = (
    await api('POST', '/sites', admin, {
      clientId: created.client._id,
      name: `Site ${tag}`,
      address: 'Sector V',
      serviceIds: [types.Electrician, types.Gardener],
    })
  ).data
  const tech = (
    await api('POST', '/employees', admin, { name: `Tech ${tag}`, serviceId: types.Electrician, assignedSiteIds: [site._id], joiningDate: '2026-01-01' })
  ).data
  await api('POST', '/accounts', admin, {
    name: `Supervisor ${tag}`,
    email: `sup${tag}@test.dev`,
    password: 'Password1',
    role: 'supervisor',
    serviceId: types['Technical Supervisor'],
    assignedSiteIds: [site._id],
    joiningDate: '2026-01-01',
  })
  return {
    tag,
    admin,
    types,
    client: created.client,
    clientEmail: `client${tag}@test.dev`,
    clientMobile: mobile,
    clientPassword: created.login.temporaryPassword,
    site,
    tech,
    sup: await login({ email: `sup${tag}@test.dev`, password: 'Password1' }),
    user: await login({ identifier: `client${tag}@test.dev`, password: created.login.temporaryPassword }),
  }
}

export async function makeWorkOrder(w, extra = {}) {
  return (
    await api('POST', '/work-orders', w.admin, {
      clientId: w.client._id,
      siteId: w.site._id,
      serviceId: w.types.Electrician,
      title: 'Panel audit',
      assignedEmployeeId: w.tech._id,
      dueDate: '2026-12-01',
      ...extra,
    })
  ).data
}