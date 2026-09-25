import { createHmac } from 'node:crypto';
import type {
  AccessTokenPayload,
  ReceiptLine,
  ReceiptView,
  VatReportDay,
  VatReportQuery,
  VatReportView,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { tsParam, VIENTIANE_OFFSET_MINUTES } from '../../utils/dateHelpers.js';
import { round2, toNum } from '../../utils/money.js';
import { getSettings } from '../settings/settings.service.js';
import { getVatSettings } from './vat.js';
import { runSerializable } from '../../utils/serializable.js';

/** Wave 10B — void, ໃບຮັບເງິນ, ລາຍງານ VAT. */

// ---- void ---------------------------------------------------------

/** ຍົກເລີກບິນທີ່ຍັງບໍ່ມີເງິນເຂົ້າ (ຕ່າງຈາກ refund). ບິນທີ່ມີເງິນແລ້ວ → ຕ້ອງຄືນເງິນ ບໍ່ແມ່ນ void. */
export async function voidPayment(auth: AccessTokenPayload, id: string, reason: string) {
  await runSerializable(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${id} FOR UPDATE`;
      const p = await tx.payment.findUnique({
        where: { id },
        include: {
          transactions: true,
          giftCardPurchase: { select: { id: true } },
          packagePurchase: { select: { id: true } },
          retailSale: { select: { id: true } },
        },
      });
      if (!p) throw ApiError.notFound('ບໍ່ພົບບິນ');
      if (auth.role === 'BRANCH_ADMIN' && auth.branchId !== p.branchId) throw ApiError.forbidden('ບໍ່ມີສິດຈັດການບິນຂອງສາຂາອື່ນ');
      if (p.paymentStatus === 'VOIDED') throw ApiError.conflict('ບິນນີ້ຖືກຍົກເລີກແລ້ວ');
      if (p.paymentStatus !== 'PENDING' || p.transactions.some((t) => t.status === 'SUCCESS')) {
        throw ApiError.badRequest('ບິນທີ່ຮັບເງິນແລ້ວ void ບໍ່ໄດ້ — ໃຫ້ຄືນເງິນ (refund) ແທນ');
      }
      await tx.paymentTransaction.updateMany({ where: { paymentId: id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      if (p.giftCardPurchase) await tx.giftCard.update({ where: { id: p.giftCardPurchase.id }, data: { status: 'VOID' } });
      if (p.packagePurchase) await tx.userPackage.update({ where: { id: p.packagePurchase.id }, data: { status: 'VOID' } });
      // M13 — ບິນຂາຍໜ້າຮ້ານ (ຍັງບໍ່ຈ່າຍ = ຍັງບໍ່ຕັດສະຕັອກ) → VOIDED.
      if (p.retailSale) {
        await tx.retailSale.update({ where: { id: p.retailSale.id }, data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason } });
      }
      await tx.payment.update({
        where: { id },
        data: { paymentStatus: 'VOIDED', voidedAt: new Date(), voidReason: reason, voidedById: auth.sub },
      });
    },
  );
  return { id };
}

// ---- receipt ------------------------------------------------------

/** ລະຫັດກວດສອບໃບຮັບເງິນ (HMAC) — ພິມເປັນ QR ໃຫ້ຜູ້ຮັບເງິນ/ສານັກງານກວດວ່າ invoiceNo + ຍອດ ບໍ່ຖືກແກ້. */
export function receiptVerifyCode(invoiceNo: string, total: number): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(`receipt:${invoiceNo}:${total}`).digest('hex').slice(0, 16).toUpperCase();
}

export async function getReceipt(auth: AccessTokenPayload, id: string): Promise<ReceiptView> {
  const p = await prisma.payment.findUnique({
    where: { id },
    include: {
      branch: { select: { name: true, address: true, phone: true } },
      transactions: { where: { status: 'SUCCESS' }, orderBy: { createdAt: 'asc' } },
      refunds: { where: { status: 'PAID' }, orderBy: { paidAt: 'asc' } },
      appointment: { select: { customerId: true, travelFee: true, totalAmount: true, customer: { select: { name: true } }, service: { select: { name: true } } } },
      bookingGroup: {
        select: {
          payerId: true,
          payer: { select: { name: true } },
          appointments: { select: { totalAmount: true, service: { select: { name: true } } } },
        },
      },
      giftCardPurchase: { select: { buyerId: true, buyer: { select: { name: true } }, initialBalance: true } },
      packagePurchase: { select: { userId: true, user: { select: { name: true } }, package: { select: { name: true } } } },
      retailSale: {
        select: {
          customerId: true,
          customer: { select: { name: true } },
          lines: { select: { uomQty: true, lineTotal: true, product: { select: { name: true } }, uom: { select: { code: true } } } },
        },
      },
    },
  });
  if (!p) throw ApiError.notFound('ບໍ່ພົບບິນ');

  const ownerId = p.appointment?.customerId ?? p.bookingGroup?.payerId ?? p.giftCardPurchase?.buyerId ?? p.packagePurchase?.userId ?? p.retailSale?.customerId ?? null;
  const isStaff = auth.role === 'SUPER_ADMIN' || auth.role === 'BRANCH_ADMIN' || auth.role === 'STAFF';
  if (!isStaff && auth.sub !== ownerId) throw ApiError.forbidden('ບໍ່ມີສິດເຂົ້າເຖິງບິນນີ້');

  const lines: ReceiptLine[] = [];
  if (p.appointment) {
    lines.push({ label: p.appointment.service.name, qty: 1, amount: toNum(p.appointment.totalAmount) });
    if (toNum(p.appointment.travelFee) > 0) lines.push({ label: 'Travel fee', qty: 1, amount: toNum(p.appointment.travelFee) });
  } else if (p.bookingGroup) {
    for (const a of p.bookingGroup.appointments) lines.push({ label: a.service.name, qty: 1, amount: toNum(a.totalAmount) });
  } else if (p.giftCardPurchase) {
    lines.push({ label: 'Gift card', qty: 1, amount: toNum(p.totalAmount) });
  } else if (p.packagePurchase) {
    lines.push({ label: p.packagePurchase.package?.name ?? 'Package', qty: 1, amount: toNum(p.totalAmount) });
  } else if (p.retailSale) {
    // M13 — ແຖວສິນຄ້າ (ຈຳນວນເປັນໜ່ວຍທີ່ຂາຍ, ຍອດຫຼັງສ່ວນຫຼຸດ).
    for (const l of p.retailSale.lines) {
      lines.push({ label: l.uom ? `${l.product.name} (${l.uom.code})` : l.product.name, qty: toNum(l.uomQty), amount: toNum(l.lineTotal) });
    }
  }

  const settings = await getSettings();
  const total = toNum(p.totalAmount);
  return {
    invoiceNo: p.invoiceNo,
    status: p.paymentStatus,
    issuedAt: p.paidAt?.toISOString() ?? null,
    business: {
      name: settings.businessName,
      legalName: settings.legalName,
      taxId: settings.taxId,
      address: settings.addressLine,
      phone: settings.contactPhone,
    },
    branch: { name: p.branch.name, address: p.branch.address, phone: p.branch.phone },
    customerName: p.appointment?.customer.name ?? p.bookingGroup?.payer.name ?? p.giftCardPurchase?.buyer?.name ?? p.packagePurchase?.user?.name ?? p.retailSale?.customer?.name ?? null,
    currency: p.currency,
    lines,
    total,
    vatRate: p.vatRate ? p.vatRate.toNumber() : null,
    vatMode: p.vatMode,
    netAmount: p.netAmount ? toNum(p.netAmount) : null,
    taxAmount: p.taxAmount ? toNum(p.taxAmount) : null,
    tenders: p.transactions.map((t) => ({ method: t.method, amount: toNum(t.amount) })),
    refunds: p.refunds.map((r) => ({
      creditNoteNo: r.creditNoteNo,
      amount: toNum(r.amount) + toNum(r.storeCreditAmount),
      paidAt: r.paidAt?.toISOString() ?? null,
    })),
    refundedAmount: toNum(p.refundedAmount),
    verifyCode: p.invoiceNo ? receiptVerifyCode(p.invoiceNo, total) : '',
  };
}

// ---- VAT report ---------------------------------------------------

/** ຂອບເຂດເດືອນ (ວຽງຈັນ) 'YYYY-MM' → [start, end) ເປັນ instant UTC. */
function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const offset = VIENTIANE_OFFSET_MINUTES * 60_000;
  return { start: new Date(Date.UTC(y, m - 1, 1) - offset), end: new Date(Date.UTC(y, m, 1) - offset) };
}

export async function vatReport(auth: AccessTokenPayload, query: VatReportQuery): Promise<VatReportView> {
  const branchId = auth.role === 'BRANCH_ADMIN' ? auth.branchId : query.branchId !== 'all' ? query.branchId : null;
  if (auth.role === 'BRANCH_ADMIN' && !branchId) throw ApiError.forbidden('ບັນຊີນີ້ບໍ່ໄດ້ຜູກກັບສາຂາໃດ');
  const { start, end } = monthRange(query.month);
  const branchSql = branchId ? Prisma.sql`AND p."branchId" = ${branchId}` : Prisma.empty;
  const shift = Prisma.sql`INTERVAL '${Prisma.raw(String(VIENTIANE_OFFSET_MINUTES))} minutes'`;

  const [inv, cn, settings, vat] = await Promise.all([
    prisma.$queryRaw<
      { day: string; invoices: bigint; gross: Prisma.Decimal; net: Prisma.Decimal | null; tax: Prisma.Decimal | null; untaxed: bigint }[]
    >`
      SELECT to_char(p."paidAt" + ${shift}, 'YYYY-MM-DD') AS day,
             COUNT(*) AS invoices,
             COALESCE(SUM(p."totalAmount"), 0) AS gross,
             COALESCE(SUM(p."netAmount"), 0) AS net,
             COALESCE(SUM(p."taxAmount"), 0) AS tax,
             COUNT(*) FILTER (WHERE p."taxAmount" IS NULL) AS untaxed
      FROM payments p
      WHERE p."invoiceNo" IS NOT NULL AND p."paidAt" >= ${tsParam(start)} AND p."paidAt" < ${tsParam(end)} ${branchSql}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ day: string; cnt: bigint; total: Prisma.Decimal; tax: Prisma.Decimal }[]>`
      SELECT to_char(r."paidAt" + ${shift}, 'YYYY-MM-DD') AS day,
             COUNT(*) AS cnt,
             COALESCE(SUM(r."amount" + r."storeCreditAmount"), 0) AS total,
             COALESCE(SUM(r."taxAmount"), 0) AS tax
      FROM refunds r JOIN payments p ON p."id" = r."paymentId"
      WHERE r."status" = 'PAID' AND r."paidAt" >= ${tsParam(start)} AND r."paidAt" < ${tsParam(end)} ${branchSql}
      GROUP BY 1 ORDER BY 1`,
    getSettings(),
    getVatSettings(),
  ]);

  const days = new Map<string, VatReportDay>();
  const day = (d: string): VatReportDay => {
    let v = days.get(d);
    if (!v) {
      v = { date: d, invoices: 0, gross: 0, net: 0, tax: 0, creditNotes: 0, creditNet: 0, creditTax: 0 };
      days.set(d, v);
    }
    return v;
  };
  let invoicesWithoutTax = 0;
  for (const r of inv) {
    const d = day(r.day);
    d.invoices = Number(r.invoices);
    d.gross = toNum(r.gross);
    d.net = toNum(r.net);
    d.tax = toNum(r.tax);
    invoicesWithoutTax += Number(r.untaxed);
  }
  for (const r of cn) {
    const d = day(r.day);
    d.creditNotes = Number(r.cnt);
    d.creditTax = toNum(r.tax);
    d.creditNet = round2(toNum(r.total) - toNum(r.tax));
  }
  const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const sum = (f: (d: VatReportDay) => number) => round2(list.reduce((s, d) => s + f(d), 0));
  const outputTax = sum((d) => d.tax);
  const creditTax = sum((d) => d.creditTax);
  return {
    month: query.month,
    branchId: branchId ?? 'all',
    vat,
    taxId: settings.taxId,
    legalName: settings.legalName,
    invoices: sum((d) => d.invoices),
    gross: sum((d) => d.gross),
    net: sum((d) => d.net),
    outputTax,
    creditNotes: sum((d) => d.creditNotes),
    creditTax,
    netTaxPayable: round2(outputTax - creditTax),
    invoicesWithoutTax,
    days: list,
  };
}
