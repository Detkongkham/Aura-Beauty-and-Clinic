import { randomBytes } from 'node:crypto';
import type {
  GiftCardListQuery,
  GiftCardView,
  IssueGiftCardInput,
  Paginated,
  PurchaseGiftCardInput,
} from '@abcp/shared-types';
import { GIFT_CARD_VALID_MONTHS } from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { dec, toNum } from '../../utils/money.js';
import { notifyUser } from '../../services/push.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode(): string {
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    if (i % 4 === 3 && i !== 11) out += '-';
  }
  return `GC-${out}`;
}

const CARD_SELECT = {
  id: true,
  code: true,
  branchId: true,
  initialBalance: true,
  currentBalance: true,
  currency: true,
  buyerId: true,
  recipientEmail: true,
  expireDate: true,
  isRedeemed: true,
  status: true,
  purchasePaymentId: true,
  issuedByUserId: true,
  issueReason: true,
  createdAt: true,
  branch: { select: { name: true } },
  buyer: { select: { name: true } },
} satisfies Prisma.GiftCardSelect;

type CardRow = Prisma.GiftCardGetPayload<{ select: typeof CARD_SELECT }>;

function toView(c: CardRow, transactions?: GiftCardView['transactions']): GiftCardView {
  return {
    id: c.id,
    code: c.code,
    branchId: c.branchId,
    branchName: c.branch.name,
    initialBalance: toNum(c.initialBalance),
    currentBalance: toNum(c.currentBalance),
    currency: c.currency,
    buyerId: c.buyerId,
    buyerName: c.buyer?.name ?? null,
    recipientEmail: c.recipientEmail,
    expireDate: c.expireDate.toISOString(),
    isRedeemed: c.isRedeemed,
    isExpired: c.expireDate.getTime() < Date.now(),
    status: c.status,
    purchasePaymentId: c.purchasePaymentId,
    issuedByUserId: c.issuedByUserId,
    issueReason: c.issueReason,
    createdAt: c.createdAt.toISOString(),
    ...(transactions ? { transactions } : {}),
  };
}

async function notifyRecipientIfAny(card: { id: string; code: string; currency: string; recipientEmail: string }, amount: number): Promise<void> {
  const recipient = await prisma.user.findFirst({
    where: { email: card.recipientEmail, deletedAt: null },
    select: { id: true },
  });
  if (!recipient) return;
  await notifyUser({
    userId: recipient.id,
    type: 'GIFT_CARD_RECEIVED',
    title: 'ທ່ານໄດ້ຮັບບັດຂອງຂວັນ 🎁',
    body: `ບັດຂອງຂວັນມູນຄ່າ ${amount.toLocaleString()} ${card.currency} — ລະຫັດ ${card.code}`,
    data: { code: card.code },
    dedupeKey: `giftcard:${card.id}`,
  }).catch(() => undefined);
}

/**
 * Wave 10A (ອຸດ C1) — admin ອອກບັດດ້ວຍມືເທົ່ານັ້ນ (ບໍ່ເກັບເງິນ). Route ຕ້ອງ `roleGuard`
 * ('SUPER_ADMIN'|'BRANCH_ADMIN') + `issueReason` ບັງຄັບ. ບັດ activate ທັນທີ.
 */
export async function issueGiftCard(
  issuedByUserId: string,
  input: IssueGiftCardInput,
): Promise<GiftCardView> {
  const branch = await prisma.branch.findUnique({
    where: { id: input.branchId },
    select: { id: true },
  });
  if (!branch) throw ApiError.notFound('ບໍ່ພົບສາຂາ');

  const expireDate = new Date();
  expireDate.setMonth(expireDate.getMonth() + GIFT_CARD_VALID_MONTHS);

  const card = await prisma.$transaction(async (tx) => {
    // retry on the astronomically-unlikely code collision
    let created: CardRow | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      try {
        created = await tx.giftCard.create({
          data: {
            branchId: input.branchId,
            code: genCode(),
            initialBalance: dec(input.amount),
            currentBalance: dec(input.amount),
            recipientEmail: input.recipientEmail,
            expireDate,
            status: 'ACTIVE',
            issuedByUserId,
            issueReason: input.issueReason,
          },
          select: CARD_SELECT,
        });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
      }
    }
    if (!created) throw ApiError.conflict('ອອກລະຫັດບັດຂອງຂວັນບໍ່ສຳເລັດ, ລອງໃໝ່');

    await tx.giftCardTransaction.create({
      data: {
        giftCardId: created.id,
        amount: dec(input.amount),
        balanceAfter: dec(input.amount),
      },
    });
    return created;
  });

  await notifyRecipientIfAny(card, input.amount);
  return toView(card);
}

