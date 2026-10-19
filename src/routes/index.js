import { Router } from 'express'
import authRoutes from './auth.routes.js'
import accountRoutes from './account.routes.js'
import clientRoutes from './client.routes.js'
import siteRoutes from './site.routes.js'
import serviceRoutes from './service.routes.js'
import employeeRoutes from './employee.routes.js'
import workOrderRoutes from './workOrder.routes.js'
import complaintRoutes from './complaint.routes.js'
import siteVisitRoutes from './siteVisit.routes.js'
import mediaRoutes from './media.routes.js'
import notificationRoutes from './notification.routes.js'
import activityLogRoutes from './activityLog.routes.js'
import dashboardRoutes from './dashboard.routes.js'
import reportRoutes from './report.routes.js'
import enterpriseRoutes from './enterprise.routes.js'
import documentRoutes from './document.routes.js'
import attendanceRoutes from './attendance.routes.js'
import assetRoutes from './asset.routes.js'
import { contractRoutes, pmScheduleRoutes } from './contract.routes.js'
import { invoiceRoutes, publicBillingRoutes, quotationRoutes } from './billing.routes.js'
import { productOrderRoutes, productRoutes } from './product.routes.js'

const router = Router()

router.get('/health', (req, res) => res.json({ success: true, message: 'ok', time: new Date().toISOString() }))

router.use('/auth', authRoutes)
router.use('/accounts', accountRoutes)
router.use('/clients', clientRoutes)
router.use('/sites', siteRoutes)
router.use('/services', serviceRoutes)
router.use('/employees', employeeRoutes)
router.use('/work-orders', workOrderRoutes)
router.use('/complaints', complaintRoutes)
router.use('/site-visits', siteVisitRoutes)
router.use('/media', mediaRoutes)
router.use('/notifications', notificationRoutes)
router.use('/activity-logs', activityLogRoutes)
router.use('/dashboard', dashboardRoutes)
router.use('/reports', reportRoutes)
router.use('/enterprise', enterpriseRoutes)
router.use('/documents', documentRoutes)
router.use('/attendance', attendanceRoutes)
router.use('/assets', assetRoutes)
router.use('/contracts', contractRoutes)
router.use('/pm-schedules', pmScheduleRoutes)
router.use('/quotations', quotationRoutes)
router.use('/invoices', invoiceRoutes)
router.use('/products', productRoutes)
router.use('/product-orders', productOrderRoutes)
router.use('/public', publicBillingRoutes)

export default router
