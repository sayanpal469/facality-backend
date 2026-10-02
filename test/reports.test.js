import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { api, makeWorkOrder, makeWorld, startApi, stopApi } from './helpers.js'

let base
before(async () => {
  base = await startApi()
})
after(stopApi)

async function download(path, token) {
  const res = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } })
  return { status: res.status, type: res.headers.get('content-type') || '', disposition: res.headers.get('content-disposition') || '', bytes: Buffer.from(await res.arrayBuffer()) }
}

describe('reports', () => {
  it('filters by client and date range', async () => {
    const w = await makeWorld()
    await makeWorkOrder(w, { title: 'Report me' })

    const mine = (await api('GET', `/reports/work?clientId=${w.client._id}`, w.admin)).data
    assert.equal(mine.summary.total, 1)
    assert.equal(mine.rows[0].title, 'Report me')
    assert.equal(mine.rows[0].site, w.site.name)

    const past = (await api('GET', `/reports/work?clientId=${w.client._id}&dateTo=2020-01-01`, w.admin)).data
    assert.equal(past.summary.total, 0)
    const today = new Date().toISOString().slice(0, 10)
    assert.equal((await api('GET', `/reports/work?clientId=${w.client._id}&dateFrom=${today}&dateTo=${today}`, w.admin)).data.summary.total, 1, 'dateTo covers the whole day')

    assert.equal((await api('GET', '/reports/work?dateFrom=nope', w.admin)).status, 400)
    assert.equal((await api('GET', '/reports/work', w.user)).status, 403)
  })

  it('exports every report as Excel and PDF', async () => {
    const w = await makeWorld()
    await makeWorkOrder(w)
    for (const type of ['work', 'service', 'employee', 'complaint', 'client']) {
      const xlsx = await download(`/reports/${type}/export?format=xlsx&clientId=${w.client._id}`, w.admin)
      assert.equal(xlsx.status, 200, `${type} xlsx`)
      assert.match(xlsx.type, /spreadsheetml/)
      assert.match(xlsx.disposition, new RegExp(`${type}-report-.*\\.xlsx`))
      assert.equal(xlsx.bytes.subarray(0, 2).toString(), 'PK', 'xlsx is a zip')

      const pdf = await download(`/reports/${type}/export?format=pdf`, w.admin)
      assert.equal(pdf.status, 200, `${type} pdf`)
      assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-')
    }
    assert.equal((await download('/reports/bogus/export', w.admin)).status, 404)
    assert.equal((await download('/reports/work/export', w.user)).status, 403)
  })
})
