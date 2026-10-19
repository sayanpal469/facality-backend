import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { api, makeWorld, startApi, stopApi } from './helpers.js'

before(startApi)
after(stopApi)

let n = 0
async function makeProduct(w, extra = {}) {
  const r = await api('POST', '/products', w.admin, {
    name: `Product ${w.tag}-${n++}`,
    category: 'Cleaning Supplies',
    unit: 'packet',
    packSize: '1 kg',
    price: 100,
    mrp: Math.round((extra.price ?? 100) * 1.2),
    stock: 50,
    serviceIds: [w.types.Housekeeper],
    ...extra,
  })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  return r.data
}

// Test site sits 0.1° east of the hub: ~10.3 km straight ≈ 13.4 road km.
async function setupDelivery(w) {
  const r = await api('PATCH', '/enterprise/commerce', w.admin, {
    hubAddress: 'Store',
    hubLatitude: 22.5,
    hubLongitude: 88.3,
    transportBaseCharge: 50,
    transportFreeKm: 5,
    transportRatePerKm: 10,
    defaultTransportCharge: 150,
    freeTransportAbove: 0,
  })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  await api('PATCH', `/sites/${w.site._id}`, w.admin, { latitude: 22.5, longitude: 88.4 })
}

describe('product catalogue', () => {
  it('lets admins manage products and clients browse active ones', async () => {
    const w = await makeWorld()
    const p = await makeProduct(w)
    assert.match(p.sku, /^PRD-\d+$/, 'sku generated when blank')
    assert.equal(p.discountPercent, 17)
    assert.equal(p.inStock, true)
    assert.equal(p.serviceIds[0].name, 'Housekeeper')

    assert.equal((await api('POST', '/products', w.admin, { name: 'x', price: 100, mrp: 50 })).status, 400, 'MRP below price')
    assert.equal((await api('POST', '/products', w.user, { name: 'x', price: 1 })).status, 403)
    assert.equal((await api('POST', '/products', w.admin, { name: 'dup', price: 1, sku: p.sku })).status, 409, 'duplicate sku')

    const hidden = await makeProduct(w, { status: 'inactive', serviceIds: [] })
    const asClient = (await api('GET', `/products?search=${w.tag}`, w.user)).data
    assert.ok(asClient.some((x) => x._id === p._id))
    assert.ok(!asClient.some((x) => x._id === hidden._id), 'clients never see inactive products')
    assert.equal((await api('GET', `/products/${hidden._id}`, w.user)).status, 404)
    assert.equal((await api('GET', `/products?search=${w.tag}&status=inactive`, w.admin)).data.length, 1)

    const byService = (await api('GET', `/products?serviceId=${w.types.Housekeeper}&search=${w.tag}`, w.user)).data
    assert.deepEqual(byService.map((x) => x._id), [p._id])

    const meta = (await api('GET', '/products/meta', w.user)).data
    assert.ok(meta.categories.some((c) => c.name === 'Cleaning Supplies'))
    assert.ok(meta.units.includes('packet'))

    const updated = await api('PATCH', `/products/${p._id}`, w.admin, { price: 90, stock: 3 })
    assert.equal(updated.data.price, 90)
    assert.equal(updated.data.lowStock, true)
    assert.equal((await api('PATCH', `/products/${p._id}`, w.admin, { mrp: 10 })).status, 400)

    assert.equal((await api('POST', `/products/${p._id}/stock`, w.admin, { delta: -5 })).status, 400, "can't go below zero")
    assert.equal((await api('POST', `/products/${p._id}/stock`, w.admin, { delta: 7, note: 'restock' })).data.stock, 10)

    const { pngForm } = await import('./helpers.js')
    const img = await api('POST', `/products/${p._id}/image`, w.admin, pngForm())
    assert.equal(img.status, 200)
    assert.match(img.data.imageUrl, /\/uploads\/products\//)

    assert.equal((await api('DELETE', `/products/${hidden._id}`, w.admin)).status, 200)
  })

  it('builds service packages and totals them', async () => {
    const w = await makeWorld()
    const a = await makeProduct(w, { price: 85 })
    const b = await makeProduct(w, { price: 450, serviceIds: [] })

    const bad = await api('PUT', `/services/types/${w.types.Housekeeper}/package`, w.admin, { serviceCharge: 1000, items: [{ productId: a._id, quantity: 1 }, { productId: a._id, quantity: 2 }] })
    assert.equal(bad.status, 400, 'duplicate lines rejected')

    const saved = await api('PUT', `/services/types/${w.types.Housekeeper}/package`, w.admin, {
      serviceCharge: 1200,
      description: 'Bathroom deep clean',
      items: [{ productId: a._id, quantity: 5 }, { productId: b._id, quantity: 1 }],
    })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    assert.equal(saved.data.productsTotal, 85 * 5 + 450)
    assert.equal(saved.data.total, 1200 + 85 * 5 + 450)

    // Bundling tags the product with the service.
    assert.ok((await api('GET', `/products/${b._id}`, w.admin)).data.serviceIds.some((s) => s._id === w.types.Housekeeper))
    assert.equal((await api('GET', `/products/${a._id}`, w.admin)).data.usedInServices[0].name, 'Housekeeper')

    const cats = (await api('GET', '/services/categories', w.user)).data
    const hk = cats.flatMap((c) => c.types).find((t) => t._id === w.types.Housekeeper)
    assert.equal(hk.packageTotal, 2075)
    assert.equal(hk.includedCount, 2)
    assert.equal((await api('GET', `/services/types/${w.types.Housekeeper}/package`, w.user)).data.total, 2075)
    assert.equal((await api('PUT', `/services/types/${w.types.Housekeeper}/package`, w.user, { serviceCharge: 1, items: [] })).status, 403)

    // Deleting a product drops it from packages.
    await api('DELETE', `/products/${b._id}`, w.admin)
    assert.equal((await api('GET', `/services/types/${w.types.Housekeeper}/package`, w.admin)).data.items.length, 1)

    // Reset so other tests sharing the seeded Housekeeper type aren't affected.
    await api('PUT', `/services/types/${w.types.Housekeeper}/package`, w.admin, { serviceCharge: 0, items: [] })
  })
})

describe('work order pricing', () => {
  it('lets the client approve, reduce or reject bundled products', async () => {
    const w = await makeWorld()
    const other = await makeWorld()
    await setupDelivery(w)
    const bleach = await makeProduct(w, { name: 'Bleaching powder', price: 85 })
    const phenyl = await makeProduct(w, { name: 'Phenyl', price: 450 })

    const create = await api('POST', '/work-orders', w.admin, {
      clientId: w.client._id,
      siteId: w.site._id,
      serviceId: w.types.Housekeeper,
      title: 'Bathroom cleaning',
      assignedEmployeeId: w.tech._id,
      dueDate: '2026-12-01',
      pricing: { serviceCharge: 1200, items: [{ productId: bleach._id, quantity: 5 }, { productId: phenyl._id, quantity: 1 }] },
    })
    assert.equal(create.status, 201, JSON.stringify(create.body))
    let p = create.data.pricing
    assert.equal(p.clientStatus, 'pending')
    assert.equal(p.proposedProductsTotal, 875)
    // ≈ 13.4 road km → 50 + (13.4 − 5) × 10
    assert.ok(p.distanceKm > 13 && p.distanceKm < 16, `distance ${p.distanceKm}`)
    assert.equal(p.transportCharge, Math.round(50 + (p.distanceKm - 5) * 10))
    assert.equal(p.total, 1200 + 875 + p.transportCharge)

    const notes = (await api('GET', '/notifications', w.user)).data
    assert.ok(notes.some((x) => x.event === 'materials_approval'), 'client asked to approve')

    const [bleachLine, phenylLine] = p.items
    // Client approves 2 of the 5 packets and rejects the phenyl.
    assert.equal((await api('PATCH', `/work-orders/${create.data._id}/pricing/respond`, w.user, { items: [{ itemId: bleachLine._id, approvedQuantity: 6 }] })).status, 400, 'more than proposed')
    assert.equal((await api('PATCH', `/work-orders/${create.data._id}/pricing/respond`, other.user, { items: [{ itemId: bleachLine._id, approvedQuantity: 1 }] })).status, 404, 'other client')
    assert.equal((await api('PATCH', `/work-orders/${create.data._id}/pricing/respond`, w.admin, { items: [{ itemId: bleachLine._id, approvedQuantity: 1 }] })).status, 403)

    const partial = await api('PATCH', `/work-orders/${create.data._id}/pricing/respond`, w.user, { items: [{ itemId: bleachLine._id, approvedQuantity: 2 }] })
    assert.equal(partial.status, 200)
    assert.equal(partial.data.pricing.clientStatus, 'pending', 'phenyl still undecided')
    assert.equal(partial.data.pricing.productsTotal, 2 * 85 + 450)

    const done = await api('PATCH', `/work-orders/${create.data._id}/pricing/respond`, w.user, { items: [{ itemId: phenylLine._id, approvedQuantity: 0, note: 'We have stock' }] })
    p = done.data.pricing
    assert.equal(p.clientStatus, 'responded')
    assert.equal(p.items[0].status, 'approved')
    assert.equal(p.items[0].approvedQuantity, 2)
    assert.equal(p.items[1].status, 'rejected')
    assert.equal(p.items[1].clientNote, 'We have stock')
    assert.equal(p.productsTotal, 170)
    assert.equal(p.total, 1200 + 170 + p.transportCharge)
    assert.ok((await api('GET', '/notifications', w.admin)).data.some((x) => x.event === 'materials_responded'))

    // Admin raises the bleach to 6 and adds a product: changed/new lines go back to pending, the rest keep their answer.
    const extra = await makeProduct(w, { name: 'Gloves', price: 200 })
    const edited = await api('PUT', `/work-orders/${create.data._id}/pricing`, w.admin, {
      serviceCharge: 1000,
      items: [{ productId: bleach._id, quantity: 6 }, { productId: phenyl._id, quantity: 1 }, { productId: extra._id, quantity: 1, unitPrice: 150 }],
    })
    assert.equal(edited.status, 200, JSON.stringify(edited.body))
    p = edited.data.pricing
    assert.deepEqual(p.items.map((i) => i.status), ['pending', 'rejected', 'pending'])
    assert.equal(p.items[2].unitPrice, 150, 'admin price override')
    assert.equal(p.productsTotal, 6 * 85 + 150)

    // Rejecting everything removes the transport charge too.
    const none = await api('PATCH', `/work-orders/${create.data._id}/pricing/respond`, w.user, {
      items: [{ itemId: p.items[0]._id, approvedQuantity: 0 }, { itemId: p.items[2]._id, approvedQuantity: 0 }],
    })
    assert.equal(none.data.pricing.productsTotal, 0)
    assert.equal(none.data.pricing.transportCharge, 0)
    assert.equal(none.data.pricing.total, 1000)

    // Manual transport.
    const manual = await api('PUT', `/work-orders/${create.data._id}/pricing`, w.admin, {
      serviceCharge: 1000,
      items: [{ productId: bleach._id, quantity: 2 }],
      transportMode: 'manual',
      transportCharge: 300,
    })
    assert.equal(manual.data.pricing.transportCharge, 300)
    assert.equal(manual.data.pricing.total, 1000 + 170 + 300)
    assert.equal((await api('PUT', `/work-orders/${create.data._id}/pricing`, w.admin, { serviceCharge: 1, items: [], transportMode: 'manual' })).status, 400)

    // Invoicing waits for the client, then bills service + approved products + transport.
    assert.equal((await api('POST', `/work-orders/${create.data._id}/invoice`, w.admin, { dueDate: '2026-12-31' })).status, 400, 'client still to review')
    await api('PATCH', `/work-orders/${create.data._id}/pricing/respond`, w.user, { items: [{ itemId: manual.data.pricing.items[0]._id, approvedQuantity: 1 }] })
    const inv = await api('POST', `/work-orders/${create.data._id}/invoice`, w.admin, { dueDate: '2026-12-31' })
    assert.equal(inv.status, 201, JSON.stringify(inv.body))
    assert.equal(inv.data.status, 'draft')
    assert.equal(inv.data.total, 1000 + 85 + 300)
    assert.equal(inv.data.items.length, 3)
    assert.equal((await api('POST', `/work-orders/${create.data._id}/invoice`, w.admin, { dueDate: '2026-12-31' })).status, 409)
    assert.equal((await api('PUT', `/work-orders/${create.data._id}/pricing`, w.admin, { serviceCharge: 1, items: [] })).status, 400, 'locked once invoiced')
  })

  it('copies the service package when asked and stops changes once work completes', async () => {
    const w = await makeWorld()
    const bleach = await makeProduct(w, { price: 85, serviceIds: [w.types.Gardener] })
    await api('PUT', `/services/types/${w.types.Gardener}/package`, w.admin, { serviceCharge: 700, items: [{ productId: bleach._id, quantity: 3 }] })

    const wo = await api('POST', '/work-orders', w.admin, {
      clientId: w.client._id,
      siteId: w.site._id,
      serviceId: w.types.Gardener,
      title: 'Lawn care',
      assignedEmployeeId: w.tech._id,
      dueDate: '2026-12-01',
      applyServicePackage: true,
    })
    assert.equal(wo.status, 201)
    const p = wo.data.pricing
    assert.equal(p.serviceCharge, 700)
    assert.equal(p.items[0].quantity, 3)
    // Site has no GPS → flat default charge (150 unless another test changed it; just check it's applied).
    assert.equal(p.distanceKm, null)
    assert.equal(p.total, 700 + 255 + p.transportCharge)

    await api('PATCH', `/work-orders/${wo.data._id}/override-status`, w.admin, { status: 'completed', reason: 'done' })
    const late = await api('PATCH', `/work-orders/${wo.data._id}/pricing/respond`, w.user, { items: [{ itemId: p.items[0]._id, approvedQuantity: 1 }] })
    assert.equal(late.status, 400)

    await api('PUT', `/services/types/${w.types.Gardener}/package`, w.admin, { serviceCharge: 0, items: [] })
  })
})

describe('shop orders', () => {
  it('quotes, places, fulfils and cancels orders with stock and transport', async () => {
    const w = await makeWorld()
    const other = await makeWorld()
    await setupDelivery(w)
    const a = await makeProduct(w, { price: 200, stock: 10 })
    const b = await makeProduct(w, { price: 50, stock: 2 })

    const quote = await api('POST', '/product-orders/quote', w.user, { siteId: w.site._id, items: [{ productId: a._id, quantity: 3 }, { productId: b._id, quantity: 5 }] })
    assert.equal(quote.status, 200)
    assert.equal(quote.data.subtotal, 850)
    assert.equal(quote.data.issues.length, 1, 'b only has 2')
    assert.ok(quote.data.transportCharge > 0)
    assert.equal((await api('POST', '/product-orders/quote', w.user, { siteId: other.site._id, items: [{ productId: a._id, quantity: 1 }] })).status, 400, "someone else's site")

    assert.equal((await api('POST', '/product-orders', w.user, { siteId: w.site._id, items: [{ productId: b._id, quantity: 5 }] })).status, 400, 'oversell')

    const placed = await api('POST', '/product-orders', w.user, {
      siteId: w.site._id,
      items: [{ productId: a._id, quantity: 3 }, { productId: b._id, quantity: 1 }, { productId: a._id, quantity: 1 }],
      notes: 'Leave at reception',
    })
    assert.equal(placed.status, 201, JSON.stringify(placed.body))
    const order = placed.data
    assert.match(order.code, /^ORD-\d+$/)
    assert.equal(order.items.length, 2, 'duplicate lines merged')
    assert.equal(order.subtotal, 4 * 200 + 50)
    assert.equal(order.total, order.subtotal + order.transportCharge)
    assert.equal((await api('GET', `/products/${a._id}`, w.admin)).data.stock, 6, 'stock reserved')
    assert.ok((await api('GET', '/notifications', w.admin)).data.some((x) => x.event === 'order_placed'))

    assert.equal((await api('GET', `/product-orders/${order._id}`, other.user)).status, 404)
    assert.equal((await api('GET', '/product-orders', other.user)).data.length, 0)
    const mine = await api('GET', '/product-orders', w.user)
    assert.equal(mine.data.length, 1)
    assert.equal(mine.body.meta.byStatus.placed, 1)
    assert.equal((await api('POST', '/product-orders', w.admin, { siteId: w.site._id, items: [{ productId: a._id, quantity: 1 }] })).status, 403)

    // Admin flow.
    assert.equal((await api('PATCH', `/product-orders/${order._id}/status`, w.admin, { status: 'delivered' })).status, 400, 'must go step by step')
    assert.equal((await api('PATCH', `/product-orders/${order._id}/status`, w.user, { status: 'confirmed' })).status, 403)
    const adj = await api('PATCH', `/product-orders/${order._id}`, w.admin, { transportCharge: 99 })
    assert.equal(adj.data.total, 850 + 99)
    await api('PATCH', `/product-orders/${order._id}/status`, w.admin, { status: 'confirmed', expectedDeliveryDate: '2026-11-01' })
    await api('PATCH', `/product-orders/${order._id}/status`, w.admin, { status: 'dispatched', note: 'Van WB-02' })
    assert.equal((await api('PATCH', `/product-orders/${order._id}/cancel`, w.user, { reason: 'late' })).status, 400, 'already dispatched')
    assert.equal((await api('PATCH', `/product-orders/${order._id}`, w.admin, { transportCharge: 1 })).status, 400)
    const delivered = await api('PATCH', `/product-orders/${order._id}/status`, w.admin, { status: 'delivered' })
    assert.equal(delivered.data.status, 'delivered')
    assert.equal(delivered.data.paymentStatus, 'paid', 'cash on delivery collected')
    assert.deepEqual(delivered.data.statusHistory.map((h) => h.status), ['placed', 'confirmed', 'dispatched', 'delivered'])
    assert.ok((await api('GET', '/notifications', w.user)).data.some((x) => x.event === 'order_status'))

    const inv = await api('POST', `/product-orders/${order._id}/invoice`, w.admin, { dueDate: '2026-12-31' })
    assert.equal(inv.status, 201)
    assert.equal(inv.data.total, 949)
    assert.equal((await api('POST', `/product-orders/${order._id}/invoice`, w.admin, { dueDate: '2026-12-31' })).status, 409)

    // Client cancels a fresh order → stock comes back.
    const second = (await api('POST', '/product-orders', w.user, { siteId: w.site._id, items: [{ productId: b._id, quantity: 1 }] })).data
    assert.equal((await api('GET', `/products/${b._id}`, w.admin)).data.stock, 0)
    assert.equal((await api('PATCH', `/product-orders/${second._id}/cancel`, w.user, { reason: '' })).status, 400, 'reason required')
    const cancelled = await api('PATCH', `/product-orders/${second._id}/cancel`, w.user, { reason: 'Ordered by mistake' })
    assert.equal(cancelled.data.status, 'cancelled')
    assert.equal((await api('GET', `/products/${b._id}`, w.admin)).data.stock, 1)

    // A product on orders can't be deleted — only deactivated.
    assert.equal((await api('DELETE', `/products/${a._id}`, w.admin)).status, 409)
  })
})
