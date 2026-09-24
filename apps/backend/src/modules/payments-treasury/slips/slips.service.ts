import { createHash, randomUUID } from 'node:crypto';
import type {
  AccessTokenPayload,
  Paginated,
  BulkApproveSlipsResult,
  PaymentSlipDetail,
  PaymentSlipEvent,
  PaymentSlipView,
  ReviewSlipInput,
  SlipBankProof,
  SlipRef,
  SlipRejectCode,
  SlipRiskSignal,
  SlipSummary,
  SlipCorrectedFields,
  SlipExportQuery,
  SlipListQuery,
  SlipMismatchField,
  UploadSlipInput,
} from '@abcp/shared-types';
import { BLOCKING_RISK_SIGNALS } from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import {
  SLIP_AMOUNT_TOLERANCE_SETTING_KEY,
  SLIP_AUTO_APPROVE_SETTING_KEY,
  SLIP_MAX_BYTES,
} from '../../../constants/paymentsTreasury.js';
import { slipOcrQueue } from '../../../jobs/queues.js';
import type { Actor } from '../../../middlewares/permissionGuard.js';
import { emitChatMessage, emitPaymentSlipUpdated } from '../../../realtime/socket.js';
import { notifyUser } from '../../../services/push.js';
import { storage } from '../../../storage/index.js';
import { ApiError } from '../../../utils/ApiError.js';
import { vientianeDateKey, vientianeDayRangeOf, vientianeDayStart } from '../../../utils/dateHelpers.js';
import { dec, round2, toNum } from '../../../utils/money.js';
import { ensureThread, postMessage } from '../../chat/chat.service.js';
import { getPayment, recomputeAndSettle } from '../../payments/payments.service.js';
import { getSlipSettings, slaForBranch } from '../payments-treasury.ops.service.js';
import { lockedMonths } from '../reconciliation/recon.util.js';
import { computeBankProofs } from './bankProof.js';
import { NEAR_DUPLICATE_MAX_DISTANCE, detectEditorSoftware, fingerprintDistance, inkFingerprint } from './imageSignals.js';
import { accountMatches, evaluateSlip } from './matcher.js';
import { decodeQr, parseQrPayload } from './ocr/qr.js';
import { normalizeForStorage, preprocessForOcr } from './ocr/preprocess.js';
import { getOcrProvider } from './ocr/tesseractProvider.js';
import { parseSlipText, type SlipParsed } from './parser.js';

/** ສະລິບທີ່ຍັງລໍຜົນ/ລໍກວດ ຕໍ່ບິນ — ກັນການ spam ອັບໂຫຼດ. */
const MAX_OPEN_SLIPS_PER_PAYMENT = 5;
/** job ທີ່ຄ້າງ PROCESSING ເກີນນີ້ ຖືວ່າ worker ຕາຍ → ຍອມໃຫ້ claim ໃໝ່. */
const STALE_PROCESSING_MS = 5 * 60_000;
const OPEN_VERDICTS = ['PENDING', 'AUTO_MATCHED', 'NEEDS_REVIEW'] as const;
const REVIEWABLE_VERDICTS = ['AUTO_MATCHED', 'NEEDS_REVIEW'] as const;
/** S5 — lock ການກວດໝົດອາຍຸຫຼັງຈາກນີ້ ຖ້າບໍ່ມີ heartbeat (client ຕໍ່ທຸກ 60 ວິ). */
export const SLIP_CLAIM_TTL_MS = 3 * 60_000;

// ---- views --------------------------------------------------------

const SLIP_INCLUDE = {
  branch: { select: { name: true } },
  uploadedBy: { select: { name: true, role: true } },
  reviewedBy: { select: { name: true } },
  claimedBy: { select: { id: true, name: true } },
  reversedBy: { select: { name: true } },
  bankAccount: {
    select: { id: true, accountName: true, accountNumber: true, bank: { select: { code: true } } },
  },
  payment: {
    select: {
      totalAmount: true,
      depositAmount: true,
      currency: true,
      paymentStatus: true,
      invoiceNo: true,
      appointmentId: true,
      createdAt: true,
      transactions: { where: { status: 'SUCCESS' }, select: { amount: true } },
      appointment: { select: { customer: { select: { name: true } } } },
      bookingGroup: { select: { payer: { select: { name: true } } } },
      giftCardPurchase: { select: { buyer: { select: { name: true } } } },
      packagePurchase: { select: { user: { select: { name: true } } } },
    },
  },
} satisfies Prisma.PaymentSlipInclude;

type SlipRow = Prisma.PaymentSlipGetPayload<{ include: typeof SLIP_INCLUDE }>;

/** `ocrRaw` ເປັນ JSON ອິດສະຫຼະ — ອ່ານແບບປອດໄພ. */
function ocrRawOf(s: { ocrRaw: Prisma.JsonValue }): { text: string | null; confidence: number | null; dateOnly: boolean } {
  const raw = (s.ocrRaw ?? {}) as { text?: unknown; confidence?: unknown; dateOnly?: unknown };
  return {
    text: typeof raw.text === 'string' ? raw.text : null,
    confidence: typeof raw.confidence === 'number' ? Math.round(raw.confidence) : null,
    dateOnly: raw.dateOnly === true,
  };
}

type Reversal = PaymentSlipView['reversal'];
const NO_PROOF: SlipBankProof = { status: 'NO_STATEMENT', refMatched: false, line: null };

function claimOf(s: SlipRow): PaymentSlipView['claimedBy'] {
  if (!s.claimedBy || !s.claimedAt) return null;
  if (s.claimedAt.getTime() < Date.now() - SLIP_CLAIM_TTL_MS) return null;
  return { id: s.claimedBy.id, name: s.claimedBy.name, at: s.claimedAt.toISOString() };
}

/**
 * S7 — ຍົກເລີກການອະນຸມັດໄດ້ສະເພາະເມື່ອ: ສະລິບ APPROVED + ມີ tx, ບິນຍັງບໍ່ຈ່າຍຄົບ (ຈ່າຍຄົບ = ອອກໃບຮັບເງິນ/
 * activate ບັດ-ແພັກເກັດແລ້ວ → ຕ້ອງ void ບິນ ຫຼື ຄືນເງິນໃນ Finance), ເງິນຍັງບໍ່ຖືກຈັບຄູ່ກັບ statement, ງວດຍັງບໍ່ປິດ.
 */
function reversalOf(s: SlipRow, proof: SlipBankProof, locked: Set<string>): Reversal {
  const blocked = (blockedReason: string): Reversal => ({ allowed: false, blockedReason });
  if (s.verdict !== 'APPROVED' || !s.paymentTransactionId) return blocked('NOT_APPROVED');
  if (!['PENDING', 'DEPOSIT_PAID'].includes(s.payment.paymentStatus)) return blocked('BILL_SETTLED');
  if (proof.status === 'MATCHED') return blocked('RECONCILED');
  const month = vientianeDateKey(s.reviewedAt ?? s.updatedAt).toISOString().slice(0, 7);
  if (locked.has(`${s.branchId}|${month}`)) return blocked('PERIOD_CLOSED');
  return { allowed: true, blockedReason: null };
}

/** ມຸມມອງຫຼາຍແຖວ — ຫຼັກຖານທະນາຄານ ແລະ ງວດທີ່ປິດ ຄິດເປັນຊຸດ (2–3 query ຕໍ່ list, ບໍ່ແມ່ນຕໍ່ແຖວ). */
async function toViews(rows: SlipRow[]): Promise<PaymentSlipView[]> {
  const proofs = await computeBankProofs(
    rows.map((r) => ({
      id: r.id,
      branchId: r.branchId,
      bankAccountId: r.bankAccountId,
      amount: r.amount === null ? null : toNum(r.amount),
      declaredAmount: r.declaredAmount === null ? null : toNum(r.declaredAmount),
      txnRef: r.txnRef,
      transferredAt: r.transferredAt,
      createdAt: r.createdAt,
      paymentTransactionId: r.paymentTransactionId,
    })),
  );
  const approved = rows.filter((r) => r.verdict === 'APPROVED');
  const locked = await lockedMonths(
    [...new Set(approved.map((r) => r.branchId))],
    [...new Set(approved.map((r) => vientianeDateKey(r.reviewedAt ?? r.updatedAt).toISOString().slice(0, 7)))],
  );
  return rows.map((r) => {
    const proof = proofs.get(r.id) ?? NO_PROOF;
    return toView(r, proof, reversalOf(r, proof, locked));
  });
}

