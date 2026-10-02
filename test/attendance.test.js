import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { api, makeWorld, startApi, stopApi } from './helpers.js'

before(startApi)
after(stopApi)

describe('attendance', () => {
  it('lets staff clock in and out once a day, geofenced to their site', async () => {
    const w = await makeWorld()
    await api('PATCH', `/sites/${w.site._id}`, w.admin, { latitude: 22.5726, longitude: 88.3639, geofenceRadiusM: 100 })

    const far = await api('POST', '/attendance/clock-in', w.sup, { siteId: w.site._id, latitude: 22.6, longitude: 88.4 })
    assert.equal(far.status, 200, 'warn mode records instead of refusing')
    assert.equal(far.data.locationVerified, false)
    assert.ok(far.data.checkInDistanceM > 100)

    assert.equal((await api('POST', '/attendance/clock-in', w.sup, { siteId: w.site._id })).status, 409)
    assert.equal((await api('POST', '/attendance/clock-out', w.sup)).status, 200)
    assert.equal((await api('POST', '/attendance/clock-out', w.sup)).status, 409)

    const me = (await api('GET', '/attendance/me', w.sup)).data
    assert.equal(me.todayRecord.status, 'present')
    assert.ok(me.todayRecord.checkOut)

    const other = await makeWorld()
    assert.equal((await api('POST', '/attendance/clock-in', other.sup, { siteId: w.site._id })).status, 403, 'not their site')
    assert.equal((await api('POST', '/attendance/clock-in', w.admin, {})).status, 403, 'admins have no attendance')
  })

  it('lets supervisors mark their team and feeds the client app', async () => {
    const w = await makeWorld()
    const other = await makeWorld()
    const gardener = (
      await api('POST', '/employees', w.admin, { name: `Gardener ${w.tag}`, serviceId: w.types.Gardener, assignedSiteIds: [w.site._id], joiningDate: '2026-01-01' })
    ).data

    const sheet = (await api('GET', `/attendance/roster?siteId=${w.site._id}`, w.sup)).data
    assert.ok(sheet.rows.some((r) => r.employee._id === gardener._id))
    assert.equal(sheet.rows.find((r) => r.employee._id === gardener._id).attendance, null)

    const before = (await api('GET', `/sites/${w.site._id}/services-summary`, w.user)).data.find((s) => s.name === 'Gardener')
    assert.equal(before.presentStaff, null, 'unmarked day shows no count')

    const today = sheet.date
    const marked = await api('PUT', '/attendance/mark', w.sup, {
      date: today,
      siteId: w.site._id,
      entries: [
        { employeeId: gardener._id, status: 'present' },
        { employeeId: w.tech._id, status: 'leave', note: 'Sick' },
      ],
    })
    assert.equal(marked.status, 200)
    assert.equal(marked.data.length, 2)

    const svc = (await api('GET', `/sites/${w.site._id}/services-summary`, w.user)).data.find((s) => s.name === 'Gardener')
    assert.equal(svc.presentStaff, 1)
    assert.equal(svc.staff[0].presentToday, true)

    assert.equal((await api('PUT', '/attendance/mark', other.sup, { date: today, entries: [{ employeeId: gardener._id, status: 'absent' }] })).status, 403)
    assert.equal((await api('PUT', '/attendance/mark', w.admin, { date: '2999-01-01', entries: [{ employeeId: gardener._id, status: 'absent' }] })).status, 400)
    assert.equal((await api('GET', `/attendance/roster?siteId=${w.site._id}`, w.user)).status, 403)

    const list = await api('GET', `/attendance?employeeId=${w.tech._id}`, w.admin)
    assert.equal(list.data[0].status, 'leave')
    assert.equal(list.body.meta.summary.leave, 1)
    const teamList = await api('GET', '/attendance', w.sup)
    assert.equal(teamList.body.meta.summary.present, 1)
    assert.equal((await api('GET', `/attendance?employeeId=${w.tech._id}`, other.sup)).status, 403)
  })
})
