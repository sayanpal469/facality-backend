import { ApiError } from '../utils/ApiError.js'

/**
 * Validates a request part against a Zod schema.
 *  - 'body' / 'params' are replaced in place with the parsed value.
 *  - 'query' is NOT reassigned (Express 5 exposes req.query as a getter over
 *    the raw querystring, so `req.query = ...` throws) — it's attached as
 *    req.validatedQuery instead; controllers read from there.
 */
export function validate(schema, part = 'body') {
  return function validateMiddleware(req, res, next) {
    const result = schema.safeParse(req[part])
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
      return next(ApiError.badRequest('Validation failed', details))
    }

    if (part === 'query') {
      req.validatedQuery = result.data
    } else {
      req[part] = result.data
    }
    next()
  }
}
