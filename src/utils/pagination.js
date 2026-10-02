export function getPagination(query) {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(1000, Math.max(1, Number(query.limit) || 20))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

export function paginatedMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    pageCount: Math.max(1, Math.ceil(total / limit)),
  }
}
