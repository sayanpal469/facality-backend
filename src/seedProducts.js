import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { connectDatabase, disconnectDatabase } from './config/db.js'
import { env } from './config/env.js'
import { seedDatabase } from './seed.js'
import { generateCode } from './utils/sequence.js'
import { buildMaterialItems, deliveryQuote, packageAsPricingInput, refreshPricing } from './utils/pricing.js'
import { PRODUCT_CATALOG, SERVICE_PACKAGES } from './data/productCatalog.js'
import { Client, Enterprise, Product, ProductOrder, ServiceType, Site, User, WorkOrder } from './models/index.js'
import { PRODUCT_ORDER_STATUS, ROLES } from './constants/enums.js'

// Product catalogue + service packages + delivery settings on top of the
// base seed. Idempotent and non-destructive: products are matched by SKU and
// only created when missing, packages are only filled in for services that
// don't have one yet, and the delivery hub is only set when unset — so admin
// edits always survive a re-run.
//
//   npm run seed:products            catalogue, packages, delivery settings
//   npm run seed:products -- --demo  also prices two open work orders and
//                                    places two shop orders for the demo client

const IMAGES = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./data/productImages.json', import.meta.url)), 'utf8'))

// Central Kolkata store — demo sites sit 5–15 km away, so transport varies.
const DEFAULT_COMMERCE = {
  hubAddress: 'TeamGenix Store, 22 Park Circus, Kolkata 700017',
  hubLatitude: 22.539,
  hubLongitude: 88.3654,
  transportBaseCharge: 50,
  transportFreeKm: 5,
  transportRatePerKm: 12,
  defaultTransportCharge: 150,
  freeTransportAbove: 10000,
}

export async function seedProducts({ enterpriseId }) {
  const types = await ServiceType.find({ enterpriseId }).select('name serviceCharge includedProducts').lean()
  const typeIdByName = new Map(types.map((t) => [t.name, t._id]))

  // ── Products ──
  const existing = new Map((await Product.find({ enterpriseId }).select('sku imageUrl').lean()).map((p) => [p.sku, p]))
  const toInsert = []
  let imagesFilled = 0
  for (const row of PRODUCT_CATALOG) {
    const imageUrl = IMAGES[row.sku]?.url ?? null
    const found = existing.get(row.sku)
    if (found) {
      if (!found.imageUrl && imageUrl) {
        await Product.updateOne({ _id: found._id }, { $set: { imageUrl } })
        imagesFilled++
      }
      continue
    }
    toInsert.push({
      enterpriseId,
      sku: row.sku,
      name: row.name,
      description: row.description,
      category: row.category,
      brand: row.brand,
      unit: row.unit,
      packSize: row.packSize,
      price: row.price,
      mrp: row.mrp,
      stock: row.stock,
      imageUrl,
      serviceIds: row.services.map((name) => typeIdByName.get(name)).filter(Boolean),
    })
  }
  if (toInsert.length) await Product.insertMany(toInsert)
  console.log(`[seed:products] ${toInsert.length} products created, ${PRODUCT_CATALOG.length - toInsert.length} already present${imagesFilled ? `, ${imagesFilled} images filled in` : ''}`)

  // ── Service packages ──
  const productIdBySku = new Map((await Product.find({ enterpriseId }).select('sku').lean()).map((p) => [p.sku, p._id]))
  let packages = 0
  for (const t of types) {
    const pkg = SERVICE_PACKAGES[t.name]
    if (!pkg || t.serviceCharge > 0 || t.includedProducts?.length) continue
    const includedProducts = pkg.items.map(([sku, quantity]) => ({ productId: productIdBySku.get(sku), quantity })).filter((i) => i.productId)
    await ServiceType.updateOne({ _id: t._id }, { $set: { serviceCharge: pkg.serviceCharge, description: pkg.description, includedProducts } })
    packages++
  }
  console.log(`[seed:products] ${packages} service packages set up`)

  // ── Delivery settings ──
  const enterprise = await Enterprise.findById(enterpriseId).select('commerce')
  if (enterprise.commerce?.hubLatitude == null) {
    for (const [k, v] of Object.entries(DEFAULT_COMMERCE)) enterprise.set(`commerce.${k}`, v)
    await enterprise.save()
    console.log(`[seed:products] delivery hub set to "${DEFAULT_COMMERCE.hubAddress}"`)
  }
}

