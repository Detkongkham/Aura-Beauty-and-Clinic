import { z } from 'zod';

/** GET /dashboard/stats — ຂອບເຂດຕາມສາຂາ ('all' = ທຸກສາຂາ). */
export const dashboardStatsQuerySchema = z.object({
  branchId: z.union([z.string().uuid(), z.literal('all')]).default('all'),
  /** ຂະໜາດຊ່ວງວິເຄາະ (ມື້) — ຊ່ວງກ່ອນໜ້າທີ່ຍາວເທົ່າກັນໃຊ້ປຽບທຽບ. ຄ່າ `*14d` ທັງໝົດຄິດຕາມຊ່ວງນີ້. */
  days: z.enum(['7', '14', '30']).default('14').transform(Number),
});
export type DashboardStatsQuery = z.infer<typeof dashboardStatsQuerySchema>;

type MiniAppointment = {
  id: string;
  code: string;
  status: string;
  startAt: string;
  endAt: string;
  branchId: string;
  branchName: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  staffId: string;
  staffName: string;
  serviceId: string;
  serviceName: string;
  deliveryType: string;
  price: number;
  depositPaid: number;
  isWalkIn: boolean;
  createdAt: string;
};

/**
 * ຮູບຮ່າງກົງກັບ web-admin `DashboardStats` (types/models.ts) — drop-in ສຳລັບ
 * ໜ້າ Dashboard ຫຼັງ cutover ອອກຈາກ MSW.
 */
export type DashboardStatsView = {
  branchId: string;
  range: { from: string; to: string };
  bookingsToday: number;
  bookingsTodayDelta: number;
  revenueToday: number;
  revenueTodayDelta: number;
  queueWaiting: number;
  completedToday: number;
  revenueSeries: Array<{ date: string; revenue: number; bookings: number }>;
  serviceMix: Array<{ name: string; value: number; revenue: number }>;
  upcoming: MiniAppointment[];
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
  walkinRate14d: number;
  depositsToday: number;
  timeOffTotal: number;
  upcoming7dSeries: number[];
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
  confirmedToday: number;
  pendingToday: number;
  walkinsToday: number;
  queueInService: number;
  queueCalled: number;
  queueLongestWaitMin: number;
  queueNextNumber: string | null;

  // --- period comparison + business-health layer (additive) ---
  /** ຂະໜາດຊ່ວງທີ່ຄິດ (7 / 14 / 30). `revenueSeries` ຍາວເທົ່ານີ້. */
  periodDays: number;
  /** ລາຍຮັບ/ການຈອງ ຕໍ່ມື້ຂອງຊ່ວງກ່ອນໜ້າ — ຈັດຮຽງກົງກັບ `revenueSeries` ດັດຊະນີຕໍ່ດັດຊະນີ. */
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
    /** ລູກຄ້າໃໝ່ທີ່ລົງທະບຽນໃນຊ່ວງ (ທົ່ວລະບົບ — ລູກຄ້າບໍ່ຂຶ້ນກັບສາຂາ). */
    newCustomers: number;
    prevNewCustomers: number;
    /** ລູກຄ້າທີ່ມີນັດໃນຊ່ວງ (distinct). */
    activeCustomers: number;
    /** ໃນນັ້ນ ມີນັດກ່ອນຊ່ວງນີ້ມາແລ້ວ. */
    returningCustomers: number;
  };
  /** ນັດທັງໝົດຂອງມື້ນີ້ (ທຸກສະຖານະ) ຮຽງຕາມເວລາ — ສຳລັບ timeline, ສູງສຸດ 60 ແຖວ. */
  todayAgenda: MiniAppointment[];
  /** ເງິນທີ່ຮັບເຂົ້າຈິງມື້ນີ້ (payment transactions SUCCESS). */
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
    /** M11 — ເກນທີ່ໃຊ້ຈິງ = max(minStockQty, reorderPoint) (ຄືກັບລາຍການສິນຄ້າ). */
    threshold: number;
    branchName: string;
  }>;
  rating: {
    avg: number;
    count: number;
    /** ດັດຊະນີ 0 = 1 ດາວ … 4 = 5 ດາວ. */
    distribution: number[];
  };
  recentReviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    customerName: string;
    serviceName: string;
    staffName: string;
    createdAt: string;
  }>;
};
