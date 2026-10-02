import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { api, makeWorkOrder, makeWorld, startApi, stopApi } from './helpers.js'

before(startApi)
after(stopApi)

describe('assets', () => {
  it('tracks equipment through complaint → repair work order → history', async () => {
    const w = await makeWorld()
    const other = await makeWorld()

    const created = await api('POST', '/assets', w.admin, {
      siteId: w.site._id,
      name: 'Gate camera 1',
      type: 'CCTV Camera',
      brand: 'Hikvision',
      location: 'Main gate',
      installDate: '2026-01-15',
    })
    assert.equal(created.status, 201)
    const asset = created.data
    assert.match(asset.code, /^AST-\d+$/)
    assert.equal(asset.clientId, w.client._id, 'client derived from site')
    assert.equal(asset.history[0].kind, 'installation')

    assert.equal((await api('POST', '/assets', w.user, { siteId: w.site._id, name: 'x', type: 'y' })).status, 403)

    // Client raises a complaint against the camera → it is flagged faulty.
    const complaint = await api('POST', '/complaints', w.user, { siteId: w.site._id, serviceId: w.types.Electrician, title: 'Camera offline', assetId: asset._id })
    assert.equal(complaint.status, 201)
    assert.equal((await api('POST', '/complaints', other.user, { siteId: other.site._id, serviceId: other.types.Electrician, title: 'x', assetId: asset._id })).status, 400)

    // A work order from that complaint inherits the equipment.
    const wo = await makeWorkOrder(w, { title: 'Replace camera PSU', fromComplaintId: complaint.data._id })
    assert.equal(wo.assetId, asset._id)

    const detail = (await api('GET', `/assets/${asset._id}`, w.admin)).data
    assert.equal(detail.status, 'faulty')
    assert.deepEqual(detail.history.map((h) => h.kind).sort(), ['complaint', 'installation', 'repair'])
    assert.equal(detail.workOrders.length, 1)
    assert.equal(detail.complaints.length, 1)

    // Supervisor logs the repair → back in service.
    const logged = await api('POST', `/assets/${asset._id}/history`, w.sup, { kind: 'repair', note: 'PSU replaced', workOrderId: wo._id })
    assert.equal(logged.status, 201)
    assert.equal(logged.data.status, 'active')
    assert.equal((await api('POST', `/assets/${asset._id}/history`, other.sup, { kind: 'note', note: 'x' })).status, 404, 'other site')

    // Scoping.
    assert.equal((await api('GET', '/assets', w.user)).data.length, 1)
    assert.equal((await api('GET', '/assets', other.user)).data.length, 0)
    assert.equal((await api('GET', `/assets?siteId=${w.site._id}&search=gate`, w.sup)).data.length, 1)
    assert.ok((await api('GET', '/assets/types', w.admin)).data.includes('CCTV Camera'))

    const retired = await api('PATCH', `/assets/${asset._id}`, w.admin, { status: 'retired', statusNote: 'End of life' })
    assert.equal(retired.data.history.at(-1).kind, 'replacement')
    assert.equal((await api('DELETE', `/assets/${asset._id}`, w.admin)).status, 409, 'linked records block delete')

    const woDetail = (await api('GET', `/work-orders/${wo._id}`, w.admin)).data
    assert.equal(woDetail.assetId.code, asset.code)
  })
})