/**
 * Wave 10A (ອຸດ C1) — ລູກຄ້າຊື້ບັດຂອງຂວັນເອງ. ບັດສ້າງເປັນ `PENDING_PAYMENT` ພ້ອມ `Payment` ໃໝ່;
 * client ຕ້ອງພາລູກຄ້າໄປຈ່າຍຜ່ານ payments flow ປົກກະຕິ (deposit-intent/tenders). ບັດຈະ activate
 * ອັດຕະໂນມັດຈາກ `payments.service.recomputeAndSettle` ເມື່ອ Payment ນັ້ນຮອດ FULLY_PAID.
 */
export async function purchaseGiftCard(
  buyerId: string,
  input: PurchaseGiftCardInput,
): Promise<GiftCardView> {
  const branch = await prisma.branch.findUnique({
    where: { id: input.branchId },
    select: { id: true },
  });
  if (!branch) throw ApiError.notFound('ບໍ່ພົບສາຂາ');

  const expireDate = new Date();
  expireDate.setMonth(expireDate.getMonth() + GIFT_CARD_VALID_MONTHS);

  const card = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        branchId: input.branchId,
        totalAmount: dec(input.amount),
        depositAmount: dec(0),
        paymentStatus: 'PENDING',
      },
      select: { id: true },
    });

    let created: CardRow | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      try {
        created = await tx.giftCard.create({
          data: {
            branchId: input.branchId,
            code: genCode(),
            initialBalance: dec(input.amount),
            currentBalance: dec(input.amount),
            buyerId,
            recipientEmail: input.recipientEmail,
            expireDate,
            status: 'PENDING_PAYMENT',
            purchasePaymentId: payment.id,
          },
          select: CARD_SELECT,
        });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
      }
    }
    if (!created) throw ApiError.conflict('ອອກລະຫັດບັດຂອງຂວັນບໍ່ສຳເລັດ, ລອງໃໝ່');
    return created;
  });

  return toView(card);
}

/**
 * ເອີ້ນຈາກ `payments.service.recomputeAndSettle` ເມື່ອ Payment ຮອດ FULLY_PAID — ຖ້າ Payment ນັ້ນ
 * ຜູກກັບການຊື້ບັດຂອງຂວັນ (PENDING_PAYMENT) ໃຫ້ activate ພ້ອມສ້າງ ledger ທຳອິດ. no-op ຖ້າບໍ່ພົບ/activate ແລ້ວ.
 */
export async function activatePurchasedGiftCard(paymentId: string): Promise<void> {
  const card = await prisma.giftCard.findUnique({
    where: { purchasePaymentId: paymentId },
    select: CARD_SELECT,
  });
  if (!card || card.status !== 'PENDING_PAYMENT') return;

  await prisma.$transaction(async (tx) => {
    await tx.giftCard.update({ where: { id: card.id }, data: { status: 'ACTIVE' } });
    await tx.giftCardTransaction.create({
      data: {
        giftCardId: card.id,
        amount: card.initialBalance,
        balanceAfter: card.currentBalance,
      },
    });
  });

  await notifyRecipientIfAny(card, toNum(card.initialBalance));
}

