import { Media } from '../models/Media.js'

/**
 * Adds a compact `media` array to each plain object in `docs`, looked up by
 * `foreignKey` (e.g. 'complaintId', 'siteVisitId') in one query — so list
 * screens can show evidence thumbnails without a request per row.
 */
export async function attachMedia(docs, foreignKey) {
  const list = Array.isArray(docs) ? docs : [docs]
  const ids = list.map((d) => d._id)
  if (ids.length === 0) return docs

  const media = await Media.find({ [foreignKey]: { $in: ids } })
    .select(`fileUrl fileType stage description createdAt ${foreignKey}`)
    .sort({ createdAt: 1 })
    .lean()

  const byOwner = new Map()
  for (const m of media) {
    const key = String(m[foreignKey])
    if (!byOwner.has(key)) byOwner.set(key, [])
    byOwner.get(key).push({ _id: m._id, fileUrl: m.fileUrl, fileType: m.fileType, stage: m.stage, description: m.description, createdAt: m.createdAt })
  }
  for (const d of list) d.media = byOwner.get(String(d._id)) ?? []
  return docs
}
