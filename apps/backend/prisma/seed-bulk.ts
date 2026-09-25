// ສະຄຣິບ seed ຂໍ້ມູນຈຳນວນຫຼາຍ ສຳລັບທົດສອບ UI (pagination, scroll, ຕາຕະລາງໃຫຍ່, ...).
// ແຍກຈາກ seed.ts ຫຼັກ — ຕ້ອງລັນ `pnpm db:seed` ກ່ອນ ເພື່ອໃຫ້ມີ branch/service/staff ພື້ນຖານ.
// ໃຊ້: pnpm db:seed:bulk
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

// ---- ຈຳນວນຂໍ້ມູນ (ປັບໄດ້ຕາມຕ້ອງການ) --------------------------------------
const N_CUSTOMERS = 800;
const N_STAFF = 15;
const N_SERVICES_EXTRA = 14;
const N_PRODUCTS = 50;
const N_SUPPLIERS = 10;
const N_PURCHASE_ORDERS = 80;
const N_EXPENSES = 300;
const N_APPOINTMENTS = 1500;
const N_BOOKING_GROUPS = 40;
const N_GIFT_CARDS = 150;
const N_PACKAGES = 15;
const N_USER_PACKAGES = 200;
const N_REFERRAL_CODES = 300;
const N_AFFILIATE_PROFILES = 60;
const N_CHAT_THREADS = 300;
const N_MARKETING_CAMPAIGNS = 15;
const N_NOTIFICATION_LOGS = 2000;
const N_PUSH_DEVICES = 500;
const N_AUDIT_LOGS = 1000;
const N_WAITLISTS = 150;
const N_QUEUE_TICKETS = 200;
const N_CONSENT_FORMS = 300;
const N_SKIN_ANALYSES = 200;
const N_BOT_CONVERSATIONS = 100;
const N_TELEGRAM_LINKS = 50;
const N_BRANCH_CLOSURES = 10;
const N_STAFF_TIME_OFFS = 40;
const ATTENDANCE_DAYS = 60;
const KPI_MONTHS = 6;

const HASH = bcrypt.hashSync('Customer@12345', 10);
const uuid = (): string => crypto.randomUUID();
const randInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)]!;
const pickSome = <T>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i += 1) {
    out.push(copy.splice(randInt(0, copy.length - 1), 1)[0]!);
  }
  return out;
};
const daysFromNow = (d: number): Date => new Date(Date.now() + d * 86400000);

/** `never[]` ໃຫ້ callback ສົ່ງ batch ເຂົ້າ `createMany({ data })` ຂອງ model ໃດກໍໄດ້ ໂດຍບໍ່ຕ້ອງໃຊ້ `any`
 * (ຂໍ້ມູນ seed ເປັນ object literal ຫຼວມ — enum ເປັນ string). */
async function createManyBatched(
  label: string,
  data: unknown[],
  fn: (batch: never[]) => Promise<unknown>,
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < data.length; i += batchSize) {
    await fn(data.slice(i, i + batchSize) as never[]);
  }
  console.log(`  ✓ ${label}: ${data.length}`);
}

// ---- ຂໍ້ມູນຊື່ພາສາລາວ ------------------------------------------------------
const MALE_FIRST = ['ສົມສັກ', 'ບຸນມີ', 'ວິໄລ', 'ໄກສອນ', 'ພອນສະຫວັນ', 'ອຸດົມ', 'ສີໄພ', 'ຄຳສິງ', 'ບຸນທັນ', 'ສຸກສະຫວັນ', 'ທອງແດງ', 'ອຳມະລິນ'];
const FEMALE_FIRST = ['ສົມສະໜຸກ', 'ຈັນທະລາ', 'ນ້ອຍ', 'ວັນນະພອນ', 'ດາລາ', 'ສີສະຫວາດ', 'ບົວທອງ', 'ແພງ', 'ຄຳແພງ', 'ອຳມະລິນ', 'ນາງແກ້ວ', 'ພອນສະໄໝ'];
const LAST_NAMES = ['ພິມມະສອນ', 'ແກ້ວມະນີ', 'ໄຊຍະວົງ', 'ຈັນທະວົງ', 'ສີວິໄລ', 'ບົວພັນ', 'ວົງສະຫວັນ', 'ອິນທະວົງ', 'ພົມມະຈັນ', 'ແສງອາລຸນ', 'ຄຳມະນີ', 'ສຸລິຍະວົງ'];
const randomName = (): { name: string; gender: string } => {
  const isFemale = Math.random() < 0.55;
  const first = isFemale ? pick(FEMALE_FIRST) : pick(MALE_FIRST);
  const title = isFemale ? 'ນາງ' : 'ທ້າວ';
  return { name: `${title} ${first} ${pick(LAST_NAMES)}`, gender: isFemale ? 'FEMALE' : 'MALE' };
};
const REVIEW_COMMENTS = [
  'ບໍລິການດີຫຼາຍ ພະນັກງານເປັນກັນເອງ',
  'ພໍໃຈຫຼາຍ ຈະກັບມາໃຊ້ບໍລິການອີກ',
  'ຊ່າງມືດີ ຄິ້ວຄາຄິ້ວແຄ້ວ',
  'ຮ້ານສະອາດ ບັນຍາກາດດີ',
  'ລໍຖ້າດົນໜ້ອຍໜຶ່ງ ແຕ່ຄຸນນະພາບການບໍລິການດີ',
  'ລາຄາເໝາະສົມກັບຄຸນນະພາບ',
  null,
];
const EXPENSE_CATEGORIES = ['ຄ່າເຊົ່າ', 'ຄ່າໄຟຟ້າ', 'ຄ່າວັດຖຸດິບ', 'ຄ່າການຕະຫຼາດ', 'ຄ່າຊ່ອມແປງ', 'ຄ່າອື່ນໆ'];
const PRODUCT_UNITS = ['ຕຸກ', 'ຫຼອດ', 'ອັນ', 'ຊອງ', 'ກ່ອງ'];

