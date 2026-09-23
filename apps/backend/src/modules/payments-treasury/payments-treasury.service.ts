import type {
  AccessTokenPayload,
  BankAccountListQuery,
  CreateQrIntentInput,
  PaymentBankAccountView,
} from '@abcp/shared-types';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { storage } from '../../storage/index.js';
import { getPayment } from '../payments/payments.service.js';
import { getBankProvider } from './providers/registry.js';

export const BANK_ACCOUNT_SELECT = {
  id: true,
  bankId: true,
  branchId: true,
  accountName: true,
  accountNumber: true,
  currency: true,
  qrImageKey: true,
  isActive: true,
  isDefault: true,
  bank: { select: { id: true, code: true, nameLo: true, nameEn: true, supportsQr: true } },
  changeRequests: {
    where: { status: 'PENDING' as const },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { id: true, kind: true, createdAt: true, requestedBy: { select: { name: true } } },
  },
} as const;

type BankAccountRow = {
  qrImageKey: string | null;
  changeRequests: { id: string; kind: string; createdAt: Date; requestedBy: { name: string } }[];
} & Record<string, unknown>;

/** ເພີ່ມ `qrImageUrl` (ຄິດຈາກ qrImageKey ຜ່ານ storage adapter) + `pendingChange` ໃຫ້ແຖວບັນຊີ. */
export function withQrUrl<T extends BankAccountRow>(
  row: T,
): Omit<T, 'changeRequests'> & {
  qrImageUrl: string | null;
  pendingChange: { id: string; kind: 'UPDATE' | 'QR'; requestedByName: string; createdAt: string } | null;
} {
  const { changeRequests, ...rest } = row;
  const p = changeRequests[0];
  return {
    ...rest,
    qrImageUrl: row.qrImageKey ? storage.url(row.qrImageKey) : null,
    pendingChange: p
      ? { id: p.id, kind: p.kind as 'UPDATE' | 'QR', requestedByName: p.requestedBy.name, createdAt: p.createdAt.toISOString() }
      : null,
  };
}

/** ຈຳກັດ branchId ໃຫ້ BRANCH_ADMIN ເຫັນສະເພາະສາຂາຂອງຕົນ; SUPER_ADMIN ເລືອກໄດ້ (ຫຼືເບິ່ງໝົດ). */
export function scopeBranchId(auth: AccessTokenPayload, requested?: string | null): string | undefined {
  if (auth.role === 'BRANCH_ADMIN') {
    if (!auth.branchId) throw ApiError.forbidden('ບັນຊີນີ້ບໍ່ໄດ້ຜູກກັບສາຂາໃດ');
    if (requested && requested !== auth.branchId) {
      throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງສາຂາອື່ນ');
    }
    return auth.branchId;
  }
  return requested ?? undefined;
}

export async function listBanks() {
  return prisma.bank.findMany({
    where: { isActive: true },
    select: { id: true, code: true, nameLo: true, nameEn: true, logoUrl: true, supportsQr: true, isActive: true },
    orderBy: { nameEn: 'asc' },
  });
}

