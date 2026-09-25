import type {
  AccessTokenPayload,
  CreateGratuityInput,
  GratuityListQuery,
  GratuityListView,
  GratuityPayoutInput,
  GratuityView,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { vientianeDayStart } from '../../utils/dateHelpers.js';
import { dec, round2, toNum } from '../../utils/money.js';
import { assertCashDrawerOpen } from '../payments-treasury/cash-drawer/cash-policy.js';

/**
 * Wave 11 (F-19) — ທິບ (gratuity). ບໍ່ແມ່ນລາຍຮັບຂອງຮ້ານ → ບໍ່ຢູ່ໃນ Payment.totalAmount / PaymentTransaction
 * (ບໍ່ກະທົບ VAT, ຄ່າຄອມ, ສະຖານະບິນ, ການຄືນເງິນ). ເປັນໜີ້ສິນຕໍ່ພະນັກງານ (Tips payable) ຈົນກວ່າຈະຈ່າຍອອກ.
 * ທິບເງິນສົດ ບັນທຶກ PAYIN ເຂົ້າກະລິ້ນຊັກທີ່ເປີດຢູ່ ເພື່ອບໍ່ໃຫ້ນັບເງິນເກີນ (over) ຕອນປິດກະ.
 */

const INCLUDE = {
  payment: { select: { invoiceNo: true } },
  branch: { select: { name: true } },
  collectedBy: { select: { name: true } },
  shares: { include: { staffProfile: { select: { user: { select: { name: true } } } } } },
} satisfies Prisma.GratuityInclude;
type Row = Prisma.GratuityGetPayload<{ include: typeof INCLUDE }>;

function toView(g: Row): GratuityView {
  return {
    id: g.id,
    paymentId: g.paymentId,
    invoiceNo: g.payment.invoiceNo,
    branchName: g.branch.name,
    method: g.method,
    amount: toNum(g.amount),
    note: g.note,
    collectedByName: g.collectedBy.name,
    createdAt: g.createdAt.toISOString(),
    shares: g.shares.map((s) => ({
      id: s.id,
      staffProfileId: s.staffProfileId,
      staffName: s.staffProfile.user.name,
      amount: toNum(s.amount),
      paidOutAt: s.paidOutAt?.toISOString() ?? null,
    })),
  };
}

function assertScope(auth: AccessTokenPayload, branchId: string): void {
  if (auth.role !== 'SUPER_ADMIN' && auth.branchId && auth.branchId !== branchId) {
    throw ApiError.forbidden('ຈັດການໄດ້ສະເພາະສາຂາຂອງທ່ານ');
  }
}

/** ແບ່ງ `amount` (LAK ຈຳນວນເຕັມ) ເທົ່າໆກັນໃຫ້ n ຄົນ; ເສດໃຫ້ຄົນທຳອິດ ເພື່ອໃຫ້ຜົນລວມຕົງພໍດີ. */
export function splitEvenly(amount: number, n: number): number[] {
  if (n <= 0) return [];
  const each = Math.floor(amount / n);
  const out = Array.from({ length: n }, () => each);
  out[0] = round2(amount - each * (n - 1));
  return out;
}

export async function createGratuity(
  auth: AccessTokenPayload,
  paymentId: string,
  input: CreateGratuityInput,
): Promise<GratuityView> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      branchId: true,
      paymentStatus: true,
      appointment: { select: { staffProfileId: true } },
      bookingGroup: { select: { appointments: { select: { staffProfileId: true } } } },
    },
  });
  if (!payment) throw ApiError.notFound('ບໍ່ພົບບິນ');
  assertScope(auth, payment.branchId);
  if (payment.paymentStatus === 'VOIDED') throw ApiError.badRequest('ບິນນີ້ຖືກຍົກເລີກແລ້ວ');

  let shares = input.shares ?? [];
  if (shares.length === 0) {
    const staff = [
      ...new Set(
        [payment.appointment?.staffProfileId, ...(payment.bookingGroup?.appointments.map((a) => a.staffProfileId) ?? [])].filter(
          (s): s is string => !!s,
        ),
      ),
    ];
    if (staff.length === 0) throw ApiError.badRequest('ບິນນີ້ບໍ່ມີຊ່າງ — ກະລຸນາລະບຸຜູ້ຮັບທິບ');
    const parts = splitEvenly(input.amount, staff.length);
    shares = staff.map((staffProfileId, i) => ({ staffProfileId, amount: parts[i]! }));
  }
  const sum = round2(shares.reduce((s, x) => s + x.amount, 0));
  if (Math.abs(sum - input.amount) > 0.01) throw ApiError.badRequest('ຜົນລວມສ່ວນແບ່ງທິບ ບໍ່ເທົ່າກັບຍອດທິບ');

  if (input.method === 'CASH') await assertCashDrawerOpen(payment.branchId);

  const id = await prisma.$transaction(async (tx) => {
    const g = await tx.gratuity.create({
      data: {
        paymentId,
        branchId: payment.branchId,
        method: input.method,
        amount: dec(input.amount),
        note: input.note ?? null,
        collectedById: auth.sub,
        shares: { create: shares.map((s) => ({ staffProfileId: s.staffProfileId, amount: dec(s.amount) })) },
      },
      select: { id: true },
    });
    if (input.method === 'CASH') {
      const session = await tx.cashDrawerSession.findFirst({
        where: { branchId: payment.branchId, status: 'OPEN' },
        select: { id: true },
      });
      if (session) {
        await tx.cashDrawerMovement.create({
          data: { sessionId: session.id, type: 'PAYIN', amount: dec(input.amount), note: `tip:${g.id}`, createdById: auth.sub },
        });
      }
    }
    return g.id;
  });
  return toView(await prisma.gratuity.findUniqueOrThrow({ where: { id }, include: INCLUDE }));
}

