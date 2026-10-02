import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { api, makeWorkOrder, makeWorld, pngForm, startApi, stopApi } from './helpers.js'

before(startApi)
after(stopApi)

describe('enterprise settings', () => {
  it('lets admins edit the company profile and logo', async () => {
    const w = await makeWorld()
    assert.equal((await api('GET', '/enterprise', w.user)).status, 200)
    assert.equal((await api('PATCH', '/enterprise', w.user, { name: 'x' })).status, 403)

    const updated = await api('PATCH', '/enterprise', w.admin, { name: 'TeamGenix FS', phone: '+91 33 4000 1122' })
    assert.equal(updated.data.name, 'TeamGenix FS')

    const first = (await api('POST', '/enterprise/logo', w.admin, pngForm())).data.logoUrl
    assert.equal((await fetch(first)).status, 200)
    const second = (await api('POST', '/enterprise/logo', w.admin, pngForm())).data
    assert.notEqual(second.logoUrl, first)
    assert.equal((await fetch(first)).status, 404, 'old logo cleaned up')
    assert.equal('logoKey' in second, false)
    assert.equal((await api('DELETE', '/enterprise/logo', w.admin)).data.logoUrl, null)
  })

  it('saves per-kind admin notification preferences', async () => {
    const w = await makeWorld()
    const r = await api('PATCH', '/enterprise/notification-preferences', w.admin, { preferences: { complaint: { email: false, push: true } } })
    assert.equal(r.data.notificationPreferences.complaint.email, false)
    assert.equal(r.data.notificationPreferences.overdue.email, true, 'untouched kinds keep defaults')
    assert.equal((await api('PATCH', '/enterprise/notification-preferences', w.admin, { preferences: { bogus: { email: true, push: true } } })).status, 400)
    await api('PATCH', '/enterprise/notification-preferences', w.admin, { preferences: { complaint: { email: true, push: true } } })
  })
})

describe('push devices & preferences', () => {
  it('registers devices and honours personal opt-outs', async () => {
    const w = await makeWorld()
    const token = `fake-fcm-token-${w.tag}-abcdefghij`
    assert.equal((await api('POST', '/notifications/devices', w.user, { token, platform: 'android', app: 'client' })).status, 200)
    assert.equal((await api('POST', '/notifications/devices', w.user, { token: 'x', platform: 'android', app: 'client' })).status, 400)

    assert.equal((await api('GET', '/notifications/preferences', w.user)).data.workUpdates, true)
    const prefs = (await api('PATCH', '/notifications/preferences', w.user, { workUpdates: false })).data
    assert.equal(prefs.workUpdates, false)
    assert.equal(prefs.complaints, true)

    // In-app notifications are kept regardless of the push opt-out.
    await makeWorkOrder(w)
    const events = (await api('GET', '/notifications', w.user)).data.map((n) => n.event)
    assert.ok(events.includes('work_created'))

    assert.equal((await api('DELETE', '/notifications/devices', w.user, { token })).status, 200)
  })
})