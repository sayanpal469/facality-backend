import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { api, login, makeWorkOrder, makeWorld, startApi, stopApi } from './helpers.js'

before(startApi)
after(stopApi)

const REJECTION = '\u27e6NEEDS_CORRECTION\u27e7'

describe('work order lifecycle (client app view)', () => {
  it('records every status change and lets the client approve verified work', async () => {
    const w = await makeWorld()
    const wo = await makeWorkOrder(w)
    assert.equal(wo.statusHistory.length, 1)

    await api('PATCH', `/work-orders/${wo._id}/status`, w.sup, { status: 'work_started', progress: 5 })
    await api('POST', `/work-orders/${wo._id}/updates`, w.sup, { note: 'Cabling done' })
    await api('POST', `/work-orders/${wo._id}/updates`, w.sup, { note: `${REJECTION}redo` })
    await api('PATCH', `/work-orders/${wo._id}/status`, w.sup, { status: 'completed', progress: 100 })

    assert.equal((await api('PATCH', `/work-orders/${wo._id}/client-approve`, w.user)).status, 400, 'not before verification')
    await api('PATCH', `/work-orders/${wo._id}/status`, w.sup, { status: 'verified' })

    const detail = (await api('GET', `/work-orders/${wo._id}`, w.user)).data
    assert.deepEqual(detail.statusHistory.map((h) => h.status), ['created', 'work_started', 'completed', 'verified'])
    assert.equal(detail.assignedEmployeeId.serviceId.name, 'Electrician')
    assert.equal(detail.serviceId.categoryId.name, 'Technical Services')

    assert.equal((await api('PATCH', `/work-orders/${wo._id}/client-approve`, w.sup)).status, 403, 'client-only')
    const approved = await api('PATCH', `/work-orders/${wo._id}/client-approve`, w.user)
    assert.equal(approved.data.status, 'closed')

    const events = (await api('GET', '/notifications?limit=50', w.user)).data.map((n) => n.event)
    for (const e of ['work_created', 'work_started', 'progress_update', 'work_completed', 'work_verified']) assert.ok(events.includes(e), e)
    const bodies = (await api('GET', '/notifications?limit=50', w.user)).data.map((n) => n.body).join(' ')
    assert.ok(!bodies.includes('NEEDS_CORRECTION'), 'supervisor rejections stay internal')
  })

  it('notifies admins when work is put on hold', async () => {
    const w = await makeWorld()
    const wo = await makeWorkOrder(w)
    await api('PATCH', `/work-orders/${wo._id}/status`, w.sup, { status: 'on_hold' })
    const notes = (await api('GET', '/notifications?limit=50', w.admin)).data
    assert.ok(notes.some((n) => n.kind === 'employee' && n.body.includes(wo.code)))
  })
})

describe('complaints', () => {
  it('runs raise → assign → resolve → reopen → confirm with a readable history', async () => {
    const w = await makeWorld()
    const wo = await makeWorkOrder(w)
    const created = await api('POST', '/complaints', w.user, { siteId: w.site._id, serviceId: w.types.Electrician, title: 'Flicker', workOrderId: wo._id })
    assert.equal(created.data.workOrderCode, wo.code)
    const id = created.data._id

    assert.equal((await api('PATCH', `/complaints/${id}/status`, w.user, { status: 'closed' })).status, 403, 'cannot close unresolved')
    await api('PATCH', `/complaints/${id}/assign`, w.sup, { assignedEmployeeId: w.tech._id })
    await api('PATCH', `/complaints/${id}/status`, w.sup, { status: 'resolved', resolutionNote: 'Replaced driver' })
    const reopened = await api('PATCH', `/complaints/${id}/reopen`, w.user, { reason: 'Still flickering' })
    assert.equal(reopened.data.status, 'work_started')
    await api('PATCH', `/complaints/${id}/status`, w.sup, { status: 'resolved' })
    assert.equal((await api('PATCH', `/complaints/${id}/status`, w.user, { status: 'closed' })).data.status, 'closed')

    const detail = (await api('GET', `/complaints/${id}`, w.user)).data
    assert.equal(detail.history.length, 6)
    assert.match(detail.history.at(-1).text, /Resolution confirmed/)

    const adminEvents = (await api('GET', '/notifications?limit=50', w.admin)).data.map((n) => n.event)
    assert.ok(adminEvents.includes('complaint_raised') && adminEvents.includes('complaint_reopened'))
  })

  it("rejects linking another client's work order", async () => {
    const a = await makeWorld()
    const b = await makeWorld()
    const wo = await makeWorkOrder(b)
    const r = await api('POST', '/complaints', a.user, { siteId: a.site._id, serviceId: a.types.Electrician, title: 'x', workOrderId: wo._id })
    assert.equal(r.status, 400)
  })
})

describe('services summary & site visits', () => {
  it('reports per-service counts, staff and visit details to the client', async () => {
    const w = await makeWorld()
    await api('POST', '/employees', w.admin, { name: 'Gardener One', serviceId: w.types.Gardener, assignedSiteIds: [w.site._id], joiningDate: '2026-01-01' })
    const wo = await makeWorkOrder(w)
    await api('PATCH', `/work-orders/${wo._id}/override-status`, w.admin, { status: 'closed', reason: 'test' })

    const summary = (await api('GET', `/sites/${w.site._id}/services-summary`, w.user)).data
    const el = summary.find((s) => s.name === 'Electrician')
    const gd = summary.find((s) => s.name === 'Gardener')
    assert.equal(el.kind, 'work')
    assert.equal(el.completedWorks, 1)
    assert.equal(el.history.length, 1)
    assert.equal(gd.kind, 'staffing')
    assert.equal(gd.staff[0].name, 'Gardener One')

    const visit = (await api('POST', '/site-visits', w.sup, { siteId: w.site._id, purpose: 'Inspection', workOrderId: wo._id })).data
    await api('PATCH', `/site-visits/${visit._id}/check-out`, w.sup, { observation: 'All good' })
    const visits = (await api('GET', `/site-visits?workOrderId=${wo._id}`, w.user)).data
    assert.equal(visits[0].visitorId.serviceId.name, 'Technical Supervisor')
    const events = (await api('GET', '/notifications?limit=50', w.user)).data.map((n) => n.event)
    assert.ok(events.includes('site_visit_completed'))
  })
})

describe('data scoping', () => {
  it("keeps one client out of another's records", async () => {
    const a = await makeWorld()
    const b = await makeWorld()
    const wo = await makeWorkOrder(a)
    assert.equal((await api('GET', `/work-orders/${wo._id}`, b.user)).status, 404)
    assert.equal((await api('GET', `/sites/${a.site._id}/services-summary`, b.user)).status, 404)
    assert.equal((await api('GET', `/work-orders?siteId=${a.site._id}`, b.user)).data.length, 0)
  })

  it("keeps a supervisor out of other sites' work", async () => {
    const a = await makeWorld()
    const b = await makeWorld()
    const wo = await makeWorkOrder(a)
    assert.equal((await api('PATCH', `/work-orders/${wo._id}/status`, b.sup, { status: 'work_started' })).status, 404)
  })

  it('turns staff accounts away from client-only actions', async () => {
    const w = await makeWorld()
    assert.ok(await login({ identifier: w.clientEmail, password: w.clientPassword }))
    const cmp = (await api('POST', '/complaints', w.user, { siteId: w.site._id, serviceId: w.types.Electrician, title: 'x' })).data
    assert.equal((await api('PATCH', `/complaints/${cmp._id}/reopen`, w.sup, { reason: 'x' })).status, 403)
  })
})