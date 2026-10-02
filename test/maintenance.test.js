import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { api, makeWorld, startApi, stopApi } from './helpers.js'

before(startApi)
after(stopApi)

const DAY = 864e5
const iso = (ms) => new Date(ms).toISOString().slice(0, 10)

describe('AMC contracts', () => {
  it('derives state, alerts before expiry once, and renews', async () => {
    const w = await makeWorld()
    const other = await makeWorld()
    const { sweepContractRenewals } = await import('../src/services/maintenance.service.js')

    const bad = await api('POST', '/contracts', w.admin, { clientId: w.client._id, siteIds: [other.site._id], title: 'x', startDate: '2026-01-01', endDate: '2026-12-31' })
    assert.equal(bad.status, 400, 'sites must belong to the client')
    assert.equal((await api('POST', '/contracts', w.admin, { clientId: w.client._id, title: 'x', startDate: '2026-05-01', endDate: '2026-01-01' })).status, 400)

    const created = await api('POST', '/contracts', w.admin, {
      clientId: w.client._id,
      siteIds: [w.site._id],
      title: 'CCTV AMC',
      startDate: iso(Date.now() - 300 * DAY),
      endDate: iso(Date.now() + 10 * DAY),
      value: 120000,
      visitsIncluded: 4,
    })
    assert.equal(created.status, 201)
    const contract = created.data
    assert.match(contract.code, /^CT-\d+$/)
    assert.equal(contract.state, 'expiring')

    assert.ok((await api('GET', '/contracts?state=expiring', w.admin)).data.some((c) => c._id === contract._id))
    assert.equal((await api('GET', '/contracts', w.user)).data.length, 1, 'client sees own contract')
    assert.equal((await api('GET', '/contracts', other.user)).data.length, 0)

    assert.ok((await sweepContractRenewals()) >= 1)
    await sweepContractRenewals()
    const alerts = (await api('GET', '/notifications', w.admin)).data.filter((n) => n.event === 'contract_expiring' && n.linkEntityId === contract._id)
    assert.equal(alerts.length, 1)

    const renewed = await api('POST', `/contracts/${contract._id}/renew`, w.admin, { endDate: iso(Date.now() + 400 * DAY), value: 130000 })
    assert.equal(renewed.status, 201)
    assert.equal(renewed.data.renewedFromId, contract._id)
    assert.equal(renewed.data.value, 130000)

    const cancelled = await api('PATCH', `/contracts/${renewed.data._id}`, w.admin, { cancelled: true })
    assert.equal(cancelled.data.state, 'cancelled')
    assert.equal((await api('POST', '/contracts', w.user, { clientId: w.client._id, title: 'x', startDate: '2026-01-01', endDate: '2026-12-31' })).status, 403)
  })
})

describe('preventive maintenance', () => {
  it('generates work orders inside the lead window and advances the schedule', async () => {
    const w = await makeWorld()
    const { sweepPmSchedules } = await import('../src/services/maintenance.service.js')

    const asset = (await api('POST', '/assets', w.admin, { siteId: w.site._id, name: 'DG set', type: 'Generator' })).data
    const contract = (
      await api('POST', '/contracts', w.admin, { clientId: w.client._id, title: 'DG AMC', startDate: iso(Date.now() - DAY), endDate: iso(Date.now() + 365 * DAY) })
    ).data

    const created = await api('POST', '/pm-schedules', w.admin, {
      siteId: w.site._id,
      serviceId: w.types.Electrician,
      assetId: asset._id,
      contractId: contract._id,
      title: 'DG monthly service',
      checklist: ['Check oil', 'Run test 15 min'],
      assignedEmployeeId: w.tech._id,
      frequencyUnit: 'month',
      frequencyInterval: 1,
      startDate: iso(Date.now() + 2 * DAY),
      leadDays: 3,
    })
    assert.equal(created.status, 201)
    const schedule = created.data
    assert.match(schedule.code, /^PM-\d+$/)

    const future = (
      await api('POST', '/pm-schedules', w.admin, {
        siteId: w.site._id,
        serviceId: w.types.Electrician,
        title: 'Quarterly panel check',
        assignedEmployeeId: w.tech._id,
        frequencyUnit: 'month',
        frequencyInterval: 3,
        startDate: iso(Date.now() + 30 * DAY),
      })
    ).data

    assert.ok((await sweepPmSchedules()) >= 1)
    assert.equal(await sweepPmSchedules(), 0, 'no duplicate for the same occurrence')

    const detail = (await api('GET', `/pm-schedules/${schedule._id}`, w.admin)).data
    assert.equal(detail.generatedCount, 1)
    assert.equal(detail.workOrders.length, 1)
    const firstDue = new Date(schedule.nextDueDate)
    const nextDue = new Date(detail.nextDueDate)
    assert.equal(nextDue.getUTCMonth(), (firstDue.getUTCMonth() + 1) % 12, 'advanced one month')

    const wo = (await api('GET', `/work-orders/${detail.workOrders[0]._id}`, w.admin)).data
    assert.equal(wo.assetId.code, asset.code)
    assert.match(wo.description, /Check oil/)
    assert.equal(iso(wo.dueDate), iso(firstDue))

    assert.equal((await api('GET', `/pm-schedules/${future._id}`, w.admin)).data.generatedCount, 0, 'outside lead window')

    // Manual generation + visibility.
    assert.equal((await api('POST', `/pm-schedules/${future._id}/generate`, w.admin)).status, 201)
    assert.equal((await api('GET', '/pm-schedules', w.sup)).data.length, 2, 'supervisor sees their site')
    assert.equal((await api('GET', '/pm-schedules', w.user)).status, 403)
    assert.equal((await api('DELETE', `/pm-schedules/${schedule._id}`, w.admin)).status, 409)

    const contractDetail = (await api('GET', `/contracts/${contract._id}`, w.admin)).data
    assert.equal(contractDetail.schedules.length, 1)
    assert.equal(contractDetail.visitsDone, 1)

    const assetDetail = (await api('GET', `/assets/${asset._id}`, w.admin)).data
    assert.ok(assetDetail.history.some((h) => h.kind === 'maintenance'))
  })
})
