import { pathToFileURL } from 'node:url'
import { connectDatabase, disconnectDatabase } from './config/db.js'
import { seedDatabase } from './seed.js'
import { generateCode } from './utils/sequence.js'
import { localDay, addDays } from './utils/dates.js'
import {
  ActivityLog,
  Asset,
  Attendance,
  Client,
  Complaint,
  Contract,
  Employee,
  Invoice,
  Notification,
  PmSchedule,
  Quotation,
  ServiceType,
  Site,
  SiteVisit,
  User,
  WorkOrder,
} from './models/index.js'
import { ROLES } from './constants/enums.js'

// Realistic demo dataset on top of the base seed (enterprise, admin, service
// catalogue): logins for every role plus clients, sites, staff, work orders,
// complaints, visits, attendance, assets, contracts, PM schedules and billing
// — all cross-linked so every screen in the admin panel and both apps has data.
//
// Idempotent: accounts are matched by email, and the operational data is only
// created once (detected by the first demo client's email).

export const DEMO_PASSWORD = 'Demo@12345'

const DAY = 864e5
const HOUR = 36e5
const now = () => new Date()
const daysAgo = (n, hour = 10) => {
  const d = new Date(Date.now() - n * DAY)
  d.setHours(hour, 0, 0, 0)
  return d
}
const daysAhead = (n) => new Date(Date.now() + n * DAY)

const STAFF_ACCOUNTS = [
  { key: 'sup1', name: 'Subhajit Banerjee', email: 'supervisor@example.com', mobile: '9830011001', role: ROLES.SUPERVISOR, service: 'Technical Supervisor', sites: ['gvA', 'gvB', 'sun'] },
  { key: 'sup2', name: 'Rina Chatterjee', email: 'supervisor2@example.com', mobile: '9830011002', role: ROLES.SUPERVISOR, service: 'General Supervisor', sites: ['rrBlock', 'rrClub'] },
  { key: 'mgr', name: 'Amit Kumar', email: 'manager@example.com', mobile: '9830011003', role: ROLES.SITE_MANAGER, service: 'Facility Manager', sites: ['gvA', 'gvB', 'sun', 'rrBlock', 'rrClub'] },
]

const TECHNICIANS = [
  { key: 'elec', name: 'Rakesh Das', mobile: '9830022001', service: 'Electrician', sites: ['gvA', 'gvB', 'sun'] },
  { key: 'plumb', name: 'Sumon Mondal', mobile: '9830022002', service: 'Plumber', sites: ['gvA', 'sun', 'rrBlock'] },
  { key: 'cctv', name: 'Arif Hossain', mobile: '9830022003', service: 'CCTV Operator', sites: ['gvA', 'gvB', 'rrBlock'] },
  { key: 'hk1', name: 'Priya Sen', mobile: '9830022004', service: 'Housekeeper', sites: ['gvA', 'gvB'] },
  { key: 'hk2', name: 'Mithu Roy', mobile: '9830022005', service: 'Housekeeper', sites: ['sun'] },
  { key: 'garden', name: 'Bablu Sheikh', mobile: '9830022006', service: 'Gardener', sites: ['rrBlock', 'rrClub'] },
  { key: 'dg', name: 'Tapas Ghosh', mobile: '9830022007', service: 'DG Operator', sites: ['gvA', 'sun'] },
  { key: 'stp', name: 'Anil Barman', mobile: '9830022008', service: 'STP Operator', sites: ['rrBlock'] },
]

const CLIENTS = [
  {
    key: 'gv',
    companyName: 'GreenValley Tech Park Pvt. Ltd.',
    contactPerson: 'Sourav Dutta',
    email: 'client@example.com',
    mobile: '9831000001',
    address: 'Plot 12, Sector V, Salt Lake, Kolkata 700091',
    gstin: '19AABCG1234F1Z5',
    startedDaysAgo: 400,
    services: ['Housekeeper', 'Electrician', 'Plumber', 'CCTV Operator', 'DG Operator'],
    sites: [
      { key: 'gvA', name: 'Tower A', address: 'Tower A, Plot 12, Sector V, Salt Lake, Kolkata 700091', contactPerson: 'Rajib Paul', contactMobile: '9831000101', lat: 22.5726, lng: 88.4331 },
      { key: 'gvB', name: 'Tower B', address: 'Tower B, Plot 12, Sector V, Salt Lake, Kolkata 700091', contactPerson: 'Moumita Sarkar', contactMobile: '9831000102', lat: 22.5741, lng: 88.4342 },
    ],
  },
  {
    key: 'sun',
    companyName: 'Sunrise Multispeciality Hospital',
    contactPerson: 'Dr. Neha Agarwal',
    email: 'client2@example.com',
    mobile: '9831000002',
    address: '1450 EM Bypass, Kasba, Kolkata 700107',
    gstin: '19AAFCS5678K1Z2',
    startedDaysAgo: 220,
    services: ['Housekeeper', 'Electrician', 'Plumber', 'DG Operator'],
    sites: [
      { key: 'sun', name: 'Main Campus', address: '1450 EM Bypass, Kasba, Kolkata 700107', contactPerson: 'Kunal Bose', contactMobile: '9831000201', lat: 22.5150, lng: 88.4010 },
    ],
  },
  {
    key: 'rr',
    companyName: 'Riverside Residency Owners Association',
    contactPerson: 'Partha Saha',
    email: 'client3@example.com',
    mobile: '9831000003',
    address: 'Action Area II, New Town, Kolkata 700161',
    gstin: '',
    startedDaysAgo: 150,
    services: ['Gardener', 'STP Operator', 'Plumber', 'CCTV Operator'],
    sites: [
      { key: 'rrBlock', name: 'Residential Blocks 1–4', address: 'Blocks 1–4, Action Area II, New Town, Kolkata 700161', contactPerson: 'Sanjoy Kar', contactMobile: '9831000301', lat: 22.5810, lng: 88.4790 },
      { key: 'rrClub', name: 'Clubhouse & Garden', address: 'Clubhouse, Action Area II, New Town, Kolkata 700161', contactPerson: 'Sanjoy Kar', contactMobile: '9831000301', lat: 22.5818, lng: 88.4801 },
    ],
  },
]

