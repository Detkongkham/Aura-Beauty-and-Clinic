import { z } from 'zod';
import { moneySchema, paginationQuerySchema } from './common.schema.js';

/**
 * Payments & Treasury (ໂມດູນ 39) W3 — ສະລິບໂອນເງິນ + OCR + ກ່ອງກວດ.
 * ອ້າງອີງ: docs/payments-treasury-plan.md §3, §5 (W3).
 */

export const slipContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export type SlipContentType = z.infer<typeof slipContentTypeSchema>;

export const slipVerdictSchema = z.enum([
  'PENDING',
  'AUTO_MATCHED',
  'NEEDS_REVIEW',
  'APPROVED',
  'REJECTED',
  'DUPLICATE',
  /** S7 — ເຄີຍອະນຸມັດ ແລ້ວຖືກຍົກເລີກ. */
  'REVERSED',
]);
export type SlipVerdict = z.infer<typeof slipVerdictSchema>;

export const slipOcrStatusSchema = z.enum(['PENDING', 'PROCESSING', 'DONE', 'FAILED']);
export type SlipOcrStatus = z.infer<typeof slipOcrStatusSchema>;

/** field ທີ່ OCR/ການປຽບທຽບຊີ້ວ່າ "ບໍ່ກົງ" — ໜ້າກວດສະລິບໃຊ້ໄຮໄລ້ເປັນສີ. */
export const slipMismatchFieldSchema = z.enum([
  'amount',
  'currency',
  'receiverAccount',
  'transferredAt',
  'txnRef',
]);
export type SlipMismatchField = z.infer<typeof slipMismatchFieldSchema>;

/** POST /payments-treasury/payments/:id/slips — ຮູບ encode ເປັນ base64 (ບໍ່ຕ້ອງມີ data: prefix). */
export const uploadSlipSchema = z.object({
  contentType: slipContentTypeSchema,
  dataBase64: z.string().min(1),
  bankAccountId: z.string().uuid().optional(),
  /** ຈຳນວນທີ່ຜູ້ອັບໂຫຼດແຈ້ງວ່າໂອນ — ຖ້າບໍ່ລະບຸ, ຄາດໝາຍວ່າເທົ່າຍອດຄ້າງ ຫຼື ຍອດມັດຈຳ. */
  amount: moneySchema.refine((n) => n > 0, 'ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0').optional(),
});
export type UploadSlipInput = z.infer<typeof uploadSlipSchema>;

/** ແຖບຂອງກ່ອງກວດ — action = ຍັງຕ້ອງເຮັດ (PENDING/AUTO_MATCHED/NEEDS_REVIEW). */
export const slipViewSchema = z.enum(['action', 'approved', 'rejected', 'all']);
export type SlipQueueView = z.infer<typeof slipViewSchema>;

/** S2/S3 — ສັນຍານຄວາມສ່ຽງຂອງຮູບ/ຂໍ້ມູນ. ສາມອັນທຳອິດຫ້າມ AUTO_MATCHED. */
export const slipRiskSignalSchema = z.enum(['NEAR_DUPLICATE', 'EDITOR_SOFTWARE', 'QR_TEXT_MISMATCH', 'LOW_CONFIDENCE']);
export type SlipRiskSignal = z.infer<typeof slipRiskSignalSchema>;
export const BLOCKING_RISK_SIGNALS: SlipRiskSignal[] = ['NEAR_DUPLICATE', 'EDITOR_SOFTWARE', 'QR_TEXT_MISMATCH'];

/** S8 — ເຫດຜົນປະຕິເສດແບບມີລະຫັດ. */
export const slipRejectCodeSchema = z.enum([
  'AMOUNT_SHORT',
  'WRONG_ACCOUNT',
  'UNREADABLE',
  'DUPLICATE',
  'NOT_RECEIVED',
  'OLD_SLIP',
  'SUSPECTED_FAKE',
  'OTHER',
]);
export type SlipRejectCode = z.infer<typeof slipRejectCodeSchema>;

/** ທຸງກັ່ນຕອງ: field ທີ່ບໍ່ຜ່ານ, OCR ລົ້ມ/ຊ້ຳ, ມີສັນຍານສ່ຽງ, ລໍຄຳຕອບລູກຄ້າ. */
export const slipFlagSchema = z.enum([
  ...slipMismatchFieldSchema.options,
  'ocrFailed',
  'duplicate',
  'risk',
  'infoRequested',
]);
export type SlipFlag = z.infer<typeof slipFlagSchema>;