function toView(s: SlipRow, bankProof: SlipBankProof, reversal: Reversal): PaymentSlipView {
  const total = toNum(s.payment.totalAmount);
  const paid = round2(s.payment.transactions.reduce((sum, t) => sum + toNum(t.amount), 0));
  const raw = ocrRawOf(s);
  return {
    id: s.id,
    paymentId: s.paymentId,
    branchId: s.branchId,
    branchName: s.branch.name,
    customerName:
      s.payment.appointment?.customer.name ??
      s.payment.bookingGroup?.payer.name ??
      s.payment.giftCardPurchase?.buyer?.name ??
      s.payment.packagePurchase?.user?.name ??
      null,
    uploadedById: s.uploadedById,
    uploadedByName: s.uploadedBy.name,
    imageUrl: s.imageUrl,
    declaredAmount: s.declaredAmount === null ? null : toNum(s.declaredAmount),
    ocrStatus: s.ocrStatus,
    ocrEngine: s.ocrEngine,
    ocrMs: s.ocrMs,
    qrPayload: s.qrPayload,
    bankCode: s.bankCode,
    amount: s.amount === null ? null : toNum(s.amount),
    currency: s.currency,
    txnRef: s.txnRef,
    transferredAt: s.transferredAt?.toISOString() ?? null,
    senderName: s.senderName,
    receiverAccount: s.receiverAccount,
    matchScore: s.matchScore,
    mismatchFields: s.mismatchFields as SlipMismatchField[],
    verdict: s.verdict,
    rejectReason: s.rejectReason,
    reviewedByName: s.reviewedBy?.name ?? null,
    reviewedAt: s.reviewedAt?.toISOString() ?? null,
    reviewNote: s.reviewNote,
    paymentTransactionId: s.paymentTransactionId,
    ocrError: s.ocrError,
    ocrConfidence: raw.confidence,
    dateOnly: raw.dateOnly,
    uploadedByRole: s.uploadedBy.role,
    sizeBytes: s.sizeBytes,
    updatedAt: s.updatedAt.toISOString(),
    riskSignals: s.riskSignals as SlipRiskSignal[],
    nearDuplicateOfId: s.nearDuplicateOfId,
    claimedBy: claimOf(s),
    infoRequestedAt: s.infoRequestedAt?.toISOString() ?? null,
    infoRequestNote: s.infoRequestNote,
    rejectCode: (s.rejectCode as SlipRejectCode | null) ?? null,
    reversedByName: s.reversedBy?.name ?? null,
    reversedAt: s.reversedAt?.toISOString() ?? null,
    reverseReason: s.reverseReason,
    bankProof,
    reversal,
    payment: {
      totalAmount: total,
      balanceAmount: round2(Math.max(0, total - paid)),
      currency: s.payment.currency,
      paidAmount: paid,
      depositAmount: toNum(s.payment.depositAmount),
      depositRemaining: round2(Math.max(0, toNum(s.payment.depositAmount) - paid)),
      status: s.payment.paymentStatus,
      invoiceNo: s.payment.invoiceNo,
      appointmentId: s.payment.appointmentId,
      createdAt: s.payment.createdAt.toISOString(),
    },
    bankAccount: s.bankAccount
      ? {
          id: s.bankAccount.id,
          accountName: s.bankAccount.accountName,
          accountNumber: s.bankAccount.accountNumber,
          bankCode: s.bankAccount.bank.code,
        }
      : null,
    createdAt: s.createdAt.toISOString(),
  };
}

async function loadView(id: string): Promise<PaymentSlipView> {
  const row = await prisma.paymentSlip.findUnique({ where: { id }, include: SLIP_INCLUDE });
  if (!row) throw ApiError.notFound('ບໍ່ພົບສະລິບ');
  return (await toViews([row]))[0]!;
}

function emitUpdated(slip: {
  id: string;
  paymentId: string;
  branchId: string;
  uploadedById: string;
  verdict: PaymentSlipEvent['verdict'];
  ocrStatus: PaymentSlipEvent['ocrStatus'];
}): void {
  emitPaymentSlipUpdated(
    {
      slipId: slip.id,
      paymentId: slip.paymentId,
      branchId: slip.branchId,
      verdict: slip.verdict,
      ocrStatus: slip.ocrStatus,
    },
    slip.uploadedById,
  );
}

/** appointmentId ຂອງບິນ (null ຖ້າເປັນບິນຊື້ບັດ/ແພັກເກັດ) — ໃຫ້ push ເປີດໜ້າຈ່າຍເງິນຂອງນັດນັ້ນໄດ້. */
async function appointmentIdOf(paymentId: string): Promise<string | null> {
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, select: { appointmentId: true } });
  return p?.appointmentId ?? null;
}

// ---- settings -------------------------------------------------

async function readSetting(key: string): Promise<unknown> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value;
}

