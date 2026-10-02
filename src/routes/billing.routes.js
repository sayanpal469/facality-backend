import { Router } from 'express'
import { z } from 'zod'
import * as billing from '../controllers/billing.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/rbac.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { ROLES } from '../constants/enums.js'
import {
  createInvoiceSchema,
  createQuotationSchema,
  invoiceFromQuotationSchema,
  listBillingQuerySchema,
  recordPaymentSchema,
  respondQuotationSchema,
  updateInvoiceSchema,
  updateQuotationSchema,
} from '../validators/billing.validator.js'

const admin = requireRole(ROLES.ADMIN)
const linkWorkOrderSchema = z.object({ workOrderId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id') })

// Admins manage billing; client users read what was sent/issued to them and answer quotations.
export const quotationRoutes = Router()
quotationRoutes.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.USER))
quotationRoutes.get('/', validate(listBillingQuerySchema, 'query'), billing.listQuotations)
quotationRoutes.get('/:id', billing.getQuotation)
quotationRoutes.get('/:id/pdf', billing.quotationPdf)
quotationRoutes.get('/:id/pdf-link', billing.pdfLink('quotations'))
quotationRoutes.post('/', admin, validate(createQuotationSchema), billing.createQuotation)
quotationRoutes.patch('/:id', admin, validate(updateQuotationSchema), billing.updateQuotation)
quotationRoutes.post('/:id/send', admin, billing.sendQuotation)
quotationRoutes.post('/:id/respond', validate(respondQuotationSchema), billing.respondQuotation)
quotationRoutes.post('/:id/work-order', admin, validate(linkWorkOrderSchema), billing.linkQuotationWorkOrder)
quotationRoutes.post('/:id/invoice', admin, validate(invoiceFromQuotationSchema), billing.invoiceFromQuotation)

export const invoiceRoutes = Router()
invoiceRoutes.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.USER))
invoiceRoutes.get('/', validate(listBillingQuerySchema, 'query'), billing.listInvoices)
invoiceRoutes.get('/:id', billing.getInvoice)
invoiceRoutes.get('/:id/pdf', billing.invoicePdf)
invoiceRoutes.get('/:id/pdf-link', billing.pdfLink('invoices'))

// Signed, unauthenticated PDF links (opened in the phone's browser).
export const publicBillingRoutes = Router()
publicBillingRoutes.get('/pdf/:kind/:id', billing.publicPdf)
invoiceRoutes.post('/', admin, validate(createInvoiceSchema), billing.createInvoice)
invoiceRoutes.patch('/:id', admin, validate(updateInvoiceSchema), billing.updateInvoice)
invoiceRoutes.post('/:id/issue', admin, billing.issueInvoice)
invoiceRoutes.post('/:id/payments', admin, validate(recordPaymentSchema), billing.recordPayment)
invoiceRoutes.delete('/:id/payments/:paymentId', admin, billing.removePayment)
invoiceRoutes.post('/:id/cancel', admin, billing.cancelInvoice)
