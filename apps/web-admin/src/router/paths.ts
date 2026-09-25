/** Canonical route paths — referenced by the router, sidebar, and links. */
export const ROUTES = {
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',

  dashboard: '/',
  /** Module launcher — every module the user can reach, grouped + described. */
  portal: '/portal',
  /** Public, unauthenticated clinic website. */
  site: '/site',
  calendar: '/calendar',
  appointments: '/appointments',
  appointmentDetail: (id = ':id') => `/appointments/${id}`,
  queue: '/queue',

  services: '/services',
  serviceDetail: (id = ':id') => `/services/${id}`,
  categories: '/services/categories',
  servicePackages: '/services/packages',

  staff: '/staff',
  staffDetail: (id = ':id') => `/staff/${id}`,
  roster: '/staff/roster',
  timeOff: '/staff/time-off',
  payroll: '/staff/payroll',

  customers: '/customers',
  customerDetail: (id = ':id') => `/customers/${id}`,

  branches: '/branches',
  branchClosures: '/branches/closures',

  usersRoles: '/settings/users',
  userPermissions: '/settings/permissions',
  quickLoginManagement: '/settings/quick-login',
  settings: '/settings',
  settingsNotifications: '/settings/notifications',
  settingsModules: '/settings/modules',
  auditLog: '/settings/audit',
  chatModeration: '/settings/chat-moderation',
  /** Interactive system flow map — modules, APIs, jobs and status machines. */
  systemMap: '/system-map',
  account: '/account',

  notifications: '/notifications',
  search: '/search',
  reports: '/reports',
  importExport: '/reports/import-export',
  onboarding: '/onboarding',

  // Phase 5 — Finance & Marketing
  finance: '/finance',
  financeAccounting: '/finance/accounting',
  financePaymentDetail: (id = ':id') => `/finance/${id}`,
  loyalty: '/loyalty',
  giftCards: '/gift-cards',
  marketing: '/marketing',

  // Module 39 — Payments & Treasury
  paymentsBanks: '/payments/banks',
  paymentsSlips: '/payments/slips',
  paymentsExpenses: '/payments/expenses',
  paymentsReconciliation: '/payments/reconciliation',

  // Phase 7A — Revenue (Module 28 + 33)
  pricing: '/pricing',
  referrals: '/referrals',

  // Phase 7B — Home Service Dispatch (Module 29)
  homeServiceDispatch: '/home-service/dispatch',

  // Phase 7C — Multi-Resource Allocation (Module 17)
  resources: '/resources',

  // Phase 8 — Platform-Wide Messaging (Module 38)
  messaging: '/messaging',

  // Phase 6 — Inventory (Module 14 + 32)
  inventory: '/inventory',
  inventorySuppliers: '/inventory/suppliers',
  inventoryPurchaseOrders: '/inventory/purchase-orders',
  inventoryTransfers: '/inventory/transfers',
  inventoryLedger: '/inventory/ledger',
  inventoryCounts: '/inventory/counts',
  inventoryReturns: '/inventory/returns',
  inventorySales: '/inventory/sales',

  forbidden: '/403',
  notFound: '/404',
} as const;
