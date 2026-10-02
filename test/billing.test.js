import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { api, makeWorld, startApi, stopApi } from './helpers.js'

let base
before(async () => {
  base = await startApi()
})
after(stopApi)

const DAY = 864e5
const UNKNOWN_ID = '0123456789abcdef01234567'
const iso = (ms) => new Date(ms).toISOString().slice(0, 10)

async function pdf(path, token) {
  const res = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } })
  return { status: res.status, head: Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString() }
}

describe('quotations & invoices', () => {
  it('runs quote → client accepts → invoice → payments', async () => {
    const w = await makeWorld()
    const other = await makeWorld()

    const draft = await api('POST', '/quotations', w.admin, {
      clientId: w.client._id,
      siteId: w.site._id,
      title: 'Install 4 CCTV cameras',
      validUntil: iso(Date.now() + 15 * DAY),
      items: [
        { description: 'IP camera 4MP', quantity: 4, rate: 3500, taxPercent: 18 },
        { description: 'Installation labour', quantity: 1, unit: 'job', rate: 2000, taxPercent: 18 },
      ],
    })
    assert.equal(draft.status, 201)
    const q = draft.data
    assert.match(q.code, /^QT-\d+$/)
    assert.equal(q.subtotal, 16000)
    assert.equal(q.taxTotal, 2880)
    assert.equal(q.total, 18880)

    assert.equal((await api('GET', '/quotations', w.user)).data.length, 0, 'drafts are hidden from the client')
    assert.equal((await api('POST', '/quotations', w.admin, { clientId: w.client._id, title: 'x', validUntil: iso(Date.now() + DAY), items: [] })).status, 400)
    assert.equal((await api('POST', '/quotations', w.admin, { clientId: w.client._id, siteId: other.site._id, title: 'x', validUntil: iso(Date.now() + DAY), items: [{ description: 'a', quantity: 1, rate: 1 }] })).status, 400)

    assert.equal((await api('POST', `/quotations/${q._id}/send`, w.admin)).data.state, 'sent')
    const clientView = (await api('GET', '/quotations', w.user)).data
    assert.equal(clientView.length, 1)
    assert.equal((await api('GET', '/quotations', other.user)).data.length, 0)
    assert.equal((await pdf(`/quotations/${q._id}/pdf`, w.user)).head, '%PDF-')

    assert.equal((await api('POST', `/quotations/${q._id}/invoice`, w.admin, { dueDate: iso(Date.now() + 30 * DAY) })).status, 400, 'must be accepted first')
    const accepted = await api('POST', `/quotations/${q._id}/respond`, w.user, { decision: 'accepted', note: 'Go ahead' })
    assert.equal(accepted.data.status, 'accepted')
    assert.ok((await api('GET', '/notifications', w.admin)).data.some((n) => n.title === 'Quotation accepted'))
    assert.equal((await api('PATCH', `/quotations/${q._id}`, w.admin, { title: 'x' })).status, 400, 'accepted quotes are locked')

    const inv = await api('POST', `/quotations/${q._id}/invoice`, w.admin, { dueDate: iso(Date.now() + 30 * DAY) })
    assert.equal(inv.status, 201)
    const invoice = inv.data
    assert.match(invoice.code, /^INV-\d+$/)
    assert.equal(invoice.total, 18880)
    assert.equal(invoice.state, 'draft')
    assert.equal((await api('POST', `/quotations/${q._id}/invoice`, w.admin, { dueDate: iso(Date.now() + 30 * DAY) })).status, 409)

    assert.equal((await api('GET', '/invoices', w.user)).data.length, 0, 'draft invoices hidden')
    assert.equal((await api('POST', `/invoices/${invoice._id}/payments`, w.admin, { amount: 100 })).status, 400, 'must be issued')
    assert.equal((await api('POST', `/invoices/${invoice._id}/issue`, w.admin)).data.state, 'unpaid')
    assert.equal((await api('PATCH', `/invoices/${invoice._id}`, w.admin, { title: 'x' })).status, 400, 'issued invoices are locked')

    const part = await api('POST', `/invoices/${invoice._id}/payments`, w.admin, { amount: 10000, method: 'upi', reference: 'UTR123' })
    assert.equal(part.data.state, 'partially_paid')
    assert.equal(part.data.balance, 8880)
    assert.equal((await api('POST', `/invoices/${invoice._id}/payments`, w.admin, { amount: 9000 })).status, 400, 'overpayment refused')

    const list = await api('GET', '/invoices', w.user)
    assert.equal(list.data.length, 1)
    assert.equal(list.body.meta.outstanding, 8880)
    assert.equal((await pdf(`/invoices/${invoice._id}/pdf`, w.user)).head, '%PDF-')
    assert.equal((await pdf(`/invoices/${invoice._id}/pdf`, other.user)).status, 404)

    // Signed browser links for the apps: work without auth, but not when tampered with.
    const link = (await api('GET', `/invoices/${invoice._id}/pdf-link`, w.user)).data.url
    const signed = await fetch(link)
    assert.equal(signed.status, 200)
    assert.equal(Buffer.from(await signed.arrayBuffer()).subarray(0, 5).toString(), '%PDF-')
    assert.equal((await fetch(link.replace(/sig=[^&]+/, 'sig=forged'))).status, 403)
    assert.equal((await fetch(link.replace(invoice._id, UNKNOWN_ID))).status, 403)
    assert.equal((await api('GET', `/invoices/${invoice._id}/pdf-link`, other.user)).status, 404)

    const paid = await api('POST', `/invoices/${invoice._id}/payments`, w.admin, { amount: 8880 })
    assert.equal(paid.data.state, 'paid')
    assert.equal((await api('GET', '/invoices?state=paid', w.admin)).data.some((i) => i._id === invoice._id), true)
    assert.equal((await api('POST', `/invoices/${invoice._id}/cancel`, w.admin)).status, 400, 'paid invoices cannot be cancelled')

    // A standalone overdue invoice.
    const late = (
      await api('POST', '/invoices', w.admin, { clientId: w.client._id, title: 'AMC Q1', dueDate: '2020-01-31', items: [{ description: 'AMC quarter 1', quantity: 1, rate: 30000 }] })
    ).data
    await api('POST', `/invoices/${late._id}/issue`, w.admin)
    assert.ok((await api('GET', '/invoices?state=overdue', w.admin)).data.some((i) => i._id === late._id))
    assert.equal((await api('POST', '/invoices', w.user, { clientId: w.client._id, title: 'x', dueDate: '2030-01-01', items: [{ description: 'a', quantity: 1, rate: 1 }] })).status, 403)
  })
})
