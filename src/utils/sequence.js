import { Counter } from '../models/Counter.js'

const PREFIXES = {
  workOrder: { prefix: 'WO-', start: 10200 },
  complaint: { prefix: 'CMP-', start: 5100 },
  siteVisit: { prefix: 'SV-', start: 7300 },
  employee: { prefix: 'EMP-', start: 1000 },
  asset: { prefix: 'AST-', start: 1000 },
  pmSchedule: { prefix: 'PM-', start: 100 },
  contract: { prefix: 'CT-', start: 1000 },
  invoice: { prefix: 'INV-', start: 10001 },
  quotation: { prefix: 'QT-', start: 2001 },
}

/** Atomically reserves the next number for (entityKind, enterpriseId) and formats it, e.g. "WO-10245". */
export async function generateCode(entityKind, enterpriseId) {
  const { prefix, start } = PREFIXES[entityKind]
  const key = `${entityKind}:${enterpriseId}`
  const counter = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })
  return `${prefix}${start + counter.seq - 1}`
}