async function getAmountTolerance(): Promise<number> {
  const v = Number(await readSetting(SLIP_AMOUNT_TOLERANCE_SETTING_KEY));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

async function isAutoApproveEnabled(): Promise<boolean> {
  return (await readSetting(SLIP_AUTO_APPROVE_SETTING_KEY)) === true;
}

// ---- upload ---------------------------------------------------

export async function uploadSlip(
  auth: AccessTokenPayload,
  paymentId: string,
  input: UploadSlipInput,
): Promise<PaymentSlipView> {
  // getPayment ກວດສິດເຂົ້າເຖິງບິນ (ລູກຄ້າເຈົ້າຂອງ ຫຼື ພະນັກງານ) ແລະ ຄືນຍອດຄ້າງຈິງຈາກ DB
  const payment = await getPayment(paymentId, auth);
  if (payment.balanceAmount <= 0) throw ApiError.badRequest('ບິນນີ້ຈ່າຍຄົບແລ້ວ');
  if (input.amount !== undefined && input.amount > payment.balanceAmount + 0.01) {
    throw ApiError.badRequest('ຈຳນວນທີ່ແຈ້ງເກີນຍອດຄ້າງຂອງບິນ');
  }

  if (input.bankAccountId) {
    const acct = await prisma.bankAccount.findUnique({ where: { id: input.bankAccountId } });
    if (!acct || !acct.isActive || acct.branchId !== payment.branchId) {
      throw ApiError.badRequest('ບັນຊີປາຍທາງບໍ່ຖືກຕ້ອງ');
    }
  }

  const original = Buffer.from(input.dataBase64, 'base64');
  if (original.byteLength === 0) throw ApiError.badRequest('ຮູບບໍ່ຖືກຕ້ອງ');
  if (original.byteLength > SLIP_MAX_BYTES) throw ApiError.badRequest('ຮູບສະລິບໃຫຍ່ເກີນ 8MB');
  const image = await normalizeForStorage(original);
  if (!image) throw ApiError.badRequest('ໄຟລ໌ນີ້ບໍ່ແມ່ນຮູບ JPEG/PNG/WebP ທີ່ອ່ານໄດ້');

  const imageHash = createHash('sha256').update(original).digest('hex');
  // S3 — ຕ້ອງອ່ານ metadata ຈາກໄຟລ໌ຕົ້ນສະບັບ: ຮູບທີ່ເກັບໄວ້ຖືກລ້າງ EXIF ແລ້ວ
  const editor = await detectEditorSoftware(original);
  const same = await prisma.paymentSlip.findFirst({
    where: { imageHash, verdict: { not: 'REJECTED' } },
    select: { id: true, paymentId: true, uploadedById: true },
  });
  if (same) {
    // ກົດສົ່ງຊ້ຳໂດຍຄົນເດີມ/ບິນເດີມ (ເນັດຫຼຸດ, retry) → ຄືນສະລິບເດີມ ບໍ່ສ້າງໃໝ່
    if (same.paymentId === paymentId && same.uploadedById === auth.sub) return loadView(same.id);
    throw ApiError.conflict('ຮູບສະລິບນີ້ຖືກໃຊ້ຍື່ນໄປແລ້ວ');
  }

  const open = await prisma.paymentSlip.count({
    where: { paymentId, verdict: { in: [...OPEN_VERDICTS] } },
  });
  if (open >= MAX_OPEN_SLIPS_PER_PAYMENT) {
    throw ApiError.badRequest('ມີສະລິບລໍກວດຄ້າງຫຼາຍເກີນໄປ, ກະລຸນາລໍຖ້າຜົນກ່ອນ');
  }

  const key = `slips/${paymentId}/${randomUUID()}.jpg`;
  const { url } = await storage.save(key, image, 'image/jpeg');

  const slip = await prisma.paymentSlip.create({
    data: {
      paymentId,
      branchId: payment.branchId,
      uploadedById: auth.sub,
      bankAccountId: input.bankAccountId ?? null,
      declaredAmount: input.amount === undefined ? null : dec(input.amount),
      imageKey: key,
      imageUrl: url,
      imageHash,
      contentType: 'image/jpeg',
      sizeBytes: image.byteLength,
      riskSignals: editor ? ['EDITOR_SOFTWARE'] : [],
    },
  });

  // S6 — ລູກຄ້າຕອບຄຳຂໍດ້ວຍສະລິບໃໝ່ → ໃບເກົ່າຂອງບິນນີ້ບໍ່ "ລໍລູກຄ້າ" ອີກ (ບັນທຶກຄຳຂໍຍັງຢູ່)
  await prisma.paymentSlip.updateMany({
    where: { paymentId, id: { not: slip.id }, infoRequestedAt: { not: null }, verdict: { in: [...OPEN_VERDICTS] } },
    data: { infoRequestedAt: null },
  });

  dispatchSlipOcr(slip.id);
  emitUpdated(slip);
  return loadView(slip.id);
}

/**
 * ຖິ້ມເຂົ້າ queue (BullMQ) ໃຫ້ worker ແຍກ process ອ່ານ OCR. ຖ້າ Redis ລົ້ມ → ແລ່ນໃນ process ນີ້ແທນ
 * ເພື່ອບໍ່ໃຫ້ສະລິບຄ້າງ PENDING. ໃນ test ບໍ່ enqueue (ບໍ່ມີ worker, ແລະ Redis ອາດຖືກແບ່ງກັບ dev) —
 * test ເອີ້ນ `processSlip` ເອງເພື່ອຄວບຄຸມ timing.
 */
export function dispatchSlipOcr(slipId: string): void {
  if (env.isTest) return;
  slipOcrQueue.add('process', { slipId }, { jobId: slipId }).catch((err) => {
    logger.warn({ err, slipId }, 'enqueue slip OCR ບໍ່ສຳເລັດ — ແລ່ນ inline ແທນ');
    void processSlip(slipId).catch((e) => logger.error({ err: e, slipId }, 'processSlip inline ລົ້ມ'));
  });
}

// ---- OCR pipeline ---------------------------------------------

function emptyParsed(): SlipParsed {
  return {
    bankCode: null,
    amount: null,
    currency: null,
    txnRef: null,
    transferredAt: null,
    dateOnly: false,
    senderName: null,
    accountTokens: [],
  };
}

/**
 * ຊັ້ນ 1–2 ຂອງ pipeline + ໃຫ້ຄະແນນ match (docs §3). ຮຽກໂດຍ BullMQ worker. Idempotent — claim ຜ່ານ
 * updateMany ຈຶ່ງແລ່ນຊ້ຳ (retry/duplicate job) ບໍ່ສ້າງຜົນຊ້ຳ. ບໍ່ throw ເມື່ອ OCR ລົ້ມ: ບັນທຶກ FAILED +
 * NEEDS_REVIEW ເພື່ອໃຫ້ພະນັກງານປ້ອນເອງ (ຊັ້ນ 3).
 */
export async function processSlip(slipId: string): Promise<void> {
  const claimed = await prisma.paymentSlip.updateMany({
    where: {
      id: slipId,
      OR: [
        { ocrStatus: 'PENDING' },
        { ocrStatus: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
      ],
    },
    data: { ocrStatus: 'PROCESSING' },
  });
  if (claimed.count === 0) return;

  const slip = await prisma.paymentSlip.findUniqueOrThrow({
    where: { id: slipId },
    include: {
      payment: {
        select: {
          createdAt: true,
          totalAmount: true,
          depositAmount: true,
          currency: true,
          transactions: { where: { status: 'SUCCESS' }, select: { amount: true } },
        },
      },
    },
  });

  const started = Date.now();
  let parsed = emptyParsed();
  let qrPayload: string | null = null;
  let ocrText = '';
  let confidence = 0;
  let engine: string | null = null;
  let ocrError: string | null = null;
  let fingerprint: string | null = null;
  let qrTextMismatch = false;

  try {
    const image = await storage.read(slip.imageKey);
    fingerprint = await inkFingerprint(image);
    qrPayload = await decodeQr(image).catch(() => null);
    const qr = qrPayload ? parseQrPayload(qrPayload) : {};
    const result = await getOcrProvider().recognize(await preprocessForOcr(image));
    ocrText = result.text;
    confidence = result.confidence;
    engine = result.engine;
    parsed = parseSlipText(ocrText, qr);
    // S3 — QR ຂອງທະນາຄານແກ້ບໍ່ໄດ້ງ່າຍ, ຕົວໜັງສືແກ້ໄດ້: ເລກອ້າງອີງທີ່ພິມ ≠ ໃນ QR = ສັນຍານແກ້ຮູບ
    const printedRef = parseSlipText(ocrText, {}).txnRef;
    qrTextMismatch = Boolean(qr.reference && printedRef && !sameRef(qr.reference, printedRef));
  } catch (err) {
    ocrError = err instanceof Error ? err.message.slice(0, 300) : 'OCR ລົ້ມເຫລວ';
    logger.warn({ err, slipId }, 'slip OCR ລົ້ມເຫລວ → NEEDS_REVIEW');
  }

  // ---- ປຽບທຽບ ----
  const accounts = await prisma.bankAccount.findMany({
    where: slip.bankAccountId
      ? { id: slip.bankAccountId }
      : { branchId: slip.branchId, isActive: true },
    select: { id: true, accountNumber: true, bank: { select: { code: true } } },
  });
  const total = toNum(slip.payment.totalAmount);
  const paid = round2(slip.payment.transactions.reduce((s, t) => s + toNum(t.amount), 0));
  const balance = round2(Math.max(0, total - paid));
  const depositRemaining = round2(Math.max(0, toNum(slip.payment.depositAmount) - paid));
  const expectedAmounts =
    slip.declaredAmount !== null
      ? [toNum(slip.declaredAmount)]
      : [balance, ...(depositRemaining > 0 ? [depositRemaining] : [])];

  const match = ocrError
    ? {
        matchScore: 0,
        mismatchFields: ['amount', 'receiverAccount', 'transferredAt', 'txnRef'] as SlipMismatchField[],
        verdict: 'NEEDS_REVIEW' as const,
        matchedAccountId: null,
        matchedToken: null,
      }
    : evaluateSlip({
        parsed,
        expected: {
          amounts: expectedAmounts,
          currency: slip.payment.currency,
          tolerance: await getAmountTolerance(),
        },
        accounts,
        billCreatedAt: slip.payment.createdAt,
        uploadedAt: slip.createdAt,
      });

  // ---- S2/S3 ສັນຍານຄວາມສ່ຽງ ----
  const nearDuplicateOfId = await findNearDuplicate(slip, fingerprint, parsed);
  const riskSignals = [
    ...new Set([
      ...(slip.riskSignals as SlipRiskSignal[]).filter((x) => x === 'EDITOR_SOFTWARE'),
      ...(nearDuplicateOfId ? (['NEAR_DUPLICATE'] as const) : []),
      ...(qrTextMismatch ? (['QR_TEXT_MISMATCH'] as const) : []),
      ...(!ocrError && confidence > 0 && confidence < LOW_CONFIDENCE ? (['LOW_CONFIDENCE'] as const) : []),
    ]),
  ];
  // ສັນຍານທີ່ຫ້າມຜ່ານອັດຕະໂນມັດ — ຍັງກວດ/ອະນຸມັດເອງໄດ້
  const blocked = riskSignals.some((x) => BLOCKING_RISK_SIGNALS.includes(x));
  const verdict = blocked && match.verdict === 'AUTO_MATCHED' ? 'NEEDS_REVIEW' : match.verdict;

  const matchedAccount = accounts.find((a) => a.id === match.matchedAccountId);
  const bankCode = parsed.bankCode ?? matchedAccount?.bank.code ?? accounts[0]?.bank.code ?? null;
  const txnRef = parsed.txnRef?.toUpperCase() ?? null;
  const baseData: Prisma.PaymentSlipUpdateInput = {
    ocrStatus: ocrError ? 'FAILED' : 'DONE',
    ocrEngine: engine,
    ocrMs: Date.now() - started,
    ocrError,
    ocrRaw: {
      text: ocrText,
      confidence,
      dateOnly: parsed.dateOnly,
      accountTokens: parsed.accountTokens,
    },
    qrPayload,
    bankCode,
    amount: parsed.amount === null ? null : dec(parsed.amount),
    currency: parsed.currency,
    txnRef,
    transferredAt: parsed.transferredAt,
    senderName: parsed.senderName,
    receiverAccount: match.matchedToken ?? parsed.accountTokens[0] ?? null,
    matchScore: match.matchScore,
    mismatchFields: match.mismatchFields,
    verdict,
    imagePhash: fingerprint,
    nearDuplicateOfId,
    riskSignals,
    ...(match.matchedAccountId && !slip.bankAccountId
      ? { bankAccount: { connect: { id: match.matchedAccountId } } }
      : {}),
  };

  // (bank, txnRef) ຖືກໃຊ້ກັບສະລິບທີ່ຍັງມີຜົນອື່ນແລ້ວ → DUPLICATE (ພະນັກງານປະຕິເສດໄດ້ເທົ່ານັ້ນ).
  // pre-check ກັນ error ໃນກໍລະນີປົກກະຕິ; unique index ຍັງເປັນດ່ານສຸດທ້າຍຖ້າ 2 ສະລິບ process ພ້ອມກັນ.
  const dedupeKey = txnRef ? `${bankCode ?? 'UNK'}:${txnRef}` : null;
  const clash = dedupeKey
    ? await prisma.paymentSlip.findUnique({ where: { dedupeKey }, select: { id: true } })
    : null;
  const asDuplicate: Prisma.PaymentSlipUpdateInput = {
    ...baseData,
    verdict: 'DUPLICATE',
    dedupeKey: null,
    mismatchFields: [...new Set([...match.mismatchFields, 'txnRef'])],
  };

  let saved;
  if (clash && clash.id !== slipId) {
    saved = await prisma.paymentSlip.update({ where: { id: slipId }, data: asDuplicate });
  } else {
    try {
      saved = await prisma.paymentSlip.update({ where: { id: slipId }, data: { ...baseData, dedupeKey } });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      saved = await prisma.paymentSlip.update({ where: { id: slipId }, data: asDuplicate });
    }
  }

  if (saved.verdict === 'AUTO_MATCHED' && (await isAutoApproveEnabled())) {
    try {
      await approveSlip(slipId, null, undefined, 'ອະນຸມັດອັດຕະໂນມັດ (ຜ່ານທັງ 3 ເກນ)');
      return; // approveSlip ຍິງ event ເອງແລ້ວ
    } catch (err) {
      logger.warn({ err, slipId }, 'auto-approve ສະລິບບໍ່ສຳເລັດ — ປ່ອຍໃຫ້ພະນັກງານກວດ');
    }
  }
  emitUpdated(saved);
}

/** OCR ຕ່ຳກວ່ານີ້ = ອ່ານບໍ່ແນ່ນອນ (ບໍ່ຫ້າມຜ່ານອັດຕະໂນມັດ ແຕ່ສະແດງໃຫ້ເຫັນ). */
const LOW_CONFIDENCE = 50;
const NEAR_DUP_LOOKBACK_MS = 60 * 86_400_000;

function sameRef(a: string, b: string): boolean {
  const n = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const x = n(a);
  const y = n(b);
  return x === y || (x.length >= 6 && y.length >= 6 && (x.endsWith(y) || y.endsWith(x)));
}

/**
 * S2 — ສະລິບທີ່ "ເກືອບຄືກັນ" ທີ່ມີຢູ່ກ່ອນ. ຕ້ອງມີ **ຈຳນວນເງິນ + ຊື່ຜູ້ໂອນ ດຽວກັນ** (ອ່ານໄດ້ທັງສອງໃບ) ບວກກັບ:
 * (ກ) ຮູບເກືອບຄືກັນ (ລາຍນິ້ວມືໝຶກ ≤ 42) ຫຼື (ຂ) ເວລາໂອນນາທີດຽວກັນ ແຕ່ເລກອ້າງອີງຕ່າງ.
 *
 * ເປັນຫຍັງບໍ່ໃຊ້ຮູບຢ່າງດຽວ: ສະລິບທະນາຄານດຽວກັນໃຊ້ template ດຽວກັນ — ສອງໃບຄົນລະການໂອນ ທີ່ຈຳນວນ/ເວລາເທົ່າກັນ
 * ແລະ ເລກອ້າງອີງຕ່າງກັນ 4 ຕົວ ວັດໄດ້ 39.7 (ຕ່ຳກວ່າເກນ) — ຮູບຢ່າງດຽວຈະກັກສະລິບດີໄວ້ຜິດ. ນັບສະເພາະເມື່ອອີກໃບ
 * ເປັນຂອງບິນອື່ນ ຫຼື ຖືກອະນຸມັດ/ຍົກເລີກແລ້ວ — ຖ່າຍຮູບໃໝ່ໃຫ້ບິນດຽວກັນທີ່ຍັງລໍກວດ ບໍ່ແມ່ນການໂກງ.
 */
async function findNearDuplicate(
  slip: { id: string; paymentId: string },
  fingerprint: string | null,
  parsed: SlipParsed,
): Promise<string | null> {
  if (parsed.amount === null || !parsed.senderName) return null;
  const pool = await prisma.paymentSlip.findMany({
    where: {
      id: { not: slip.id },
      verdict: { not: 'REJECTED' },
      amount: dec(parsed.amount),
      senderName: { equals: parsed.senderName, mode: 'insensitive' },
      createdAt: { gte: new Date(Date.now() - NEAR_DUP_LOOKBACK_MS) },
    },
    select: { id: true, paymentId: true, verdict: true, txnRef: true, transferredAt: true, imagePhash: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const relevant = (o: (typeof pool)[number]) =>
    o.paymentId !== slip.paymentId || o.verdict === 'APPROVED' || o.verdict === 'REVERSED';
  const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
  const hit = pool.find((o) => {
    if (!relevant(o)) return false;
    const looksSame = Boolean(
      fingerprint && o.imagePhash && fingerprintDistance(fingerprint, o.imagePhash) <= NEAR_DUPLICATE_MAX_DISTANCE,
    );
    const sameMinuteOtherRef = Boolean(
      parsed.transferredAt &&
        !parsed.dateOnly &&
        o.transferredAt &&
        minute(o.transferredAt) === minute(parsed.transferredAt) &&
        (!o.txnRef || !parsed.txnRef || !sameRef(o.txnRef, parsed.txnRef)),
    );
    return looksSame || sameMinuteOtherRef;
  });
  return hit?.id ?? null;
}

// ---- review ---------------------------------------------------

function pick<T>(corrected: T | undefined, parsed: T | null): T | null {
  return corrected !== undefined ? corrected : parsed;
}

/**
 * ບັນຊີທີ່ເງິນຂອງສະລິບເຂົ້າ — ຕ້ອງຮູ້ກ່ອນອະນຸມັດ, ບໍ່ດັ່ງນັ້ນ tx ຈະບໍ່ຜູກບັນຊີ ແລະ ກະທົບຍອດບໍ່ໄດ້ຕະຫຼອດ.
 * ລຳດັບ: ຜູ້ກວດເລືອກ → ຜູ້ອັບໂຫຼດ/OCR ຜູກໄວ້ → ເລກບັນຊີປາຍທາງ (ແກ້ແລ້ວ ຫຼື OCR) ກົງກັບບັນຊີດຽວຂອງສາຂາ
 * → ສາຂາມີບັນຊີ active ດຽວ. ນອກນັ້ນ 400 ໃຫ້ຜູ້ກວດເລືອກເອງ.
 */
async function resolveReceivingAccount(
  slip: { branchId: string; bankAccountId: string | null; receiverAccount: string | null },
  corrected: SlipCorrectedFields | undefined,
): Promise<string> {
  const accounts = await prisma.bankAccount.findMany({
    where: { branchId: slip.branchId },
    select: { id: true, accountNumber: true, isActive: true },
  });
  if (corrected?.bankAccountId) {
    if (!accounts.some((a) => a.id === corrected.bankAccountId)) {
      throw ApiError.badRequest('ບັນຊີທີ່ເລືອກບໍ່ແມ່ນບັນຊີຂອງສາຂາທີ່ອອກບິນ');
    }
    return corrected.bankAccountId;
  }
  if (slip.bankAccountId) return slip.bankAccountId;
  const active = accounts.filter((a) => a.isActive);
  const token = (corrected?.receiverAccount ?? slip.receiverAccount ?? '').replace(/\D/g, '');
  if (token) {
    const hits = active.filter((a) => accountMatches(token, a.accountNumber));
    if (hits.length === 1) return hits[0]!.id;
  }
  if (active.length === 1) return active[0]!.id;
  if (active.length === 0) throw ApiError.badRequest('ສາຂານີ້ຍັງບໍ່ມີບັນຊີຮັບເງິນ — ເພີ່ມບັນຊີກ່ອນອະນຸມັດ');
  throw ApiError.badRequest('ກະລຸນາເລືອກບັນຊີທີ່ຮັບເງິນກ່ອນອະນຸມັດ');
}

/**
 * ອະນຸມັດສະລິບ → ສ້າງ `PaymentTransaction` (BANK_TRANSFER). ລັອກແຖວ payments (FOR UPDATE) ເໝືອນ
 * `addTenders` ເພື່ອກັນຈ່າຍເກີນ; claim ສະລິບແບບ conditional-update ເພື່ອໃຫ້ອະນຸມັດ 2 ເທື່ອ → tx ດຽວ.
 * `reviewerId = null` = ລະບົບອະນຸມັດເອງ (auto-approve).
 */
export async function approveSlip(
  slipId: string,
  reviewerId: string | null,
  corrected: SlipCorrectedFields | undefined,
  note?: string,
): Promise<PaymentSlipView> {
  const slip = await prisma.paymentSlip.findUnique({
    where: { id: slipId },
    include: { bankAccount: { select: { bank: { select: { code: true } } } }, uploadedBy: { select: { role: true } } },
  });
  if (!slip) throw ApiError.notFound('ບໍ່ພົບສະລິບ');
  if (slip.verdict === 'PENDING') throw ApiError.conflict('OCR ຍັງບໍ່ສຳເລັດ, ກະລຸນາລໍຖ້າ');
  if (!(REVIEWABLE_VERDICTS as readonly string[]).includes(slip.verdict)) {
    throw ApiError.conflict(
      slip.verdict === 'DUPLICATE' ? 'ສະລິບຊ້ຳ — ປະຕິເສດໄດ້ເທົ່ານັ້ນ' : 'ສະລິບນີ້ຖືກດຳເນີນການແລ້ວ',
    );
  }

  const amount = pick(corrected?.amount, slip.amount === null ? null : toNum(slip.amount));
  if (amount === null || amount <= 0) throw ApiError.badRequest('ຕ້ອງລະບຸຈຳນວນເງິນ');
  const txnRef = (pick(corrected?.txnRef, slip.txnRef) ?? '').toUpperCase() || null;
  if (!txnRef) throw ApiError.badRequest('ຕ້ອງລະບຸເລກອ້າງອີງຂອງສະລິບ');
  const bankCode = pick(corrected?.bankCode, slip.bankCode) ?? slip.bankAccount?.bank.code ?? null;
  const transferredAt = corrected?.transferredAt ? new Date(corrected.transferredAt) : slip.transferredAt;
  const bankAccountId = await resolveReceivingAccount(slip, corrected);

  try {
    await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ totalAmount: Prisma.Decimal; currency: string }[]>`
          SELECT "totalAmount", "currency" FROM "payments" WHERE "id" = ${slip.paymentId} FOR UPDATE`;
        const payment = locked[0];
        if (!payment) throw ApiError.notFound('ບໍ່ພົບບິນ');
        if (corrected?.amount === undefined && slip.currency && slip.currency !== payment.currency) {
          throw ApiError.badRequest('ສະກຸນເງິນຂອງສະລິບບໍ່ກົງກັບບິນ');
        }

        const claim = await tx.paymentSlip.updateMany({
          where: { id: slipId, verdict: { in: [...REVIEWABLE_VERDICTS] } },
          data: { verdict: 'APPROVED' },
        });
        if (claim.count === 0) throw ApiError.conflict('ສະລິບນີ້ຖືກດຳເນີນການແລ້ວ');

        const paidRows = await tx.paymentTransaction.findMany({
          where: { paymentId: slip.paymentId, status: 'SUCCESS' },
          select: { amount: true },
        });
        const alreadyPaid = round2(paidRows.reduce((s, t) => s + toNum(t.amount), 0));
        if (alreadyPaid + amount > toNum(payment.totalAmount) + 0.01) {
          throw ApiError.badRequest('ຈຳນວນຈ່າຍລວມເກີນຍອດບິນ');
        }

        const created = await tx.paymentTransaction.create({
          data: {
            paymentId: slip.paymentId,
            method: 'BANK_TRANSFER',
            amount: dec(amount),
            currency: payment.currency,
            qrReference: txnRef,
            bankAccountId,
            status: 'SUCCESS',
          },
        });
        await tx.paymentSlip.update({
          where: { id: slipId },
          data: {
            amount: dec(amount),
            txnRef,
            bankCode,
            transferredAt,
            receiverAccount: pick(corrected?.receiverAccount, slip.receiverAccount),
            senderName: pick(corrected?.senderName, slip.senderName),
            dedupeKey: `${bankCode ?? 'UNK'}:${txnRef}`,
            paymentTransactionId: created.id,
            bankAccountId,
            reviewedById: reviewerId,
            reviewedAt: new Date(),
            reviewNote: note ?? null,
            claimedById: null,
            claimedAt: null,
          },
        });
        await tx.auditLog.create({
          data: {
            branchId: slip.branchId,
            userId: reviewerId,
            action: reviewerId ? 'SLIP_APPROVE' : 'SLIP_AUTO_APPROVE',
            entityName: 'PaymentSlip',
            entityId: slipId,
            oldValue: { verdict: slip.verdict, amount: slip.amount === null ? null : toNum(slip.amount), txnRef: slip.txnRef },
            newValue: { verdict: 'APPROVED', amount, txnRef, paymentTransactionId: created.id, corrected: corrected ?? null },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') throw ApiError.conflict('ເລກອ້າງອີງນີ້ຖືກໃຊ້ກັບສະລິບອື່ນແລ້ວ');
    // Serializable write-conflict: ມີ request ອື່ນກຳລັງອະນຸມັດບິນ/ສະລິບດຽວກັນຢູ່
    if (code === 'P2034') throw ApiError.conflict('ສະລິບນີ້ກຳລັງຖືກດຳເນີນການ, ກະລຸນາລອງໃໝ່');
    throw err;
  }

  await recomputeAndSettle(slip.paymentId);
  const view = await loadView(slipId);
  emitUpdated({ ...slip, verdict: 'APPROVED', ocrStatus: slip.ocrStatus });
  if (slip.uploadedBy.role === 'CUSTOMER') {
    await notifyUser({
      userId: slip.uploadedById,
      type: 'SLIP_APPROVED',
      title: 'ຢືນຢັນການໂອນເງິນແລ້ວ',
      body: `ຮັບຍອດໂອນ ${amount.toLocaleString()} ${view.payment.currency} ຮຽບຮ້ອຍ`,
      data: { paymentId: slip.paymentId, slipId, appointmentId: await appointmentIdOf(slip.paymentId) },
      dedupeKey: `slip-approved:${slipId}`,
    }).catch(() => undefined);
  }
  return view;
}

export async function rejectSlip(
  slipId: string,
  reviewerId: string,
  note: string,
  reasonCode?: SlipRejectCode,
): Promise<PaymentSlipView> {
  const slip = await prisma.paymentSlip.findUnique({
    where: { id: slipId },
    include: { uploadedBy: { select: { role: true } } },
  });
  if (!slip) throw ApiError.notFound('ບໍ່ພົບສະລິບ');
  if (slip.verdict === 'PENDING') throw ApiError.conflict('OCR ຍັງບໍ່ສຳເລັດ, ກະລຸນາລໍຖ້າ');

  await prisma.$transaction(async (tx) => {
    const claim = await tx.paymentSlip.updateMany({
      where: { id: slipId, verdict: { in: [...REVIEWABLE_VERDICTS, 'DUPLICATE'] } },
      // ລ້າງ dedupeKey → ຍື່ນສະລິບຖືກຕ້ອງອັນດຽວກັນໃໝ່ໄດ້ພາຍຫຼັງ
      data: {
        verdict: 'REJECTED',
        dedupeKey: null,
        rejectReason: note,
        rejectCode: reasonCode ?? 'OTHER',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note,
        claimedById: null,
        claimedAt: null,
      },
    });
    if (claim.count === 0) throw ApiError.conflict('ສະລິບນີ້ຖືກດຳເນີນການແລ້ວ');
    await tx.auditLog.create({
      data: {
        branchId: slip.branchId,
        userId: reviewerId,
        action: 'SLIP_REJECT',
        entityName: 'PaymentSlip',
        entityId: slipId,
        oldValue: { verdict: slip.verdict },
        newValue: { verdict: 'REJECTED', reason: note, code: reasonCode ?? 'OTHER' },
      },
    });
  });

  emitUpdated({ ...slip, verdict: 'REJECTED' });
  if (slip.uploadedBy.role === 'CUSTOMER') {
    await notifyUser({
      userId: slip.uploadedById,
      type: 'SLIP_REJECTED',
      title: 'ສະລິບຖືກປະຕິເສດ',
      body: note,
      data: { paymentId: slip.paymentId, slipId, appointmentId: await appointmentIdOf(slip.paymentId) },
      dedupeKey: `slip-rejected:${slipId}`,
    }).catch(() => undefined);
  }
  return loadView(slipId);
}

export async function reviewSlip(
  actor: Actor,
  slipId: string,
  input: ReviewSlipInput,
): Promise<PaymentSlipView> {
  await assertStaffBranchAccess(actor, slipId);
  await assertNotClaimedByOther(slipId, actor.id);
  if (input.action === 'APPROVE') {
    return approveSlip(slipId, actor.id, input.correctedFields, input.note);
  }
  return rejectSlip(slipId, actor.id, input.note!, input.reasonCode);
}

/** S5 — ຄົນອື່ນກຳລັງກວດ (lock ຍັງບໍ່ໝົດອາຍຸ) → 409 ພ້ອມຊື່; ຕ້ອງ "ຮັບຊ່ວງ" (claim force) ກ່ອນ. */
async function assertNotClaimedByOther(slipId: string, actorId: string): Promise<void> {
  const s = await prisma.paymentSlip.findUnique({
    where: { id: slipId },
    select: { claimedById: true, claimedAt: true, claimedBy: { select: { name: true } } },
  });
  if (
    s?.claimedById &&
    s.claimedById !== actorId &&
    s.claimedAt &&
    s.claimedAt.getTime() >= Date.now() - SLIP_CLAIM_TTL_MS
  ) {
    throw ApiError.conflict(`${s.claimedBy?.name ?? 'ພະນັກງານຄົນອື່ນ'} ກຳລັງກວດສະລິບນີ້ຢູ່`);
  }
}

// ---- queries --------------------------------------------------

/** ຜູ້ທີ່ບໍ່ແມ່ນ SUPER_ADMIN ເຫັນ/ແກ້ໄດ້ສະເພາະສາຂາຂອງຕົນ. */
function scopedBranchId(actor: Actor, requested?: string): string | undefined {
  if (actor.isSuperAdmin) return requested;
  if (!actor.branchId) throw ApiError.forbidden('ບັນຊີນີ້ບໍ່ໄດ້ຜູກກັບສາຂາໃດ');
  if (requested && requested !== actor.branchId) throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງສາຂາອື່ນ');
  return actor.branchId;
}

async function assertStaffBranchAccess(actor: Actor, slipId: string): Promise<void> {
  const slip = await prisma.paymentSlip.findUnique({ where: { id: slipId }, select: { branchId: true } });
  if (!slip) throw ApiError.notFound('ບໍ່ພົບສະລິບ');
  scopedBranchId(actor, slip.branchId);
}

/** YYYY-MM-DD ວຽງຈັນ → instant ຂອງ 00:00 ມື້ນັ້ນ. */
function dayStartOf(key: string): Date {
  return vientianeDayStart(new Date(`${key}T00:00:00Z`));
}

const VIEW_WHERE: Record<NonNullable<SlipListQuery['view']>, Prisma.PaymentSlipWhereInput> = {
  action: { verdict: { in: [...OPEN_VERDICTS] } },
  approved: { verdict: 'APPROVED' },
  rejected: { verdict: { in: ['REJECTED', 'DUPLICATE', 'REVERSED'] } },
  all: {},
};

function flagWhere(flag: NonNullable<SlipListQuery['flag']>): Prisma.PaymentSlipWhereInput {
  if (flag === 'ocrFailed') return { ocrStatus: 'FAILED' };
  if (flag === 'duplicate') return { verdict: 'DUPLICATE' };
  if (flag === 'risk') return { riskSignals: { hasSome: [...BLOCKING_RISK_SIGNALS] } };
  if (flag === 'infoRequested') return { infoRequestedAt: { not: null }, verdict: { in: [...OPEN_VERDICTS] } };
  return { mismatchFields: { has: flag } };
}

function buildListWhere(actor: Actor, query: SlipExportQuery): Prisma.PaymentSlipWhereInput {
  const branchId = scopedBranchId(actor, query.branchId);
  const q = query.q?.trim();
  const and: Prisma.PaymentSlipWhereInput[] = [];
  if (query.view) and.push(VIEW_WHERE[query.view]);
  if (query.flag) and.push(flagWhere(query.flag));
  if (query.from) and.push({ createdAt: { gte: dayStartOf(query.from) } });
  if (query.to) and.push({ createdAt: { lt: new Date(dayStartOf(query.to).getTime() + 86_400_000) } });
  if (q) {
    const has = { contains: q, mode: 'insensitive' as const };
    and.push({
      OR: [
        { txnRef: has },
        { senderName: has },
        { uploadedBy: { name: has } },
        { payment: { invoiceNo: has } },
        { payment: { appointment: { customer: { OR: [{ name: has }, { phone: has }] } } } },
        { payment: { bookingGroup: { payer: { name: has } } } },
      ],
    });
  }
  return {
    ...(branchId ? { branchId } : {}),
    ...(query.verdict ? { verdict: query.verdict } : {}),
    ...(query.paymentId ? { paymentId: query.paymentId } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

export async function listSlips(actor: Actor, query: SlipListQuery): Promise<Paginated<PaymentSlipView>> {
  const where = buildListWhere(actor, query);
  const [rows, total] = await Promise.all([
    prisma.paymentSlip.findMany({
      where,
      include: SLIP_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.paymentSlip.count({ where }),
  ]);
  return {
    items: await toViews(rows),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

// ---- summary --------------------------------------------------

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const isoDay = (d: Date): string => vientianeDateKey(d).toISOString().slice(0, 10);

/**
 * ຕົວເລກຫົວໜ້າກ່ອງກວດ — ນັບຢູ່ DB (ບໍ່ແມ່ນຈາກ 100 ແຖວລ່າສຸດທີ່ client ຖື). ຂອບເຂດສາຂາຄືກັບ listSlips.
 */
export async function getSlipSummary(actor: Actor, requestedBranchId?: string): Promise<SlipSummary> {
  const branchId = scopedBranchId(actor, requestedBranchId);
  const scope: Prisma.PaymentSlipWhereInput = branchId ? { branchId } : {};
  const now = new Date();
  const todayStart = vientianeDayRangeOf(now).start;
  const weekStart = new Date(todayStart.getTime() - 6 * 86_400_000);
  const settings = await getSlipSettings();

  const [openRows, openAmount, todayApproved, todayAuto, todayRejected, todayUploaded, week] = await Promise.all([
    prisma.paymentSlip.findMany({
      where: { ...scope, verdict: { in: [...OPEN_VERDICTS, 'DUPLICATE'] } },
      select: { branchId: true, verdict: true, ocrStatus: true, createdAt: true, riskSignals: true, infoRequestedAt: true },
    }),
    prisma.paymentSlip.aggregate({
      where: { ...scope, verdict: { in: [...REVIEWABLE_VERDICTS] }, OR: [{ currency: 'LAK' }, { currency: null }] },
      _sum: { amount: true },
    }),
    prisma.paymentSlip.aggregate({
      where: { ...scope, verdict: 'APPROVED', reviewedAt: { gte: todayStart } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.paymentSlip.count({ where: { ...scope, verdict: 'APPROVED', reviewedAt: { gte: todayStart }, reviewedById: null } }),
    prisma.paymentSlip.count({ where: { ...scope, verdict: 'REJECTED', reviewedAt: { gte: todayStart } } }),
    prisma.paymentSlip.count({ where: { ...scope, createdAt: { gte: todayStart } } }),
    prisma.paymentSlip.findMany({
      where: { ...scope, OR: [{ createdAt: { gte: weekStart } }, { reviewedAt: { gte: weekStart } }] },
      select: {
        createdAt: true,
        reviewedAt: true,
        reviewedById: true,
        verdict: true,
        ocrStatus: true,
        mismatchFields: true,
        bankCode: true,
        rejectCode: true,
      },
      take: 10_000,
    }),
  ]);

  const open = openRows.filter((r) => (OPEN_VERDICTS as readonly string[]).includes(r.verdict));
  const count = (v: string) => open.filter((r) => r.verdict === v).length;
  const overSla = open.filter(
    (r) => now.getTime() - r.createdAt.getTime() >= slaForBranch(settings, r.branchId) * 60_000,
  ).length;
  const oldest = open.reduce<Date | null>((m, r) => (!m || r.createdAt < m ? r.createdAt : m), null);

  const days = Array.from({ length: 7 }, (_, i) => isoDay(new Date(weekStart.getTime() + i * 86_400_000)));
  const daily = new Map(days.map((d) => [d, { date: d, uploaded: 0, approved: 0, rejected: 0 }]));
  const mismatch: SlipSummary['week']['mismatch'] = {};
  const rejectCodes: SlipSummary['week']['rejectCodes'] = {};
  const banks = new Map<string, { processed: number; clean: number }>();
  let uploaded = 0;
  let processed = 0;
  let clean = 0;
  const reviewMinutes: number[] = [];
  for (const r of week) {
    if (r.createdAt >= weekStart) {
      uploaded += 1;
      const d = daily.get(isoDay(r.createdAt));
      if (d) d.uploaded += 1;
      if (r.ocrStatus === 'DONE' || r.ocrStatus === 'FAILED') {
        processed += 1;
        const ok = r.mismatchFields.length === 0 && r.ocrStatus === 'DONE' && r.verdict !== 'DUPLICATE';
        if (ok) clean += 1;
        for (const f of r.mismatchFields as SlipMismatchField[]) mismatch[f] = (mismatch[f] ?? 0) + 1;
        const b = banks.get(r.bankCode ?? '?') ?? { processed: 0, clean: 0 };
        b.processed += 1;
        if (ok) b.clean += 1;
        banks.set(r.bankCode ?? '?', b);
      }
    }
    if (r.reviewedAt && r.reviewedAt >= weekStart) {
      const d = daily.get(isoDay(r.reviewedAt));
      if (d && r.verdict === 'APPROVED') d.approved += 1;
      if (d && r.verdict === 'REJECTED') d.rejected += 1;
      if (r.verdict === 'REJECTED' && r.rejectCode) {
        const c = r.rejectCode as SlipRejectCode;
        rejectCodes[c] = (rejectCodes[c] ?? 0) + 1;
      }
      if (r.reviewedById) reviewMinutes.push((r.reviewedAt.getTime() - r.createdAt.getTime()) / 60_000);
    }
  }
  const med = median(reviewMinutes);

  return {
    open: {
      needsReview: count('NEEDS_REVIEW'),
      autoMatched: count('AUTO_MATCHED'),
      pending: count('PENDING'),
      ocrFailed: open.filter((r) => r.verdict !== 'PENDING' && r.ocrStatus === 'FAILED').length,
      duplicates: openRows.filter((r) => r.verdict === 'DUPLICATE').length,
      amount: round2(toNum(openAmount._sum.amount ?? 0)),
      oldestAt: oldest?.toISOString() ?? null,
      overSla,
      risky: open.filter((r) => r.riskSignals.some((x) => (BLOCKING_RISK_SIGNALS as string[]).includes(x))).length,
      infoRequested: open.filter((r) => r.infoRequestedAt).length,
    },
    today: {
      approved: todayApproved._count,
      approvedAmount: round2(toNum(todayApproved._sum.amount ?? 0)),
      autoApproved: todayAuto,
      rejected: todayRejected,
      uploaded: todayUploaded,
    },
    week: {
      uploaded,
      autoMatchRate: processed > 0 ? Math.round((clean / processed) * 100) : null,
      medianReviewMinutes: med === null ? null : Math.round(med),
      mismatch,
      daily: [...daily.values()],
      byBank: [...banks.entries()]
        .map(([bankCode, b]) => ({ bankCode, ...b, rate: Math.round((b.clean / b.processed) * 100) }))
        .sort((a, b) => b.processed - a.processed),
      rejectCodes,
    },
    slaMinutes: slaForBranch(settings, branchId),
  };
}

// ---- bulk + reprocess -----------------------------------------

/**
 * ຢືນຢັນຫຼາຍໃບ — ສະເພາະ AUTO_MATCHED (ຜ່ານທຸກເກນ, ບໍ່ມີຫຍັງໃຫ້ແກ້). ແຕ່ລະໃບຜ່ານ `approveSlip` ດຽວກັນ
 * (ລັອກບິນ, ກັນຈ່າຍເກີນ, audit); ໃບທີ່ລົ້ມຖືກລາຍງານ ບໍ່ລົ້ມທັງຊຸດ.
 */
export async function bulkApproveSlips(actor: Actor, ids: string[]): Promise<BulkApproveSlipsResult> {
  const out: BulkApproveSlipsResult = { approved: [], failed: [] };
  for (const id of [...new Set(ids)]) {
    try {
      await assertStaffBranchAccess(actor, id);
      await assertNotClaimedByOther(id, actor.id);
      const slip = await prisma.paymentSlip.findUnique({ where: { id }, select: { verdict: true } });
      if (slip?.verdict !== 'AUTO_MATCHED') {
        throw ApiError.conflict('ຢືນຢັນຫຼາຍໃບໄດ້ສະເພາະສະລິບທີ່ຜ່ານທຸກເກນ — ໃບນີ້ຕ້ອງກວດເອງ');
      }
      await approveSlip(id, actor.id, undefined, 'ຢືນຢັນເປັນຊຸດ');
      out.approved.push(id);
    } catch (err) {
      out.failed.push({ id, message: err instanceof Error ? err.message : 'ບໍ່ສຳເລັດ' });
    }
  }
  return out;
}

/**
 * ອ່ານສະລິບໃໝ່ (OCR ລົ້ມ ຫຼື ອ່ານຜິດ) — ລ້າງຜົນເກົ່າ ແລ້ວສົ່ງເຂົ້າ queue. ບໍ່ແຕະສະລິບທີ່ມີຜົນສຸດທ້າຍແລ້ວ.
 */
export async function reprocessSlip(actor: Actor, slipId: string): Promise<PaymentSlipView> {
  await assertStaffBranchAccess(actor, slipId);
  const slip = await prisma.paymentSlip.findUnique({ where: { id: slipId } });
  if (!slip) throw ApiError.notFound('ບໍ່ພົບສະລິບ');
  const stale = slip.updatedAt.getTime() < Date.now() - STALE_PROCESSING_MS;
  if (slip.verdict === 'PENDING' && !stale) throw ApiError.conflict('ກຳລັງອ່ານສະລິບຢູ່ແລ້ວ');
  if (!(['PENDING', ...REVIEWABLE_VERDICTS] as string[]).includes(slip.verdict)) {
    throw ApiError.conflict('ສະລິບນີ້ມີຜົນແລ້ວ — ອ່ານໃໝ່ບໍ່ໄດ້');
  }
  const claim = await prisma.paymentSlip.updateMany({
    where: { id: slipId, verdict: slip.verdict, updatedAt: slip.updatedAt },
    data: {
      ocrStatus: 'PENDING',
      verdict: 'PENDING',
      ocrError: null,
      matchScore: 0,
      mismatchFields: [],
      dedupeKey: null,
      nearDuplicateOfId: null,
      // ສັນຍານຈາກໄຟລ໌ຕົ້ນສະບັບ (EXIF) ຄິດຄືນບໍ່ໄດ້ — ເກັບໄວ້; ອັນອື່ນຄິດໃໝ່ຕອນອ່ານ
      riskSignals: slip.riskSignals.filter((x) => x === 'EDITOR_SOFTWARE'),
    },
  });
  if (claim.count === 0) throw ApiError.conflict('ສະລິບນີ້ຖືກປ່ຽນໂດຍຄົນອື່ນ, ກະລຸນາລອງໃໝ່');
  await prisma.auditLog.create({
    data: {
      branchId: slip.branchId,
      userId: actor.id,
      action: 'SLIP_REPROCESS',
      entityName: 'PaymentSlip',
      entityId: slipId,
      oldValue: { verdict: slip.verdict, ocrStatus: slip.ocrStatus, matchScore: slip.matchScore },
      newValue: { verdict: 'PENDING', ocrStatus: 'PENDING' },
    },
  });
  dispatchSlipOcr(slipId);
  emitUpdated({ ...slip, verdict: 'PENDING', ocrStatus: 'PENDING' });
  return loadView(slipId);
}

/** ສະລິບຂອງບິນໜຶ່ງ — ໃຫ້ mobile ສະແດງສະຖານະ "ລໍຖ້າກວດ". ສິດເຂົ້າເຖິງບິນກວດຜ່ານ `getPayment`. */
export async function listPaymentSlips(
  auth: AccessTokenPayload,
  paymentId: string,
): Promise<PaymentSlipView[]> {
  await getPayment(paymentId, auth);
  const rows = await prisma.paymentSlip.findMany({
    where: { paymentId },
    include: SLIP_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return toViews(rows);
}

const REF_SELECT = {
  id: true,
  verdict: true,
  amount: true,
  txnRef: true,
  paymentId: true,
  createdAt: true,
  payment: SLIP_INCLUDE.payment,
} satisfies Prisma.PaymentSlipSelect;

function toRef(r: Prisma.PaymentSlipGetPayload<{ select: typeof REF_SELECT }>): SlipRef {
  const p = r.payment;
  return {
    id: r.id,
    verdict: r.verdict,
    amount: r.amount === null ? null : toNum(r.amount),
    txnRef: r.txnRef,
    customerName:
      p.appointment?.customer.name ??
      p.bookingGroup?.payer.name ??
      p.giftCardPurchase?.buyer?.name ??
      p.packagePurchase?.user?.name ??
      null,
    paymentId: r.paymentId,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function getSlip(actor: Actor, slipId: string): Promise<PaymentSlipDetail> {
  const row = await prisma.paymentSlip.findUnique({ where: { id: slipId }, include: SLIP_INCLUDE });
  if (!row) throw ApiError.notFound('ບໍ່ພົບສະລິບ');
  if (row.uploadedById !== actor.id) {
    if (actor.role === 'CUSTOMER' || !(actor.isSuperAdmin || actor.permissions.has('payments:review'))) {
      throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງສະລິບນີ້');
    }
    scopedBranchId(actor, row.branchId);
  }

  // ສະລິບທີ່ຖືເລກອ້າງອີງນີ້ກ່ອນ (ທະນາຄານດຽວກັນ) — ຜູ້ກວດຈະເຫັນວ່າຊ້ຳກັບໃຜ
  const [duplicate, siblings, near] = await Promise.all([
    row.txnRef
      ? prisma.paymentSlip.findFirst({
          where: {
            id: { not: row.id },
            txnRef: row.txnRef,
            ...(row.bankCode ? { bankCode: row.bankCode } : {}),
            verdict: { notIn: ['REJECTED', 'DUPLICATE'] },
          },
          orderBy: { createdAt: 'asc' },
          select: REF_SELECT,
        })
      : null,
    prisma.paymentSlip.findMany({
      where: { paymentId: row.paymentId, id: { not: row.id } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: REF_SELECT,
    }),
    row.nearDuplicateOfId
      ? prisma.paymentSlip.findUnique({ where: { id: row.nearDuplicateOfId }, select: REF_SELECT })
      : null,
  ]);

  const view = (await toViews([row]))[0]!;
  // ຂໍ້ຄວາມ OCR ດິບ ສະເພາະພະນັກງານ (ລູກຄ້າທີ່ອັບເອງບໍ່ຈຳເປັນ)
  const staff = actor.role !== 'CUSTOMER';
  return {
    ...view,
    ocrText: staff ? ocrRawOf(row).text : null,
    duplicateOf: staff && duplicate ? toRef(duplicate) : null,
    nearDuplicateOf: staff && near ? toRef(near) : null,
    siblings: staff ? siblings.map(toRef) : [],
  };
}

// ---- S5 claim / S6 ask customer / S7 reverse -------------------

/**
 * S5 — ຈອງການກວດ (soft lock ໝົດອາຍຸເອງ 3 ນາທີ; client ຕໍ່ອາຍຸທຸກ 60 ວິ ຂະນະເປີດສະລິບຢູ່).
 * ວ່າງ / ໝົດອາຍຸ / ຂອງຕົນເອງ → ຈອງ; ຄົນອື່ນຈອງຢູ່ → ຄືນມຸມມອງທີ່ມີ `claimedBy` ເປັນຄົນນັ້ນ (ບໍ່ error),
 * ເວັ້ນແຕ່ `force` (ຮັບຊ່ວງ) ເຊິ່ງບັນທຶກ audit.
 */
export async function claimSlip(actor: Actor, slipId: string, force = false): Promise<PaymentSlipView> {
  await assertStaffBranchAccess(actor, slipId);
  const s = await prisma.paymentSlip.findUniqueOrThrow({
    where: { id: slipId },
    select: { verdict: true, claimedById: true, claimedAt: true, branchId: true, paymentId: true, uploadedById: true, ocrStatus: true },
  });
  if (!(OPEN_VERDICTS as readonly string[]).includes(s.verdict)) return loadView(slipId);
  const fresh = s.claimedAt && s.claimedAt.getTime() >= Date.now() - SLIP_CLAIM_TTL_MS;
  const other = s.claimedById && s.claimedById !== actor.id && fresh;
  if (other && !force) return loadView(slipId);
  await prisma.paymentSlip.update({ where: { id: slipId }, data: { claimedById: actor.id, claimedAt: new Date() } });
  if (other && force) {
    await prisma.auditLog.create({
      data: {
        branchId: s.branchId,
        userId: actor.id,
        action: 'SLIP_CLAIM_TAKEOVER',
        entityName: 'PaymentSlip',
        entityId: slipId,
        oldValue: { claimedById: s.claimedById },
        newValue: { claimedById: actor.id },
      },
    });
  }
  // ບອກຄົນອື່ນໃນຫ້ອງກວດ ໃຫ້ເຫັນວ່າໃຜກຳລັງກວດ (ບໍ່ຍິງທຸກ heartbeat — ສະເພາະຕອນເຈົ້າຂອງປ່ຽນ)
  if (s.claimedById !== actor.id || !fresh) emitUpdated({ id: slipId, ...s });
  return loadView(slipId);
}

/** S5 — ປ່ອຍ lock (ປິດສະລິບ / ປ່ຽນໄປໃບອື່ນ). ປ່ອຍໄດ້ສະເພາະຂອງຕົນເອງ. */
export async function releaseSlip(actor: Actor, slipId: string): Promise<void> {
  const r = await prisma.paymentSlip.updateMany({
    where: { id: slipId, claimedById: actor.id },
    data: { claimedById: null, claimedAt: null },
  });
  if (r.count > 0) {
    const s = await prisma.paymentSlip.findUnique({
      where: { id: slipId },
      select: { branchId: true, paymentId: true, uploadedById: true, verdict: true, ocrStatus: true },
    });
    if (s) emitUpdated({ id: slipId, ...s });
  }
}

export type RequestSlipInfoResult = { slip: PaymentSlipView; viaChat: boolean };

/**
 * S6 — ຂໍຮູບ/ຂໍ້ມູນເພີ່ມຈາກລູກຄ້າໂດຍບໍ່ປະຕິເສດ: ບັນທຶກຄຳຂໍໃສ່ສະລິບ, ສົ່ງ push (ເປີດໜ້າຈ່າຍເງິນ) ແລະ ຖ້າບິນມີ
 * ນັດໝາຍ ແລະ ຜູ້ສົ່ງມີສິດ → ສົ່ງຂໍ້ຄວາມເຂົ້າແຊັດຂອງນັດນັ້ນນຳ. ສະລິບຍັງຢູ່ໃນຄິວ (ທຸງ "ລໍລູກຄ້າ").
 */
export async function requestSlipInfo(
  actor: Actor,
  auth: AccessTokenPayload,
  slipId: string,
  message: string,
): Promise<RequestSlipInfoResult> {
  await assertStaffBranchAccess(actor, slipId);
  const s = await prisma.paymentSlip.findUniqueOrThrow({
    where: { id: slipId },
    select: {
      verdict: true,
      branchId: true,
      paymentId: true,
      uploadedById: true,
      ocrStatus: true,
      uploadedBy: { select: { role: true } },
      payment: {
        select: {
          appointmentId: true,
          appointment: { select: { customerId: true } },
          bookingGroup: { select: { payerId: true } },
        },
      },
    },
  });
  if (!(REVIEWABLE_VERDICTS as readonly string[]).includes(s.verdict)) {
    throw ApiError.conflict('ຂໍຂໍ້ມູນໄດ້ສະເພາະສະລິບທີ່ຍັງລໍກວດ');
  }
  await prisma.$transaction([
    prisma.paymentSlip.update({ where: { id: slipId }, data: { infoRequestedAt: new Date(), infoRequestNote: message } }),
    prisma.auditLog.create({
      data: {
        branchId: s.branchId,
        userId: actor.id,
        action: 'SLIP_INFO_REQUEST',
        entityName: 'PaymentSlip',
        entityId: slipId,
        newValue: { message },
      },
    }),
  ]);

  // ລູກຄ້າຂອງບິນ (ອາດບໍ່ແມ່ນຄົນອັບ ຖ້າພະນັກງານອັບໃຫ້)
  const customerId =
    s.uploadedBy.role === 'CUSTOMER'
      ? s.uploadedById
      : (s.payment.appointment?.customerId ?? s.payment.bookingGroup?.payerId ?? null);
  if (customerId) {
    await notifyUser({
      userId: customerId,
      type: 'SLIP_INFO_REQUESTED',
      title: 'ກະລຸນາສົ່ງຂໍ້ມູນການໂອນເພີ່ມ',
      body: message,
      data: { paymentId: s.paymentId, slipId, appointmentId: s.payment.appointmentId },
      dedupeKey: `slip-info:${slipId}:${Date.now()}`,
      severity: 'warning',
    }).catch(() => undefined);
  }
  let viaChat = false;
  if (s.payment.appointmentId && customerId) {
    try {
      const thread = await ensureThread(s.payment.appointmentId, auth);
      const msg = await postMessage(thread.id, auth, `📎 ${message}`);
      emitChatMessage(msg);
      viaChat = true;
    } catch (err) {
      // ພະນັກງານທົ່ວໄປອາດບໍ່ມີສິດເຂົ້າແຊັດຂອງນັດ — push ພໍແລ້ວ
      logger.info({ err, slipId }, 'slip info request: chat not sent');
    }
  }
  emitUpdated({ id: slipId, ...s });
  return { slip: await loadView(slipId), viaChat };
}

const REVERSAL_BLOCK_MESSAGE: Record<string, string> = {
  NOT_APPROVED: 'ຍົກເລີກໄດ້ສະເພາະສະລິບທີ່ອະນຸມັດແລ້ວ',
  BILL_SETTLED: 'ບິນຈ່າຍຄົບ ແລະ ອອກໃບຮັບເງິນແລ້ວ — ໃຫ້ void ບິນ ຫຼື ຄືນເງິນໃນໜ້າການເງິນ',
  RECONCILED: 'ເງິນນີ້ຖືກຈັບຄູ່ກັບ statement ທະນາຄານແລ້ວ — ຍົກເລີກການຈັບຄູ່ກ່ອນ',
  PERIOD_CLOSED: 'ງວດກະທົບຍອດຂອງເດືອນນັ້ນປິດແລ້ວ',
};

/**
 * S7 — ຍົກເລີກການອະນຸມັດ (ເຊັ່ນ ພົບພາຍຫຼັງວ່າເງິນບໍ່ເຂົ້າ): tx → REVERSED, ສະລິບ → REVERSED, ບິນຄິດຍອດຄືນ.
 * ລັອກແຖວບິນຄືກັບ approve. ເງື່ອນໄຂ (ບິນບໍ່ຈ່າຍຄົບ / ບໍ່ຈັບຄູ່ statement / ງວດບໍ່ປິດ) ມາຈາກ `reversalOf`.
 */
export async function reverseSlip(actor: Actor, slipId: string, reason: string): Promise<PaymentSlipView> {
  await assertStaffBranchAccess(actor, slipId);
  const view = await loadView(slipId);
  if (!view.reversal.allowed) {
    throw ApiError.conflict(REVERSAL_BLOCK_MESSAGE[view.reversal.blockedReason ?? ''] ?? 'ຍົກເລີກບໍ່ໄດ້');
  }
  const txId = view.paymentTransactionId!;
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${view.paymentId} FOR UPDATE`;
      const pay = await tx.payment.findUniqueOrThrow({ where: { id: view.paymentId }, select: { paymentStatus: true } });
      if (!['PENDING', 'DEPOSIT_PAID'].includes(pay.paymentStatus)) throw ApiError.conflict(REVERSAL_BLOCK_MESSAGE.BILL_SETTLED!);
      const claim = await tx.paymentSlip.updateMany({
        where: { id: slipId, verdict: 'APPROVED' },
        data: {
          verdict: 'REVERSED',
          dedupeKey: null,
          reversedById: actor.id,
          reversedAt: new Date(),
          reverseReason: reason,
        },
      });
      if (claim.count === 0) throw ApiError.conflict('ສະລິບນີ້ຖືກດຳເນີນການແລ້ວ');
      const t = await tx.paymentTransaction.updateMany({ where: { id: txId, status: 'SUCCESS' }, data: { status: 'REVERSED' } });
      if (t.count === 0) throw ApiError.conflict('ລາຍການຈ່າຍນີ້ບໍ່ຢູ່ໃນສະຖານະສຳເລັດແລ້ວ');
      await tx.auditLog.create({
        data: {
          branchId: view.branchId,
          userId: actor.id,
          action: 'SLIP_REVERSE',
          entityName: 'PaymentSlip',
          entityId: slipId,
          oldValue: { verdict: 'APPROVED', paymentTransactionId: txId, amount: view.amount },
          newValue: { verdict: 'REVERSED', reason },
        },
      });
    },
    { isolationLevel: 'Serializable' },
  );
  await recomputeAndSettle(view.paymentId);
  if (view.uploadedByRole === 'CUSTOMER') {
    await notifyUser({
      userId: view.uploadedById,
      type: 'SLIP_REVERSED',
      title: 'ການຢືນຢັນການໂອນຖືກຍົກເລີກ',
      body: reason,
      data: { paymentId: view.paymentId, slipId, appointmentId: view.payment.appointmentId },
      dedupeKey: `slip-reversed:${slipId}`,
      severity: 'warning',
    }).catch(() => undefined);
  }
  emitUpdated({ ...view, id: slipId, verdict: 'REVERSED' });
  return loadView(slipId);
}

// ---- S10 export ------------------------------------------------

const EXPORT_LIMIT = 5000;

/** S10 — CSV ຂອງການຕັດສິນ ຕາມຕົວກັ່ນຕອງດຽວກັບກ່ອງກວດ (ສູງສຸດ 5000 ແຖວ, ໃໝ່ສຸດກ່ອນ). */
export async function exportSlipsCsv(actor: Actor, query: SlipExportQuery): Promise<{ filename: string; csv: string }> {
  const rows = await prisma.paymentSlip.findMany({
    where: buildListWhere(actor, query),
    include: SLIP_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: EXPORT_LIMIT,
  });
  const views = await toViews(rows);
  const headers = [
    'uploaded_at',
    'branch',
    'customer',
    'uploaded_by',
    'uploader_role',
    'bank',
    'txn_ref',
    'amount',
    'currency',
    'declared_amount',
    'bill_total',
    'invoice_no',
    'transferred_at',
    'sender',
    'receiver_account',
    'verdict',
    'match_score',
    'failed_checks',
    'risk_signals',
    'bank_proof',
    'reviewed_by',
    'reviewed_at',
    'reject_code',
    'reason_or_note',
    'reversed_by',
    'reversed_at',
    'reverse_reason',
    'wait_minutes',
  ];
  const esc = (v: string | number | null | undefined): string => {
    const s = v === null || v === undefined ? '' : String(v);
    // ກັນ CSV/formula injection ໃນ Excel
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [headers.join(',')];
  for (const v of views) {
    const decided = v.reviewedAt ? new Date(v.reviewedAt).getTime() : Date.now();
    lines.push(
      [
        v.createdAt,
        v.branchName,
        v.customerName,
        v.uploadedByName,
        v.uploadedByRole,
        v.bankCode,
        v.txnRef,
        v.amount,
        v.currency ?? v.payment.currency,
        v.declaredAmount,
        v.payment.totalAmount,
        v.payment.invoiceNo,
        v.transferredAt,
        v.senderName,
        v.receiverAccount,
        v.verdict,
        v.matchScore,
        v.mismatchFields.join('|'),
        v.riskSignals.join('|'),
        v.bankProof.status,
        v.reviewedByName ?? (v.verdict === 'APPROVED' && v.reviewedAt ? 'AUTO' : null),
        v.reviewedAt,
        v.rejectCode,
        v.rejectReason ?? v.reviewNote,
        v.reversedByName,
        v.reversedAt,
        v.reverseReason,
        Math.round((decided - new Date(v.createdAt).getTime()) / 60_000),
      ]
        .map(esc)
        .join(','),
    );
  }
  const stamp = new Date().toISOString().slice(0, 10);
  // BOM ໃຫ້ Excel ອ່ານພາສາລາວເປັນ UTF-8
  return { filename: `slips-${stamp}.csv`, csv: `\uFEFF${lines.join('\n')}` };
}

// ---- S4 SLA alerts ---------------------------------------------

/**
 * S4 — ແລ່ນທຸກ 5 ນາທີ: ສະລິບທີ່ລໍເກີນ SLA ຂອງສາຂາ → ແຈ້ງ SUPER_ADMIN + BRANCH_ADMIN ຂອງສາຂາ.
 * dedupe ຕໍ່ "ສະລິບທີ່ເກີນໃໝ່ລ່າສຸດ" ເພື່ອບໍ່ແຈ້ງຊ້ຳທຸກຮອບ ແຕ່ແຈ້ງອີກເມື່ອມີໃບໃໝ່ເກີນ.
 */
export async function runSlipSlaAlerts(now = new Date()): Promise<{ branches: number; notified: number }> {
  const settings = await getSlipSettings();
  if (!settings.slaAlertEnabled) return { branches: 0, notified: 0 };
  const open = await prisma.paymentSlip.findMany({
    where: { verdict: { in: [...OPEN_VERDICTS] } },
    select: { id: true, branchId: true, createdAt: true, branch: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const late = open.filter((s) => now.getTime() - s.createdAt.getTime() >= slaForBranch(settings, s.branchId) * 60_000);
  const byBranch = new Map<string, typeof late>();
  for (const s of late) byBranch.set(s.branchId, [...(byBranch.get(s.branchId) ?? []), s]);

  let notified = 0;
  for (const [branchId, list] of byBranch) {
    const newest = list[list.length - 1]!;
    const oldestMin = Math.round((now.getTime() - list[0]!.createdAt.getTime()) / 60_000);
    const admins = await prisma.user.findMany({
      where: { isActive: true, deletedAt: null, OR: [{ role: 'SUPER_ADMIN' }, { role: 'BRANCH_ADMIN', branchId }] },
      select: { id: true },
    });
    for (const a of admins) {
      const r = await notifyUser({
        userId: a.id,
        type: 'slip_sla_breach',
        title: `ສະລິບລໍກວດເກີນເວລາ ${list.length} ໃບ · ${list[0]!.branch.name}`,
        body: `ໃບທີ່ລໍດົນສຸດ ${oldestMin} ນາທີ (ເປົ້າໝາຍ ${slaForBranch(settings, branchId)} ນາທີ)`,
        data: { module: 'payments', path: `/payments/slips?sort=oldest&branch=${branchId}` },
        dedupeKey: `slip-sla:${branchId}:${newest.id}:${a.id}`,
        severity: 'warning',
      }).catch(() => ({ skipped: true }));
      if (!r.skipped) notified += 1;
    }
  }
  return { branches: byBranch.size, notified };
}
