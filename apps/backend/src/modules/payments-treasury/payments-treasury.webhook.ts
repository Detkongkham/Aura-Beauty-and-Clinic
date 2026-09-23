import { randomUUID } from 'node:crypto';
import type { AccessTokenPayload } from '@abcp/shared-types';
import type { Prisma, PaymentProvider, ProviderEvent } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { ApiError } from '../../utils/ApiError.js';
import { recomputeAndSettle } from '../payments/payments.service.js';
import { getBankProvider } from './providers/registry.js';
import { signWebhookBody } from './providers/webhookUtil.js';
import type { ProviderIntentStatus } from './providers/types.js';

/**
 * ໂມດູນ 39 W2 — Webhook ເປັນເສັ້ນທາງຕັດຍອດດຽວຂອງການຈ່າຍອອນລາຍ (plan §2.3). Simulator ກໍຍິງເຂົ້າ
 * `handleWebhook` ຕົວດຽວກັນ — ພຶດຕິກຳທີ່ test ໄວ້ຈຶ່ງບໍ່ປ່ຽນເມື່ອຕໍ່ API ຈິງ.
 */

export type WebhookResult =
  | 'SETTLED'
  | 'SETTLED_REPLAY'
  | 'FAILED'
  | 'EXPIRED'
  | 'IGNORED_NOT_PENDING'
  | 'IGNORED_PENDING'
  | 'UNKNOWN_INTENT'
  | 'PROVIDER_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'OVERPAY';

export type WebhookOutcome = { duplicate: boolean; result: string | null };

const round2 = (n: number): number => Math.round(n * 100) / 100;

function resolveSecret(config: PaymentProvider): string {
  if (config.webhookSecretRef) {
    const s = process.env[config.webhookSecretRef];
    if (s) return s;
  } else if (config.mode === 'MOCK') {
    return env.PAYMENT_WEBHOOK_SECRET;
  }
  throw new ApiError(503, ErrorCode.INTERNAL, 'provider ນີ້ຍັງບໍ່ໄດ້ຕັ້ງ webhook secret');
}

async function loadProvider(code: string) {
  const provider = getBankProvider(code);
  const config = await prisma.paymentProvider.findUnique({ where: { code } });
  if (!provider || !config || !config.isActive) throw ApiError.notFound(`ບໍ່ພົບ provider: ${code}`);
  if (config.mode === 'MOCK' && env.isProd) {
    throw ApiError.forbidden('provider ແບບຈຳລອງຖືກປິດໃນ production');
  }
  return { provider, config };
}

async function applyEvent(
  providerCode: string,
  v: { reference: string; status: ProviderIntentStatus; amount?: number },
  isReplay: boolean,
): Promise<{ result: WebhookResult; intentId?: string; paymentId?: string }> {
  const intent = await prisma.providerIntent.findUnique({ where: { reference: v.reference } });
  if (!intent) return { result: 'UNKNOWN_INTENT' };
  const ids = { intentId: intent.id, paymentId: intent.paymentId };
  if (intent.providerCode !== providerCode) return { result: 'PROVIDER_MISMATCH', ...ids };

  // replay ຂອງ event ດຽວກັນທີ່ລົ້ມກາງທາງຫຼັງ intent ຖືກຕັດແລ້ວ → recompute ຊ້ຳໄດ້ (idempotent).
  // event ໃໝ່ (eventId ຕ່າງ) ທີ່ມາຫຼັງ intent ປິດແລ້ວ ບໍ່ຄວນກະຕຸ້ນ side-effect ອີກ.
  if (isReplay && intent.status === 'SUCCESS' && v.status === 'SUCCESS') {
    await recomputeAndSettle(intent.paymentId);
    return { result: 'SETTLED_REPLAY', ...ids };
  }
  if (intent.status !== 'PENDING') return { result: 'IGNORED_NOT_PENDING', ...ids };
  if (v.status === 'PENDING') return { result: 'IGNORED_PENDING', ...ids };

  const claim = (status: ProviderIntentStatus) =>
    prisma.providerIntent.updateMany({
      where: { id: intent.id, status: 'PENDING' },
      data: { status },
    });

  if (v.status === 'FAILED' || v.status === 'EXPIRED') {
    await claim(v.status);
    return { result: v.status, ...ids };
  }

  if (intent.expiresAt.getTime() < Date.now()) {
    await claim('EXPIRED');
    return { result: 'EXPIRED', ...ids };
  }
  const intentAmount = Number(intent.amount);
  if (v.amount !== undefined && Math.abs(v.amount - intentAmount) > 0.01) {
    return { result: 'AMOUNT_MISMATCH', ...ids };
  }

  const result = await prisma.$transaction(
    async (tx): Promise<WebhookResult> => {
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: intent.paymentId },
        include: { transactions: { select: { amount: true, status: true } } },
      });
      const paid = payment.transactions
        .filter((t) => t.status === 'SUCCESS')
        .reduce((s, t) => s + Number(t.amount), 0);
      if (round2(paid + intentAmount) > round2(Number(payment.totalAmount)) + 0.01)
        return 'OVERPAY';

      const claimed = await tx.providerIntent.updateMany({
        where: { id: intent.id, status: 'PENDING' },
        data: { status: 'SUCCESS' },
      });
      if (claimed.count === 0) return 'IGNORED_NOT_PENDING';

      await tx.paymentTransaction.create({
        data: {
          paymentId: intent.paymentId,
          method: providerCode === 'MANUAL_TRANSFER' ? 'BANK_TRANSFER' : 'BANK_QR',
          amount: intent.amount,
          currency: intent.currency,
          qrReference: intent.reference,
          bankAccountId: intent.bankAccountId,
          providerIntentId: intent.id,
          status: 'SUCCESS',
        },
      });
      return 'SETTLED';
    },
    { isolationLevel: 'Serializable' },
  );
  if (result === 'SETTLED') await recomputeAndSettle(intent.paymentId);
  return { result, ...ids };
}

