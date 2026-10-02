import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { api, makeWorld, startApi, stopApi } from './helpers.js'

before(startApi)
after(stopApi)

function pdfForm(fields) {
  const form = new FormData()
  form.append('file', new Blob([Buffer.from('%PDF-1.4\n%%EOF\n')], { type: 'application/pdf' }), 'agreement.pdf')
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v))
  return form
}

describe('client documents', () => {
  it('lets admins upload and clients read only visible documents', async () => {
    const w = await makeWorld()
    const other = await makeWorld()

    const shared = await api('POST', '/documents', w.admin, pdfForm({ clientId: w.client._id, title: 'Service agreement', category: 'agreement', expiresOn: '2027-03-31' }))
    assert.equal(shared.status, 201)
    assert.equal(shared.data.category, 'agreement')
    assert.equal('storageKey' in shared.data, false)
    assert.equal((await fetch(shared.data.fileUrl)).status, 200)

    const hidden = await api('POST', '/documents', w.admin, pdfForm({ clientId: w.client._id, title: 'Internal costing', visibleToClient: 'false' }))
    assert.equal(hidden.data.visibleToClient, false)

    assert.equal((await api('POST', '/documents', w.admin, pdfForm({ clientId: w.client._id, siteId: other.site._id, title: 'x' }))).status, 400, 'site must belong to client')
    assert.equal((await api('POST', '/documents', w.user, pdfForm({ clientId: w.client._id, title: 'x' }))).status, 403)
    assert.equal((await api('POST', '/documents', w.admin, pdfForm({ clientId: w.client._id }))).status, 400, 'title required')

    const adminList = (await api('GET', `/documents?clientId=${w.client._id}`, w.admin)).data
    assert.equal(adminList.length, 2)

    const clientList = (await api('GET', '/documents', w.user)).data
    assert.deepEqual(clientList.map((d) => d.title), ['Service agreement'])
    assert.equal((await api('GET', `/documents/${hidden.data._id}`, w.user)).status, 404)
    assert.equal((await api('GET', '/documents', other.user)).data.length, 0, 'other clients see nothing')

    const patched = await api('PATCH', `/documents/${hidden.data._id}`, w.admin, { visibleToClient: true, title: 'Costing v2' })
    assert.equal(patched.data.title, 'Costing v2')
    assert.equal((await api('GET', '/documents', w.user)).data.length, 2)

    assert.equal((await api('DELETE', `/documents/${shared.data._id}`, w.admin)).status, 200)
    assert.equal((await fetch(shared.data.fileUrl)).status, 404, 'file removed from storage')
  })
})
