import { Enterprise } from '../models/Enterprise.js'
import { Site } from '../models/Site.js'
import { Product } from '../models/Product.js'
import { ApiError } from './ApiError.js'
import { distanceMeters } from './geo.js'
import { MATERIAL_STATUS } from '../constants/enums.js'

// Straight-line GPS distance understates the drive; this approximates road distance.
export const ROAD_FACTOR = 1.3

export const round2 = (n) => Math.round(n * 100) / 100

/** Approximate road km from the enterprise's hub to a site, or null when either has no GPS location. */
export function roadDistanceKm(commerce, site) {
  if (commerce?.hubLatitude == null || commerce?.hubLongitude == null) return null
  if (site?.latitude == null || site?.longitude == null) return null
  const km = (distanceMeters(commerce.hubLatitude, commerce.hubLongitude, site.latitude, site.longitude) / 1000) * ROAD_FACTOR
  return Math.round(km * 10) / 10
}

/**
 * Transport for delivering `productsValue` worth of products. Nothing to
 * deliver → nothing to charge; otherwise a flat base plus a per-km rate
 * beyond the free radius (or the flat default when distance is unknown).
 */
export function transportCharge(commerce = {}, distanceKm, productsValue) {
  if (!(productsValue > 0)) return 0
  if (commerce.freeTransportAbove > 0 && productsValue >= commerce.freeTransportAbove) return 0
  if (distanceKm == null) return Math.round(commerce.defaultTransportCharge ?? 0)
  const extraKm = Math.max(0, distanceKm - (commerce.transportFreeKm ?? 0))
  return Math.round((commerce.transportBaseCharge ?? 0) + extraKm * (commerce.transportRatePerKm ?? 0))
}

/** Distance + transport charge for delivering to a site. */
export async function deliveryQuote(enterpriseId, siteId, productsValue) {
  const [enterprise, site] = await Promise.all([
    Enterprise.findById(enterpriseId).select('commerce').lean(),
    Site.findById(siteId).select('latitude longitude').lean(),
  ])
  const commerce = enterprise?.commerce ?? {}
  const distanceKm = roadDistanceKm(commerce, site)
  return { distanceKm, transportCharge: transportCharge(commerce, distanceKm, productsValue) }
}

/** Units of a bundled product the client is paying for: pending counts as proposed. */
export function effectiveQuantity(item) {
  if (item.status === MATERIAL_STATUS.REJECTED) return 0
  if (item.status === MATERIAL_STATUS.APPROVED) return item.approvedQuantity ?? item.quantity
  return item.quantity
}

/** Recomputes a work order's pricing totals (and auto transport) in place. */
export async function refreshPricing(workOrder) {
  const p = workOrder.pricing
  if (!p) return
  let proposed = 0
  let effective = 0
  for (const item of p.items) {
    proposed += item.unitPrice * item.quantity
    effective += item.unitPrice * effectiveQuantity(item)
  }
  p.proposedProductsTotal = round2(proposed)
  p.productsTotal = round2(effective)

  if (p.transportMode === 'manual') {
    p.transportCharge = p.productsTotal > 0 ? p.manualTransportCharge : 0
  } else {
    const quote = await deliveryQuote(workOrder.enterpriseId, workOrder.siteId?._id ?? workOrder.siteId, p.productsTotal)
    p.transportCharge = quote.transportCharge
    p.distanceKm = quote.distanceKm
  }

  if (p.items.length === 0) p.clientStatus = 'not_required'
  else p.clientStatus = p.items.some((i) => i.status === MATERIAL_STATUS.PENDING) ? 'pending' : 'responded'
  p.total = round2(p.serviceCharge + p.productsTotal + p.transportCharge)
}

/**
 * Turns admin input `[{ productId, quantity, unitPrice? }]` into work-order
 * line items. A line whose quantity and price didn't change keeps the
 * client's earlier answer; anything new or changed goes back to pending.
 */
export async function buildMaterialItems(enterpriseId, input = [], existing = []) {
  const ids = input.map((i) => String(i.productId))
  if (new Set(ids).size !== ids.length) throw ApiError.badRequest('Each product can only be added once — change its quantity instead')

  const products = await Product.find({ _id: { $in: ids }, enterpriseId }).lean()
  const byId = new Map(products.map((p) => [String(p._id), p]))
  const prevByProduct = new Map(existing.map((i) => [String(i.productId), i]))

  return input.map((line) => {
    const id = String(line.productId)
    const product = byId.get(id)
    const prev = prevByProduct.get(id)
    if (!product && !prev) throw ApiError.badRequest('One or more products were not found')
    if (!prev && product.status !== 'active') throw ApiError.badRequest(`"${product.name}" is inactive and can't be added`)

    const unitPrice = line.unitPrice ?? (prev ? prev.unitPrice : product.price)
    if (prev && prev.quantity === line.quantity && prev.unitPrice === unitPrice) {
      return typeof prev.toObject === 'function' ? prev.toObject() : prev
    }
    const src = product ?? prev
    return {
      ...(prev?._id ? { _id: prev._id } : {}),
      productId: id,
      sku: src.sku ?? '',
      name: src.name,
      unit: src.unit,
      packSize: src.packSize ?? '',
      imageUrl: src.imageUrl ?? null,
      unitPrice,
      quantity: line.quantity,
      approvedQuantity: null,
      status: MATERIAL_STATUS.PENDING,
      clientNote: '',
      respondedAt: null,
    }
  })
}

/** A service's package as pricing input (inactive products are skipped). */
export async function packageAsPricingInput(serviceType) {
  const ids = (serviceType.includedProducts ?? []).map((i) => i.productId)
  const active = new Set((await Product.find({ _id: { $in: ids }, status: 'active' }).select('_id').lean()).map((p) => String(p._id)))
  return {
    serviceCharge: serviceType.serviceCharge ?? 0,
    items: (serviceType.includedProducts ?? []).filter((i) => active.has(String(i.productId))).map((i) => ({ productId: String(i.productId), quantity: i.quantity })),
    transportMode: 'auto',
  }
}
