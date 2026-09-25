/**
 * Read/view models for the admin console.
 *
 * The backend (`@abcp/backend`) currently ships Zod schemas only for auth + booking
 * inputs; list/detail response shapes for catalog/staff/customers/dashboard do not
 * exist yet. These types define the contract the MSW mock layer implements (Option A)
 * and that feature code consumes. When the backend adds real endpoints they should
 * be promoted into `@abcp/shared-types` and imported from there instead.
 */
import type {
  AdminAppointmentDetailView,
  AdminAppointmentListItem,
  Currency,
  QueueTicketStatus,
} from '@abcp/shared-types';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Slug for one of the 18 Lao first-level administrative areas (17 provinces +
 * Vientiane Capital). Kept as a stable string union so the map, the grouped list
 * and the branch form all agree on the same identifiers. Display names live in
 * `src/features/branches/lao-provinces.ts`.
 */
export type LaoProvinceId =
  | 'vientiane-capital'
  | 'vientiane'
  | 'phongsaly'
  | 'louangnamtha'
  | 'oudomxay'
  | 'bokeo'
  | 'louangprabang'
  | 'houaphanh'
  | 'xayaboury'
  | 'xiangkhouang'
  | 'xaisomboun'
  | 'bolikhamxai'
  | 'khammouane'
  | 'savannakhet'
  | 'salavan'
  | 'sekong'
  | 'champasak'
  | 'attapeu';

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  province: LaoProvinceId;
  latitude: number;
  longitude: number;
  timezone: string;
  isActive: boolean;
  openTime: string; // HH:mm
  closeTime: string; // HH:mm
  /** Inventory audit C2 — ອະນຸຍາດໃຫ້ BOM ຕັດສະຕັອກຕິດລົບໄດ້ (backflush exception) ແທນທີ່ຈະ block. */
  allowNegativeStock: boolean;
  email?: string | null;
  /** 'wifi' | 'parking' | 'drink' | 'lounge' | 'kids' | 'card' — shown on the mobile service detail. */
  amenities?: string[];
  createdAt?: string;
  /** Wave 11 */
  weeklyHours?: { day: number; open: string; close: string; closed: boolean }[] | null;
  managerUserId?: string | null;
  managerName?: string | null;
  coverImageUrl?: string | null;
  photoUrls?: string[];
  monthlyRevenueTarget?: number | null;
  monthlyBookingTarget?: number | null;
  archivedAt?: string | null;
}

export interface ServiceCategory {
  id: string;
  name: string;
  imageUrl: string | null;
  serviceCount: number;
  sortOrder: number;
}

export interface ServiceConsumable {
  productId: string;
  productName: string;
  qtyPerUse: number;
  unit: string;
  /** M1 (inventory 9C) — ໜ່ວຍຂອງ BOM (null = ໜ່ວຍພື້ນຖານ); ຕັດຈິງ = qtyPerUse × factorToBase. Optional for older mocks. */
  uomId?: string | null;
  uomCode?: string | null;
  factorToBase?: number;
  baseQtyPerUse?: number;
  stockQty: number;
  lowStock: boolean;
}