async function main(): Promise<void> {
  const branches = await prisma.branch.findMany();
  const categories = await prisma.serviceCategory.findMany();
  const existingServices = await prisma.service.findMany();
  const existingStaff = await prisma.staffProfile.findMany();
  const existingCustomers = await prisma.user.findMany({ where: { role: 'CUSTOMER' } });

  if (branches.length === 0 || categories.length === 0 || existingServices.length === 0) {
    throw new Error('ກະລຸນາລັນ `pnpm db:seed` ກ່ອນ (ຍັງບໍ່ມີ branch/service ພື້ນຖານ)');
  }
  console.log('🌱 ເລີ່ມ bulk seed...');

  // ---- ບໍລິການເພີ່ມເຕີມ ----------------------------------------------------
  const extraServices = Array.from({ length: N_SERVICES_EXTRA }, (_, i) => ({
    id: uuid(),
    categoryId: pick(categories).id,
    branchId: pick(branches).id,
    name: `ບໍລິການເສີມ #${i + 1}`,
    price: new Prisma.Decimal(randInt(50, 800) * 1000),
    durationMinutes: randInt(20, 120),
    imageUrl: `https://picsum.photos/seed/svc-bulk-${i}/600/400`,
    isActive: true,
  }));
  await createManyBatched('Service (extra)', extraServices, (b) => prisma.service.createMany({ data: b }));
  const allServices = [...existingServices, ...extraServices];

  // ---- ຜູ້ໃຊ້ / ລູກຄ້າ -------------------------------------------------------
  const customers = Array.from({ length: N_CUSTOMERS }, (_, i) => {
    const { name, gender } = randomName();
    return {
      id: uuid(),
      branchId: pick(branches).id,
      role: 'CUSTOMER' as const,
      name,
      gender,
      phone: `0209${(1000000 + i).toString()}`,
      email: `customer${i + 1}@auraseed.la`,
      password: HASH,
      dateOfBirth: new Date(randInt(1970, 2005), randInt(0, 11), randInt(1, 28)),
      avatarUrl: `https://i.pravatar.cc/300?u=aura-cust-${i}`,
      createdAt: daysFromNow(-randInt(0, 400)),
    };
  });
  await createManyBatched('User (customers)', customers, (b) => prisma.user.createMany({ data: b }));
  const allCustomers = [...existingCustomers, ...customers];

  // ---- ພະນັກງານໃໝ່ ----------------------------------------------------------
  const staffTitles = ['ຊ່າງຜົມ', 'ຊ່າງເລັບ', 'ນັກນວດບຳບັດ', 'ຊ່າງແຕ່ງໜ້າ', 'ຜູ້ຊ່ຽວຊານຜິວພັນ'];
  const staffUsers = Array.from({ length: N_STAFF }, (_, i) => {
    const { name } = randomName();
    return {
      id: uuid(),
      branchId: pick(branches).id,
      role: 'STAFF' as const,
      name,
      phone: `02056${(600000 + i).toString()}`,
      password: HASH,
      avatarUrl: `https://i.pravatar.cc/300?u=aura-staff-bulk-${i}`,
    };
  });
  await createManyBatched('User (staff)', staffUsers, (b) => prisma.user.createMany({ data: b }));

  const newStaffProfiles = staffUsers.map((u, i) => ({
    id: uuid(),
    userId: u.id,
    title: pick(staffTitles),
    bio: 'ພະນັກງານທົດສອບຂໍ້ມູນຈຳນວນຫຼາຍ (seed-bulk).',
    commissionRate: [0.1, 0.12, 0.15][i % 3],
    rating: Number((3.5 + Math.random() * 1.5).toFixed(1)),
    isHomeServiceAvailable: Math.random() < 0.25,
  }));
  await createManyBatched('StaffProfile', newStaffProfiles, (b) => prisma.staffProfile.createMany({ data: b }));
  const allStaff = [...existingStaff, ...newStaffProfiles];

  const staffBranches = newStaffProfiles.map((sp, i) => ({
    id: uuid(),
    staffProfileId: sp.id,
    branchId: staffUsers[i]!.branchId,
    isPrimary: true,
  }));
  await createManyBatched('StaffBranch', staffBranches, (b) => prisma.staffBranch.createMany({ data: b }));

  const staffServiceRows: Array<{ id: string; staffProfileId: string; serviceId: string }> = [];
  for (const sp of newStaffProfiles) {
    for (const svc of pickSome(allServices, randInt(2, 5))) {
      staffServiceRows.push({ id: uuid(), staffProfileId: sp.id, serviceId: svc.id });
    }
  }
  await createManyBatched('StaffService', staffServiceRows, (b) => prisma.staffService.createMany({ data: b, skipDuplicates: true }));

  const workingHours: Array<Record<string, unknown>> = [];
  for (const sp of newStaffProfiles) {
    for (let dow = 0; dow <= 6; dow += 1) {
      workingHours.push({
        id: uuid(),
        staffProfileId: sp.id,
        dayOfWeek: dow,
        startTime: '09:00',
        endTime: '18:00',
        breakStartTime: '12:00',
        breakEndTime: '13:00',
        isDayOff: dow === 0,
      });
    }
  }
  await createManyBatched('WorkingHour', workingHours, (b) => prisma.workingHour.createMany({ data: b }));

  const staffTimeOffs = Array.from({ length: N_STAFF_TIME_OFFS }, () => {
    const start = daysFromNow(randInt(-30, 60));
    return {
      id: uuid(),
      staffProfileId: pick(allStaff).id,
      startDate: start,
      endDate: new Date(start.getTime() + randInt(1, 3) * 86400000),
      reason: pick(['ພັກຮ້ອນ', 'ລາປ່ວຍ', 'ທຸລະກິດຄອບຄົວ']),
      isApproved: Math.random() < 0.7,
      status: pick(['PENDING', 'APPROVED', 'REJECTED']),
    };
  });
  await createManyBatched('StaffTimeOff', staffTimeOffs, (b) => prisma.staffTimeOff.createMany({ data: b }));

  const attendances: Array<Record<string, unknown>> = [];
  for (const sp of allStaff) {
    for (let d = 0; d < ATTENDANCE_DAYS; d += 1) {
      const date = daysFromNow(-d);
      if (date.getDay() === 0) continue;
      const checkIn = new Date(date);
      checkIn.setHours(9, randInt(-10, 20), 0, 0);
      attendances.push({
        id: uuid(),
        staffProfileId: sp.id,
        date,
        checkIn,
        checkOut: new Date(checkIn.getTime() + 8 * 3600000),
        status: pick(['ON_TIME', 'ON_TIME', 'ON_TIME', 'LATE', 'OVERTIME']),
      });
    }
  }
  await createManyBatched('StaffAttendance', attendances, (b) => prisma.staffAttendance.createMany({ data: b }));

  const kpiGoals: Array<Record<string, unknown>> = [];
  for (const sp of allStaff) {
    for (let m = 0; m < KPI_MONTHS; m += 1) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const target = randInt(3, 15) * 1000000;
      kpiGoals.push({
        id: uuid(),
        staffProfileId: sp.id,
        monthYear,
        targetRevenue: new Prisma.Decimal(target),
        actualRevenue: new Prisma.Decimal(randInt(0, 120) * target / 100),
        bonusAmount: new Prisma.Decimal(randInt(0, 5) * 100000),
        isBonusPaid: Math.random() < 0.5,
      });
    }
  }
  // skipDuplicates: setMonth() ລົ້ນວັນທີ 31 ໃຫ້ເດືອນຊ້ຳໄດ້ — ແຖວຊ້ຳຖືກກັນດ້ວຍ unique (staffProfileId, monthYear).
  await createManyBatched('StaffKpiGoal', kpiGoals, (b) => prisma.staffKpiGoal.createMany({ data: b, skipDuplicates: true }));

  // ---- ວັດຖຸດິບ / ຜູ້ສະໜອງ / ການສັ່ງຊື້ / ສາງ --------------------------------
  const suppliers = Array.from({ length: N_SUPPLIERS }, (_, i) => ({
    id: uuid(),
    name: `ບໍລິສັດ ຊັບພາຍເລີ #${i + 1} ຈຳກັດ`,
    contactPerson: randomName().name,
    phone: `020${randInt(50000000, 59999999)}`,
    email: `supplier${i + 1}@vendor.la`,
  }));
  await createManyBatched('Supplier', suppliers, (b) => prisma.supplier.createMany({ data: b }));

  const products = Array.from({ length: N_PRODUCTS }, (_, i) => ({
    id: uuid(),
    branchId: pick(branches).id,
    name: `ວັດຖຸດິບ #${i + 1}`,
    sku: `SKU-BULK-${i + 1}`,
    stockQty: new Prisma.Decimal(randInt(0, 100)),
    minStockQty: new Prisma.Decimal(5),
    costPrice: new Prisma.Decimal(randInt(10, 300) * 1000),
    unit: pick(PRODUCT_UNITS),
  }));
  await createManyBatched('Product', products, (b) => prisma.product.createMany({ data: b }));

  const purchaseOrders = Array.from({ length: N_PURCHASE_ORDERS }, (_, i) => {
    const status = pick(['DRAFT', 'ORDERED', 'RECEIVED', 'RECEIVED', 'CANCELLED']);
    return {
      id: uuid(),
      branchId: pick(branches).id,
      supplierId: pick(suppliers).id,
      poNumber: `PO-BULK-${i + 1}`,
      totalAmount: new Prisma.Decimal(0),
      status,
      orderDate: daysFromNow(-randInt(0, 180)),
      receivedDate: status === 'RECEIVED' ? daysFromNow(-randInt(0, 170)) : null,
    };
  });
  const poItems: Array<Record<string, unknown>> = [];
  for (const po of purchaseOrders) {
    const items = pickSome(products, randInt(1, 4));
    let total = 0;
    for (const p of items) {
      const qty = randInt(5, 50);
      const unitCost = Number(p.costPrice);
      total += qty * unitCost;
      poItems.push({ id: uuid(), purchaseOrderId: po.id, productId: p.id, quantity: new Prisma.Decimal(qty), unitCost: new Prisma.Decimal(unitCost) });
    }
    po.totalAmount = new Prisma.Decimal(total);
  }
  await createManyBatched('PurchaseOrder', purchaseOrders, (b) => prisma.purchaseOrder.createMany({ data: b }));
  await createManyBatched('PurchaseOrderItem', poItems, (b) => prisma.purchaseOrderItem.createMany({ data: b }));

  const stockMovements: Array<Record<string, unknown>> = [];
  for (const p of products) {
    for (let i = 0; i < randInt(3, 15); i += 1) {
      const type = pick(['PURCHASE_IN', 'SERVICE_CONSUMED', 'ADJUSTMENT_ADD', 'ADJUSTMENT_DEDUCT']);
      const qty = randInt(1, 20);
      stockMovements.push({
        id: uuid(),
        branchId: p.branchId,
        productId: p.id,
        type,
        // qty is always a positive magnitude in real writes (inventory.service.ts) — direction
        // comes from `type` alone. Match that here so seeded rows don't double-negate in the UI.
        qty: new Prisma.Decimal(qty),
        balanceAfter: new Prisma.Decimal(randInt(0, 200)),
        createdAt: daysFromNow(-randInt(0, 180)),
      });
    }
  }
  await createManyBatched('StockMovement', stockMovements, (b) => prisma.stockMovement.createMany({ data: b }));

  const expenses = Array.from({ length: N_EXPENSES }, () => ({
    id: uuid(),
    branchId: pick(branches).id,
    category: pick(EXPENSE_CATEGORIES),
    amount: new Prisma.Decimal(randInt(5, 500) * 10000),
    expenseDate: daysFromNow(-randInt(0, 365)),
    notes: null,
  }));
  await createManyBatched('Expense', expenses, (b) => prisma.expense.createMany({ data: b }));

  // ---- ນັດໝາຍ + ການຈ່າຍເງິນ + ຄອມມິດຊັນ + ລີວິວ + Treatment ------------------
  type Appt = {
    id: string; branchId: string; customerId: string; staffProfileId: string; serviceId: string;
    startAt: Date; endAt: Date; status: string; source: string; deliveryType: string;
    totalAmount: Prisma.Decimal; homeAddress: string | null;
  };
  const appointments: Appt[] = [];
  for (let i = 0; i < N_APPOINTMENTS; i += 1) {
    const svc = pick(allServices);
    const staff = pick(allStaff);
    const customer = pick(allCustomers);
    const branchId = pick(branches).id;
    const isPast = Math.random() < 0.7;
    const startAt = isPast
      ? daysFromNow(-randInt(1, 180))
      : daysFromNow(randInt(0, 45));
    startAt.setHours(randInt(9, 17), pick([0, 15, 30, 45]), 0, 0);
    const endAt = new Date(startAt.getTime() + svc.durationMinutes * 60000);
    const status = isPast
      ? pick(['COMPLETED', 'COMPLETED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
      : pick(['PENDING', 'CONFIRMED', 'CONFIRMED']);
    const deliveryType = Math.random() < 0.15 ? 'HOME_SERVICE' : 'IN_STORE';
    appointments.push({
      id: uuid(),
      branchId,
      customerId: customer.id,
      staffProfileId: staff.id,
      serviceId: svc.id,
      startAt,
      endAt,
      status,
      source: pick(['ONLINE', 'ONLINE', 'WALK_IN', 'ADMIN']),
      deliveryType,
      totalAmount: new Prisma.Decimal(svc.price),
      homeAddress: deliveryType === 'HOME_SERVICE' ? 'ບ້ານ' + pick(['ໜອງບອນ', 'ສີສັດຕະນາກ', 'ໂພນສີນວນ', 'ດົງປ່າແຫຼບ']) : null,
    });
  }
  await createManyBatched('Appointment', appointments, (b) => prisma.appointment.createMany({ data: b }));

  const completed = appointments.filter((a) => a.status === 'COMPLETED');
  const payable = appointments.filter((a) => a.status === 'COMPLETED' || a.status === 'CONFIRMED');

  const payments = payable.map((a) => {
    const paymentStatus = a.status === 'COMPLETED' ? 'FULLY_PAID' : pick(['PENDING', 'DEPOSIT_PAID']);
    return {
      id: uuid(),
      branchId: a.branchId,
      appointmentId: a.id,
      totalAmount: a.totalAmount,
      depositAmount: paymentStatus === 'DEPOSIT_PAID' ? new Prisma.Decimal(Number(a.totalAmount) * 0.2) : new Prisma.Decimal(0),
      paymentStatus,
      paidAt: paymentStatus !== 'PENDING' ? a.startAt : null,
    };
  });
  await createManyBatched('Payment', payments, (b) => prisma.payment.createMany({ data: b }));

  const paymentTx = payments
    .filter((p) => p.paymentStatus !== 'PENDING')
    .map((p) => ({
      id: uuid(),
      paymentId: p.id,
      method: pick(['CASH', 'CASH', 'BCEL_ONE_QR', 'CREDIT_CARD']),
      amount: p.totalAmount,
      status: 'SUCCESS',
    }));
  await createManyBatched('PaymentTransaction', paymentTx, (b) => prisma.paymentTransaction.createMany({ data: b }));

  const commissions = completed.map((a) => {
    const staff = allStaff.find((s) => s.id === a.staffProfileId)!;
    const rate = staff.commissionRate ?? 0.1;
    return {
      id: uuid(),
      staffProfileId: a.staffProfileId,
      appointmentId: a.id,
      serviceAmount: a.totalAmount,
      commissionRate: rate,
      payoutAmount: new Prisma.Decimal(Number(a.totalAmount) * rate),
      isPaid: Math.random() < 0.6,
    };
  });
  await createManyBatched('StaffCommission', commissions, (b) => prisma.staffCommission.createMany({ data: b }));

  const reviewed = pickSome(completed, Math.floor(completed.length * 0.5));
  const reviews = reviewed.map((a) => ({
    id: uuid(),
    appointmentId: a.id,
    userId: a.customerId,
    rating: pick([3, 4, 4, 5, 5, 5]),
    comment: pick(REVIEW_COMMENTS),
    createdAt: a.endAt,
  }));
  await createManyBatched('Review', reviews, (b) => prisma.review.createMany({ data: b }));

  const treated = pickSome(completed, Math.floor(completed.length * 0.35));
  const treatmentRecords = treated.map((a) => ({
    id: uuid(),
    appointmentId: a.id,
    customerId: a.customerId,
    medicalNotes: pick(['ຜິວແພ້ງ່າຍ, ໃຊ້ຜະລິດຕະພັນອ່ອນໂຍນ', 'ບໍ່ມີປະຫວັດແພ້', 'ຄວນຕິດຕາມຜົນຫຼັງ 2 ອາທິດ', null]),
    treatmentDate: a.endAt,
  }));
  await createManyBatched('TreatmentRecord', treatmentRecords, (b) => prisma.treatmentRecord.createMany({ data: b }));

  const treatmentPhotos: Array<Record<string, unknown>> = [];
  for (const tr of treatmentRecords) {
    for (const type of pickSome(['BEFORE', 'AFTER', 'PROGRESS'], randInt(1, 3))) {
      treatmentPhotos.push({ id: uuid(), treatmentRecordId: tr.id, photoUrl: `https://picsum.photos/seed/${tr.id.slice(0, 8)}-${type}/500/500`, type });
    }
  }
  await createManyBatched('TreatmentPhoto', treatmentPhotos, (b) => prisma.treatmentPhoto.createMany({ data: b }));

  // ---- HomeServiceTrip -------------------------------------------------------
  const homeApts = appointments.filter((a) => a.deliveryType === 'HOME_SERVICE');
  const trips = homeApts.map((a) => {
    const status = a.status === 'COMPLETED' ? 'COMPLETED' : a.status === 'CANCELLED' ? 'CANCELLED' : pick(['MATCHING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED']);
    const assignedAt = status === 'MATCHING' ? null : new Date(a.startAt.getTime() - randInt(20, 60) * 60000);
    const enRouteAt = assignedAt && ['EN_ROUTE', 'ARRIVED', 'COMPLETED'].includes(status)
      ? new Date(assignedAt.getTime() + randInt(2, 10) * 60000)
      : null;
    const arrivedAt = enRouteAt && ['ARRIVED', 'COMPLETED'].includes(status)
      ? new Date(enRouteAt.getTime() + randInt(5, 30) * 60000)
      : null;
    return {
      id: uuid(),
      appointmentId: a.id,
      status,
      matchedStaffId: a.staffProfileId,
      matchRadiusM: randInt(1000, 5000),
      etaMinutes: randInt(5, 45),
      assignedAt,
      enRouteAt,
      arrivedAt,
      startedAt: status === 'COMPLETED' ? arrivedAt : null,
      completedAt: status === 'COMPLETED' ? a.endAt : null,
      cancelledAt: status === 'CANCELLED' ? a.endAt : null,
    };
  });
  await createManyBatched('HomeServiceTrip', trips, (b) => prisma.homeServiceTrip.createMany({ data: b }));

  // ---- QueueTicket / Waitlist -------------------------------------------------
  const walkIns = pickSome(appointments.filter((a) => a.source === 'WALK_IN'), Math.min(N_QUEUE_TICKETS, appointments.filter((a) => a.source === 'WALK_IN').length));
  const queueTickets = walkIns.map((a, i) => ({
    id: uuid(),
    branchId: a.branchId,
    serviceId: a.serviceId,
    appointmentId: a.id,
    ticketNumber: `Q-${1000 + i}`,
    customerName: 'ລູກຄ້າ Walk-in',
    phone: `020${randInt(50000000, 59999999)}`,
    status: pick(['WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED']),
  }));
  await createManyBatched('QueueTicket', queueTickets, (b) => prisma.queueTicket.createMany({ data: b }));

  const waitlists = Array.from({ length: N_WAITLISTS }, () => ({
    id: uuid(),
    branchId: pick(branches).id,
    customerId: pick(allCustomers).id,
    serviceId: pick(allServices).id,
    preferredDate: daysFromNow(randInt(1, 30)),
  }));
  await createManyBatched('Waitlist', waitlists, (b) => prisma.waitlist.createMany({ data: b }));

  // ---- ConsentForm / SkinHairAnalysis -----------------------------------------
  const consentForms = Array.from({ length: N_CONSENT_FORMS }, () => {
    const svc = pick(allServices);
    return {
      id: uuid(),
      userId: pick(allCustomers).id,
      serviceId: svc.id,
      serviceName: svc.name,
      signatureUrl: `https://picsum.photos/seed/consent-${uuid().slice(0, 8)}/300/150`,
    };
  });
  await createManyBatched('ConsentForm', consentForms, (b) => prisma.consentForm.createMany({ data: b }));

  const skinAnalyses = Array.from({ length: N_SKIN_ANALYSES }, () => ({
    id: uuid(),
    userId: pick(allCustomers).id,
    photoUrl: `https://picsum.photos/seed/skin-${uuid().slice(0, 8)}/500/500`,
    analysisType: pick(['SKIN', 'HAIR']),
    detectedIssues: { issues: pickSome(['ຜິວແຫ້ງ', 'ຮອຍດ່າງດຳ', 'ສິວ', 'ຜົມແຕກປາຍ', 'ໜັງຫົວມັນ'], randInt(1, 3)) },
    recommendedService: { serviceIds: pickSome(allServices, randInt(1, 2)).map((s) => s.id) },
  }));
  await createManyBatched('SkinHairAnalysis', skinAnalyses, (b) => prisma.skinHairAnalysis.createMany({ data: b }));

  // ---- BookingGroup ------------------------------------------------------------
  const bookingGroups = Array.from({ length: N_BOOKING_GROUPS }, () => ({
    id: uuid(),
    branchId: pick(branches).id,
    payerId: pick(allCustomers).id,
    title: 'ຈອງກຸ່ມ',
    totalAmount: new Prisma.Decimal(randInt(200, 2000) * 1000),
    status: pick(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']),
  }));
  await createManyBatched('BookingGroup', bookingGroups, (b) => prisma.bookingGroup.createMany({ data: b }));

  // ---- GiftCard ------------------------------------------------------------------
  const giftCards = Array.from({ length: N_GIFT_CARDS }, (_, i) => {
    const initial = randInt(5, 50) * 10000;
    const isRedeemed = Math.random() < 0.4;
    return {
      id: uuid(),
      branchId: pick(branches).id,
      code: `GIFT-BULK-${i + 1}`,
      initialBalance: new Prisma.Decimal(initial),
      currentBalance: new Prisma.Decimal(isRedeemed ? randInt(0, initial) : initial),
      buyerId: pick(allCustomers).id,
      redeemedByUserId: isRedeemed ? pick(allCustomers).id : null,
      recipientEmail: `giftrecipient${i + 1}@auraseed.la`,
      expireDate: daysFromNow(randInt(30, 365)),
      isRedeemed,
    };
  });
  await createManyBatched('GiftCard', giftCards, (b) => prisma.giftCard.createMany({ data: b }));

  const giftCardTx = giftCards
    .filter((g) => g.isRedeemed)
    .map((g) => ({ id: uuid(), giftCardId: g.id, amount: new Prisma.Decimal(Number(g.initialBalance) - Number(g.currentBalance)), balanceAfter: g.currentBalance }));
  await createManyBatched('GiftCardTransaction', giftCardTx, (b) => prisma.giftCardTransaction.createMany({ data: b }));

  // ---- Loyalty ---------------------------------------------------------------------
  const loyaltyAccounts = customers.map((c) => ({
    id: uuid(),
    userId: c.id,
    points: randInt(0, 5000),
    tierLevel: pick(['SILVER', 'SILVER', 'GOLD', 'PLATINUM']),
  }));
  await createManyBatched('LoyaltyAccount', loyaltyAccounts, (b) => prisma.loyaltyAccount.createMany({ data: b, skipDuplicates: true }));

  const loyaltyTx: Array<Record<string, unknown>> = [];
  for (const la of loyaltyAccounts) {
    for (let i = 0; i < randInt(1, 4); i += 1) {
      const type = pick(['EARN', 'EARN', 'REDEEM', 'EXPIRE', 'ADJUST']);
      loyaltyTx.push({
        id: uuid(),
        loyaltyAccountId: la.id,
        points: type === 'EARN' ? randInt(10, 200) : -randInt(10, 200),
        type,
        createdAt: daysFromNow(-randInt(0, 300)),
      });
    }
  }
  await createManyBatched('LoyaltyTransaction', loyaltyTx, (b) => prisma.loyaltyTransaction.createMany({ data: b }));

  // ---- Package / UserPackage -------------------------------------------------------
  const packages = Array.from({ length: N_PACKAGES }, (_, i) => ({
    id: uuid(),
    branchId: pick(branches).id,
    name: `ແພັກເກັດ #${i + 1}`,
    totalPrice: new Prisma.Decimal(randInt(300, 3000) * 1000),
  }));
  await createManyBatched('Package', packages, (b) => prisma.package.createMany({ data: b }));

  const packageItems: Array<Record<string, unknown>> = [];
  for (const pkg of packages) {
    for (const svc of pickSome(allServices, randInt(1, 3))) {
      packageItems.push({ id: uuid(), packageId: pkg.id, serviceId: svc.id, totalUnits: randInt(3, 10) });
    }
  }
  await createManyBatched('PackageItem', packageItems, (b) => prisma.packageItem.createMany({ data: b }));

  const userPackages = Array.from({ length: N_USER_PACKAGES }, () => ({
    id: uuid(),
    userId: pick(allCustomers).id,
    packageId: pick(packages).id,
    expireDate: daysFromNow(randInt(10, 365)),
  }));
  await createManyBatched('UserPackage', userPackages, (b) => prisma.userPackage.createMany({ data: b }));

  const userPackageItems: Array<Record<string, unknown>> = [];
  for (const up of userPackages) {
    const svc = pick(allServices);
    const total = randInt(3, 10);
    userPackageItems.push({ id: uuid(), userPackageId: up.id, serviceId: svc.id, totalUnits: total, remainingUnits: randInt(0, total) });
  }
  await createManyBatched('UserPackageItem', userPackageItems, (b) => prisma.userPackageItem.createMany({ data: b }));

  // ---- Referral / Affiliate ----------------------------------------------------------
  const referralCandidates = pickSome(allCustomers, N_REFERRAL_CODES);
  const referralCodes = referralCandidates.map((c, i) => ({
    id: uuid(),
    userId: c.id,
    code: `REF-BULK-${i + 1}`,
    discountAmount: new Prisma.Decimal(50000),
  }));
  await createManyBatched('ReferralCode', referralCodes, (b) => prisma.referralCode.createMany({ data: b, skipDuplicates: true }));

  const referralUsages = pickSome(referralCodes, Math.floor(referralCodes.length * 0.5)).map((rc) => ({
    id: uuid(),
    referralCodeId: rc.id,
    referredUserId: pick(allCustomers.filter((c) => c.id !== rc.userId)).id,
    rewardClaimed: Math.random() < 0.6,
  }));
  await createManyBatched('ReferralUsage', referralUsages, (b) => prisma.referralUsage.createMany({ data: b }));

  const affiliateCandidates = pickSome(allCustomers, N_AFFILIATE_PROFILES);
  const affiliateProfiles = affiliateCandidates.map((c) => ({
    id: uuid(),
    userId: c.id,
    commissionRate: 0.1,
    totalEarnings: new Prisma.Decimal(randInt(0, 5000) * 1000),
    unpaidBalance: new Prisma.Decimal(randInt(0, 1000) * 1000),
  }));
  await createManyBatched('AffiliateProfile', affiliateProfiles, (b) => prisma.affiliateProfile.createMany({ data: b, skipDuplicates: true }));

  const affiliatePayouts: Array<Record<string, unknown>> = [];
  for (const ap of affiliateProfiles) {
    for (let i = 0; i < randInt(0, 3); i += 1) {
      affiliatePayouts.push({
        id: uuid(),
        affiliateProfileId: ap.id,
        amount: new Prisma.Decimal(randInt(50, 500) * 1000),
        status: pick(['PENDING', 'PROCESSING', 'PAID', 'REJECTED']),
        payoutMethod: pick(['BCEL_ONE', 'BANK_TRANSFER']),
        accountDetails: '020xxxxxxxx',
      });
    }
  }
  await createManyBatched('AffiliatePayout', affiliatePayouts, (b) => prisma.affiliatePayout.createMany({ data: b }));

  // ---- Chat ------------------------------------------------------------------------
  const consultationApts = pickSome(appointments, Math.min(N_CHAT_THREADS, appointments.length));
  const threads = consultationApts.map((a) => ({
    id: uuid(),
    type: 'CONSULTATION' as const,
    branchId: a.branchId,
    appointmentId: a.id,
    lastMessageAt: a.startAt,
  }));
  await createManyBatched('ChatThread', threads, (b) => prisma.chatThread.createMany({ data: b, skipDuplicates: true }));

  const staffUserIds = [
    ...existingStaff.map((s) => s.userId),
    ...staffUsers.map((u) => u.id),
  ];
  const participants: Array<Record<string, unknown>> = [];
  const messages: Array<Record<string, unknown>> = [];
  const MSG_BODIES = [
    'ສະບາຍດີ, ຢາກສອບຖາມກ່ຽວກັບບໍລິການ',
    'ມື້ນີ້ວ່າງເວລາໃດແດ່',
    'ໄດ້ເລີຍ, ຂອບໃຈຫຼາຍ',
    'ລໍຖ້າຢູ່ໜ້າຮ້ານແລ້ວເດີ',
    'ຂໍໂທດ, ຂໍປ່ຽນເວລານັດໝາຍໄດ້ບໍ',
    'ໂອເຄ, ພົບກັນວັນນັ້ນເລີຍ',
  ];
  for (let i = 0; i < threads.length; i += 1) {
    const t = threads[i]!;
    const apt = consultationApts[i]!;
    const staffUserId = pick(staffUserIds);
    participants.push({ id: uuid(), threadId: t.id, userId: apt.customerId });
    participants.push({ id: uuid(), threadId: t.id, userId: staffUserId });
    for (let m = 0; m < randInt(1, 8); m += 1) {
      const senderId = Math.random() < 0.5 ? apt.customerId : staffUserId;
      messages.push({
        id: uuid(),
        threadId: t.id,
        senderId,
        senderRole: senderId === apt.customerId ? 'CUSTOMER' : 'STAFF',
        body: pick(MSG_BODIES),
        createdAt: new Date(t.lastMessageAt!.getTime() - (randInt(1, 8) - m) * 3600000),
      });
    }
  }
  await createManyBatched('ConversationParticipant', participants, (b) => prisma.conversationParticipant.createMany({ data: b, skipDuplicates: true }));
  await createManyBatched('ChatMessage', messages, (b) => prisma.chatMessage.createMany({ data: b }));

  const chatReports = Array.from({ length: 30 }, () => ({
    id: uuid(),
    conversationId: pick(threads).id,
    reportedById: pick(allCustomers).id,
    reason: pick(['ຂໍ້ຄວາມບໍ່ເໝາະສົມ', 'Spam', 'ອື່ນໆ']),
    status: pick(['PENDING', 'REVIEWED', 'ACTIONED']),
  }));
  await createManyBatched('ChatReport', chatReports, (b) => prisma.chatReport.createMany({ data: b }));

  const chatBlocks = Array.from({ length: 20 }, () => {
    const [a, b2] = pickSome(allCustomers, 2) as [(typeof allCustomers)[number], (typeof allCustomers)[number]];
    return { id: uuid(), blockerId: a.id, blockedId: b2.id };
  });
  await createManyBatched('ChatBlock', chatBlocks, (b) => prisma.chatBlock.createMany({ data: b, skipDuplicates: true }));

  // ---- Marketing / Notifications ---------------------------------------------------
  const campaigns = Array.from({ length: N_MARKETING_CAMPAIGNS }, (_, i) => ({
    id: uuid(),
    branchId: pick(branches).id,
    name: `ແຄມເປນ #${i + 1}`,
    type: pick(['BIRTHDAY', 'WIN_BACK', 'FESTIVAL_PROMO', 'CUSTOM']),
    discountCode: `PROMO${i + 1}`,
  }));
  await createManyBatched('MarketingCampaign', campaigns, (b) => prisma.marketingCampaign.createMany({ data: b }));

  const campaignRecipients: Array<Record<string, unknown>> = [];
  for (const camp of campaigns) {
    for (const c of pickSome(allCustomers, randInt(20, 60))) {
      campaignRecipients.push({
        id: uuid(),
        campaignId: camp.id,
        userId: c.id,
        status: pick(['SENT', 'OPENED', 'CONVERTED', 'FAILED']),
        convertedAt: Math.random() < 0.2 ? daysFromNow(-randInt(0, 30)) : null,
      });
    }
  }
  await createManyBatched('CampaignRecipient', campaignRecipients, (b) => prisma.campaignRecipient.createMany({ data: b, skipDuplicates: true }));

  const notifTitles = ['ເຕືອນນັດໝາຍ', 'ຊຳລະເງິນສຳເລັດ', 'ໄດ້ຮັບຄະແນນສະສົມ', 'ໂປຣໂມຊັ່ນພິເສດ', 'ມີຄິວວ່າງແລ້ວ'];
  const notificationLogs = Array.from({ length: N_NOTIFICATION_LOGS }, () => ({
    id: uuid(),
    userId: pick(allCustomers).id,
    title: pick(notifTitles),
    body: 'ນີ້ແມ່ນຂໍ້ຄວາມແຈ້ງເຕືອນສຳລັບທົດສອບ UI.',
    type: pick(['APPOINTMENT', 'PAYMENT', 'LOYALTY', 'CAMPAIGN', 'WAITLIST']),
    isRead: Math.random() < 0.6,
    sentAt: daysFromNow(-randInt(0, 200)),
  }));
  await createManyBatched('NotificationLog', notificationLogs, (b) => prisma.notificationLog.createMany({ data: b }));

  const pushDevices = Array.from({ length: N_PUSH_DEVICES }, (_, i) => ({
    id: uuid(),
    userId: pick(allCustomers).id,
    token: `ExponentPushToken[bulk-${i}]`,
    platform: pick(['ios', 'android']),
    deviceName: pick(['iPhone 14', 'iPhone 15', 'Samsung Galaxy S23', 'Xiaomi Redmi Note 12']),
  }));
  await createManyBatched('PushDevice', pushDevices, (b) => prisma.pushDevice.createMany({ data: b, skipDuplicates: true }));

  // ---- Audit / Bot / Telegram / BranchClosure --------------------------------------
  const auditLogs = Array.from({ length: N_AUDIT_LOGS }, () => ({
    id: uuid(),
    branchId: pick(branches).id,
    userId: pick([...allCustomers, ...staffUsers]).id,
    action: pick(['CREATE', 'UPDATE', 'DELETE', 'LOGIN']),
    entityName: pick(['Appointment', 'Payment', 'Service', 'Product', 'User']),
    createdAt: daysFromNow(-randInt(0, 200)),
  }));
  await createManyBatched('AuditLog', auditLogs, (b) => prisma.auditLog.createMany({ data: b }));

  const botConversations = Array.from({ length: N_BOT_CONVERSATIONS }, () => ({
    id: uuid(),
    platform: pick(['WHATSAPP', 'LINE', 'MESSENGER', 'TELEGRAM', 'VOICE_AI']),
    externalUserId: `ext-${uuid().slice(0, 8)}`,
    intentDetected: pick(['BOOK_APPOINTMENT', 'CHECK_PRICE', 'CANCEL', null]),
    isResolved: Math.random() < 0.7,
  }));
  await createManyBatched('BotConversation', botConversations, (b) => prisma.botConversation.createMany({ data: b }));

  const telegramCandidates = pickSome(allCustomers, N_TELEGRAM_LINKS);
  const telegramLinks = telegramCandidates.map((c, i) => ({
    id: uuid(),
    userId: c.id,
    telegramChatId: `tg-${100000 + i}`,
    linkedAt: daysFromNow(-randInt(0, 100)),
  }));
  await createManyBatched('TelegramLink', telegramLinks, (b) => prisma.telegramLink.createMany({ data: b, skipDuplicates: true }));

  const branchClosures = Array.from({ length: N_BRANCH_CLOSURES }, () => ({
    id: uuid(),
    branchId: Math.random() < 0.5 ? pick(branches).id : null,
    date: daysFromNow(randInt(1, 200)),
    reason: pick(['ວັນພັກລັດຖະການ', 'ປັບປຸງຮ້ານ', 'ວັນຫວ່າງງານພະນັກງານ']),
  }));
  await createManyBatched('BranchClosure', branchClosures, (b) => prisma.branchClosure.createMany({ data: b }));

  console.log('✅ Bulk seed ສຳເລັດ');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
