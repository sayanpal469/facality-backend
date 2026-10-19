import { Invoice } from '../models/Billing.js'
import { generateCode } from './sequence.js'

/**
 * Creates a draft invoice from a priced work order or shop order. The admin
 * reviews/edits it under Billing → Invoices before issuing it to the client.
 */
export async function createDraftInvoice(req, { clientId, siteId = null, title, items, dueDate, notes = '', workOrderIds = [] }) {
  return Invoice.create({
    enterpriseId: req.user.enterpriseId,
    clientId,
    siteId,
    code: await generateCode('invoice', req.user.enterpriseId),
    title,
    items,
    dueDate,
    notes,
    workOrderIds,
    createdBy: req.user._id,
  })
}