async function processEvent(event: ProviderEvent, isReplay: boolean): Promise<WebhookOutcome> {
  const p = event.payload as { reference?: string; status?: ProviderIntentStatus; amount?: number };
  const outcome = await applyEvent(
    event.providerCode,
    {
      reference: p.reference ?? '',
      status: p.status ?? 'FAILED',
      amount: p.amount,
    },
    isReplay,
  );
  await prisma.providerEvent.update({
    where: { id: event.id },
    data: {
      processedAt: new Date(),
      result: outcome.result,
      providerIntentId: outcome.intentId ?? null,
    },
  });
  if (outcome.result === 'AMOUNT_MISMATCH' || outcome.result === 'OVERPAY') {
    logger.warn(
      { eventId: event.eventId, result: outcome.result },
      'payment webhook needs manual review',
    );
  }
  return { duplicate: false, result: outcome.result };
}

/** ກວດ HMAC ກ່ອນ parse → ບັນທຶກ ProviderEvent (idempotent ຕໍ່ eventId) → process. */
export async function handleWebhook(
  providerCode: string,
  rawBody: Buffer,
  signature: string | undefined,
): Promise<WebhookOutcome> {
  const { provider, config } = await loadProvider(providerCode);
  const v = provider.verifyWebhook(rawBody, signature, resolveSecret(config));
  if (!v.ok) throw ApiError.unauthorized('webhook signature ບໍ່ຖືກຕ້ອງ');
  if (!v.eventId || !v.reference) throw ApiError.badRequest('webhook ຂາດ eventId ຫຼື reference');

  const where = { providerCode_eventId: { providerCode, eventId: v.eventId } };
  let event = await prisma.providerEvent.findUnique({ where });
  if (event?.processedAt) return { duplicate: true, result: event.result };
  const isReplay = event !== null;
  if (!event) {
    try {
      event = await prisma.providerEvent.create({
        data: {
          providerCode,
          eventId: v.eventId,
          signature: signature ?? null,
          payload: v.raw as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return { duplicate: true, result: null };
      throw err;
    }
  }
  return processEvent(event, isReplay);
}

/** ໃຊ້ໂດຍ job: ຮັບ event ທີ່ລົ້ມກາງທາງ (processedAt = null) ມາ process ຊ້ຳ. */
export async function replayStaleEvents(
  olderThanMs = 5 * 60_000,
): Promise<{ replayed: number; failed: number }> {
  const stale = await prisma.providerEvent.findMany({
    where: { processedAt: null, createdAt: { lt: new Date(Date.now() - olderThanMs) } },
    take: 50,
    orderBy: { createdAt: 'asc' },
  });
  let failed = 0;
  for (const e of stale) {
    try {
      await processEvent(e, true);
    } catch (err) {
      failed += 1;
      logger.error(
        { err, eventId: e.eventId, providerCode: e.providerCode },
        'payment webhook replay failed',
      );
    }
  }
  return { replayed: stale.length - failed, failed };
}

/** dev/staging ເທົ່ານັ້ນ — ຍິງ webhook ທີ່ signature ຖືກຕ້ອງເຂົ້າ handleWebhook ຕົວຈິງ. */
export async function simulateIntent(
  auth: AccessTokenPayload,
  intentId: string,
  status: 'SUCCESS' | 'FAILED',
): Promise<WebhookOutcome & { intentStatus: string }> {
  if (env.isProd) throw ApiError.forbidden('simulate-paid ຖືກປິດໃນ production');
  const intent = await prisma.providerIntent.findUnique({
    where: { id: intentId },
    include: { payment: { select: { branchId: true } } },
  });
  if (!intent) throw ApiError.notFound('ບໍ່ພົບ intent');
  if (auth.role === 'BRANCH_ADMIN' && auth.branchId !== intent.payment.branchId) {
    throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງສາຂາອື່ນ');
  }
  const { config } = await loadProvider(intent.providerCode);
  if (config.mode !== 'MOCK') throw ApiError.badRequest('simulate ໃຊ້ໄດ້ສະເພາະ provider ແບບ MOCK');

  const body = Buffer.from(
    JSON.stringify({
      eventId: `sim_${randomUUID()}`,
      reference: intent.reference,
      status,
      amount: Number(intent.amount),
    }),
  );
  const secret = resolveSecret(config);
  const signature = signWebhookBody(body, secret);
  const { provider } = await loadProvider(intent.providerCode);
  if (!provider.verifyWebhook(body, signature, secret).ok) {
    throw ApiError.badRequest('provider ນີ້ບໍ່ຮອງຮັບ webhook (ໃຊ້ສະລິບແທນ)');
  }
  const outcome = await handleWebhook(intent.providerCode, body, signature);
  const fresh = await prisma.providerIntent.findUniqueOrThrow({
    where: { id: intentId },
    select: { status: true },
  });
  return { ...outcome, intentStatus: fresh.status };
}
