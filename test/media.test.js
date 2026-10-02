import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { api, makeWorkOrder, makeWorld, pngForm, startApi, stopApi } from './helpers.js'

before(startApi)
after(stopApi)

describe('media uploads', () => {
  it('stores GPS-stamped evidence on a work order and serves it cross-origin', async () => {
    const w = await makeWorld()
    const wo = await makeWorkOrder(w)
    const r = await api('POST', '/media', w.sup, pngForm({ workOrderId: wo._id, stage: 'before', latitude: 22.57, longitude: 88.43 }))
    assert.equal(r.status, 201)
    assert.equal(r.data.siteId, w.site._id, 'site derived from the work order')
    assert.equal(r.data.clientId, w.client._id)
    assert.equal(r.data.latitude, 22.57)

    const file = await fetch(r.data.fileUrl)
    assert.equal(file.status, 200)
    assert.equal(file.headers.get('cross-origin-resource-policy'), 'cross-origin')

    const listed = (await api('GET', `/media?workOrderId=${wo._id}`, w.user)).data
    assert.equal(listed.length, 1)
    assert.equal((await api('DELETE', `/media/${listed[0]._id}`, w.admin)).status, 200)
    assert.equal((await fetch(r.data.fileUrl)).status, 404, 'file removed with the record')
  })

  it('enforces who may attach to what', async () => {
    const a = await makeWorld()
    const b = await makeWorld()
    const wo = await makeWorkOrder(a)
    assert.equal((await api('POST', '/media', b.sup, pngForm({ workOrderId: wo._id }))).status, 404, 'other site')
    assert.equal((await api('POST', '/media', a.user, pngForm({ workOrderId: wo._id }))).status, 403, 'client → work order')

    const cmp = (await api('POST', '/complaints', a.user, { siteId: a.site._id, serviceId: a.types.Electrician, title: 'Leak' })).data
    assert.equal((await api('POST', '/media', a.user, pngForm({ complaintId: cmp._id }))).status, 201)
    assert.equal((await api('POST', '/media', b.user, pngForm({ complaintId: cmp._id }))).status, 404, "another client's complaint")
    assert.equal((await api('POST', '/media', a.sup, pngForm({}))).status, 400, 'no owner')

    const text = new FormData()
    text.append('file', new Blob(['hi'], { type: 'text/plain' }), 'x.txt')
    text.append('workOrderId', wo._id)
    assert.equal((await api('POST', '/media', a.sup, text)).status, 400, 'non-media type')
  })

  it('embeds evidence in complaint and site-visit responses', async () => {
    const w = await makeWorld()
    const cmp = (await api('POST', '/complaints', w.user, { siteId: w.site._id, serviceId: w.types.Electrician, title: 'Leak' })).data
    await api('POST', '/media', w.user, pngForm({ complaintId: cmp._id }))
    await api('POST', '/media', w.sup, pngForm({ complaintId: cmp._id, stage: 'after' }))
    const detail = (await api('GET', `/complaints/${cmp._id}`, w.user)).data
    assert.deepEqual(detail.media.map((m) => m.stage).sort(), ['after', null].sort())

    const visit = (await api('POST', '/site-visits', w.sup, { siteId: w.site._id, purpose: 'Inspection' })).data
    await api('POST', '/media', w.sup, pngForm({ siteVisitId: visit._id }))
    const visits = (await api('GET', `/site-visits?siteId=${w.site._id}`, w.user)).data
    assert.equal(visits[0].media.length, 1)
  })
})