export const slipListQuerySchema = paginationQuerySchema.extend({
  verdict: slipVerdictSchema.optional(),
  view: slipViewSchema.optional(),
  flag: slipFlagSchema.optional(),
  branchId: z.string().uuid().optional(),
  paymentId: z.string().uuid().optional(),
  /** ຊື່ລູກຄ້າ/ຜູ້ອັບ/ຜູ້ໂອນ, ເລກອ້າງອີງ, ເລກໃບຮັບເງິນ. */
  q: z.string().trim().max(80).optional(),
  /** YYYY-MM-DD ວຽງຈັນ ຂອງວັນອັບໂຫຼດ (ລວມທັງສອງຂອບ). */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type SlipListQuery = z.infer<typeof slipListQuerySchema>;

/** ຄ່າທີ່ພະນັກງານແກ້ຕອນອະນຸມັດ (OCR ອ່ານຜິດ) — ທຸກ field optional. */
export const slipCorrectedFieldsSchema = z.object({
  bankCode: z.string().trim().min(1).max(20).optional(),
  amount: moneySchema.refine((n) => n > 0, 'ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0').optional(),
  txnRef: z.string().trim().min(4).max(64).optional(),
  transferredAt: z.string().datetime().optional(),
  receiverAccount: z.string().trim().max(60).optional(),
  senderName: z.string().trim().max(120).optional(),
  /** ບັນຊີຮັບເງິນທີ່ຜູ້ກວດເລືອກ — ຕ້ອງເປັນບັນຊີຂອງສາຂາທີ່ອອກບິນ. */
  bankAccountId: z.string().uuid().optional(),
});
export type SlipCorrectedFields = z.infer<typeof slipCorrectedFieldsSchema>;

export const reviewSlipSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT']),
    correctedFields: slipCorrectedFieldsSchema.optional(),
    note: z.string().trim().max(500).optional(),
    /** S8 — ລະຫັດເຫດຜົນ (REJECT ເທົ່ານັ້ນ). */
    reasonCode: slipRejectCodeSchema.optional(),
  })
  .refine((v) => v.action !== 'REJECT' || Boolean(v.note), {
    message: 'ຕ້ອງລະບຸເຫດຜົນເມື່ອປະຕິເສດສະລິບ',
    path: ['note'],
  });
export type ReviewSlipInput = z.infer<typeof reviewSlipSchema>;

/** S1 — ຫຼັກຖານຈາກ statement ທະນາຄານທີ່ນຳເຂົ້າ. */
export const slipBankProofSchema = z.object({
  /**
   * MATCHED = ແຖວ statement ຖືກຈັບຄູ່ກັບ tx ຂອງສະລິບນີ້ແລ້ວ; FOUND = ມີແຖວເງິນເຂົ້າທີ່ກົງ (ຈຳນວນ + ວັນ ± 1,
   * ຫຼື ເລກອ້າງອີງ); NOT_FOUND = ມີ statement ຂອງມື້ນັ້ນແຕ່ບໍ່ພົບ; NO_STATEMENT = ຍັງບໍ່ໄດ້ນຳເຂົ້າ.
   */
  status: z.enum(['MATCHED', 'FOUND', 'NOT_FOUND', 'NO_STATEMENT']),
  refMatched: z.boolean(),
  line: z
    .object({
      id: z.string().uuid(),
      statementDate: z.string(),
      postedAt: z.string().nullable(),
      amount: z.number(),
      reference: z.string().nullable(),
      description: z.string().nullable(),
    })
    .nullable(),
});
export type SlipBankProof = z.infer<typeof slipBankProofSchema>;

