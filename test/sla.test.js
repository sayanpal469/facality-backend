import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { api, makeWorkOrder, makeWorld, startApi, stopApi } from './helpers.js'

before(startApi)
after(stopApi)

const HOUR = 36e5

describe('complaint SLA', () => {
  it('sets due times from the enterprise targets and tracks response/resolution', async () => {
    const w = await makeWorld()
    await api('PATCH', '/enterprise/operations', w.admin, { sla: { urgent: { responseHours: 2, resolutionHours: 10 } } })

    const c = (await api('POST', '/complaints', w.user, { siteId: w.site._id, serviceId: w.types.Electrician, title: 'Sparking DB', priority: 'urgent' })).data
    const created = new Date(c.createdAt).getTime()
    assert.equal(new Date(c.responseDueAt).getTime() - created, 2 * HOUR)
    assert.equal(new Date(c.resolutionDueAt).getTime() - created, 10 * HOUR)
    assert.equal(c.sla.response.state, 'pending')

    await api('PATCH', `/complaints/${c._id}/assign`, w.admin, { assignedEmployeeId: w.tech._id })
    let detail = (await api('GET', `/complaints/${c._id}`, w.admin)).data
    assert.equal(detail.sla.response.state, 'met')
    assert.ok(detail.respondedAt)

    await api('PATCH', `/complaints/${c._id}/status`, w.admin, { status: 'resolved', resolutionNote: 'Fixed' })
    detail = (await api('GET', `/complaints/${c._id}`, w.admin)).data
    assert.equal(detail.sla.resolution.state, 'met')

    // Reopening restarts the resolution clock.
    await api('PATCH', `/complaints/${c._id}/reopen`, w.user, { reason: 'Still sparking' })
    detail = (await api('GET', `/complaints/${c._id}`, w.admin)).data
    assert.equal(detail.resolvedAt, null)
    assert.equal(detail.sla.resolution.state, 'pending')
  })

  it('alerts once on breach and lists breached complaints', async () => {
    const w = await makeWorld()
    const { sweepComplaintSla, sweepOverdueWorkOrders } = await import('../src/services/scheduler.service.js')
    const { Complaint } = await import('../src/models/Complaint.js')

    const c = (await api('POST', '/complaints', w.user, { siteId: w.site._id, serviceId: w.types.Electrician, title: 'No water' })).data
    // Pretend it was raised 5 days ago.
    const past = new Date(Date.now() - 5 * 24 * HOUR)
    await Complaint.updateOne({ _id: c._id }, { $set: { responseDueAt: past, resolutionDueAt: past } })

    const breached = (await api('GET', '/complaints?sla=breached', w.admin)).data.map((x) => x._id)
    assert.ok(breached.includes(c._id))
    assert.ok((await api('GET', '/dashboard/stats', w.admin)).data.complaints.slaBreached >= 1)

    assert.ok((await sweepComplaintSla()) >= 2, 'response + resolution alerts')
    const again = await sweepComplaintSla()
    const alerts = (await api('GET', '/notifications', w.sup)).data.filter((n) => n.event === 'sla_breached' && n.linkEntityId === c._id)
    assert.equal(alerts.length, 2, 'one alert per clock, even after a second sweep')
    assert.equal(again, 0)

    const wo = await makeWorkOrder(w, { title: 'Late job', dueDate: '2020-01-01' })
    await sweepOverdueWorkOrders()
    await sweepOverdueWorkOrders()
    const overdue = (await api('GET', '/notifications', w.sup)).data.filter((n) => n.event === 'work_overdue' && n.linkEntityId === wo._id)
    assert.equal(overdue.length, 1)

    const report = (await api('GET', `/reports/complaint?clientId=${w.client._id}`, w.admin)).data
    assert.equal(report.summary.slaBreached, 1)
    assert.equal(report.rows[0].sla, 'Breached')
  })
})
