import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { RouteError } from '@/error/RouteError';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { ForbiddenPage } from '@/pages/system/ForbiddenPage';
import { NotFoundPage } from '@/pages/system/NotFoundPage';
import { lazyPage } from '@/router/lazyPage';
import { ProtectedRoute } from '@/router/ProtectedRoute';
import { RoleRoute } from '@/router/RoleRoute';
import { ROUTES } from '@/router/paths';

// --- Code-split feature pages (step 4) ---
const DashboardPage = lazyPage(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage');
const ServicesPage = lazyPage(() => import('@/features/services/ServicesPage'), 'ServicesPage');
const CategoriesPage = lazyPage(() => import('@/features/services/CategoriesPage'), 'CategoriesPage');
const AppointmentsPage = lazyPage(
  () => import('@/features/appointments/AppointmentsPage'),
  'AppointmentsPage',
);
const AppointmentDetailPage = lazyPage(
  () => import('@/features/appointments/AppointmentDetailPage'),
  'AppointmentDetailPage',
);
const StaffPage = lazyPage(() => import('@/features/staff/StaffPage'), 'StaffPage');
const StaffDetailPage = lazyPage(() => import('@/features/staff/StaffDetailPage'), 'StaffDetailPage');
const TimeOffPage = lazyPage(() => import('@/features/staff/TimeOffPage'), 'TimeOffPage');
const CustomersPage = lazyPage(() => import('@/features/customers/CustomersPage'), 'CustomersPage');
const CustomerDetailPage = lazyPage(
  () => import('@/features/customers/CustomerDetailPage'),
  'CustomerDetailPage',
);
const CalendarPage = lazyPage(() => import('@/features/calendar/CalendarPage'), 'CalendarPage');
const QueueBoardPage = lazyPage(() => import('@/features/queue/QueueBoardPage'), 'QueueBoardPage');
const BranchesPage = lazyPage(() => import('@/features/branches/BranchesPage'), 'BranchesPage');
const UsersPage = lazyPage(() => import('@/features/users/UsersPage'), 'UsersPage');
const PermissionsPage = lazyPage(() => import('@/features/users/PermissionsPage'), 'PermissionsPage');
const QuickLoginPage = lazyPage(() => import('@/features/users/QuickLoginPage'), 'QuickLoginPage');
const SettingsPage = lazyPage(() => import('@/features/settings/SettingsPage'), 'SettingsPage');
const AccountPage = lazyPage(() => import('@/features/account/AccountPage'), 'AccountPage');
const NotificationsPage = lazyPage(
  () => import('@/features/notifications/NotificationsPage'),
  'NotificationsPage',
);
const SearchPage = lazyPage(() => import('@/features/search/SearchPage'), 'SearchPage');
const ServiceDetailPage = lazyPage(
  () => import('@/features/services/ServiceDetailPage'),
  'ServiceDetailPage',
);
const RosterPage = lazyPage(() => import('@/features/staff/RosterPage'), 'RosterPage');
const BranchClosuresPage = lazyPage(
  () => import('@/features/branches/BranchClosuresPage'),
  'BranchClosuresPage',
);
const SettingsNotificationsPage = lazyPage(
  () => import('@/features/settings/SettingsNotificationsPage'),
  'SettingsNotificationsPage',
);
const ModuleManagementPage = lazyPage(
  () => import('@/features/settings/ModuleManagementPage'),
  'ModuleManagementPage',
);
const EndOfDayPage = lazyPage(() => import('@/features/reports/EndOfDayPage'), 'EndOfDayPage');
const ImportExportPage = lazyPage(
  () => import('@/features/reports/ImportExportPage'),
  'ImportExportPage',
);
const OnboardingPage = lazyPage(
  () => import('@/features/onboarding/OnboardingPage'),
  'OnboardingPage',
);
const AuditLogPage = lazyPage(() => import('@/features/audit/AuditLogPage'), 'AuditLogPage');
const ChatModerationPage = lazyPage(
  () => import('@/features/messaging/ChatModerationPage'),
  'ChatModerationPage',
);
const FinancePage = lazyPage(() => import('@/features/finance/FinancePage'), 'FinancePage');
const LoyaltyPage = lazyPage(() => import('@/features/loyalty/LoyaltyPage'), 'LoyaltyPage');
const GiftCardsPage = lazyPage(() => import('@/features/giftcards/GiftCardsPage'), 'GiftCardsPage');
const CampaignsPage = lazyPage(() => import('@/features/marketing/CampaignsPage'), 'CampaignsPage');
const InventoryPage = lazyPage(() => import('@/features/inventory/InventoryPage'), 'InventoryPage');
const SuppliersPage = lazyPage(() => import('@/features/inventory/SuppliersPage'), 'SuppliersPage');
const PurchaseOrdersPage = lazyPage(
  () => import('@/features/inventory/PurchaseOrdersPage'),
  'PurchaseOrdersPage',
);
const StockLedgerPage = lazyPage(
  () => import('@/features/inventory/StockLedgerPage'),
  'StockLedgerPage',
);
const StockTransfersPage = lazyPage(
  () => import('@/features/inventory/StockTransfersPage'),
  'StockTransfersPage',
);
const PayrollPage = lazyPage(() => import('@/features/payroll/PayrollPage'), 'PayrollPage');
const PricingPage = lazyPage(() => import('@/features/pricing/PricingPage'), 'PricingPage');
const ReferralsPage = lazyPage(() => import('@/features/referrals/ReferralsPage'), 'ReferralsPage');
const HomeServiceDispatchPage = lazyPage(
  () => import('@/features/home-service/HomeServiceDispatchPage'),
  'HomeServiceDispatchPage',
);
const ResourcesPage = lazyPage(() => import('@/features/resources/ResourcesPage'), 'ResourcesPage');
const MessagingPage = lazyPage(() => import('@/features/messaging/MessagingPage'), 'MessagingPage');

/**
 * Route table. Feature modules (step 4) replace each PlaceholderPage with a
 * code-split page via `lazyPage(...)`; the guard + layout structure stays.
 */
export const router = createBrowserRouter([
  { path: ROUTES.login, element: <LoginPage /> },
  { path: ROUTES.forgotPassword, element: <ForgotPasswordPage /> },
  { path: ROUTES.resetPassword, element: <ResetPasswordPage /> },
  { path: ROUTES.forbidden, element: <ForbiddenPage /> },
  { path: ROUTES.onboarding, element: <OnboardingPage /> },

  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: ROUTES.notifications, element: <NotificationsPage /> },
          { path: ROUTES.account, element: <AccountPage /> },
          { path: ROUTES.search, element: <SearchPage /> },

          {
            element: <RoleRoute permission="calendar:view" />,
            children: [{ path: ROUTES.calendar, element: <CalendarPage /> }],
          },
          {
            element: <RoleRoute permission="appointments:view" />,
            children: [
              { path: ROUTES.appointments, element: <AppointmentsPage /> },
              { path: ROUTES.appointmentDetail(), element: <AppointmentDetailPage /> },
            ],
          },
          {
            element: <RoleRoute permission="queue:manage" />,
            children: [
              { path: ROUTES.queue, element: <QueueBoardPage /> },
              { path: ROUTES.homeServiceDispatch, element: <HomeServiceDispatchPage /> },
              { path: ROUTES.resources, element: <ResourcesPage /> },
              { path: ROUTES.messaging, element: <MessagingPage /> },
            ],
          },
          {
            element: <RoleRoute permission="services:view" />,
            children: [
              { path: ROUTES.categories, element: <CategoriesPage /> },
              { path: ROUTES.services, element: <ServicesPage /> },
              { path: ROUTES.serviceDetail(), element: <ServiceDetailPage /> },
            ],
          },
          {
            element: <RoleRoute permission="staff:view" />,
            children: [
              { path: ROUTES.roster, element: <RosterPage /> },
              { path: ROUTES.timeOff, element: <TimeOffPage /> },
              { path: ROUTES.payroll, element: <PayrollPage /> },
              { path: ROUTES.staff, element: <StaffPage /> },
              { path: ROUTES.staffDetail(), element: <StaffDetailPage /> },
            ],
          },
          {
            element: <RoleRoute permission="customers:view" />,
            children: [
              { path: ROUTES.customers, element: <CustomersPage /> },
              { path: ROUTES.customerDetail(), element: <CustomerDetailPage /> },
            ],
          },
          {
            element: <RoleRoute permission="branches:view" />,
            children: [
              { path: ROUTES.branches, element: <BranchesPage /> },
              { path: ROUTES.branchClosures, element: <BranchClosuresPage /> },
            ],
          },
          {
            element: <RoleRoute permission="reports:view" />,
            children: [
              { path: ROUTES.reports, element: <EndOfDayPage /> },
              { path: ROUTES.importExport, element: <ImportExportPage /> },
            ],
          },
          {
            // Phase 5 — Finance (writes are also role-guarded server-side)
            element: <RoleRoute permission="finance:view" />,
            children: [
              { path: ROUTES.finance, element: <FinancePage /> },
              { path: ROUTES.loyalty, element: <LoyaltyPage /> },
              { path: ROUTES.giftCards, element: <GiftCardsPage /> },
            ],
          },
          {
            element: <RoleRoute permission="marketing:view" />,
            children: [{ path: ROUTES.marketing, element: <CampaignsPage /> }],
          },
          {
            // Phase 7A — Revenue (Module 28 Dynamic Pricing + 33 Referral/Affiliate)
            element: <RoleRoute permission="finance:view" />,
            children: [
              { path: ROUTES.pricing, element: <PricingPage /> },
              { path: ROUTES.referrals, element: <ReferralsPage /> },
            ],
          },
          {
            element: <RoleRoute permission="settings:view" />,
            children: [
              { path: ROUTES.settings, element: <SettingsPage /> },
              { path: ROUTES.settingsNotifications, element: <SettingsNotificationsPage /> },
              { path: ROUTES.settingsModules, element: <ModuleManagementPage /> },
              { path: ROUTES.auditLog, element: <AuditLogPage /> },
              { path: ROUTES.chatModeration, element: <ChatModerationPage /> },
              {
                element: <RoleRoute permission="users:view" />,
                children: [{ path: ROUTES.usersRoles, element: <UsersPage /> }],
              },
              {
                element: <RoleRoute permission="users:manage" />,
                children: [
                  { path: ROUTES.userPermissions, element: <PermissionsPage /> },
                  { path: ROUTES.quickLoginManagement, element: <QuickLoginPage /> },
                ],
              },
            ],
          },

          // Phase 6 — Inventory (Module 14 + 32)
          {
            element: <RoleRoute permission="inventory:view" />,
            children: [
              { path: ROUTES.inventory, element: <InventoryPage /> },
              { path: ROUTES.inventorySuppliers, element: <SuppliersPage /> },
              { path: ROUTES.inventoryPurchaseOrders, element: <PurchaseOrdersPage /> },
              { path: ROUTES.inventoryTransfers, element: <StockTransfersPage /> },
              { path: ROUTES.inventoryLedger, element: <StockLedgerPage /> },
            ],
          },

          { path: ROUTES.notFound, element: <NotFoundPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },

  { path: '*', element: <Navigate to={ROUTES.notFound} replace /> },
]);