export interface Service {
  id: string;
  categoryId: string;
  categoryName: string;
  branchId: string | null;
  branchName: string | null;
  name: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: Currency;
  durationMinutes: number;
  imageUrl: string | null;
  highlights: string[];
  /** Wave 11 — ordered visit steps shown in the customer app. */
  steps?: { title: string; body: string }[];
  requireDeposit: boolean;
  depositAmount: number | null;
  isActive: boolean;
  consumables: ServiceConsumable[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkingHour {
  dayOfWeek: number; // 0=Sun … 6=Sat
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  isDayOff: boolean;
}

export interface StaffProfile {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  jobTitle: string;
  branchId: string;
  branchName: string;
  isActive: boolean;
  serviceIds: string[];
  workingHours: WorkingHour[];
  commissionRate: number; // 0..1
  hiredAt: string;
}

export interface TimeOffRequest {
  id: string;
  staffId: string;
  staffName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  birthDate: string | null;
  loyaltyPoints: number;
  loyaltyTier: 'SILVER' | 'GOLD' | 'PLATINUM' | null;
  totalVisits: number;
  totalSpent: number;
  lastVisitAt: string | null;
  notes: string | null;
  createdAt: string;
}

/**
 * Promoted to `@abcp/shared-types` (Wave 11) — the backend now owns this shape,
 * so the console re-exports it instead of keeping a parallel copy that drifts.
 */
export type AppointmentListItem = AdminAppointmentListItem;

export type AppointmentDetail = AdminAppointmentDetailView;

export type QueueTicketPriority = 'NORMAL' | 'APPOINTMENT' | 'VIP';

export type QueueCancelReason = 'NO_SHOW' | 'CUSTOMER_LEFT' | 'DUPLICATE' | 'EXPIRED' | 'OTHER';

export interface QueueTicket {
  id: string;
  number: string;
  branchId: string;
  /** Branch display name — lets the board label cards when viewing all branches. */
  branchName?: string;
  customerName: string;
  customerPhone?: string | null;
  serviceName: string;
  /** Estimated service duration (minutes) — drives the in-service ETA. */
  serviceDurationMin?: number | null;
  servicePrice?: number | null;
  staffName: string | null;
  staffProfileId?: string | null;
  appointmentId?: string | null;
  customerId?: string | null;
  /** Completed visits before this one (0 = first-timer). */
  visitCount?: number;
  priority?: QueueTicketPriority;
  status: QueueTicketStatus;
  note?: string | null;
  issuedAt: string;
  calledAt: string | null;
  lastCalledAt?: string | null;
  callCount?: number;
  /** Set when the ticket entered IN_SERVICE. */
  startedAt?: string | null;
  /** Set when the ticket entered COMPLETED. */
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: QueueCancelReason | null;
  /** Issued before today (Vientiane) but still active. */
  carriedOver?: boolean;
}

export interface QueueSummary {
  dayStart: string;
  issuedToday: number;
  completedToday: number;
  cancelledToday: number;
  noShowToday: number;
  carriedOver: number;
  avgWaitMin: number | null;
  p90WaitMin: number | null;
  avgServiceMin: number | null;
  yesterday: { issued: number; completed: number; avgWaitMin: number | null };
  hourly: Array<{ hour: number; arrivals: number; completions: number }>;
}

export interface DashboardStats {
  branchId: string | 'all';
  range: { from: string; to: string };
  bookingsToday: number;
  bookingsTodayDelta: number; // vs yesterday, ratio
  revenueToday: number;
  revenueTodayDelta: number;
  queueWaiting: number;
  completedToday: number;
  revenueSeries: Array<{ date: string; revenue: number; bookings: number }>;
  serviceMix: Array<{ name: string; value: number; revenue: number }>;
  upcoming: AppointmentListItem[];
  // --- extended operational metrics (14-day window unless noted) ---
  cancelledToday: number;
  noShowToday: number;
  avgTicket14d: number;
  vipCustomers: number;
  totalCustomers: number;
  pendingApprovals: number;
  upcoming7d: number;
  pendingConfirmation: number;
  staffLeaderboard: Array<{ name: string; completed: number; revenue: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  homeServiceToday: number;
  walkinRate14d: number; // 0..1, over periodDays
  depositsToday: number;
  timeOffTotal: number;
  upcoming7dSeries: number[]; // length 7, upcoming count per day
  hoursToday: Array<{ hour: number; count: number }>;
  branchPerformance: Array<{
    branchId: string;
    name: string;
    revenue: number;
    bookings: number;
    completed: number;
    /** CANCELLED + NO_SHOW in the window. */
    lost: number;
    /** Same metrics over the previous equal-length window. */
    prevRevenue: number;
    prevBookings: number;
    todayBookings: number;
    todayRevenue: number;
    /** Open bookings in the next 7 days. */
    upcoming7d: number;
    /** Distinct customers booked in the window. */
    customers: number;
    walkins: number;
    homeService: number;
    /** Most-booked service in the window. */
    topService: string | null;
    staffCount: number;
    ratingAvg: number;
    ratingCount: number;
    /** Bookings per day, last 7 days (oldest first). */
    spark: number[];
  }>;
  // --- per-card drill-down (row-1 KPIs) ---
  confirmedToday: number;
  pendingToday: number;
  walkinsToday: number;
  queueInService: number;
  queueCalled: number;
  queueLongestWaitMin: number;
  queueNextNumber: string | null;
  // --- period comparison + business-health layer (window = periodDays) ---
  periodDays: DashboardPeriod;
  /** Previous equal-length window, index-aligned with `revenueSeries`. */
  prevSeries: Array<{ revenue: number; bookings: number }>;
  period: {
    revenue: number;
    bookings: number;
    completed: number;
    cancelled: number;
    noShow: number;
    avgTicket: number;
    expenses: number;
    prevRevenue: number;
    prevBookings: number;
    prevCompleted: number;
    prevAvgTicket: number;
    newCustomers: number;
    prevNewCustomers: number;
    activeCustomers: number;
    returningCustomers: number;
  };
  todayAgenda: AppointmentListItem[];
  collectedToday: number;
  attention: {
    lowStock: number;
    openPurchaseOrders: number;
    transfersInTransit: number;
    unpaidBills: number;
    outstandingBalance: number;
    waitlist: number;
    homeServiceActive: number;
    lowRatings: number;
  };
  lowStockItems: Array<{
    id: string;
    name: string;
    sku: string;
    unit: string;
    stockQty: number;
    minStockQty: number;
    /** M11 — max(minStockQty, reorderPoint) (optional for older mocks). */
    threshold?: number;
    branchName: string;
  }>;
  rating: { avg: number; count: number; distribution: number[] };
  recentReviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    customerName: string;
    serviceName: string;
    staffName: string;
    createdAt: string;
  }>;
}

export type DashboardPeriod = 7 | 14 | 30;