function range(from?: string, to?: string): { gte: Date; lt: Date } {
  const end = to ? vientianeDayStart(new Date(`${to}T00:00:00Z`)) : vientianeDayStart(new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'));
  const lt = new Date(end.getTime() + 86_400_000);
  const gte = from ? vientianeDayStart(new Date(`${from}T00:00:00Z`)) : new Date(lt.getTime() - 31 * 86_400_000);
  return { gte, lt };
}

export async function listGratuities(auth: AccessTokenPayload, q: GratuityListQuery): Promise<GratuityListView> {
  const branchId = auth.role !== 'SUPER_ADMIN' && auth.branchId ? auth.branchId : q.branchId !== 'all' ? q.branchId : null;
  const where: Prisma.GratuityWhereInput = {
    createdAt: range(q.from, q.to),
    ...(branchId ? { branchId } : {}),
    ...(q.status === 'unpaid' ? { shares: { some: { paidOutAt: null } } } : {}),
    ...(q.status === 'paid' ? { shares: { every: { paidOutAt: { not: null } } } } : {}),
  };
  const rows = await prisma.gratuity.findMany({ where, include: INCLUDE, orderBy: { createdAt: 'desc' }, take: 500 });

  // ຍອດຄ້າງຈ່າຍຕໍ່ຄົນ ນັບທຸກຊ່ວງເວລາ (ໜີ້ສິນບໍ່ໝົດອາຍຸຕາມຊ່ວງທີ່ເລືອກ).
  const unpaidShares = await prisma.gratuityShare.findMany({
    where: { paidOutAt: null, ...(branchId ? { gratuity: { branchId } } : {}) },
    select: { staffProfileId: true, amount: true, staffProfile: { select: { user: { select: { name: true } } } } },
  });
  const byStaff = new Map<string, { staffProfileId: string; staffName: string; unpaid: number; paid: number; shares: number }>();
  const bucket = (id: string, name: string) => {
    let b = byStaff.get(id);
    if (!b) byStaff.set(id, (b = { staffProfileId: id, staffName: name, unpaid: 0, paid: 0, shares: 0 }));
    return b;
  };
  for (const s of unpaidShares) bucket(s.staffProfileId, s.staffProfile.user.name).unpaid += toNum(s.amount);
  const items = rows.map(toView);
  let collected = 0;
  let paid = 0;
  for (const g of items) {
    collected += g.amount;
    for (const s of g.shares) {
      const b = bucket(s.staffProfileId, s.staffName);
      b.shares += 1;
      if (s.paidOutAt) {
        b.paid += s.amount;
        paid += s.amount;
      }
    }
  }
  const staffRows = [...byStaff.values()]
    .map((b) => ({ ...b, unpaid: round2(b.unpaid), paid: round2(b.paid) }))
    .sort((a, b) => b.unpaid - a.unpaid || b.paid - a.paid);
  return {
    items,
    byStaff: staffRows,
    totals: {
      collected: round2(collected),
      unpaid: round2(staffRows.reduce((s, b) => s + b.unpaid, 0)),
      paid: round2(paid),
    },
  };
}

export async function payoutGratuities(
  auth: AccessTokenPayload,
  input: GratuityPayoutInput,
): Promise<{ paidShares: number; amount: number }> {
  const scopeBranch = auth.role !== 'SUPER_ADMIN' && auth.branchId ? auth.branchId : input.branchId ?? null;
  const shares = await prisma.gratuityShare.findMany({
    where: {
      staffProfileId: input.staffProfileId,
      paidOutAt: null,
      ...(input.shareIds ? { id: { in: input.shareIds } } : {}),
      ...(scopeBranch ? { gratuity: { branchId: scopeBranch } } : {}),
    },
    select: { id: true, amount: true, gratuity: { select: { branchId: true } } },
  });
  if (shares.length === 0) throw ApiError.badRequest('ບໍ່ມີທິບຄ້າງຈ່າຍ');
  const amount = round2(shares.reduce((s, x) => s + toNum(x.amount), 0));
  const cashBranch = input.method === 'CASH' ? scopeBranch ?? shares[0]!.gratuity.branchId : null;
  if (cashBranch) await assertCashDrawerOpen(cashBranch);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.gratuityShare.updateMany({
      where: { id: { in: shares.map((s) => s.id) }, paidOutAt: null },
      data: { paidOutAt: new Date(), paidOutById: auth.sub },
    });
    if (claimed.count !== shares.length) throw ApiError.conflict('ມີການຈ່າຍທິບນີ້ພ້ອມກັນ — ລອງໃໝ່');
    if (cashBranch) {
      const session = await tx.cashDrawerSession.findFirst({ where: { branchId: cashBranch, status: 'OPEN' }, select: { id: true } });
      if (session) {
        await tx.cashDrawerMovement.create({
          data: { sessionId: session.id, type: 'PAYOUT', amount: dec(amount), note: `tip-payout:${input.staffProfileId}`, createdById: auth.sub },
        });
      }
    }
  });
  return { paidShares: shares.length, amount };
}
