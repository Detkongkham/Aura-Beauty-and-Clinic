import type { MyAppointmentsQuery, ServiceListQuery, StaffListQuery } from '@abcp/shared-types';

/** ຄີ TanStack Query ກາງ — ຫ້າມ inline array literal ກະຈາຍ. */
export const qk = {
  me: ['me'] as const,
  categories: ['categories'] as const,
  services: (params: Partial<ServiceListQuery>) => ['services', params] as const,
  service: (id: string) => ['service', id] as const,
  staff: (params: StaffListQuery) => ['staff', params] as const,
  branch: (id: string) => ['catalog', 'branch', id] as const,
  bookingPolicy: ['booking', 'policy'] as const,
  staffOne: (id: string) => ['staff', 'one', id] as const,
  availability: (params: { branchId: string; serviceId: string; date: string; staffProfileId?: string }) =>
    ['availability', params] as const,
  myAppointments: (params: Pick<MyAppointmentsQuery, 'scope'>) =>
    ['appointments', 'me', params] as const,
  appointment: (id: string) => ['appointment', id] as const,

  // ---- Phase 5: Finance & Marketing ----
  loyalty: ['loyalty', 'me'] as const,
  loyaltyLedger: (type?: string) => ['loyalty', 'me', 'ledger', type ?? 'all'] as const,
  giftCards: ['gift-cards', 'me'] as const,
  packages: (params: { branchId?: string; serviceId?: string }) => ['packages', 'list', params] as const,
  package: (id: string) => ['packages', 'one', id] as const,
  myPackages: ['packages', 'me'] as const,
  packageUsage: (id: string) => ['packages', 'me', id, 'usage'] as const,
  giftCardLookup: (code: string) => ['gift-cards', 'lookup', code] as const,
  waitlist: ['waitlist', 'me'] as const,
  payment: (appointmentId: string) => ['payment', 'appointment', appointmentId] as const,

  // ---- Phase 7A: Revenue (Module 28 + 33) ----
  referral: ['referral', 'me'] as const,
  referralUsages: ['referral', 'me', 'usages'] as const,
  affiliate: ['affiliate', 'me'] as const,
  promotions: (branchId: string) => ['pricing', 'promotions', branchId] as const,
  notifications: ['notifications', 'me'] as const,
  notificationsUnread: ['notifications', 'me', 'unread'] as const,
  priceQuote: (params: { branchId: string; serviceId: string; at?: string }) =>
    ['pricing', 'quote', params] as const,

  // ---- Staff Portal (Phase 4) ----
  staffSchedule: (date: string) => ['staff-portal', 'schedule', date] as const,
  staffAttendance: (month?: string) => ['staff-portal', 'attendance', month ?? 'recent'] as const,
  staffCommission: (month: string) => ['staff-portal', 'commission', month] as const,
  staffTreatment: (appointmentId: string) =>
    ['staff-portal', 'treatment', appointmentId] as const,

  // ---- Phase 7B: Home Service & Live GPS (Module 29) ----
  staffHomeServiceAvailability: ['staff-portal', 'home-service', 'availability'] as const,
  homeServiceTrip: (appointmentId: string) =>
    ['home-service', 'trip', appointmentId] as const,

  // ---- Phase 7C: In-App Chat (Module 21) ----
  chatThread: (appointmentId: string) => ['chat', 'thread', appointmentId] as const,
  chatMessages: (threadId: string) => ['chat', 'messages', threadId] as const,

  // ---- Phase 8: Platform-Wide Messaging (Module 38) ----
  conversations: (type: string) => ['conversations', 'list', type] as const,

  // ---- Phase 7C: AI Skin & Hair Camera (Module 30) ----
  skinAnalyses: ['skin-analysis', 'me'] as const,
};