/** Demo data for the first demo client (seedDemo.js) — skipped when it isn't there or already has orders. */
export async function seedProductDemo({ enterpriseId }) {
  const client = await Client.findOne({ enterpriseId, email: 'client@example.com' })
  const user = client && (await User.findOne({ clientId: client._id, role: ROLES.USER }))
  if (!client || !user) return console.log('[seed:products] demo client not found — run `npm run seed:demo` first; skipping demo orders')
  if (await ProductOrder.exists({ clientId: client._id })) return console.log('[seed:products] demo orders already present')

  const sites = await Site.find({ clientId: client._id }).sort({ name: 1 })

  // Price up to two open work orders from their service packages.
  const openWorkOrders = await WorkOrder.find({ clientId: client._id, pricing: null, status: { $in: ['created', 'assigned', 'accepted', 'in_progress', 'work_started'] } }).limit(2)
  for (const wo of openWorkOrders) {
    const service = await ServiceType.findById(wo.serviceId)
    const input = await packageAsPricingInput(service)
    if (!input.items.length) continue
    wo.pricing = { serviceCharge: input.serviceCharge, items: await buildMaterialItems(enterpriseId, input.items), transportMode: 'auto' }
    await refreshPricing(wo)
    await wo.save()
    console.log(`[seed:products] priced ${wo.code} at ₹${wo.pricing.total} (awaiting client approval)`)
  }

  // Two shop orders: one delivered, one just placed.
  const pick = async (skus) => Product.find({ enterpriseId, sku: { $in: skus } }).lean()
  const carts = [
    { site: sites[0], skus: [['CLN-001', 10], ['CLN-002', 2], ['CLN-007', 5]], status: PRODUCT_ORDER_STATUS.DELIVERED, daysAgo: 6 },
    { site: sites[1] ?? sites[0], skus: [['ELE-001', 3], ['ELE-005', 1], ['SAF-012', 1]], status: PRODUCT_ORDER_STATUS.PLACED, daysAgo: 0 },
  ]
  for (const cart of carts) {
    const products = await pick(cart.skus.map(([s]) => s))
    const bySku = new Map(products.map((p) => [p.sku, p]))
    const items = cart.skus.filter(([s]) => bySku.has(s)).map(([s, quantity]) => {
      const p = bySku.get(s)
      return { productId: p._id, sku: p.sku, name: p.name, unit: p.unit, packSize: p.packSize, imageUrl: p.imageUrl, unitPrice: p.price, quantity }
    })
    const subtotal = items.reduce((n, i) => n + i.unitPrice * i.quantity, 0)
    const quote = await deliveryQuote(enterpriseId, cart.site._id, subtotal)
    const placedAt = new Date(Date.now() - cart.daysAgo * 864e5)
    const history = [{ status: 'placed', actorId: user._id, at: placedAt }]
    if (cart.status === PRODUCT_ORDER_STATUS.DELIVERED) {
      history.push({ status: 'confirmed', at: new Date(placedAt.getTime() + 2 * 36e5) }, { status: 'dispatched', at: new Date(placedAt.getTime() + 864e5) }, { status: 'delivered', at: new Date(placedAt.getTime() + 2 * 864e5) })
    }
    const order = await ProductOrder.create({
      enterpriseId,
      code: await generateCode('productOrder', enterpriseId),
      clientId: client._id,
      siteId: cart.site._id,
      placedBy: user._id,
      items,
      transportCharge: quote.transportCharge,
      distanceKm: quote.distanceKm,
      status: cart.status,
      statusHistory: history,
      paymentStatus: cart.status === PRODUCT_ORDER_STATUS.DELIVERED ? 'paid' : 'unpaid',
      paidAt: cart.status === PRODUCT_ORDER_STATUS.DELIVERED ? history.at(-1).at : null,
      createdAt: placedAt,
    })
    for (const i of items) await Product.updateOne({ _id: i.productId }, { $inc: { stock: -i.quantity } })
    console.log(`[seed:products] demo order ${order.code} (${order.status}) ₹${order.total}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const demo = process.argv.includes('--demo')
  connectDatabase()
    .then(() => seedDatabase())
    .then(async ({ enterprise }) => {
      console.log(`[seed:products] enterprise "${enterprise.name}" (${env.seed.enterpriseName})`)
      await seedProducts({ enterpriseId: enterprise._id })
      if (demo) await seedProductDemo({ enterpriseId: enterprise._id })
      console.log('[seed:products] Done.')
      return disconnectDatabase()
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed:products] Failed:', err)
      process.exit(1)
    })
}
