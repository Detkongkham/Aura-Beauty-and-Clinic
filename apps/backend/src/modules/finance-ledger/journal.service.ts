import type {
  ChartOfAccounts,
  JournalEntry,
  JournalLine,
  JournalQuery,
  JournalSource,
  JournalView,
  LedgerAccountKey,
  RefundAllocation,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { vientianeDateKey, vientianeDayStart } from '../../utils/dateHelpers.js';
import { round2, toNum } from '../../utils/money.js';
import { SHRINKAGE_MOVEMENT_WHERE } from '../inventory/inventory.service.js';
import { getChartOfAccounts } from './policy.js';

/**
 * Wave 11 (F-17) — ສົ່ງອອກ journal ບັນຊີຄູ່ (double-entry) ສຳລັບນຳເຂົ້າໂປຣແກຣມບັນຊີ.
 *
 * ນະໂຍບາຍຮັບຮູ້ (ສະຫຼຸບ — ລາຍລະອຽດໃນ docs/wave11-progress.md):
 * - ທຸກການຮັບເງິນ = Dr ເງິນສົດ/ທະນາຄານ, Cr ເງິນມັດຈຳລູກຄ້າ (contract liability) — ຍັງບໍ່ແມ່ນລາຍຮັບ.
 *   ຊື້ບັດຂອງຂວັນ → Cr ໜີ້ສິນບັດ; ຊື້ແພັກເກັດ → Cr ລາຍຮັບລ່ວງໜ້າແພັກເກັດ.
 * - Tender ທີ່ບໍ່ແມ່ນເງິນ: ບັດຂອງຂວັນ Dr ໜີ້ສິນບັດ; ຄະແນນ Dr ສ່ວນຫຼຸດຄະແນນ (contra revenue); ສິດແພັກເກັດ Dr ລາຍຮັບລ່ວງໜ້າ.
 * - ລາຍຮັບຖືກຮັບຮູ້ຕອນອອກໃບຮັບເງິນ (FULLY_PAID → paidAt): Dr ມັດຈຳ, Cr ລາຍຮັບ + ຄ່າບໍລິການ + VAT.
 * - ນັດທີ່ໃຊ້ສິດແພັກເກັດ (ລາຄາ 0) → ຕອນ COMPLETED: Dr ລາຍຮັບລ່ວງໜ້າ, Cr ລາຍຮັບ (ມູນຄ່າຕໍ່ຄັ້ງ).
 * - ຄ່າປັບ no-show/ຍົກເລີກຊ້າ, breakage, ຄືນເງິນ, ທິບ, ລາຍຈ່າຍ ຕາມຊື່.
 * - ສະຕັອກ: ຮັບເຂົ້າ Dr ສະຕັອກ/Cr ເຈົ້າໜີ້; ລາຍຈ່າຍທີ່ຜູກ PO = ຈ່າຍເຈົ້າໜີ້ (Dr ເຈົ້າໜີ້). ໂອນຂ້າມສາຂາຜ່ານບັນຊີ in-transit.
 * ທຸກ entry ສົມດຸນ (Dr = Cr) — ກວດໃນ `pushEntry`.
 */

type Range = { gte: Date; lt: Date };
type Acc = ChartOfAccounts;

const BANK_METHODS = new Set(['BCEL_ONE_QR', 'BANK_QR', 'BANK_TRANSFER', 'CREDIT_CARD']);

function dayKey(at: Date): string {
  return vientianeDateKey(at).toISOString().slice(0, 10);
}

export function journalRange(from: string, to: string): Range {
  const gte = vientianeDayStart(new Date(`${from}T00:00:00Z`));
  const lt = new Date(vientianeDayStart(new Date(`${to}T00:00:00Z`)).getTime() + 86_400_000);
  if (lt <= gte) throw ApiError.badRequest('ຊ່ວງວັນທີບໍ່ຖືກຕ້ອງ');
  if (lt.getTime() - gte.getTime() > 400 * 86_400_000) throw ApiError.badRequest('ສົ່ງອອກໄດ້ສູງສຸດ 400 ມື້ຕໍ່ຄັ້ງ');
  return { gte, lt };
}

class JournalBuilder {
  entries: JournalEntry[] = [];
  constructor(private readonly acc: Acc) {}

  line(key: LedgerAccountKey | { code: string; name: string }, debit: number, credit: number): JournalLine {
    const a = typeof key === 'string' ? this.acc[key] : key;
    return { account: a.code, accountName: a.name, debit: round2(debit), credit: round2(credit) };
  }

  push(e: { at: Date; source: JournalSource; ref: string; memo: string; branchName: string; lines: JournalLine[] }): void {
    const lines = e.lines.filter((l) => l.debit > 0.004 || l.credit > 0.004);
    if (lines.length === 0) return;
    const dr = round2(lines.reduce((s, l) => s + l.debit, 0));
    const cr = round2(lines.reduce((s, l) => s + l.credit, 0));
    // ເສດປັດຈາກການແບ່ງ VAT/ຄ່າບໍລິການ (≤ 0.05) → ປັບໃສ່ແຖວ credit ໃຫຍ່ສຸດ ເພື່ອໃຫ້ສົມດຸນພໍດີ.
    const diff = round2(dr - cr);
    if (Math.abs(diff) > 0 && Math.abs(diff) <= 0.05) {
      const big = lines.reduce((m, l) => (l.credit > m.credit ? l : m), lines[0]!);
      big.credit = round2(big.credit + diff);
    } else if (Math.abs(diff) > 0.05) {
      throw new Error(`unbalanced journal entry ${e.source} ${e.ref}: Dr ${dr} ≠ Cr ${cr}`);
    }
    this.entries.push({ date: dayKey(e.at), source: e.source, ref: e.ref, memo: e.memo, branchName: e.branchName, lines });
  }
}

function tenderDebitKey(method: string): LedgerAccountKey {
  if (method === 'CASH') return 'cash';
  if (BANK_METHODS.has(method)) return 'bank';
  if (method === 'GIFT_CARD') return 'giftCardLiability';
  if (method === 'PACKAGE_CREDIT') return 'packageDeferred';
  return 'loyaltyDiscount';
}

export async function buildJournal(q: Pick<JournalQuery, 'from' | 'to' | 'branchId'>): Promise<JournalView> {
  const range = journalRange(q.from, q.to);
  const branchId = q.branchId !== 'all' ? q.branchId : null;
  const acc = await getChartOfAccounts();
  const j = new JournalBuilder(acc);
  const pBranch: Prisma.PaymentWhereInput = branchId ? { branchId } : {};

  const [tenders, invoiced, forfeits, refunds, breakage, gratuities, tipPayouts, pkgUsage, expensesPaid, expensesVoided, stock] =
    await Promise.all([
      prisma.paymentTransaction.findMany({
        where: { status: 'SUCCESS', createdAt: range, payment: pBranch },
        select: {
          id: true,
          method: true,
          amount: true,
          createdAt: true,
          payment: {
            select: {
              id: true,
              invoiceNo: true,
              branch: { select: { name: true } },
              giftCardPurchase: { select: { code: true } },
              packagePurchase: { select: { id: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.payment.findMany({
        where: { ...pBranch, invoiceNo: { not: null }, paidAt: range, giftCardPurchase: null, packagePurchase: null },
        select: {
          id: true,
          invoiceNo: true,
          paidAt: true,
          totalAmount: true,
          taxAmount: true,
          serviceChargeAmount: true,
          branch: { select: { name: true } },
        },
        orderBy: { paidAt: 'asc' },
      }),
      prisma.payment.findMany({
        where: { ...pBranch, forfeitedAt: range, forfeitedAmount: { gt: 0 } },
        select: { id: true, forfeitedAt: true, forfeitedAmount: true, forfeitKind: true, branch: { select: { name: true } } },
      }),
      prisma.refund.findMany({
        where: { status: 'PAID', paidAt: range, payment: pBranch },
        select: {
          id: true,
          creditNoteNo: true,
          paidAt: true,
          amount: true,
          storeCreditAmount: true,
          method: true,
          bankAccountId: true,
          allocations: true,
          payment: {
            select: {
              invoiceNo: true,
              paidAt: true,
              branch: { select: { name: true } },
              giftCardPurchase: { select: { id: true } },
              packagePurchase: { select: { id: true } },
            },
          },
        },
      }),
      prisma.giftCardTransaction.findMany({
        where: { isBreakage: true, createdAt: range, ...(branchId ? { giftCard: { branchId } } : {}) },
        select: { id: true, amount: true, createdAt: true, giftCard: { select: { code: true, branch: { select: { name: true } } } } },
      }),
      prisma.gratuity.findMany({
        where: { createdAt: range, ...(branchId ? { branchId } : {}) },
        select: { id: true, method: true, amount: true, createdAt: true, payment: { select: { invoiceNo: true } }, branch: { select: { name: true } } },
      }),
      prisma.gratuityShare.findMany({
        where: { paidOutAt: range, ...(branchId ? { gratuity: { branchId } } : {}) },
        select: { amount: true, paidOutAt: true, staffProfile: { select: { user: { select: { name: true } } } }, gratuity: { select: { branch: { select: { name: true } } } } },
      }),
      prisma.appointment.findMany({
        where: {
          deletedAt: null,
          status: 'COMPLETED',
          userPackageItemId: { not: null },
          endAt: range,
          ...(branchId ? { branchId } : {}),
        },
        select: {
          id: true,
          endAt: true,
          branch: { select: { name: true } },
          userPackageItem: {
            select: {
              userPackage: {
                select: {
                  purchasePayment: { select: { totalAmount: true } },
                  package: { select: { name: true, totalPrice: true } },
                  items: { select: { totalUnits: true } },
                },
              },
            },
          },
        },
      }),
      prisma.expense.findMany({
        where: { paidAt: range, status: { in: ['PAID', 'VOIDED'] }, ...(branchId ? { branchId } : {}) },
        select: {
          id: true,
          title: true,
          paidAt: true,
          amountBase: true,
          invoiceNumber: true,
          purchaseOrderId: true,
          paidFromAccountId: true,
          branch: { select: { name: true } },
          category: { select: { code: true, nameEn: true } },
        },
      }),
      prisma.expense.findMany({
        where: { voidedAt: range, paidAt: { not: null }, status: 'VOIDED', ...(branchId ? { branchId } : {}) },
        select: {
          id: true,
          title: true,
          voidedAt: true,
          amountBase: true,
          purchaseOrderId: true,
          paidFromAccountId: true,
          branch: { select: { name: true } },
          category: { select: { code: true, nameEn: true } },
        },
      }),
      prisma.stockMovement.findMany({
        where: {
          createdAt: range,
          valueChange: { not: null },
          ...(branchId ? { branchId } : {}),
        },
        select: { type: true, reasonCode: true, valueChange: true, createdAt: true, branchId: true, branch: { select: { name: true } } },
      }),
    ]);

  // 1) ຮັບເງິນ / tender
  for (const t of tenders) {
    const amt = toNum(t.amount);
    const p = t.payment;
    const creditKey: LedgerAccountKey = p.giftCardPurchase ? 'giftCardLiability' : p.packagePurchase ? 'packageDeferred' : 'customerDeposits';
    const cashLike = t.method === 'CASH' || BANK_METHODS.has(t.method);
    j.push({
      at: t.createdAt,
      source: cashLike ? 'RECEIPT' : 'TENDER',
      ref: p.invoiceNo ?? `PAY-${p.id.slice(0, 8)}`,
      memo: p.giftCardPurchase ? `Gift card sale ${p.giftCardPurchase.code}` : p.packagePurchase ? 'Package sale' : `Payment ${t.method}`,
      branchName: p.branch.name,
      lines: [j.line(tenderDebitKey(t.method), amt, 0), j.line(creditKey, 0, amt)],
    });
  }

  // 2) ຮັບຮູ້ລາຍຮັບຕອນອອກໃບຮັບເງິນ
  for (const p of invoiced) {
    const gross = toNum(p.totalAmount);
    const tax = toNum(p.taxAmount);
    const net = gross - tax;
    const sc = toNum(p.serviceChargeAmount);
    const scNet = gross > 0 ? round2((sc * net) / gross) : 0;
    j.push({
      at: p.paidAt!,
      source: 'REVENUE',
      ref: p.invoiceNo!,
      memo: 'Revenue recognised on invoice',
      branchName: p.branch.name,
      lines: [
        j.line('customerDeposits', gross, 0),
        j.line('serviceRevenue', 0, round2(net - scNet)),
        j.line('serviceChargeRevenue', 0, scNet),
        j.line('vatPayable', 0, tax),
      ],
    });
  }

  // 3) ຄ່າປັບ no-show / ຍົກເລີກຊ້າ
  for (const p of forfeits) {
    const amt = toNum(p.forfeitedAmount);
    j.push({
      at: p.forfeitedAt!,
      source: 'FORFEIT',
      ref: `PAY-${p.id.slice(0, 8)}`,
      memo: p.forfeitKind === 'NO_SHOW' ? 'No-show fee (deposit forfeited)' : 'Late cancellation fee',
      branchName: p.branch.name,
      lines: [j.line('customerDeposits', amt, 0), j.line('cancellationFeeIncome', 0, amt)],
    });
  }

  // 4) ຄືນເງິນ
  for (const r of refunds) {
    const allocs = (r.allocations as RefundAllocation[] | null) ?? [];
    const credits: JournalLine[] = [];
    for (const a of allocs) {
      if (a.amount <= 0) continue;
      if (a.kind === 'PAYOUT') credits.push(j.line(a.method === 'CASH' ? 'cash' : 'bank', 0, a.amount));
      else if (a.kind === 'STORE') credits.push(j.line(a.method === 'GIFT_CARD' ? 'giftCardLiability' : 'loyaltyDiscount', 0, a.amount));
      else if (a.kind === 'PACKAGE') credits.push(j.line('packageDeferred', 0, a.amount));
    }
    if (credits.length === 0) {
      const payout = toNum(r.amount);
      if (payout > 0) credits.push(j.line(r.method === 'CASH' ? 'cash' : 'bank', 0, payout));
      const store = toNum(r.storeCreditAmount);
      if (store > 0) credits.push(j.line('giftCardLiability', 0, store));
    }
    const total = round2(credits.reduce((s, l) => s + l.credit, 0));
    const p = r.payment;
    // ລາຍຮັບທີ່ຮັບຮູ້ແລ້ວ (ມີໃບຮັບເງິນ ກ່ອນວັນຄືນ) → ບັນທຶກເປັນ sales return; ຍັງບໍ່ຮັບຮູ້ → ຫຼຸດມັດຈຳ.
    const recognised = !!p.invoiceNo && !!p.paidAt && p.paidAt <= r.paidAt!;
    const debitKey: LedgerAccountKey = p.giftCardPurchase
      ? 'giftCardLiability'
      : p.packagePurchase
        ? 'packageDeferred'
        : recognised
          ? 'salesReturns'
          : 'customerDeposits';
    j.push({
      at: r.paidAt!,
      source: 'REFUND',
      ref: r.creditNoteNo ?? `RF-${r.id.slice(0, 8)}`,
      memo: `Refund of ${p.invoiceNo ?? 'unpaid bill'}`,
      branchName: p.branch.name,
      lines: [j.line(debitKey, total, 0), ...credits],
    });
  }

  // 5) breakage ບັດຂອງຂວັນ
  for (const b of breakage) {
    const amt = -toNum(b.amount);
    j.push({
      at: b.createdAt,
      source: 'BREAKAGE',
      ref: b.giftCard.code,
      memo: 'Gift card expired — breakage recognised',
      branchName: b.giftCard.branch.name,
      lines: [j.line('giftCardLiability', amt, 0), j.line('breakageIncome', 0, amt)],
    });
  }

  // 6) ທິບ ຮັບ / ຈ່າຍອອກ
  for (const g of gratuities) {
    const amt = toNum(g.amount);
    j.push({
      at: g.createdAt,
      source: 'GRATUITY',
      ref: g.payment.invoiceNo ?? `TIP-${g.id.slice(0, 8)}`,
      memo: 'Tip collected for staff',
      branchName: g.branch.name,
      lines: [j.line(g.method === 'CASH' ? 'cash' : 'bank', amt, 0), j.line('tipsPayable', 0, amt)],
    });
  }
  const payoutGroups = new Map<string, { at: Date; staff: string; branch: string; amount: number }>();
  for (const s of tipPayouts) {
    const k = `${s.paidOutAt!.toISOString()}|${s.staffProfile.user.name}|${s.gratuity.branch.name}`;
    const g = payoutGroups.get(k) ?? { at: s.paidOutAt!, staff: s.staffProfile.user.name, branch: s.gratuity.branch.name, amount: 0 };
    g.amount += toNum(s.amount);
    payoutGroups.set(k, g);
  }
  for (const g of payoutGroups.values()) {
    j.push({
      at: g.at,
      source: 'GRATUITY_PAYOUT',
      ref: `TIP-PAYOUT`,
      memo: `Tips paid to ${g.staff}`,
      branchName: g.branch,
      lines: [j.line('tipsPayable', g.amount, 0), j.line('cash', 0, g.amount)],
    });
  }

  // 7) ໃຊ້ສິດແພັກເກັດ → ຮັບຮູ້ລາຍຮັບລ່ວງໜ້າ
  for (const a of pkgUsage) {
    const up = a.userPackageItem?.userPackage;
    if (!up) continue;
    const units = up.items.reduce((s, i) => s + i.totalUnits, 0);
    const price = up.purchasePayment ? toNum(up.purchasePayment.totalAmount) : toNum(up.package.totalPrice);
    const per = units > 0 ? round2(price / units) : 0;
    j.push({
      at: a.endAt,
      source: 'PACKAGE_USAGE',
      ref: `APT-${a.id.slice(0, 8)}`,
      memo: `Package session used — ${up.package.name}`,
      branchName: a.branch.name,
      lines: [j.line('packageDeferred', per, 0), j.line('serviceRevenue', 0, per)],
    });
  }

  // 8) ລາຍຈ່າຍ (ຈ່າຍ / ຍົກເລີກຫຼັງຈ່າຍ)
  const expenseAccount = (e: { purchaseOrderId: string | null; category: { code: string; nameEn: string } }) =>
    e.purchaseOrderId ? acc.accountsPayable : { code: `${acc.operatingExpense.code}-${e.category.code}`, name: e.category.nameEn };
  for (const e of expensesPaid) {
    const amt = toNum(e.amountBase);
    j.push({
      at: e.paidAt!,
      source: 'EXPENSE',
      ref: e.invoiceNumber ?? `EXP-${e.id.slice(0, 8)}`,
      memo: e.title || e.category.nameEn,
      branchName: e.branch.name,
      lines: [j.line(expenseAccount(e), amt, 0), j.line(e.paidFromAccountId ? 'bank' : 'cash', 0, amt)],
    });
  }
  for (const e of expensesVoided) {
    const amt = toNum(e.amountBase);
    j.push({
      at: e.voidedAt!,
      source: 'EXPENSE',
      ref: `EXP-${e.id.slice(0, 8)}-VOID`,
      memo: `Void: ${e.title || e.category.nameEn}`,
      branchName: e.branch.name,
      lines: [j.line(e.paidFromAccountId ? 'bank' : 'cash', amt, 0), j.line(expenseAccount(e), 0, amt)],
    });
  }

  // 9) ສະຕັອກ — ລວມຕໍ່ມື້ ຕໍ່ສາຂາ ຕໍ່ປະເພດ/ເຫດຜົນ (ບໍ່ໃຫ້ journal ຍາວເປັນພັນແຖວ).
  //    ໃຊ້ຂອບເຂດ shrinkage ດຽວກັນກັບ P&L (SHRINKAGE_MOVEMENT_WHERE): ປັບລົດເຫດຜົນອື່ນ (ໃຊ້ພາຍໃນ/ຊົດເຊີຍລູກຄ້າ/ຕົວຢ່າງ)
  //    = ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ; SUPPLIER_RETURN/OPENING_BALANCE ບໍ່ແມ່ນການສູນເສຍ.
  const shrinkReasons = new Set<string>(SHRINKAGE_MOVEMENT_WHERE.reasonCode.in);
  const stockGroups = new Map<string, { at: Date; branch: string; kind: string; value: number }>();
  for (const m of stock) {
    let kind: string = m.type;
    if (m.type === 'ADJUSTMENT_DEDUCT' || m.type === 'ADJUSTMENT_ADD') {
      const r = m.reasonCode ?? 'OTHER';
      kind = r === 'OPENING_BALANCE' ? 'OPENING' : r === 'SUPPLIER_RETURN' ? 'RETURN_TO_SUPPLIER' : shrinkReasons.has(r) || m.type === 'ADJUSTMENT_ADD' ? 'SHRINK' : 'INTERNAL_USE';
    }
    const k = `${dayKey(m.createdAt)}|${m.branchId}|${kind}`;
    const g = stockGroups.get(k) ?? { at: m.createdAt, branch: m.branch.name, kind, value: 0 };
    g.value += toNum(m.valueChange);
    stockGroups.set(k, g);
  }
  const opex = { code: acc.operatingExpense.code, name: acc.operatingExpense.name };
  const STOCK_RULES: Record<string, { memo: string; other: LedgerAccountKey | typeof opex; source: JournalSource }> = {
    SERVICE_CONSUMED: { memo: 'Consumables used in services', other: 'cogs', source: 'COGS' },
    SOLD: { memo: 'Retail goods sold', other: 'cogs', source: 'COGS' },
    SALE_RETURN: { memo: 'Retail goods returned (COGS reversal)', other: 'cogs', source: 'COGS' },
    SHRINK: { memo: 'Stock adjustment (shrinkage)', other: 'shrinkage', source: 'COGS' },
    INTERNAL_USE: { memo: 'Stock used internally / samples / compensation', other: opex, source: 'COGS' },
    PURCHASE_IN: { memo: 'Goods received from supplier', other: 'accountsPayable', source: 'INVENTORY' },
    RETURN_TO_SUPPLIER: { memo: 'Goods returned to supplier', other: 'accountsPayable', source: 'INVENTORY' },
    TRANSFER_OUT: { memo: 'Inter-branch transfer out', other: 'inventoryInTransit', source: 'INVENTORY' },
    TRANSFER_IN: { memo: 'Inter-branch transfer in', other: 'inventoryInTransit', source: 'INVENTORY' },
    OPENING: { memo: 'Opening stock balance', other: 'openingEquity', source: 'INVENTORY' },
  };
  for (const g of stockGroups.values()) {
    const rule = STOCK_RULES[g.kind];
    const v = round2(Math.abs(g.value));
    if (!rule || v === 0) continue;
    // valueChange ບວກ = ສະຕັອກເຂົ້າ (Dr ສະຕັອກ); ລົບ = ສະຕັອກອອກ (Cr ສະຕັອກ).
    const lines = g.value > 0 ? [j.line('inventory', v, 0), j.line(rule.other, 0, v)] : [j.line(rule.other, v, 0), j.line('inventory', 0, v)];
    j.push({ at: g.at, source: rule.source, ref: 'STOCK', memo: rule.memo, branchName: g.branch, lines });
  }

  const entries = j.entries.sort((a, b) => a.date.localeCompare(b.date));
  const totalsMap = new Map<string, { account: string; accountName: string; debit: number; credit: number }>();
  for (const e of entries) {
    for (const l of e.lines) {
      const t = totalsMap.get(l.account) ?? { account: l.account, accountName: l.accountName, debit: 0, credit: 0 };
      t.debit += l.debit;
      t.credit += l.credit;
      totalsMap.set(l.account, t);
    }
  }
  const totals = [...totalsMap.values()]
    .map((t) => ({ ...t, debit: round2(t.debit), credit: round2(t.credit) }))
    .sort((a, b) => a.account.localeCompare(b.account));
  const debitTotal = round2(totals.reduce((s, t) => s + t.debit, 0));
  const creditTotal = round2(totals.reduce((s, t) => s + t.credit, 0));
  return { from: q.from, to: q.to, entries, totals, debitTotal, creditTotal, balanced: Math.abs(debitTotal - creditTotal) < 0.01 };
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV ແບບແຖວລະ 1 ບັນຊີ (ຮູບແບບທີ່ໂປຣແກຣມບັນຊີສ່ວນຫຼາຍນຳເຂົ້າໄດ້); ມີ BOM ໃຫ້ Excel ອ່ານລາວໄດ້. */
export function journalToCsv(view: JournalView): string {
  const rows: (string | number)[][] = [
    ['date', 'entry_no', 'source', 'ref', 'branch', 'account', 'account_name', 'debit', 'credit', 'memo'],
  ];
  view.entries.forEach((e, i) => {
    const no = `JE-${String(i + 1).padStart(5, '0')}`;
    for (const l of e.lines) rows.push([e.date, no, e.source, e.ref, e.branchName, l.account, l.accountName, l.debit.toFixed(2), l.credit.toFixed(2), e.memo]);
  });
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}
