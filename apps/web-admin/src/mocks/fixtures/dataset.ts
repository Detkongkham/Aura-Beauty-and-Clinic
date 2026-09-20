import type {
  AppointmentSource,
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
} from '@abcp/shared-types';

import type {
  AppointmentListItem,
  Branch,
  Customer,
  QueueTicket,
  Service,
  ServiceCategory,
  StaffProfile,
  TimeOffRequest,
  WorkingHour,
} from '@/types/models';

/** Tiny deterministic PRNG (mulberry32) so the mock dataset is stable across reloads. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260901);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DAY = 86_400_000;
const now = new Date('2026-09-01T09:00:00+07:00').getTime();
const iso = (ms: number) => new Date(ms).toISOString();

// --- Branches ---
const TZ = 'Asia/Vientiane';
export const branches: Branch[] = [
  {
    id: uuid(0xb1),
    name: 'Aura ສາຂາ ໃຈກາງວຽງຈັນ',
    code: 'VTE-01',
    address: 'ຖະໜົນເສດຖາທິລາດ, ບ້ານຫາຍໂສກ, ເມືອງຈັນທະບູລີ, ນະຄອນຫຼວງວຽງຈັນ',
    phone: '2021000010',
    province: 'vientiane-capital',
    latitude: 17.9667,
    longitude: 102.6,
    timezone: TZ,
    isActive: true,
    allowNegativeStock: false,
    openTime: '09:00',
    closeTime: '20:00',
  },
  {
    id: uuid(0xb2),
    name: 'Aura ສາຂາ ແຄມແມ່ນ້ຳຂອງ',
    code: 'VTE-02',
    address: 'ຖະໜົນຟ້າງຸ່ມ, ບ້ານວັດຈັນ, ເມືອງສີສັດຕະນາກ, ນະຄອນຫຼວງວຽງຈັນ',
    phone: '2021000020',
    province: 'vientiane-capital',
    latitude: 17.955,
    longitude: 102.63,
    timezone: TZ,
    isActive: true,
    allowNegativeStock: false,
    openTime: '10:00',
    closeTime: '21:00',
  },
  {
    id: uuid(0xb3),
    name: 'Aura ສາຂາ ຕະຫຼາດເຊົ້າ ມໍນິງມາກເກັດ',
    code: 'VTE-03',
    address: 'ສູນການຄ້າຕະຫຼາດເຊົ້າ, ຖະໜົນລ້ານຊ້າງ, ເມືອງຈັນທະບູລີ, ນະຄອນຫຼວງວຽງຈັນ',
    phone: '2021000030',
    province: 'vientiane-capital',
    latitude: 17.967,
    longitude: 102.612,
    timezone: TZ,
    isActive: true,
    allowNegativeStock: false,
    openTime: '10:00',
    closeTime: '21:00',
  },
  {
    id: uuid(0xb4),
    name: 'Aura ສາຂາ ວັງວຽງ',
    code: 'VLI-01',
    address: 'ຖະໜົນຫຼວງ, ບ້ານສະຫວ່າງ, ເມືອງວັງວຽງ, ແຂວງວຽງຈັນ',
    phone: '2023200110',
    province: 'vientiane',
    latitude: 18.9236,
    longitude: 102.4468,
    timezone: TZ,
    isActive: true,
    allowNegativeStock: false,
    openTime: '09:00',
    closeTime: '19:00',
  },
  {
    id: uuid(0xb5),
    name: 'Aura ສາຂາ ຫຼວງພະບາງ ເມືອງເກົ່າ',
    code: 'LPB-01',
    address: 'ຖະໜົນສີສະຫວ່າງວົງ, ບ້ານຊຽງທອງ, ເມືອງຫຼວງພະບາງ, ແຂວງຫຼວງພະບາງ',
    phone: '2027100210',
    province: 'louangprabang',
    latitude: 19.8856,
    longitude: 102.1347,
    timezone: TZ,
    isActive: true,
    allowNegativeStock: false,
    openTime: '08:30',
    closeTime: '20:00',
  },
  {
    id: uuid(0xb6),
    name: 'Aura ສາຂາ ຫຼວງພະບາງ ສະໜາມບິນ',
    code: 'LPB-02',
    address: 'ຖະໜົນສະໜາມບິນສາກົນ, ບ້ານໂນນສະຫວ່າງ, ເມືອງຫຼວງພະບາງ, ແຂວງຫຼວງພະບາງ',
    phone: '2027100220',
    province: 'louangprabang',
    latitude: 19.8975,
    longitude: 102.1608,
    timezone: TZ,
    isActive: false,
    allowNegativeStock: false,
    openTime: '09:00',
    closeTime: '18:00',
  },
  {
    id: uuid(0xb7),
    name: 'Aura ສາຂາ ສະຫວັນນະເຂດ',
    code: 'SVK-01',
    address: 'ຖະໜົນລັດສະໝີ, ບ້ານໂພນສະຫວ່າງ, ເມືອງໄກສອນ ພົມວິຫານ, ແຂວງສະຫວັນນະເຂດ',
    phone: '2041200310',
    province: 'savannakhet',
    latitude: 16.5563,
    longitude: 104.7519,
    timezone: TZ,
    isActive: true,
    allowNegativeStock: false,
    openTime: '09:00',
    closeTime: '20:00',
  },
  {
    id: uuid(0xb8),
    name: 'Aura ສາຂາ ປາກເຊ',
    code: 'PKZ-01',
    address: 'ຖະໜົນ 13 ໃຕ້, ບ້ານພະບາດ, ເມືອງປາກເຊ, ແຂວງຈຳປາສັກ',
    phone: '2031200410',
    province: 'champasak',
    latitude: 15.1202,
    longitude: 105.7988,
    timezone: TZ,
    isActive: true,
    allowNegativeStock: false,
    openTime: '09:00',
    closeTime: '20:00',
  },
  {
    id: uuid(0xb9),
    name: 'Aura ສາຂາ ໂພນສະຫວັນ',
    code: 'XKH-01',
    address: 'ຖະໜົນ 7, ບ້ານໂພນສະຫວັນເໜືອ, ເມືອງແປກ, ແຂວງຊຽງຂວາງ',
    phone: '2061200510',
    province: 'xiangkhouang',
    latitude: 19.4571,
    longitude: 103.2003,
    timezone: TZ,
    isActive: true,
    allowNegativeStock: false,
    openTime: '08:30',
    closeTime: '18:30',
  },
  {
    id: uuid(0xba),
    name: 'Aura ສາຂາ ຫ້ວຍຊາຍ',
    code: 'BKO-01',
    address: 'ຖະໜົນແຄມຂອງ, ບ້ານໃນເມືອງ, ເມືອງຫ້ວຍຊາຍ, ແຂວງບໍ່ແກ້ວ',
    phone: '2084200610',
    province: 'bokeo',
    latitude: 20.2777,
    longitude: 100.4172,
    timezone: TZ,
    isActive: false,
    allowNegativeStock: false,
    openTime: '09:00',
    closeTime: '18:00',
  },
  {
    id: uuid(0xbb),
    name: 'Aura ສາຂາ ທ່າແຂກ',
    code: 'KHM-01',
    address: 'ຖະໜົນວຽງຈັນ, ບ້ານນາໂພ, ເມືອງທ່າແຂກ, ແຂວງຄຳມ່ວນ',
    phone: '2051200710',
    province: 'khammouane',
    latitude: 17.4103,
    longitude: 104.8214,
    timezone: TZ,
    isActive: true,
    allowNegativeStock: false,
    openTime: '09:00',
    closeTime: '19:30',
  },
  {
    id: uuid(0xbc),
    name: 'Aura ສາຂາ ຊຳເໜືອ',
    code: 'HPN-01',
    address: 'ຖະໜົນໃຫຍ່, ບ້ານໂພນໄຊ, ເມືອງຊຳເໜືອ, ແຂວງຫົວພັນ',
    phone: '2064200810',
    province: 'houaphanh',
    latitude: 20.4186,
    longitude: 104.0492,
    timezone: TZ,
    isActive: true,
    allowNegativeStock: false,
    openTime: '08:30',
    closeTime: '18:00',
  },
];

// --- Categories ---
const categoryNames = [
  'ຜົມ',
  'ຜິວໜ້າ & ດູແລໜ້າ',
  'ເລັບ',
  'ນວດ & ສະປາ',
  'ຄລີນິກຄວາມງາມ',
  // extra rows so the list paginates (mirrors the real catalogue size)
  ...Array.from({ length: 26 }, (_, i) => `ໝວດບໍລິການເສີມ ຊຸດ ${i + 1}`),
];
export const categories: ServiceCategory[] = categoryNames.map((name, i) => ({
  id: uuid(0xc0 + i),
  name,
  imageUrl: null,
  serviceCount: 0,
  sortOrder: i,
}));

// --- Services ---
const serviceSeeds: Array<[string, number, number]> = [
  // [name, price (LAK), durationMinutes]
  ['ຕັດ & ຈັດແຕ່ງຊົງເອກະລັກ', 250000, 60],
  ['ບຳລຸງເສັ້ນຜົມເຄຣາຕິນ', 850000, 120],
  ['ຍ້ອມສີບາລາຢາຈ', 1200000, 180],
  ['ດູແລຜິວໜ້າ ໄຮໂດຣ ໂກລວ', 450000, 75],
  ['ດູແລຜິວໜ້າ ຫຼຸດສິວ', 400000, 60],
  ['ທຳເລັບມື ຄລາສສິກ', 150000, 45],
  ['ຕໍ່ເລັບເຈວ (ຊຸດ)', 350000, 90],
  ['ນວດອະໂຣມາເທຣາປີ', 500000, 90],
  ['ນວດຫີນຮ້ອນ', 650000, 120],
  ['ປຶກສາໂບທັອກ', 300000, 30],
  ['ສີດຟີລເລີ 1ml', 3500000, 60],
  ['ກຳຈັດຂົນດ້ວຍເລເຊີ (ຈຸດນ້ອຍ)', 550000, 40],
];
const HIGHLIGHT_POOL = ['ຜົມສຸຂະພາບດີ', 'ຜ່ອນຄາຍ', 'ຄົງທົນ', 'VIP', 'ຍອດນິຍົມ'];

const seededServices: Service[] = serviceSeeds.map(([name, price, durationMinutes], i) => {
  const category = categories[Math.min(Math.floor(i / 3), 4)]!;
  category.serviceCount += 1;
  const requireDeposit = price >= 800000;
  const onSale = i % 4 === 0;
  return {
    id: uuid(0x100 + i),
    categoryId: category.id,
    categoryName: category.name,
    branchId: null,
    branchName: null,
    name,
    description: `${name} — ໃຫ້ບໍລິການໂດຍຜູ້ຊ່ຽວຊານທີ່ໄດ້ຮັບການຮັບຮອງ.`,
    price,
    compareAtPrice: onSale ? Math.round(price * 1.25) : null,
    currency: 'LAK' as const,
    durationMinutes,
    imageUrl: null,
    highlights: i % 2 === 0 ? [HIGHLIGHT_POOL[i % HIGHLIGHT_POOL.length]!] : [],
    requireDeposit,
    depositAmount: requireDeposit ? Math.round(price * 0.3) : null,
    isActive: i % 11 !== 0,
    consumables:
      i % 3 === 0
        ? [
            {
              productId: uuid(0x200 + i),
              productName: 'ຊຸດວັດຖຸສິ້ນເປືອງ',
              qtyPerUse: 1,
              unit: 'ຊຸດ',
              stockQty: i % 9 === 0 ? 2 : 40,
              lowStock: i % 9 === 0,
            },
          ]
        : [],
    createdAt: iso(now - int(1, 25) * DAY),
    updatedAt: iso(now - int(0, 20) * DAY),
  };
});

// Bulk rows so the table spans several pages (~120 total, like the live catalogue).
const extraServices: Service[] = Array.from({ length: 108 }, (_, k) => {
  const i = serviceSeeds.length + k;
  const category = categories[k % categories.length]!;
  category.serviceCount += 1;
  const price = 100000 + ((k * 37) % 40) * 25000;
  const requireDeposit = price >= 800000;
  return {
    id: uuid(0x300 + i),
    categoryId: category.id,
    categoryName: category.name,
    branchId: null,
    branchName: null,
    name: `ແພັກເກັດບໍລິການ ຊຸດ ${k + 1}`,
    description: `ແພັກເກັດບໍລິການ ຊຸດ ${k + 1} — ໃຫ້ບໍລິການໂດຍຜູ້ຊ່ຽວຊານທີ່ໄດ້ຮັບການຮັບຮອງ.`,
    price,
    compareAtPrice: null,
    currency: 'LAK' as const,
    durationMinutes: 30 + (k % 6) * 15,
    imageUrl: null,
    highlights: [],
    requireDeposit,
    depositAmount: requireDeposit ? Math.round(price * 0.3) : null,
    isActive: k % 7 !== 0,
    consumables:
      k % 4 === 0
        ? [
            {
              productId: uuid(0x400 + i),
              productName: 'ຊຸດວັດຖຸສິ້ນເປືອງ',
              qtyPerUse: 1,
              unit: 'ຊຸດ',
              stockQty: k % 10 === 0 ? 1 : 30,
              lowStock: k % 10 === 0,
            },
          ]
        : [],
    // older than every seeded row so a newest-first sort keeps the named seeds on page 1
    createdAt: iso(now - (60 + k) * DAY),
    updatedAt: iso(now - (60 + k) * DAY),
  };
});

export const services: Service[] = [...seededServices, ...extraServices];

// --- Staff ---
const staffNames = [
  'ຈັນທະລາ ພ.',
  'ສົມສັກ ກ.',
  'ນາລີ ວ.',
  'ບຸນມີ ສ.',
  'ແກ້ວ ດ.',
  'ມະໄລທອງ ຂ.',
  'ເພັດສະໝອນ ຣ.',
  'ວິໄລພອນ ທ.',
];
const jobTitles = ['ຊ່າງແຕ່ງຜົມອາວຸໂສ', 'ຜູ້ຊ່ຽວຊານດ້ານຜິວ', 'ຊ່າງທຳເລັບ', 'ໝໍນວດບຳບັດ', 'ພະຍາບານສີດຢາ'];
function defaultWorkingHours(): WorkingHour[] {
  return Array.from({ length: 7 }, (_, d) => ({
    dayOfWeek: d,
    startTime: '09:00',
    endTime: '18:00',
    isDayOff: d === 0,
  }));
}
export const staff: StaffProfile[] = staffNames.map((name, i) => {
  const branch = branches[i % branches.length]!;
  return {
    id: uuid(0x300 + i),
    userId: uuid(0x380 + i),
    name,
    phone: `202150000${i}`,
    email: `staff${i + 1}@aura.test`,
    avatarUrl: null,
    jobTitle: jobTitles[i % jobTitles.length]!,
    branchId: branch.id,
    branchName: branch.name,
    isActive: i !== 7,
    serviceIds: services.filter((_, si) => (si + i) % 3 === 0).map((s) => s.id),
    workingHours: defaultWorkingHours(),
    commissionRate: 0.1 + (i % 3) * 0.05,
    hiredAt: iso(now - int(120, 1200) * DAY),
  };
});

// --- Customers ---
const firstNames = ['ສຸພາພອນ', 'ຄຳລາ', 'ດາຣາ', 'ນ້ອຍ', 'ເມັງ', 'ວົງ', 'ລັດຕະນາ', 'ຈັນໂຮມ', 'ສົມໄຊ', 'ປານີ'];
const lastNames = ['ວົງ', 'ສີສຸກ', 'ພົມມະຈັນ', 'ລັດຕະນາ', 'ແກ້ວມະນີ', 'ອິນທະວົງ', 'ສຸວັນນາ', 'ຈັນທະວົງ'];
export const customers: Customer[] = Array.from({ length: 34 }, (_, i) => {
  const visits = int(0, 25);
  const tier = visits > 18 ? 'PLATINUM' : visits > 10 ? 'GOLD' : visits > 3 ? 'SILVER' : null;
  return {
    id: uuid(0x400 + i),
    name: `${pick(firstNames)} ${pick(lastNames)}`,
    phone: `20287${String(100000 + i).slice(-6)}`,
    email: i % 3 === 0 ? `customer${i}@mail.test` : null,
    gender: pick(['MALE', 'FEMALE', 'FEMALE', 'OTHER'] as const),
    birthDate: iso(now - int(6570, 21900) * DAY).slice(0, 10),
    loyaltyPoints: visits * int(10, 120),
    loyaltyTier: tier,
    totalVisits: visits,
    totalSpent: visits * int(150000, 900000),
    lastVisitAt: visits ? iso(now - int(0, 90) * DAY) : null,
    notes: i % 7 === 0 ? 'ມັກນັດຕອນບ່າຍ. ຜິວແພ້ງ່າຍ.' : null,
    createdAt: iso(now - int(30, 900) * DAY),
  };
});

// --- Appointments (±10 days around "now") ---
export const appointments: AppointmentListItem[] = Array.from({ length: 120 }, (_, i) => {
  const branch = branches[i % branches.length]!;
  const svc = pick(services);
  const stf = pick(staff.filter((s) => s.branchId === branch.id));
  const cust = pick(customers);
  const dayOffset = int(-10, 10);
  const hour = int(9, 18);
  const start = new Date('2026-09-01T00:00:00+07:00').getTime() + dayOffset * DAY + hour * 3_600_000;
  const past = start < now;
  const status: AppointmentStatus = past
    ? pick(['COMPLETED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
    : pick(['PENDING', 'CONFIRMED', 'CONFIRMED', 'IN_PROGRESS']);
  const isWalkIn = rand() < 0.25;
  return {
    id: uuid(0x1000 + i),
    code: `APT-${String(1000 + i)}`,
    branchId: branch.id,
    branchName: branch.name,
    customerId: cust.id,
    customerName: cust.name,
    customerPhone: cust.phone,
    staffId: stf?.id ?? staff[0]!.id,
    staffName: stf?.name ?? staff[0]!.name,
    serviceId: svc.id,
    serviceName: svc.name,
    status,
    deliveryType: (rand() < 0.1 ? 'HOME_SERVICE' : 'IN_STORE') as 'IN_STORE' | 'HOME_SERVICE',
    startAt: iso(start),
    endAt: iso(start + svc.durationMinutes * 60_000),
    price: svc.price,
    depositPaid: svc.requireDeposit && status !== 'PENDING' ? (svc.depositAmount ?? 0) : 0,
    isWalkIn,
    createdAt: iso(start - int(1, 240) * 3_600_000),
    source: (isWalkIn ? 'WALK_IN' : rand() < 0.2 ? 'ADMIN' : 'ONLINE') as AppointmentSource,
    durationMin: svc.durationMinutes,
    updatedAt: iso(start),
    paymentStatus: (status === 'COMPLETED'
      ? 'FULLY_PAID'
      : svc.requireDeposit && status !== 'PENDING'
        ? 'DEPOSIT_PAID'
        : 'PENDING') as PaymentStatus,
    paidAt: status === 'COMPLETED' ? iso(start + svc.durationMinutes * 60_000) : null,
    paymentMethods: (status === 'COMPLETED' ? [rand() < 0.5 ? 'CASH' : 'BCEL_ONE_QR'] : []) as PaymentMethod[],
    depositRequired: svc.requireDeposit ? (svc.depositAmount ?? 0) : 0,
    rating: status === 'COMPLETED' && rand() < 0.6 ? int(3, 5) : null,
    hasCustomerNotes: i % 5 === 0,
    hasStaffNotes: i % 9 === 0,
    roomName: null,
    travelFee: 0,
  };
}).sort((a, b) => a.startAt.localeCompare(b.startAt));

// --- Queue tickets (today) — two branches, full lifecycle so the board can show
//     per-stage timing, SLA ageing, priority mix and completion throughput. ---
export const queueTickets: QueueTicket[] = Array.from({ length: 14 }, (_, i) => {
  const svc = pick(services);
  const dur = svc.durationMinutes;
  const status: QueueTicket['status'] =
    i < 2 ? 'IN_SERVICE' : i < 4 ? 'CALLED' : i < 8 ? 'WAITING' : 'COMPLETED';
  const branch = i % 5 === 0 ? branches[1]! : branches[0]!;
  const cust = pick(customers);
  const pr = rand();
  const priority: QueueTicket['priority'] = pr < 0.15 ? 'VIP' : pr < 0.4 ? 'APPOINTMENT' : 'NORMAL';

  let issuedMs: number;
  let calledMs: number | null = null;
  let startedMs: number | null = null;
  let completedMs: number | null = null;
  if (status === 'COMPLETED') {
    // spread completions across the morning so the throughput chart has shape
    completedMs = now - ((13 - i) * 24 + 2) * 60_000;
    startedMs = completedMs - dur * 60_000;
    calledMs = startedMs - int(1, 5) * 60_000;
    issuedMs = calledMs - int(4, 22) * 60_000;
  } else if (status === 'WAITING') {
    issuedMs = now - (14 - i) * 11 * 60_000;
  } else {
    issuedMs = now - ((14 - i) * 11 + 25) * 60_000;
    calledMs = issuedMs + int(4, 22) * 60_000;
    if (status === 'IN_SERVICE') startedMs = calledMs + int(1, 5) * 60_000;
  }

  return {
    id: uuid(0x1500 + i),
    number: `A${String(i + 1).padStart(3, '0')}`,
    branchId: branch.id,
    branchName: branch.name,
    customerName: cust.name,
    customerPhone: rand() < 0.6 ? cust.phone : null,
    serviceName: svc.name,
    serviceDurationMin: dur,
    staffName: status === 'WAITING' ? null : pick(staff).name,
    priority,
    status,
    issuedAt: iso(issuedMs),
    calledAt: calledMs == null ? null : iso(calledMs),
    startedAt: startedMs == null ? null : iso(startedMs),
    completedAt: completedMs == null ? null : iso(completedMs),
  };
});

// --- Time-off requests ---
export const timeOff: TimeOffRequest[] = Array.from({ length: 5 }, (_, i) => {
  const s = staff[i]!;
  const startMs = now + int(3, 30) * DAY;
  return {
    id: uuid(0x1800 + i),
    staffId: s.id,
    staffName: s.name,
    startDate: iso(startMs).slice(0, 10),
    endDate: iso(startMs + int(0, 4) * DAY).slice(0, 10),
    reason: pick(['ວຽກຄອບຄົວ', 'ພົບແພດ', 'ພັກຜ່ອນ', 'ສ່ວນຕົວ']),
    status: i === 0 ? 'PENDING' : pick(['PENDING', 'APPROVED', 'REJECTED']),
    requestedAt: iso(now - int(1, 10) * DAY),
  };
});

export const NOW_MS = now;