export async function listBankAccounts(auth: AccessTokenPayload, query: BankAccountListQuery) {
  const branchId = scopeBranchId(auth, query.branchId);
  const rows = await prisma.bankAccount.findMany({
    where: { ...(branchId ? { branchId } : {}) },
    select: BANK_ACCOUNT_SELECT,
    orderBy: [{ branchId: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map(withQrUrl);
}

export async function deleteBankAccount(auth: AccessTokenPayload, id: string): Promise<void> {
  const existing = await prisma.bankAccount.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບບັນຊີທະນາຄານ');
  scopeBranchId(auth, existing.branchId);
  if (existing.isDefault) {
    throw ApiError.badRequest('ບໍ່ສາມາດລຶບບັນຊີ default ໄດ້ — ຕັ້ງບັນຊີອື່ນເປັນ default ກ່ອນ');
  }
  await prisma.bankAccount.update({ where: { id }, data: { isActive: false } });
  await prisma.auditLog.create({
    data: {
      branchId: existing.branchId,
      userId: auth.sub,
      action: 'DELETE',
      entityName: 'BankAccount',
      entityId: id,
      oldValue: existing as never,
    },
  });
}

/** ຄືນບັນຊີ default ຂອງສາຂາ (ໃຊ້ໂດຍ QR-intent flow ຖ້າບໍ່ໄດ້ລະບຸ bankAccountId). */
export async function getDefaultBankAccount(branchId: string) {
  const account = await prisma.bankAccount.findFirst({
    where: { branchId, isActive: true, isDefault: true },
    select: BANK_ACCOUNT_SELECT,
  });
  if (account) return account;
  // ຖ້າຍັງບໍ່ໄດ້ຕັ້ງ default (ຂໍ້ມູນເກົ່າ), ຄືນບັນຊີ active ອັນທຳອິດ.
  return prisma.bankAccount.findFirst({
    where: { branchId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: BANK_ACCOUNT_SELECT,
  });
}

export async function createQrIntent(auth: AccessTokenPayload, providerCode: string, input: CreateQrIntentInput) {
  const provider = getBankProvider(providerCode);
  if (!provider) throw ApiError.notFound(`ບໍ່ພົບ provider: ${providerCode}`);

  const providerConfig = await prisma.paymentProvider.findUnique({ where: { code: providerCode } });
  if (!providerConfig || !providerConfig.isActive) {
    throw ApiError.badRequest('provider ນີ້ຍັງບໍ່ໄດ້ເປີດໃຊ້');
  }

  const payment = await prisma.payment.findUnique({ where: { id: input.paymentId } });
  if (!payment) throw ApiError.notFound('ບໍ່ພົບບິນ');
  scopeBranchId(auth, payment.branchId);

  const bankAccount = input.bankAccountId
    ? await prisma.bankAccount.findUnique({ where: { id: input.bankAccountId }, select: BANK_ACCOUNT_SELECT })
    : await getDefaultBankAccount(payment.branchId);
  if (!bankAccount) throw ApiError.badRequest('ສາຂານີ້ຍັງບໍ່ໄດ້ຕັ້ງບັນຊີທະນາຄານ');

  const reference = `${providerCode}_${payment.id.slice(0, 8)}_${Date.now()}`;
  const { qrPayload, expiresAt } = await provider.createQrIntent({
    amount: input.amount,
    currency: input.currency,
    ttlMinutes: input.ttlMinutes,
    reference,
    bankAccountNumber: bankAccount.accountNumber,
    bankAccountName: bankAccount.accountName,
  });

  const intent = await prisma.providerIntent.create({
    data: {
      paymentId: payment.id,
      providerCode,
      bankAccountId: bankAccount.id,
      amount: input.amount,
      currency: input.currency,
      reference,
      expiresAt,
      rawResponse: { qrPayload } as never,
    },
  });

  return { intentId: intent.id, reference, qrPayload, expiresAt, bankAccount: withQrUrl(bankAccount) };
}

/**
 * ບັນຊີຮັບເງິນທີ່ ACTIVE ຂອງສາຂາທີ່ອອກບິນ — ໃຫ້ລູກຄ້າເລືອກທະນາຄານກ່ອນໂອນ. ສິດເຂົ້າເຖິງບິນກວດຜ່ານ
 * `getPayment` (ເຈົ້າຂອງບິນ ຫຼື ພະນັກງານ); default ຂຶ້ນກ່ອນ.
 */
export async function listPaymentBankAccounts(
  auth: AccessTokenPayload,
  paymentId: string,
): Promise<PaymentBankAccountView[]> {
  const payment = await getPayment(paymentId, auth);
  const rows = await prisma.bankAccount.findMany({
    where: { branchId: payment.branchId, isActive: true },
    select: BANK_ACCOUNT_SELECT,
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map((a) => ({
    id: a.id,
    accountName: a.accountName,
    accountNumber: a.accountNumber,
    currency: a.currency,
    isDefault: a.isDefault,
    qrImageUrl: a.qrImageKey ? storage.url(a.qrImageKey) : null,
    bank: { code: a.bank.code, nameLo: a.bank.nameLo, nameEn: a.bank.nameEn, supportsQr: a.bank.supportsQr },
  }));
}
