// A minimal, Express-5-safe stand-in for express-mongo-sanitize, which
// crashes on Express 5 by trying to reassign req.query (now a read-only
// getter). This only mutates req.body/req.params in place — both remain
// plain, writable objects in Express 5 — stripping any key that starts with
// "$" or contains "." so user input can never inject Mongo operators.
// req.query isn't touched: every query param this API reads is already
// strictly typed by a Zod schema (validate.middleware.js) before use, which
// closes the same hole for query strings.
function stripBadKeys(value) {
  if (Array.isArray(value)) {
    for (const item of value) stripBadKeys(item)
    return value
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete value[key]
        continue
      }
      stripBadKeys(value[key])
    }
  }
  return value
}

export function sanitizeInput(req, res, next) {
  if (req.body) stripBadKeys(req.body)
  if (req.params) stripBadKeys(req.params)
  next()
}
