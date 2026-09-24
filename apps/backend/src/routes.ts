import { Router } from 'express';
import { appointmentsRouter } from './modules/appointments/appointments.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { bookingRouter } from './modules/booking/booking.routes.js';
import { branchClosuresRouter, branchesRouter } from './modules/branches/branches.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { chatRouter } from './modules/chat/chat.routes.js';
import { chatbotRouter } from './modules/chatbot/chatbot.routes.js';
import { conversationsRouter } from './modules/conversations/conversations.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { giftCardsRouter } from './modules/gift-cards/gift-cards.routes.js';
import { packagesRouter } from './modules/packages/packages.routes.js';
import {
  homeServiceAdminRouter,
  homeServiceStaffRouter,
  homeServiceTripsRouter,
} from './modules/home-service/home-service.routes.js';
import {
  productsRouter,
  purchaseOrdersRouter,
  stockLotsRouter,
  stockMovementsRouter,
  stockTransfersRouter,
  suppliersRouter,
} from './modules/inventory/inventory.routes.js';
import { loyaltyRouter } from './modules/loyalty/loyalty.routes.js';
import { marketingRouter } from './modules/marketing/marketing.routes.js';
import { consentRouter } from './modules/marketing/consent.routes.js';
import { expensesRouter } from './modules/expenses/expenses.routes.js';
import { payrollRouter } from './modules/payroll/payroll.routes.js';
import { pricingQuoteRouter, pricingRulesRouter } from './modules/pricing/pricing.routes.js';
import {
  affiliateSelfRouter,
  affiliatesRouter,
  referralRouter,
} from './modules/referral/referral.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import {
  paymentsTreasuryRouter,
  paymentsWebhookRouter,
} from './modules/payments-treasury/payments-treasury.routes.js';
import { queueRouter } from './modules/queue/queue.routes.js';
import { equipmentRouter, roomsRouter } from './modules/resources/resources.routes.js';
import { rolesRouter } from './modules/roles/roles.routes.js';
import { skinAnalysisRouter } from './modules/skin-analysis/skin-analysis.routes.js';
import { waitlistRouter } from './modules/waitlist/waitlist.routes.js';
import {
  serviceCategoriesRouter,
  servicesAdminRouter,
} from './modules/services-admin/services-admin.routes.js';
import {
  notificationTemplatesRouter,
  settingsRouter,
} from './modules/settings/settings.routes.js';
import { staffPortalRouter } from './modules/staff-portal/staff-portal.routes.js';
import { staffRouter } from './modules/staff/staff.routes.js';
import { auditLogsRouter, notificationsRouter, reportsRouter } from './modules/system/system.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

/** Root API router — ຕໍ່ module router ໃໝ່ຢູ່ບ່ອນນີ້ຕາມ phase. */
export const apiRouter: Router = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/appointments', appointmentsRouter);
apiRouter.use('/booking', bookingRouter);
apiRouter.use('/branches', branchesRouter);
apiRouter.use('/branch-closures', branchClosuresRouter);
apiRouter.use('/catalog', catalogRouter);
apiRouter.use('/chat', chatRouter);
apiRouter.use('/chatbot', chatbotRouter);
apiRouter.use('/conversations', conversationsRouter);
apiRouter.use('/customers', customersRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/payments/webhooks', paymentsWebhookRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/payments-treasury', paymentsTreasuryRouter);
apiRouter.use('/expenses', expensesRouter);
apiRouter.use('/loyalty', loyaltyRouter);
apiRouter.use('/gift-cards', giftCardsRouter);
apiRouter.use('/packages', packagesRouter);
apiRouter.use('/marketing', marketingRouter);
apiRouter.use('/consent', consentRouter);
apiRouter.use('/waitlist', waitlistRouter);
apiRouter.use('/queue', queueRouter);
apiRouter.use('/suppliers', suppliersRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/stock-movements', stockMovementsRouter);
apiRouter.use('/stock-lots', stockLotsRouter);
apiRouter.use('/purchase-orders', purchaseOrdersRouter);
apiRouter.use('/stock-transfers', stockTransfersRouter);
apiRouter.use('/services', servicesAdminRouter);
apiRouter.use('/service-categories', serviceCategoriesRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/notification-templates', notificationTemplatesRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/audit-logs', auditLogsRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/payroll', payrollRouter);
apiRouter.use('/pricing', pricingQuoteRouter);
apiRouter.use('/pricing-rules', pricingRulesRouter);
apiRouter.use('/referral', referralRouter);
apiRouter.use('/affiliate', affiliateSelfRouter);
apiRouter.use('/affiliates', affiliatesRouter);
apiRouter.use('/home-service/staff', homeServiceStaffRouter);
apiRouter.use('/home-service/admin', homeServiceAdminRouter);
apiRouter.use('/home-service', homeServiceTripsRouter);
apiRouter.use('/resources/rooms', roomsRouter);
apiRouter.use('/resources/equipment', equipmentRouter);
apiRouter.use('/skin-analysis', skinAnalysisRouter);
apiRouter.use('/staff', staffRouter);
apiRouter.use('/staff-portal', staffPortalRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/roles', rolesRouter);