export async function myGiftCards(userId: string): Promise<{ items: GiftCardView[] }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const rows = await prisma.giftCard.findMany({
    where: {
      OR: [
        { buyerId: userId },
        { redeemedByUserId: userId },
        ...(user?.email ? [{ recipientEmail: user.email }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: CARD_SELECT,
  });
  return { items: rows.map((r) => toView(r)) };
}

export async function lookupByCode(code: string): Promise<GiftCardView> {
  const card = await prisma.giftCard.findUnique({
    where: { code: code.trim().toUpperCase() },
    select: {
      ...CARD_SELECT,
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, amount: true, balanceAfter: true, createdAt: true },
      },
    },
  });
  if (!card) throw ApiError.notFound('ບໍ່ພົບບັດຂອງຂວັນ');
  const { transactions, ...rest } = card;
  return toView(rest, transactions.map((t) => ({
    id: t.id,
    amount: toNum(t.amount),
    balanceAfter: toNum(t.balanceAfter),
    createdAt: t.createdAt.toISOString(),
  })));
}

export async function listGiftCards(
  query: GiftCardListQuery,
): Promise<Paginated<GiftCardView>> {
  const where: Prisma.GiftCardWhereInput = {
    ...(query.branchId !== 'all' ? { branchId: query.branchId } : {}),
    ...(query.scope === 'active' ? { isRedeemed: false } : {}),
    ...(query.scope === 'redeemed' ? { isRedeemed: true } : {}),
    ...(query.q
      ? {
          OR: [
            { code: { contains: query.q, mode: 'insensitive' } },
            { recipientEmail: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.giftCard.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: CARD_SELECT,
    }),
    prisma.giftCard.count({ where }),
  ]);
  return {
    items: rows.map((r) => toView(r)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * ຫັກຍອດບັດຂອງຂວັນ — ໃຊ້ໃນ payment tender GIFT_CARD. ຕ້ອງຢູ່ໃນ transaction.
 * ຄືນຈຳນວນທີ່ຫັກຈິງ (= amount ຖ້າຍອດພຽງພໍ).
 */
export async function redeemGiftCard(
  tx: Prisma.TransactionClient,
  params: { code: string; amount: number; redeemedByUserId?: string; paymentTransactionId?: string },
): Promise<number> {
  // Wave 10A (ອຸດ C2) — SELECT ... FOR UPDATE ລັອກແຖວນີ້ໄວ້ຈົນຈົບ transaction ເພື່ອກັນ 2 request
  // ພ້ອມກັນອ່ານຍອດເກົ່າດຽວກັນແລ້ວຫັກຊ້ຳ (over-redeem race).
  const rows = await tx.$queryRaw<
    { id: string; currentBalance: Prisma.Decimal; expireDate: Date; status: string }[]
  >`SELECT "id", "currentBalance", "expireDate", "status" FROM "gift_cards"
     WHERE "code" = ${params.code.trim().toUpperCase()} FOR UPDATE`;
  const card = rows[0];
  if (!card) throw ApiError.notFound('ບໍ່ພົບບັດຂອງຂວັນ');
  if (card.status !== 'ACTIVE') throw ApiError.badRequest('ບັດຂອງຂວັນນີ້ບໍ່ສາມາດໃຊ້ໄດ້');
  if (card.expireDate.getTime() < Date.now()) throw ApiError.badRequest('ບັດຂອງຂວັນໝົດອາຍຸແລ້ວ');

  const balance = toNum(card.currentBalance);
  if (balance < params.amount) throw ApiError.badRequest('ຍອດເງິນໃນບັດຂອງຂວັນບໍ່ພຽງພໍ');

  const balanceAfter = balance - params.amount;
  await tx.giftCard.update({
    where: { id: card.id },
    data: {
      currentBalance: dec(balanceAfter),
      isRedeemed: balanceAfter <= 0,
      status: balanceAfter <= 0 ? 'DEPLETED' : 'ACTIVE',
      ...(params.redeemedByUserId ? { redeemedByUserId: params.redeemedByUserId } : {}),
    },
  });
  await tx.giftCardTransaction.create({
    data: {
      giftCardId: card.id,
      paymentTransactionId: params.paymentTransactionId ?? null,
      amount: dec(-params.amount),
      balanceAfter: dec(balanceAfter),
    },
  });
  return params.amount;
}

/**
 * Wave 10B — ຄືນເງິນເຂົ້າບັດຂອງຂວັນ (ຄືນເງິນ tender GIFT_CARD). ບັດທີ່ DEPLETED ກັບມາ ACTIVE; ບັດ VOID/EXPIRED
 * ກໍຄືນຍອດໄດ້ (ຍອດເປັນຂອງລູກຄ້າ) ແຕ່ບໍ່ປ່ຽນສະຖານະ. ລັອກແຖວກ່ອນ ກັນແຂ່ງກັບການໃຊ້ບັດພ້ອມກັນ.
 */
export async function restoreGiftCardBalance(
  tx: Prisma.TransactionClient,
  params: { giftCardId: string; amount: number; paymentTransactionId?: string },
): Promise<void> {
  if (params.amount <= 0) return;
  const rows = await tx.$queryRaw<{ id: string; currentBalance: Prisma.Decimal; status: string }[]>`
    SELECT "id", "currentBalance", "status" FROM "gift_cards" WHERE "id" = ${params.giftCardId} FOR UPDATE`;
  const card = rows[0];
  if (!card) throw ApiError.notFound('ບໍ່ພົບບັດຂອງຂວັນ');
  const balanceAfter = toNum(card.currentBalance) + params.amount;
  await tx.giftCard.update({
    where: { id: card.id },
    data: {
      currentBalance: dec(balanceAfter),
      isRedeemed: false,
      ...(card.status === 'DEPLETED' ? { status: 'ACTIVE' as const } : {}),
    },
  });
  await tx.giftCardTransaction.create({
    data: {
      giftCardId: card.id,
      paymentTransactionId: params.paymentTransactionId ?? null,
      amount: dec(params.amount),
      balanceAfter: dec(balanceAfter),
    },
  });
}

/**
 * ຂໍ້ຈຳກັດ 10B — ຄືນເງິນ "ບິນຊື້ບັດຂອງຂວັນ": ຫັກມູນຄ່າທີ່ຄືນອອກຈາກບັດ (ລູກຄ້າໄດ້ເງິນຄືນ → ບັດຕ້ອງເສຍມູນຄ່ານັ້ນ).
 * ລັອກແຖວ; ຍອດຄົງເຫຼືອບໍ່ພໍ (ບັດຖືກໃຊ້ໄປຫຼັງຂໍຄືນ) → 409. ຍອດເຫຼືອ 0 → ບັດ VOID (ໃຊ້ຕໍ່ບໍ່ໄດ້).
 */
export async function deductGiftCardForRefund(
  tx: Prisma.TransactionClient,
  params: { giftCardId: string; amount: number },
): Promise<void> {
  if (params.amount <= 0) return;
  const rows = await tx.$queryRaw<{ id: string; currentBalance: Prisma.Decimal; status: string }[]>`
    SELECT "id", "currentBalance", "status" FROM "gift_cards" WHERE "id" = ${params.giftCardId} FOR UPDATE`;
  const card = rows[0];
  if (!card) throw ApiError.notFound('ບໍ່ພົບບັດຂອງຂວັນ');
  const balance = toNum(card.currentBalance);
  if (balance + 0.01 < params.amount) {
    throw ApiError.conflict(`ຍອດໃນບັດເຫຼືອ ${balance.toLocaleString()} — ໜ້ອຍກວ່າຍອດຄືນ (ບັດຖືກໃຊ້ໄປແລ້ວ)`);
  }
  const balanceAfter = Math.max(0, Math.round((balance - params.amount) * 100) / 100);
  await tx.giftCard.update({
    where: { id: card.id },
    data: { currentBalance: dec(balanceAfter), ...(balanceAfter <= 0 ? { status: 'VOID' as const } : {}) },
  });
  await tx.giftCardTransaction.create({
    data: { giftCardId: card.id, amount: dec(-params.amount), balanceAfter: dec(balanceAfter) },
  });
}