export const paymentSlipViewSchema = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
  branchId: z.string().uuid(),
  branchName: z.string(),
  customerName: z.string().nullable(),
  uploadedById: z.string().uuid(),
  uploadedByName: z.string(),
  imageUrl: z.string(),
  declaredAmount: z.number().nullable(),

  ocrStatus: slipOcrStatusSchema,
  ocrEngine: z.string().nullable(),
  ocrMs: z.number().nullable(),
  qrPayload: z.string().nullable(),

  bankCode: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  txnRef: z.string().nullable(),
  transferredAt: z.string().nullable(),
  senderName: z.string().nullable(),
  receiverAccount: z.string().nullable(),

  matchScore: z.number().int(),
  mismatchFields: z.array(slipMismatchFieldSchema),
  verdict: slipVerdictSchema,
  rejectReason: z.string().nullable(),
  reviewedByName: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewNote: z.string().nullable(),
  paymentTransactionId: z.string().uuid().nullable(),

  /** ຂໍ້ຄວາມ error ຂອງ OCR (ຖ້າລົ້ມ) + ຄວາມໝັ້ນໃຈ 0–100 ຂອງ engine. */
  ocrError: z.string().nullable(),
  ocrConfidence: z.number().nullable(),
  /** ສະລິບມີແຕ່ວັນທີ ບໍ່ມີເວລາ → ກວດເວລາເປັນມື້. */
  dateOnly: z.boolean(),
  uploadedByRole: z.string(),
  sizeBytes: z.number().int(),
  updatedAt: z.string(),

  riskSignals: z.array(slipRiskSignalSchema),
  nearDuplicateOfId: z.string().uuid().nullable(),
  /** S5 — ຜູ້ກຳລັງກວດ (null = ວ່າງ ຫຼື lock ໝົດອາຍຸ). */
  claimedBy: z.object({ id: z.string().uuid(), name: z.string(), at: z.string() }).nullable(),
  infoRequestedAt: z.string().nullable(),
  infoRequestNote: z.string().nullable(),
  rejectCode: slipRejectCodeSchema.nullable(),
  reversedByName: z.string().nullable(),
  reversedAt: z.string().nullable(),
  reverseReason: z.string().nullable(),
  bankProof: slipBankProofSchema,
  /** S7 — ຍົກເລີກການອະນຸມັດໄດ້ບໍ ແລະ ເຫດຜົນທີ່ບໍ່ໄດ້. */
  reversal: z.object({ allowed: z.boolean(), blockedReason: z.string().nullable() }),

  /** ສະຖານະບິນ ໜ້າກວດຈະໄດ້ເຫັນວ່າຄາດໝາຍເທົ່າໃດ. */
  payment: z.object({
    totalAmount: z.number(),
    balanceAmount: z.number(),
    currency: z.string(),
    paidAmount: z.number(),
    depositAmount: z.number(),
    /** ມັດຈຳທີ່ຍັງຄ້າງ (0 ຖ້າຈ່າຍເກີນມັດຈຳແລ້ວ) — ເປັນຍອດທີ່ຍອມຮັບອີກອັນໜຶ່ງ. */
    depositRemaining: z.number(),
    status: z.string(),
    invoiceNo: z.string().nullable(),
    appointmentId: z.string().uuid().nullable(),
    createdAt: z.string(),
  }),
  bankAccount: z
    .object({
      id: z.string().uuid(),
      accountName: z.string(),
      accountNumber: z.string(),
      bankCode: z.string(),
    })
    .nullable(),
  createdAt: z.string(),
});
export type PaymentSlipView = z.infer<typeof paymentSlipViewSchema>;

/** ສະລິບອື່ນຂອງບິນດຽວກັນ / ສະລິບຕົ້ນສະບັບທີ່ຊ້ຳ — ແຖວສັ້ນ. */
export const slipRefSchema = z.object({
  id: z.string().uuid(),
  verdict: slipVerdictSchema,
  amount: z.number().nullable(),
  txnRef: z.string().nullable(),
  customerName: z.string().nullable(),
  paymentId: z.string().uuid(),
  createdAt: z.string(),
});
export type SlipRef = z.infer<typeof slipRefSchema>;

/** GET /slips/:id — ມຸມມອງເຕັມສຳລັບໜ້າກວດ (ຂໍ້ຄວາມ OCR ດິບ, ສະລິບຊ້ຳ, ສະລິບອື່ນຂອງບິນ). */
export const paymentSlipDetailSchema = paymentSlipViewSchema.extend({
  ocrText: z.string().nullable(),
  /** ສະລິບທີ່ໃຊ້ (ທະນາຄານ, ເລກອ້າງອີງ) ດຽວກັນກ່ອນ — ມີເມື່ອ verdict = DUPLICATE ຫຼື ເລກອ້າງອີງຖືກໃຊ້ແລ້ວ. */
  duplicateOf: slipRefSchema.nullable(),
  /** S2 — ສະລິບທີ່ຮູບເກືອບຄືກັນ. */
  nearDuplicateOf: slipRefSchema.nullable(),
  siblings: z.array(slipRefSchema),
});
export type PaymentSlipDetail = z.infer<typeof paymentSlipDetailSchema>;