// Status progression a work order passes through, with the progress % it reports at each step.
const WO_FLOW = [
  ['created', 0],
  ['assigned', 0],
  ['accepted', 0],
  ['work_started', 10],
  ['in_progress', 50],
  ['completed', 100],
  ['verified', 100],
  ['closed', 100],
]

async function ensureUser({ enterpriseId, name, email, mobile, role, clientId = null, employeeId = null, createdBy = null }) {
  let user = await User.findOne({ email })
  if (user) return { user, created: false }
  user = new User({ enterpriseId, name, email, mobile, role, clientId, employeeId, createdBy, mustChangePassword: false })
  user.password = DEMO_PASSWORD
  await user.save()
  return { user, created: true }
}

export async function seedDemoData() {
  const { enterprise } = await seedDatabase()
  const enterpriseId = enterprise._id

  if (!enterprise.supportEmail) {
    enterprise.supportEmail = 'support@example.com'
    enterprise.phone = '03340001234'
    enterprise.address = 'DN-24, Sector V, Salt Lake, Kolkata 700091'
    enterprise.gstin = '19AADCD9999Q1Z8'
    await enterprise.save()
  }

  const admin = await User.findOne({ enterpriseId, role: ROLES.ADMIN }).sort({ createdAt: 1 })
  const { user: opsAdmin } = await ensureUser({
    enterpriseId,
    name: 'Operations Admin',
    email: 'ops.admin@example.com',
    mobile: '9830000002',
    role: ROLES.ADMIN,
    createdBy: admin._id,
  })

  const types = await ServiceType.find({ enterpriseId }).lean()
  const svc = (name) => {
    const t = types.find((x) => x.name === name)
    if (!t) throw new Error(`Service type "${name}" not found — run the base seed first`)
    return t._id
  }

  if (await Client.exists({ enterpriseId, email: CLIENTS[0].email })) {
    console.log('[seed:demo] Demo data already present — skipping operational data.')
    return { enterprise }
  }

  // ── Clients, sites, client logins ──────────────────────────────────────────
  const clients = {}
  const sites = {}
  const clientUsers = {}
  for (const c of CLIENTS) {
    const client = await Client.create({
      enterpriseId,
      companyName: c.companyName,
      contactPerson: c.contactPerson,
      mobile: c.mobile,
      email: c.email,
      address: c.address,
      gstin: c.gstin,
      startDate: daysAgo(c.startedDaysAgo),
      contractNote: 'Comprehensive facility services as per signed AMC.',
      serviceIds: c.services.map(svc),
    })
    const { user } = await ensureUser({
      enterpriseId,
      name: c.contactPerson,
      email: c.email,
      mobile: c.mobile,
      role: ROLES.USER,
      clientId: client._id,
      createdBy: admin._id,
    })
    if (!user.clientId) {
      user.clientId = client._id
      await user.save()
    }
    client.userId = user._id
    await client.save()
    clients[c.key] = client
    clientUsers[c.key] = user

    for (const s of c.sites) {
      sites[s.key] = await Site.create({
        enterpriseId,
        clientId: client._id,
        name: s.name,
        address: s.address,
        contactPerson: s.contactPerson,
        contactMobile: s.contactMobile,
        serviceIds: c.services.map(svc),
        latitude: s.lat,
        longitude: s.lng,
        geofenceRadiusM: 250,
      })
    }
  }
  const siteClient = (siteKey) => sites[siteKey].clientId

  // ── Staff: supervisors / site manager (with logins) and technicians ────────
  const emp = {}
  const staffUsers = {}
  for (const s of STAFF_ACCOUNTS) {
    const employee = await Employee.create({
      enterpriseId,
      name: s.name,
      mobile: s.mobile,
      email: s.email,
      employeeCode: await generateCode('employee', enterpriseId),
      serviceId: svc(s.service),
      assignedSiteIds: s.sites.map((k) => sites[k]._id),
      joiningDate: daysAgo(380),
    })
    const { user } = await ensureUser({
      enterpriseId,
      name: s.name,
      email: s.email,
      mobile: s.mobile,
      role: s.role,
      employeeId: employee._id,
      createdBy: admin._id,
    })
    if (!user.employeeId) {
      user.employeeId = employee._id
      await user.save()
    }
    employee.userId = user._id
    await employee.save()
    emp[s.key] = employee
    staffUsers[s.key] = user
  }
  for (const t of TECHNICIANS) {
    emp[t.key] = await Employee.create({
      enterpriseId,
      name: t.name,
      mobile: t.mobile,
      employeeCode: await generateCode('employee', enterpriseId),
      serviceId: svc(t.service),
      assignedSiteIds: t.sites.map((k) => sites[k]._id),
      joiningDate: daysAgo(300),
    })
  }
  const supervisorFor = (siteKey) => (['rrBlock', 'rrClub'].includes(siteKey) ? 'sup2' : 'sup1')

  // ── Assets ─────────────────────────────────────────────────────────────────
  const ASSETS = [
    { key: 'dgA', site: 'gvA', service: 'DG Operator', name: 'DG Set 250 kVA', type: 'Diesel Generator', brand: 'Kirloskar', modelNumber: 'KG1-250AS', serialNumber: 'KOEL-25A-88213', location: 'Basement utility room', installedDaysAgo: 700, warrantyDays: 30 },
    { key: 'cctvA', site: 'gvA', service: 'CCTV Operator', name: 'Main Gate Camera Cluster', type: 'CCTV Camera', brand: 'Hikvision', modelNumber: 'DS-2CD2143G2', serialNumber: 'HK-4471902', location: 'Main gate', installedDaysAgo: 380, warrantyDays: 350 },
    { key: 'cctvB', site: 'gvB', service: 'CCTV Operator', name: 'Lobby Camera', type: 'CCTV Camera', brand: 'CP Plus', modelNumber: 'CP-UNC-TA21', serialNumber: 'CPP-221093', location: 'Ground floor lobby', installedDaysAgo: 380, warrantyDays: 350, status: 'faulty' },
    { key: 'dgSun', site: 'sun', service: 'DG Operator', name: 'DG Set 500 kVA', type: 'Diesel Generator', brand: 'Cummins', modelNumber: 'C500D5', serialNumber: 'CUM-500-77120', location: 'Generator yard', installedDaysAgo: 900, warrantyDays: -200 },
    { key: 'pump', site: 'sun', service: 'Plumber', name: 'Water Booster Pump', type: 'Pump', brand: 'Grundfos', modelNumber: 'CR 10-6', serialNumber: 'GF-CR10-5521', location: 'Terrace pump room', installedDaysAgo: 500, warrantyDays: 230, status: 'under_maintenance' },
    { key: 'stp', site: 'rrBlock', service: 'STP Operator', name: 'Sewage Treatment Plant 150 KLD', type: 'STP', brand: 'Thermax', modelNumber: 'TSTP-150', serialNumber: 'THX-150-30981', location: 'Behind Block 4', installedDaysAgo: 1100, warrantyDays: 0 },
  ]
  const assets = {}
  for (const a of ASSETS) {
    assets[a.key] = await Asset.create({
      enterpriseId,
      clientId: siteClient(a.site),
      siteId: sites[a.site]._id,
      serviceId: svc(a.service),
      code: await generateCode('asset', enterpriseId),
      name: a.name,
      type: a.type,
      brand: a.brand,
      modelNumber: a.modelNumber,
      serialNumber: a.serialNumber,
      location: a.location,
      installDate: daysAgo(a.installedDaysAgo),
      warrantyUntil: daysAgo(a.installedDaysAgo - 365 - a.warrantyDays),
      status: a.status ?? 'active',
      history: [
        { kind: 'installation', date: daysAgo(a.installedDaysAgo), note: 'Installed and commissioned.', byUserId: admin._id },
        { kind: 'inspection', date: daysAgo(30), note: 'Routine inspection — no issues found.', byUserId: staffUsers[supervisorFor(a.site)]._id },
      ],
    })
  }

  // ── Work orders ────────────────────────────────────────────────────────────
  const WORK_ORDERS = [
    { key: 'wo1', site: 'gvA', service: 'Electrician', tech: 'elec', title: 'Replace faulty LED panels — 3rd floor', priority: 'normal', status: 'closed', startedDaysAgo: 20, dueInDays: -15 },
    { key: 'wo2', site: 'gvA', service: 'DG Operator', tech: 'dg', title: 'DG set quarterly service', priority: 'high', status: 'verified', startedDaysAgo: 12, dueInDays: -8, asset: 'dgA' },
    { key: 'wo3', site: 'gvB', service: 'CCTV Operator', tech: 'cctv', title: 'Lobby camera not recording', priority: 'urgent', status: 'in_progress', startedDaysAgo: 2, dueInDays: 1, asset: 'cctvB' },
    { key: 'wo4', site: 'gvB', service: 'Housekeeper', tech: 'hk1', title: 'Deep cleaning of cafeteria', priority: 'normal', status: 'completed', startedDaysAgo: 3, dueInDays: 0 },
    { key: 'wo5', site: 'sun', service: 'Plumber', tech: 'plumb', title: 'Booster pump leakage repair', priority: 'high', status: 'work_started', startedDaysAgo: 1, dueInDays: 2, asset: 'pump' },
    { key: 'wo6', site: 'sun', service: 'Electrician', tech: 'elec', title: 'OT wing emergency lighting check', priority: 'urgent', status: 'assigned', startedDaysAgo: 0, dueInDays: 1 },
    { key: 'wo7', site: 'sun', service: 'Housekeeper', tech: 'hk2', title: 'Ward sanitisation — 2nd floor', priority: 'normal', status: 'accepted', startedDaysAgo: 0, dueInDays: 2 },
    { key: 'wo8', site: 'rrBlock', service: 'STP Operator', tech: 'stp', title: 'STP blower motor overhaul', priority: 'high', status: 'on_hold', startedDaysAgo: 6, dueInDays: -2, asset: 'stp', note: 'Waiting for replacement bearing from vendor.' },
    { key: 'wo9', site: 'rrClub', service: 'Gardener', tech: 'garden', title: 'Lawn trimming and hedge shaping', priority: 'normal', status: 'created', startedDaysAgo: 0, dueInDays: 4 },
    { key: 'wo10', site: 'rrBlock', service: 'Plumber', tech: 'plumb', title: 'Block 2 overhead tank cleaning', priority: 'normal', status: 'in_progress', startedDaysAgo: 5, dueInDays: -1 },
    { key: 'wo11', site: 'gvA', service: 'Plumber', tech: 'plumb', title: 'Washroom flush valve replacement', priority: 'normal', status: 'cancelled', startedDaysAgo: 9, dueInDays: -5, cancelReason: 'Duplicate request — merged with earlier work order.' },
    { key: 'wo12', site: 'rrBlock', service: 'CCTV Operator', tech: 'cctv', title: 'Add 4 cameras at parking entrance', priority: 'normal', status: 'closed', startedDaysAgo: 35, dueInDays: -25 },
  ]
  const workOrders = {}
  for (const w of WORK_ORDERS) {
    const supKey = supervisorFor(w.site)
    const supUser = staffUsers[supKey]
    const createdAt = daysAgo(w.startedDaysAgo + 1, 9)
    const statusHistory = []
    let progress = 0
    if (w.status === 'cancelled') {
      statusHistory.push({ status: 'created', progress: 0, actorId: admin._id, at: createdAt })
      statusHistory.push({ status: 'assigned', progress: 0, actorId: admin._id, at: new Date(createdAt.getTime() + HOUR) })
      statusHistory.push({ status: 'cancelled', progress: 0, note: w.cancelReason, actorId: admin._id, at: new Date(createdAt.getTime() + 5 * HOUR) })
    } else if (w.status === 'on_hold') {
      for (const [s, p] of WO_FLOW.slice(0, 5)) statusHistory.push({ status: s, progress: p, actorId: s === 'created' || s === 'assigned' ? admin._id : supUser._id })
      statusHistory.push({ status: 'on_hold', progress: 60, note: w.note, actorId: supUser._id })
      progress = 60
    } else {
      const upto = WO_FLOW.findIndex(([s]) => s === w.status)
      for (const [s, p] of WO_FLOW.slice(0, upto + 1)) {
        statusHistory.push({ status: s, progress: p, actorId: ['created', 'assigned', 'closed'].includes(s) ? admin._id : supUser._id })
        progress = p
      }
    }
    // Spread the timeline evenly between creation and now (or the due date for finished work).
    const end = Math.min(Date.now(), daysAhead(w.dueInDays).getTime())
    const step = Math.max(HOUR, (end - createdAt.getTime()) / Math.max(1, statusHistory.length))
    statusHistory.forEach((h, i) => {
      if (!h.at) h.at = new Date(createdAt.getTime() + i * step)
    })

    const updates = []
    if (progress > 0) {
      updates.push({ authorId: supUser._id, note: 'Technician on site, work in progress.' })
      if (progress === 100) updates.push({ authorId: supUser._id, note: 'Work completed, area cleaned and handed over.' })
    }

    workOrders[w.key] = await WorkOrder.create({
      enterpriseId,
      code: await generateCode('workOrder', enterpriseId),
      clientId: siteClient(w.site),
      siteId: sites[w.site]._id,
      serviceId: svc(w.service),
      title: w.title,
      description: `${w.title}. Raised for ${sites[w.site].name}.`,
      priority: w.priority,
      status: w.status,
      progress,
      assignedEmployeeId: w.status === 'created' ? null : emp[w.tech]._id,
      supervisorId: emp[supKey]._id,
      startDate: w.status === 'created' ? null : daysAgo(w.startedDaysAgo, 10),
      dueDate: daysAhead(w.dueInDays),
      assetId: w.asset ? assets[w.asset]._id : null,
      cancelReason: w.cancelReason ?? null,
      updates,
      statusHistory,
      createdAt,
    })
  }

  // ── Complaints ─────────────────────────────────────────────────────────────
  const COMPLAINTS = [
    { key: 'c1', client: 'gv', site: 'gvB', service: 'CCTV Operator', title: 'Lobby CCTV shows black screen', priority: 'urgent', status: 'work_started', tech: 'cctv', wo: 'wo3', asset: 'cctvB', raisedDaysAgo: 2 },
    { key: 'c2', client: 'gv', site: 'gvA', service: 'Housekeeper', title: 'Washrooms on 5th floor not cleaned', priority: 'normal', status: 'open', raisedDaysAgo: 0 },
    { key: 'c3', client: 'sun', site: 'sun', service: 'Plumber', title: 'Water leakage near pump room', priority: 'high', status: 'acknowledged', tech: 'plumb', wo: 'wo5', asset: 'pump', raisedDaysAgo: 1 },
    { key: 'c4', client: 'sun', site: 'sun', service: 'Electrician', title: 'Frequent tripping in ICU corridor', priority: 'urgent', status: 'assigned', tech: 'elec', raisedDaysAgo: 0 },
    { key: 'c5', client: 'rr', site: 'rrBlock', service: 'STP Operator', title: 'Bad odour from STP area', priority: 'high', status: 'resolved', tech: 'stp', raisedDaysAgo: 8, resolution: 'Aeration blower cleaned and chemical dosing corrected.' },
    { key: 'c6', client: 'rr', site: 'rrClub', service: 'Gardener', title: 'Garden sprinklers not working', priority: 'normal', status: 'closed', tech: 'garden', raisedDaysAgo: 14, resolution: 'Clogged sprinkler heads replaced.' },
  ]
  const complaints = {}
  for (const c of COMPLAINTS) {
    const raisedAt = daysAgo(c.raisedDaysAgo, 8)
    const clientUser = clientUsers[c.client]
    const supUser = staffUsers[supervisorFor(c.site)]
    const history = [{ text: `${clientUser.name} raised the complaint`, status: 'open', actorId: clientUser._id, at: raisedAt }]
    const flow = ['assigned', 'acknowledged', 'work_started', 'resolved', 'client_verification', 'closed']
    const upto = flow.indexOf(c.status)
    flow.slice(0, upto + 1).forEach((s, i) => {
      history.push({
        text: s === 'assigned' ? `Assigned to ${emp[c.tech].name}` : `Status changed to ${s.replace('_', ' ')}`,
        status: s,
        actorId: s === 'assigned' ? admin._id : s === 'closed' ? clientUser._id : supUser._id,
        at: new Date(raisedAt.getTime() + (i + 1) * 2 * HOUR),
      })
    })
    const resolvedEntry = history.find((h) => h.status === 'resolved')
    complaints[c.key] = await Complaint.create({
      enterpriseId,
      code: await generateCode('complaint', enterpriseId),
      clientId: clients[c.client]._id,
      siteId: sites[c.site]._id,
      serviceId: svc(c.service),
      title: c.title,
      description: `${c.title}. Please attend at the earliest.`,
      priority: c.priority,
      status: c.status,
      raisedBy: clientUser._id,
      assignedEmployeeId: c.tech ? emp[c.tech]._id : null,
      workOrderId: c.wo ? workOrders[c.wo]._id : null,
      assetId: c.asset ? assets[c.asset]._id : null,
      resolutionNote: c.resolution ?? null,
      respondedAt: history[1]?.at ?? null,
      resolvedAt: resolvedEntry?.at ?? null,
      history,
      createdAt: raisedAt,
    })
    if (c.wo) await WorkOrder.updateOne({ _id: workOrders[c.wo]._id }, { fromComplaintId: complaints[c.key]._id })
  }

  // Asset lifecycle entries tied to the work orders / complaints above.
  await Asset.updateOne({ _id: assets.cctvB._id }, { $push: { history: { kind: 'complaint', date: daysAgo(2, 8), note: 'Camera not recording.', complaintId: complaints.c1._id, workOrderId: workOrders.wo3._id } } })
  await Asset.updateOne({ _id: assets.dgA._id }, { $push: { history: { kind: 'maintenance', date: daysAgo(10), note: 'Quarterly service: oil, filters, battery check.', workOrderId: workOrders.wo2._id } } })
  await Asset.updateOne({ _id: assets.pump._id }, { $push: { history: { kind: 'repair', date: daysAgo(1), note: 'Mechanical seal leaking — repair started.', complaintId: complaints.c3._id, workOrderId: workOrders.wo5._id } } })

  // ── Site visits ────────────────────────────────────────────────────────────
  const VISITS = [
    { site: 'gvA', visitor: 'sup1', purpose: 'Inspection', daysAgo: 6, observation: 'All floors clean, fire extinguishers within validity.', method: 'qr' },
    { site: 'gvB', visitor: 'sup1', purpose: 'Complaint', daysAgo: 2, observation: 'Lobby camera DVR channel failing, technician assigned.', method: 'gps', wo: 'wo3', complaint: 'c1' },
    { site: 'sun', visitor: 'mgr', purpose: 'Routine Visit', daysAgo: 4, observation: 'Met facility head, reviewed monthly report.', method: 'gps' },
    { site: 'sun', visitor: 'sup1', purpose: 'Maintenance', daysAgo: 1, observation: 'Pump seal replacement in progress.', method: 'qr', wo: 'wo5', complaint: 'c3' },
    { site: 'rrBlock', visitor: 'sup2', purpose: 'Verification', daysAgo: 7, observation: 'STP odour issue verified as resolved.', method: 'gps', complaint: 'c5' },
    { site: 'rrClub', visitor: 'sup2', purpose: 'Inspection', daysAgo: 0, observation: '', method: 'qr', ongoing: true },
  ]
  for (const v of VISITS) {
    const site = sites[v.site]
    const checkIn = v.ongoing ? new Date(Date.now() - HOUR) : daysAgo(v.daysAgo, 11)
    await SiteVisit.create({
      enterpriseId,
      code: await generateCode('siteVisit', enterpriseId),
      clientId: site.clientId,
      siteId: site._id,
      visitorId: emp[v.visitor]._id,
      purpose: v.purpose,
      checkIn,
      checkOut: v.ongoing ? null : new Date(checkIn.getTime() + 90 * 60e3),
      observation: v.observation,
      checkInMethod: v.method,
      checkInLatitude: site.latitude + 0.0003,
      checkInLongitude: site.longitude + 0.0002,
      checkInAccuracyM: 12,
      checkInDistanceM: 38,
      locationVerified: true,
      checkOutLatitude: v.ongoing ? null : site.latitude + 0.0002,
      checkOutLongitude: v.ongoing ? null : site.longitude + 0.0001,
      workOrderId: v.wo ? workOrders[v.wo]._id : null,
      complaintId: v.complaint ? complaints[v.complaint]._id : null,
    })
  }

  // ── Attendance: last 7 days for every employee ─────────────────────────────
  const today = localDay()
  const attendanceRows = []
  const allEmployees = [...STAFF_ACCOUNTS.map((s) => ({ ...s, login: true })), ...TECHNICIANS]
  allEmployees.forEach((e, ei) => {
    for (let d = 6; d >= 0; d--) {
      const date = addDays(today, -d)
      const pattern = (ei + d) % 11
      const status = pattern === 3 ? 'absent' : pattern === 7 ? 'half_day' : pattern === 9 ? 'leave' : 'present'
      const siteKey = e.sites[d % e.sites.length]
      const site = sites[siteKey]
      const checkIn = status === 'present' || status === 'half_day' ? new Date(`${date}T09:${String(5 + ei).padStart(2, '0')}:00+05:30`) : null
      const checkOut = checkIn && !(d === 0) ? new Date(checkIn.getTime() + (status === 'half_day' ? 4 : 9) * HOUR) : null
      attendanceRows.push({
        enterpriseId,
        employeeId: emp[e.key]._id,
        siteId: site._id,
        date,
        status,
        checkIn,
        checkOut,
        checkInLatitude: checkIn ? site.latitude : null,
        checkInLongitude: checkIn ? site.longitude : null,
        checkInDistanceM: checkIn ? 25 : null,
        locationVerified: checkIn && e.login ? true : null,
        source: e.login ? 'self' : 'supervisor',
        markedBy: e.login ? staffUsers[e.key]._id : staffUsers[supervisorFor(e.sites[0])]._id,
        note: status === 'leave' ? 'Approved casual leave' : '',
      })
    }
  })
  await Attendance.insertMany(attendanceRows)

  // ── Contracts ──────────────────────────────────────────────────────────────
  const contracts = {}
  const CONTRACTS = [
    { key: 'gv', client: 'gv', sites: [], title: 'Comprehensive Facility AMC 2026–27', type: 'amc', startDaysAgo: 120, lengthDays: 365, value: 480000, cycle: 'monthly', visits: 12, services: ['Housekeeper', 'Electrician', 'Plumber', 'CCTV Operator', 'DG Operator'] },
    { key: 'sun', client: 'sun', sites: ['sun'], title: 'Hospital Housekeeping & Technical Services Agreement', type: 'service_agreement', startDaysAgo: 345, lengthDays: 365, value: 720000, cycle: 'quarterly', visits: null, services: ['Housekeeper', 'Electrician', 'Plumber', 'DG Operator'] },
    { key: 'rr', client: 'rr', sites: ['rrBlock'], title: 'STP Operation & Maintenance AMC', type: 'amc', startDaysAgo: 60, lengthDays: 365, value: 180000, cycle: 'quarterly', visits: 52, services: ['STP Operator'] },
  ]
  for (const c of CONTRACTS) {
    contracts[c.key] = await Contract.create({
      enterpriseId,
      clientId: clients[c.client]._id,
      siteIds: c.sites.map((k) => sites[k]._id),
      serviceIds: c.services.map(svc),
      code: await generateCode('contract', enterpriseId),
      title: c.title,
      type: c.type,
      startDate: daysAgo(c.startDaysAgo, 0),
      endDate: daysAgo(c.startDaysAgo - c.lengthDays, 0),
      value: c.value,
      billingCycle: c.cycle,
      visitsIncluded: c.visits,
      terms: 'Payment within 30 days of invoice. Consumables billed separately at actuals.',
    })
  }

  // ── Preventive maintenance schedules ───────────────────────────────────────
  const PMS = [
    { site: 'gvA', service: 'DG Operator', tech: 'dg', asset: 'dgA', contract: 'gv', title: 'DG set monthly service', unit: 'month', interval: 1, nextInDays: 12, checklist: ['Check oil and coolant level', 'Inspect battery terminals', 'Run on load for 15 minutes', 'Clean air filter'] },
    { site: 'rrBlock', service: 'STP Operator', tech: 'stp', asset: 'stp', contract: 'rr', title: 'STP weekly inspection', unit: 'week', interval: 1, nextInDays: 5, checklist: ['Check MLSS and pH', 'Inspect blower and diffusers', 'Record treated water quality'] },
    { site: 'gvA', service: 'CCTV Operator', tech: 'cctv', asset: 'cctvA', contract: 'gv', title: 'CCTV quarterly health check', unit: 'month', interval: 3, nextInDays: 40, checklist: ['Clean camera lenses', 'Verify recording retention', 'Check NVR disk health'] },
  ]
  for (const p of PMS) {
    await PmSchedule.create({
      enterpriseId,
      clientId: siteClient(p.site),
      siteId: sites[p.site]._id,
      serviceId: svc(p.service),
      assetId: assets[p.asset]._id,
      contractId: contracts[p.contract]._id,
      code: await generateCode('pmSchedule', enterpriseId),
      title: p.title,
      description: `${p.title} as per AMC.`,
      checklist: p.checklist,
      assignedEmployeeId: emp[p.tech]._id,
      supervisorId: emp[supervisorFor(p.site)]._id,
      frequencyUnit: p.unit,
      frequencyInterval: p.interval,
      startDate: daysAgo(60, 0),
      leadDays: 3,
      nextDueDate: daysAhead(p.nextInDays),
    })
  }

  // ── Quotations & invoices ──────────────────────────────────────────────────
  await Quotation.create({
    enterpriseId,
    clientId: clients.gv._id,
    siteId: sites.gvB._id,
    code: await generateCode('quotation', enterpriseId),
    title: 'Replacement of lobby CCTV camera',
    items: [
      { description: 'Hikvision 4MP dome camera', quantity: 1, unit: 'nos', rate: 6500, taxPercent: 18 },
      { description: 'Installation & configuration', quantity: 1, unit: 'job', rate: 1500, taxPercent: 18 },
    ],
    validUntil: daysAhead(13),
    status: 'sent',
    sentAt: daysAgo(1),
    complaintId: complaints.c1._id,
    workOrderId: workOrders.wo3._id,
    terms: 'Valid for 15 days. 100% payment on completion.',
    createdBy: admin._id,
  })
  const acceptedQuote = await Quotation.create({
    enterpriseId,
    clientId: clients.rr._id,
    siteId: sites.rrBlock._id,
    code: await generateCode('quotation', enterpriseId),
    title: 'Additional CCTV cameras at parking entrance',
    items: [
      { description: 'CP Plus 2MP bullet camera', quantity: 4, unit: 'nos', rate: 3200, taxPercent: 18 },
      { description: 'Cabling (Cat6) and conduit', quantity: 120, unit: 'm', rate: 45, taxPercent: 18 },
      { description: 'Installation labour', quantity: 1, unit: 'job', rate: 4000, taxPercent: 18 },
    ],
    validUntil: daysAgo(20),
    status: 'accepted',
    sentAt: daysAgo(40),
    respondedAt: daysAgo(37),
    responseNote: 'Approved by association committee.',
    workOrderId: workOrders.wo12._id,
    createdBy: admin._id,
  })

  await Invoice.create({
    enterpriseId,
    clientId: clients.rr._id,
    siteId: sites.rrBlock._id,
    code: await generateCode('invoice', enterpriseId),
    title: 'Parking entrance CCTV installation',
    items: acceptedQuote.items.map(({ description, quantity, unit, rate, taxPercent }) => ({ description, quantity, unit, rate, taxPercent })),
    quotationId: acceptedQuote._id,
    workOrderIds: [workOrders.wo12._id],
    issueDate: daysAgo(24),
    dueDate: daysAgo(-6),
    status: 'issued',
    payments: [{ amount: 15000, date: daysAgo(10), method: 'upi', reference: 'UPI-418822019', recordedBy: admin._id }],
    createdBy: admin._id,
  }).then((inv) => Quotation.updateOne({ _id: acceptedQuote._id }, { invoiceId: inv._id }))

  const gvMonthly = Math.round(480000 / 12)
  const paidInvoice = await Invoice.create({
    enterpriseId,
    clientId: clients.gv._id,
    code: await generateCode('invoice', enterpriseId),
    title: 'AMC monthly billing — last month',
    contractId: contracts.gv._id,
    items: [{ description: 'Comprehensive facility AMC — monthly charge', quantity: 1, unit: 'month', rate: gvMonthly, taxPercent: 18 }],
    issueDate: daysAgo(32),
    dueDate: daysAgo(2),
    status: 'issued',
    createdBy: admin._id,
  })
  paidInvoice.payments.push({ amount: paidInvoice.total, date: daysAgo(5), method: 'bank_transfer', reference: 'NEFT-HDFC-77120391', recordedBy: admin._id })
  await paidInvoice.save()

  await Invoice.create({
    enterpriseId,
    clientId: clients.gv._id,
    code: await generateCode('invoice', enterpriseId),
    title: 'AMC monthly billing — this month',
    contractId: contracts.gv._id,
    items: [{ description: 'Comprehensive facility AMC — monthly charge', quantity: 1, unit: 'month', rate: gvMonthly, taxPercent: 18 }],
    dueDate: daysAhead(28),
    status: 'draft',
    createdBy: admin._id,
  })

  // ── Notifications ──────────────────────────────────────────────────────────
  const notify = (userId, title, body, kind, event, linkEntityType, linkEntityId, read = false) => ({
    enterpriseId, userId, title, body, kind, event, linkEntityType, linkEntityId, read,
  })
  const adminIds = [admin._id, opsAdmin._id]
  const notifications = []
  for (const id of adminIds) {
    notifications.push(
      notify(id, 'New complaint raised', `${complaints.c2.code}: ${complaints.c2.title}`, 'complaint', 'complaint_raised', 'Complaint', complaints.c2._id),
      notify(id, 'Urgent complaint raised', `${complaints.c4.code}: ${complaints.c4.title}`, 'complaint', 'complaint_raised', 'Complaint', complaints.c4._id),
      notify(id, 'Work order overdue', `${workOrders.wo8.code}: ${workOrders.wo8.title} is past its due date`, 'overdue', 'work_overdue', 'WorkOrder', workOrders.wo8._id),
      notify(id, 'Work awaiting verification', `${workOrders.wo4.code}: ${workOrders.wo4.title} was marked completed`, 'verification', 'work_completed', 'WorkOrder', workOrders.wo4._id),
      notify(id, 'Contract renewal due', `${contracts.sun.code}: ${contracts.sun.title} expires within 30 days`, 'client', 'contract_expiring', 'Contract', contracts.sun._id, true),
    )
  }
  notifications.push(
    notify(staffUsers.sup1._id, 'Complaint assigned', `${complaints.c4.code}: ${complaints.c4.title}`, 'complaint', 'complaint_assigned', 'Complaint', complaints.c4._id),
    notify(staffUsers.sup1._id, 'New work order', `${workOrders.wo6.code}: ${workOrders.wo6.title}`, 'work_order', 'work_created', 'WorkOrder', workOrders.wo6._id),
    notify(staffUsers.sup2._id, 'New work order', `${workOrders.wo9.code}: ${workOrders.wo9.title}`, 'work_order', 'work_created', 'WorkOrder', workOrders.wo9._id),
    notify(clientUsers.gv._id, 'Work in progress', `${workOrders.wo3.code}: ${workOrders.wo3.title} is 50% complete`, 'work_order', 'progress_update', 'WorkOrder', workOrders.wo3._id),
    notify(clientUsers.gv._id, 'Work completed', `${workOrders.wo4.code}: ${workOrders.wo4.title} has been completed`, 'work_order', 'work_completed', 'WorkOrder', workOrders.wo4._id),
    notify(clientUsers.sun._id, 'Complaint acknowledged', `${complaints.c3.code}: ${complaints.c3.title}`, 'complaint', 'complaint_status', 'Complaint', complaints.c3._id),
    notify(clientUsers.rr._id, 'Complaint resolved', `${complaints.c5.code}: ${complaints.c5.title} — please verify`, 'complaint', 'complaint_resolved', 'Complaint', complaints.c5._id),
    notify(clientUsers.rr._id, 'Site visit completed', `${sites.rrBlock.name}: verification visit completed`, 'site_visit', 'site_visit_completed', 'Site', sites.rrBlock._id, true),
  )
  await Notification.insertMany(notifications)

  // ── Activity log ───────────────────────────────────────────────────────────
  const logs = [
    ...Object.values(clients).map((c) => ({ actorId: admin._id, action: 'created client', entityType: 'Client', entityId: c._id, entityLabel: c.companyName })),
    ...Object.values(sites).map((s) => ({ actorId: admin._id, action: 'created site', entityType: 'Site', entityId: s._id, entityLabel: s.name })),
    ...STAFF_ACCOUNTS.map((s) => ({ actorId: admin._id, action: `created a ${s.role} account`, entityType: 'Account', entityId: staffUsers[s.key]._id, entityLabel: s.name })),
    ...Object.values(workOrders).map((w) => ({ actorId: admin._id, action: 'created work order', entityType: 'Work Order', entityId: w._id, entityLabel: w.code })),
    ...Object.values(contracts).map((c) => ({ actorId: admin._id, action: 'created contract', entityType: 'Contract', entityId: c._id, entityLabel: c.code })),
  ]
  await ActivityLog.insertMany(logs.map((l) => ({ enterpriseId, ...l })))

  console.log(
    `[seed:demo] Created ${CLIENTS.length} clients, ${Object.keys(sites).length} sites, ${Object.keys(emp).length} employees, ` +
      `${WORK_ORDERS.length} work orders, ${COMPLAINTS.length} complaints, ${VISITS.length} site visits, ${attendanceRows.length} attendance rows, ` +
      `${ASSETS.length} assets, ${CONTRACTS.length} contracts, ${PMS.length} PM schedules, 2 quotations, 3 invoices, ${notifications.length} notifications.`,
  )
  return { enterprise }
}

function printCredentials() {
  const rows = [
    ['Admin (admin panel)', 'see SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env'],
    ['Admin (admin panel)', `ops.admin@example.com / ${DEMO_PASSWORD}`],
    ...STAFF_ACCOUNTS.map((s) => [`${s.role} (enterprise app)`, `${s.email} / ${DEMO_PASSWORD}`]),
    ...CLIENTS.map((c) => [`client user (client app)`, `${c.email} or ${c.mobile} / ${DEMO_PASSWORD}`]),
  ]
  console.log('\n[seed:demo] Logins:')
  for (const [who, cred] of rows) console.log(`  ${who.padEnd(28)} ${cred}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  connectDatabase()
    .then(() => seedDemoData())
    .then(() => {
      printCredentials()
      console.log('[seed:demo] Done.')
      return disconnectDatabase()
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed:demo] Failed:', err)
      process.exit(1)
    })
}