/** GET /slips/summary — ຕົວເລກຫົວໜ້າກ່ອງກວດ (ນັບຢູ່ server ບໍ່ແມ່ນຈາກ 100 ແຖວລ່າສຸດ). */
export const slipSummarySchema = z.object({
  open: z.object({
    needsReview: z.number().int(),
    autoMatched: z.number().int(),
    pending: z.number().int(),
    /** ລໍຖ້າກວດ (NEEDS_REVIEW + AUTO_MATCHED) ທີ່ OCR ລົ້ມ. */
    ocrFailed: z.number().int(),
    /** ຊ້ຳທີ່ຍັງບໍ່ໄດ້ປະຕິເສດ. */
    duplicates: z.number().int(),
    /** ຍອດລວມ (ສະກຸນຫຼັກ LAK ເທົ່ານັ້ນ) ທີ່ລໍຢືນຢັນ. */
    amount: z.number(),
    oldestAt: z.string().nullable(),
    /** ລໍເກີນ SLA ຂອງສາຂາ. */
    overSla: z.number().int(),
    /** ມີສັນຍານສ່ຽງທີ່ຫ້າມຜ່ານອັດຕະໂນມັດ. */
    risky: z.number().int(),
    /** ລໍຄຳຕອບຈາກລູກຄ້າ. */
    infoRequested: z.number().int(),
  }),
  today: z.object({
    approved: z.number().int(),
    approvedAmount: z.number(),
    autoApproved: z.number().int(),
    rejected: z.number().int(),
    uploaded: z.number().int(),
  }),
  /** 7 ມື້ຫຼ້າສຸດ. */
  week: z.object({
    uploaded: z.number().int(),
    /** % ສະລິບທີ່ OCR ອ່ານແລ້ວຜ່ານທຸກເກນ (AUTO_MATCHED ຫຼື ອະນຸມັດອັດຕະໂນມັດ). */
    autoMatchRate: z.number().nullable(),
    /** ເວລາເຄິ່ງກາງ (ນາທີ) ຈາກອັບໂຫຼດ → ຄົນກວດ. */
    medianReviewMinutes: z.number().nullable(),
    /** ສາເຫດປະຕິເສດ/ບໍ່ຜ່ານເລື້ອຍສຸດ. */
    mismatch: z.record(slipMismatchFieldSchema, z.number().int()),
    daily: z.array(z.object({ date: z.string(), uploaded: z.number().int(), approved: z.number().int(), rejected: z.number().int() })),
    /** S9 — ຄວາມແມ່ນຍຳການອ່ານຕໍ່ທະນາຄານ. */
    byBank: z.array(
      z.object({ bankCode: z.string(), processed: z.number().int(), clean: z.number().int(), rate: z.number() }),
    ),
    /** S8 — ປະຕິເສດຕາມລະຫັດ. */
    rejectCodes: z.record(slipRejectCodeSchema, z.number().int()),
  }),
  slaMinutes: z.number().int(),
});
export type SlipSummary = z.infer<typeof slipSummarySchema>;

export const slipSummaryQuerySchema = z.object({ branchId: z.string().uuid().optional() });

/** POST /slips/bulk-approve — ຢືນຢັນສະລິບ AUTO_MATCHED ຫຼາຍໃບ (ຜ່ານ service ດຽວກັນທີລະໃບ). */
export const bulkApproveSlipsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});
export type BulkApproveSlipsInput = z.infer<typeof bulkApproveSlipsSchema>;
/** S5 — ຈອງ/ຕໍ່ອາຍຸການກວດ; force = ຍຶດຈາກຄົນອື່ນ. */
export const claimSlipSchema = z.object({ force: z.boolean().optional() });
/** S6 — ຂໍຂໍ້ມູນ/ຮູບໃໝ່ຈາກລູກຄ້າ ໂດຍບໍ່ປະຕິເສດ. */
export const requestSlipInfoSchema = z.object({ message: z.string().trim().min(3).max(500) });
export type RequestSlipInfoInput = z.infer<typeof requestSlipInfoSchema>;
/** S7 — ຍົກເລີກການອະນຸມັດ. */
export const reverseSlipSchema = z.object({ reason: z.string().trim().min(5).max(500) });
export type ReverseSlipInput = z.infer<typeof reverseSlipSchema>;
/** S10 — export CSV ໃຊ້ຕົວກັ່ນຕອງດຽວກັນກັບ list (ສູງສຸດ 5000 ແຖວ). */
export const slipExportQuerySchema = slipListQuerySchema.omit({ page: true, pageSize: true });
export type SlipExportQuery = z.infer<typeof slipExportQuerySchema>;

export type BulkApproveSlipsResult = {
  approved: string[];
  failed: { id: string; message: string }[];
};

/** socket event `payment-slip:updated` — ບໍ່ມີຂໍ້ມູນສ່ວນຕົວ, client ດຶງລາຍລະອຽດຜ່ານ REST. */
export type PaymentSlipEvent = {
  slipId: string;
  paymentId: string;
  branchId: string;
  verdict: SlipVerdict;
  ocrStatus: SlipOcrStatus;
};
