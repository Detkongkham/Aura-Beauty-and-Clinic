import { randomUUID } from 'node:crypto';
import type {
  AccessTokenPayload,
  ApproveBankChangeInput,
  BankAccountChangeView,
  BankChangeField,
  BankChangeListQuery,
  CreateBankAccountInput,
  RejectBankChangeInput,
  UpdateBankAccountInput,
  UploadBankAccountQrInput,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { notifyUser } from '../../services/push.js';
import { storage } from '../../storage/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { verifyPassword } from '../../utils/password.js';
import { BANK_ACCOUNT_SELECT, scopeBranchId, withQrUrl } from './payments-treasury.service.js';
import { normalizeForStorage } from './slips/ocr/preprocess.js';

/**
 * ກັນການສັບປ່ຽນບັນຊີຮັບເງິນ (payee-change fraud). ຂໍ້ມູນ "ຜູ້ຮັບເງິນ" = ການເພີ່ມບັນຊີ, ຊື່ / ເລກບັນຊີ /
 * ສະກຸນເງິນ ແລະ ຮູບ QR — ຖ້າຖືກສັບ, ເງິນລູກຄ້າຈະໄຫຼໄປບັນຊີອື່ນໂດຍບໍ່ມີໃຜເຫັນ. ກົດ:
 *  - ທຸກຄົນຕ້ອງຢືນຢັນລະຫັດຜ່ານ (ກັນ session ທີ່ຖືກລັກ).
 *  - BRANCH_ADMIN → ຍື່ນຄຳຂໍ PENDING; ຍັງບໍ່ມີຜົນຈົນກວ່າ SUPER_ADMIN ອະນຸມັດ (ຢືນຢັນລະຫັດຜ່ານອີກຄັ້ງ).
 *  - SUPER_ADMIN → ນຳໃຊ້ທັນທີ, ບັນທຶກເປັນ APPROVED ແລະ ແຈ້ງ admin ຄົນອື່ນ + admin ສາຂາ.
 * isDefault / isActive / ລຶບ QR ບໍ່ນັບເປັນການປ່ຽນຜູ້ຮັບເງິນ (ບັນຊີເຫຼົ່ານັ້ນຜ່ານການອະນຸມັດມາແລ້ວ).
 */

type Payee = { accountName: string; accountNumber: string; currency: string; qrImageKey: string | null };
type CreatePayload = Omit<CreateBankAccountInput, 'currentPassword'> & { bankCode: string };
type UpdatePayload = Partial<Pick<Payee, 'accountName' | 'accountNumber' | 'currency'>>;
type QrPayload = { qrImageKey: string };

const PAYEE_FIELDS = ['accountName', 'accountNumber', 'currency'] as const;

const CHANGE_INCLUDE = {
  branch: { select: { name: true } },
  bankAccount: { select: { accountName: true, bank: { select: { code: true } } } },
  requestedBy: { select: { name: true } },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.BankAccountChangeRequestInclude;
type ChangeRow = Prisma.BankAccountChangeRequestGetPayload<{ include: typeof CHANGE_INCLUDE }>;

// ── helpers ──────────────────────────────────────────────────────────

/** ຢືນຢັນລະຫັດຜ່ານຂອງຜູ້ເຮັດ — 403 (ບໍ່ແມ່ນ 401 ເພື່ອບໍ່ໃຫ້ client ຄິດວ່າ session ໝົດອາຍຸ). */
export async function confirmPassword(userId: string, currentPassword: string | undefined): Promise<void> {
  if (!currentPassword) {
    throw new ApiError(403, ErrorCode.REAUTH_REQUIRED, 'ກະລຸນາຢືນຢັນລະຫັດຜ່ານເພື່ອປ່ຽນຂໍ້ມູນບັນຊີຮັບເງິນ');
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user?.password || !(await verifyPassword(currentPassword, user.password))) {
    throw new ApiError(403, ErrorCode.REAUTH_FAILED, 'ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ');
  }
}

const isOwner = (auth: AccessTokenPayload) => auth.role === 'SUPER_ADMIN';
const tail = (n: string | null | undefined) => (n ? `···${n.replace(/\s+/g, '').slice(-4)}` : '—');

function payeeOf(a: Payee): Payee {
  return { accountName: a.accountName, accountNumber: a.accountNumber, currency: a.currency, qrImageKey: a.qrImageKey };
}

/** ສະຫຼຸບການປ່ຽນເປັນປະໂຫຍກດຽວ (ເລກບັນຊີປິດບັງ) ສຳລັບ notification. */
function summarize(kind: string, payload: Record<string, unknown>, before: Payee | null, bankCode: string): string {
  if (kind === 'CREATE') return `ເພີ່ມບັນຊີ ${bankCode} ${tail(payload.accountNumber as string)}`;
  if (kind === 'QR') return `ປ່ຽນຮູບ QR ຂອງ ${bankCode} ${tail(before?.accountNumber)}`;
  const parts: string[] = [];
  if (payload.accountNumber !== undefined) parts.push(`ເລກບັນຊີ ${tail(before?.accountNumber)} → ${tail(payload.accountNumber as string)}`);
  if (payload.accountName !== undefined) parts.push(`ຊື່ບັນຊີ → ${payload.accountName as string}`);
  if (payload.currency !== undefined) parts.push(`ສະກຸນເງິນ → ${payload.currency as string}`);
  return `ແກ້ ${bankCode}: ${parts.join(', ')}`;
}

async function recipients(branchId: string, exceptIds: string[], opts: { supersOnly?: boolean } = {}) {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      id: { notIn: exceptIds },
      OR: opts.supersOnly ? [{ role: 'SUPER_ADMIN' }] : [{ role: 'SUPER_ADMIN' }, { role: 'BRANCH_ADMIN', branchId }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

async function notifyMany(
  userIds: string[],
  n: { type: string; title: string; body: string; changeId: string; bankAccountId: string | null },
): Promise<void> {
  await Promise.all(
    userIds.map((userId) =>
      notifyUser({
        userId,
        type: n.type,
        title: n.title,
        body: n.body,
        severity: 'warning',
        data: { changeId: n.changeId, bankAccountId: n.bankAccountId, url: '/payments/banks' },
        dedupeKey: `${n.type}:${n.changeId}:${userId}`,
      }).catch(() => undefined),
    ),
  );
}

function toView(r: ChangeRow): BankAccountChangeView {
  const payload = r.payload as Record<string, unknown>;
  const before = (r.before ?? null) as Payee | null;
  const bankCode = r.kind === 'CREATE' ? String(payload.bankCode ?? '') : (r.bankAccount?.bank.code ?? '');
  const changes: BankAccountChangeView['changes'] = [];
  if (r.kind === 'CREATE') {
    changes.push({ field: 'bank', before: null, after: bankCode });
    changes.push({ field: 'branch', before: null, after: r.branch.name });
    for (const f of PAYEE_FIELDS) changes.push({ field: f, before: null, after: String(payload[f] ?? '') });
    if (payload.isDefault) changes.push({ field: 'isDefault', before: null, after: 'true' });
  } else if (r.kind === 'UPDATE') {
    for (const f of PAYEE_FIELDS) {
      if (payload[f] !== undefined) changes.push({ field: f as BankChangeField, before: before?.[f] ?? null, after: String(payload[f]) });
    }
  } else {
    changes.push({ field: 'qrImage', before: before?.qrImageKey ? 'set' : null, after: 'set' });
  }
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    branchId: r.branchId,
    branchName: r.branch.name,
    bankAccountId: r.bankAccountId,
    bankCode,
    accountName: String(payload.accountName ?? r.bankAccount?.accountName ?? before?.accountName ?? ''),
    changes,
    qrBeforeUrl: r.kind === 'QR' && before?.qrImageKey ? storage.url(before.qrImageKey) : null,
    qrAfterUrl: r.kind === 'QR' ? storage.url((payload as QrPayload).qrImageKey) : null,
    requestedById: r.requestedById,
    requestedByName: r.requestedBy.name,
    reviewedByName: r.reviewedBy?.name ?? null,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewNote: r.reviewNote,
    createdAt: r.createdAt.toISOString(),
  };
}

async function loadView(id: string): Promise<BankAccountChangeView> {
  return toView(await prisma.bankAccountChangeRequest.findUniqueOrThrow({ where: { id }, include: CHANGE_INCLUDE }));
}

// ── apply (shared by owner-direct and approval) ─────────────────────

async function applyCreate(tx: Prisma.TransactionClient, p: CreatePayload) {
  const existingCount = await tx.bankAccount.count({ where: { branchId: p.branchId } });
  const isDefault = p.isDefault || existingCount === 0;
  if (isDefault) {
    await tx.bankAccount.updateMany({ where: { branchId: p.branchId, isDefault: true }, data: { isDefault: false } });
  }
  return tx.bankAccount.create({
    data: {
      bankId: p.bankId,
      branchId: p.branchId,
      accountName: p.accountName,
      accountNumber: p.accountNumber,
      currency: p.currency,
      qrImageKey: p.qrImageKey,
      isDefault,
    },
    select: { id: true },
  });
}

/** ປ່ຽນຂໍ້ມູນຜູ້ຮັບເງິນ; ຖ້າບັນຊີຖືກແກ້ຕັ້ງແຕ່ຍື່ນຄຳຂໍ (before ບໍ່ກົງ) → 409 ບໍ່ໃຫ້ອະນຸມັດຄຳຂໍທີ່ລ້າສະໄໝ. */
async function applyPayee(
  tx: Prisma.TransactionClient,
  accountId: string,
  before: Payee | null,
  data: UpdatePayload | QrPayload,
): Promise<string | null> {
  const current = await tx.bankAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { accountName: true, accountNumber: true, currency: true, qrImageKey: true },
  });
  if (before && JSON.stringify(payeeOf(current)) !== JSON.stringify(payeeOf(before))) {
    throw ApiError.conflict('ບັນຊີຖືກແກ້ໄຂຫຼັງຈາກຍື່ນຄຳຂໍນີ້ — ກະລຸນາປະຕິເສດ ແລະ ຍື່ນໃໝ່');
  }
  await tx.bankAccount.update({ where: { id: accountId }, data });
  return current.qrImageKey;
}

// ── entry points used by the bank-account routes ─────────────────────

export type MutationResult =
  | { applied: true; account: ReturnType<typeof withQrUrl> }
  | { applied: false; change: BankAccountChangeView };

async function loadAccount(id: string) {
  const a = await prisma.bankAccount.findUnique({ where: { id }, select: BANK_ACCOUNT_SELECT });
  if (!a) throw ApiError.notFound('ບໍ່ພົບບັນຊີທະນາຄານ');
  return a;
}

async function actorName(userId: string): Promise<string> {
  return (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? '—';
}

export async function createBankAccount(auth: AccessTokenPayload, input: CreateBankAccountInput): Promise<MutationResult> {
  scopeBranchId(auth, input.branchId);
  const bank = await prisma.bank.findUnique({ where: { id: input.bankId } });
  if (!bank) throw ApiError.notFound('ບໍ່ພົບທະນາຄານ');
  await confirmPassword(auth.sub, input.currentPassword);
  const { currentPassword: _pw, ...rest } = input;
  const payload: CreatePayload = { ...rest, bankCode: bank.code };
  const who = await actorName(auth.sub);

  if (!isOwner(auth)) {
    const change = await prisma.bankAccountChangeRequest.create({
      data: { kind: 'CREATE', branchId: input.branchId, payload: payload as never, requestedById: auth.sub },
    });
    await prisma.auditLog.create({
      data: { branchId: input.branchId, userId: auth.sub, action: 'CREATE', entityName: 'BankAccountChangeRequest', entityId: change.id, newValue: payload as never },
    });
    await notifyMany(await recipients(input.branchId, [auth.sub], { supersOnly: true }), {
      type: 'BANK_ACCOUNT_CHANGE_REQUEST',
      title: 'ມີຄຳຂໍເພີ່ມບັນຊີຮັບເງິນ ລໍອະນຸມັດ',
      body: `${who} ຂໍ${summarize('CREATE', payload, null, bank.code)}`,
      changeId: change.id,
      bankAccountId: null,
    });
    return { applied: false, change: await loadView(change.id) };
  }

  const { account, change } = await prisma.$transaction(async (tx) => {
    const account = await applyCreate(tx, payload);
    const change = await tx.bankAccountChangeRequest.create({
      data: {
        kind: 'CREATE',
        status: 'APPROVED',
        branchId: input.branchId,
        bankAccountId: account.id,
        payload: payload as never,
        requestedById: auth.sub,
        reviewedById: auth.sub,
        reviewedAt: new Date(),
      },
    });
    return { account, change };
  });
  await prisma.auditLog.create({
    data: { branchId: input.branchId, userId: auth.sub, action: 'CREATE', entityName: 'BankAccount', entityId: account.id, newValue: payload as never },
  });
  await notifyMany(await recipients(input.branchId, [auth.sub]), {
    type: 'BANK_ACCOUNT_CHANGED',
    title: 'ມີການເພີ່ມບັນຊີຮັບເງິນ',
    body: `${who} ${summarize('CREATE', payload, null, bank.code)}`,
    changeId: change.id,
    bankAccountId: account.id,
  });
  return { applied: true, account: withQrUrl(await loadAccount(account.id)) };
}

export async function updateBankAccount(
  auth: AccessTokenPayload,
  id: string,
  input: UpdateBankAccountInput,
): Promise<MutationResult> {
  const existing = await loadAccount(id);
  scopeBranchId(auth, existing.branchId);
  if (input.qrImageKey) throw ApiError.badRequest('ປ່ຽນຮູບ QR ຜ່ານການອັບໂຫຼດເທົ່ານັ້ນ');

  // field ຜູ້ຮັບເງິນທີ່ປ່ຽນແທ້ (ສົ່ງຄ່າເດີມມາ = ບໍ່ນັບ)
  const payee: UpdatePayload = {};
  for (const f of PAYEE_FIELDS) {
    if (input[f] !== undefined && input[f] !== existing[f]) payee[f] = input[f];
  }
  const sensitive = Object.keys(payee).length > 0;
  if (sensitive) await confirmPassword(auth.sub, input.currentPassword);
  if (sensitive && !isOwner(auth)) {
    const pending = await prisma.bankAccountChangeRequest.findFirst({ where: { bankAccountId: id, status: 'PENDING' } });
    if (pending) throw ApiError.conflict('ບັນຊີນີ້ມີຄຳຂໍທີ່ລໍອະນຸມັດຢູ່ແລ້ວ — ລໍຖ້າ ຫຼື ຍົກເລີກຄຳຂໍເກົ່າກ່ອນ');
  }

  // ສ່ວນທີ່ບໍ່ອ່ອນໄຫວ (default / active / ລຶບ QR) ນຳໃຊ້ທັນທີສຳລັບທຸກບົດບາດ
  const plain: Prisma.BankAccountUpdateInput = {
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
    ...(input.qrImageKey === null ? { qrImageKey: null } : {}),
  };
  const directPayee = sensitive && isOwner(auth);
  const change = await prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.bankAccount.updateMany({
        where: { branchId: existing.branchId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    if (Object.keys(plain).length) await tx.bankAccount.update({ where: { id }, data: plain });
    if (!sensitive) return null;
    if (directPayee) await applyPayee(tx, id, null, payee);
    return tx.bankAccountChangeRequest.create({
      data: {
        kind: 'UPDATE',
        status: directPayee ? 'APPROVED' : 'PENDING',
        branchId: existing.branchId,
        bankAccountId: id,
        payload: payee as never,
        before: payeeOf(existing) as never,
        requestedById: auth.sub,
        ...(directPayee ? { reviewedById: auth.sub, reviewedAt: new Date() } : {}),
      },
    });
  });
  if (input.qrImageKey === null && existing.qrImageKey) await storage.delete(existing.qrImageKey).catch(() => undefined);

  const after = await loadAccount(id);
  await prisma.auditLog.create({
    data: {
      branchId: existing.branchId,
      userId: auth.sub,
      action: 'UPDATE',
      entityName: 'BankAccount',
      entityId: id,
      oldValue: payeeOf(existing) as never,
      newValue: { ...payeeOf(after), isActive: after.isActive, isDefault: after.isDefault, pendingChangeId: change && !directPayee ? change.id : null } as never,
    },
  });

  if (change) {
    const who = await actorName(auth.sub);
    const text = summarize('UPDATE', payee, payeeOf(existing), existing.bank.code);
    await notifyMany(await recipients(existing.branchId, [auth.sub], { supersOnly: !directPayee }), {
      type: directPayee ? 'BANK_ACCOUNT_CHANGED' : 'BANK_ACCOUNT_CHANGE_REQUEST',
      title: directPayee ? 'ຂໍ້ມູນບັນຊີຮັບເງິນຖືກປ່ຽນ' : 'ມີຄຳຂໍປ່ຽນບັນຊີຮັບເງິນ ລໍອະນຸມັດ',
      body: `${who} ${directPayee ? '' : 'ຂໍ'}${text}`,
      changeId: change.id,
      bankAccountId: id,
    });
    if (!directPayee) return { applied: false, change: await loadView(change.id) };
  }
  return { applied: true, account: withQrUrl(after) };
}

export async function uploadBankAccountQr(
  auth: AccessTokenPayload,
  id: string,
  input: UploadBankAccountQrInput,
): Promise<MutationResult> {
  const existing = await loadAccount(id);
  scopeBranchId(auth, existing.branchId);
  await confirmPassword(auth.sub, input.currentPassword);
  if (!isOwner(auth)) {
    const pending = await prisma.bankAccountChangeRequest.findFirst({ where: { bankAccountId: id, status: 'PENDING' } });
    if (pending) throw ApiError.conflict('ບັນຊີນີ້ມີຄຳຂໍທີ່ລໍອະນຸມັດຢູ່ແລ້ວ — ລໍຖ້າ ຫຼື ຍົກເລີກຄຳຂໍເກົ່າກ່ອນ');
  }

  const original = Buffer.from(input.dataBase64, 'base64');
  if (original.byteLength === 0) throw ApiError.badRequest('ຮູບບໍ່ຖືກຕ້ອງ');
  if (original.byteLength > 4 * 1024 * 1024) throw ApiError.badRequest('ຮູບ QR ໃຫຍ່ເກີນ 4MB');
  const image = await normalizeForStorage(original);
  if (!image) throw ApiError.badRequest('ໄຟລ໌ນີ້ບໍ່ແມ່ນຮູບ JPEG/PNG/WebP ທີ່ອ່ານໄດ້');
  const key = `bank-qr/${id}/${isOwner(auth) ? '' : 'pending-'}${randomUUID()}.jpg`;
  await storage.save(key, image, 'image/jpeg');

  const direct = isOwner(auth);
  const change = await prisma.$transaction(async (tx) => {
    if (direct) await applyPayee(tx, id, null, { qrImageKey: key });
    return tx.bankAccountChangeRequest.create({
      data: {
        kind: 'QR',
        status: direct ? 'APPROVED' : 'PENDING',
        branchId: existing.branchId,
        bankAccountId: id,
        payload: { qrImageKey: key } as never,
        before: payeeOf(existing) as never,
        requestedById: auth.sub,
        ...(direct ? { reviewedById: auth.sub, reviewedAt: new Date() } : {}),
      },
    });
  });
  // ຮູບເກົ່າຍັງຕ້ອງໃຊ້ສະແດງ diff ໃນປະຫວັດ → ບໍ່ລຶບຖ້າຍັງລໍອະນຸມັດ; ເມື່ອນຳໃຊ້ແລ້ວ ຮູບເກົ່າບໍ່ຖືກອ້າງອີງອີກ
  if (direct && existing.qrImageKey) await storage.delete(existing.qrImageKey).catch(() => undefined);

  await prisma.auditLog.create({
    data: {
      branchId: existing.branchId,
      userId: auth.sub,
      action: 'UPDATE',
      entityName: 'BankAccount',
      entityId: id,
      oldValue: { qrImageKey: existing.qrImageKey } as never,
      newValue: { qrImageKey: direct ? key : existing.qrImageKey, pendingChangeId: direct ? null : change.id } as never,
    },
  });
  const who = await actorName(auth.sub);
  await notifyMany(await recipients(existing.branchId, [auth.sub], { supersOnly: !direct }), {
    type: direct ? 'BANK_ACCOUNT_CHANGED' : 'BANK_ACCOUNT_CHANGE_REQUEST',
    title: direct ? 'ຮູບ QR ຂອງບັນຊີຮັບເງິນຖືກປ່ຽນ' : 'ມີຄຳຂໍປ່ຽນ QR ບັນຊີຮັບເງິນ ລໍອະນຸມັດ',
    body: `${who} ${direct ? '' : 'ຂໍ'}${summarize('QR', {}, payeeOf(existing), existing.bank.code)}`,
    changeId: change.id,
    bankAccountId: id,
  });
  if (!direct) return { applied: false, change: await loadView(change.id) };
  return { applied: true, account: withQrUrl(await loadAccount(id)) };
}

// ── review queue ─────────────────────────────────────────────────────

export async function listChanges(auth: AccessTokenPayload, query: BankChangeListQuery): Promise<BankAccountChangeView[]> {
  const branchId = scopeBranchId(auth, query.branchId);
  const rows = await prisma.bankAccountChangeRequest.findMany({
    where: { ...(branchId ? { branchId } : {}), ...(query.status ? { status: query.status } : {}) },
    include: CHANGE_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map(toView);
}

async function loadPending(id: string) {
  const r = await prisma.bankAccountChangeRequest.findUnique({ where: { id }, include: CHANGE_INCLUDE });
  if (!r) throw ApiError.notFound('ບໍ່ພົບຄຳຂໍ');
  if (r.status !== 'PENDING') throw ApiError.conflict('ຄຳຂໍນີ້ຖືກດຳເນີນການແລ້ວ');
  return r;
}

export async function approveChange(
  auth: AccessTokenPayload,
  id: string,
  input: ApproveBankChangeInput,
): Promise<BankAccountChangeView> {
  if (!isOwner(auth)) throw ApiError.forbidden('ສະເພາະເຈົ້າຂອງ (Super admin) ເທົ່ານັ້ນທີ່ອະນຸມັດໄດ້');
  const r = await loadPending(id);
  if (r.requestedById === auth.sub) throw ApiError.forbidden('ອະນຸມັດຄຳຂໍຂອງຕົນເອງບໍ່ໄດ້');
  await confirmPassword(auth.sub, input.currentPassword);
  const payload = r.payload as Record<string, unknown>;
  const before = (r.before ?? null) as Payee | null;

  const { accountId, oldQr } = await prisma.$transaction(async (tx) => {
    const claim = await tx.bankAccountChangeRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', reviewedById: auth.sub, reviewedAt: new Date(), reviewNote: input.note ?? null },
    });
    if (claim.count === 0) throw ApiError.conflict('ຄຳຂໍນີ້ຖືກດຳເນີນການແລ້ວ');
    if (r.kind === 'CREATE') {
      const created = await applyCreate(tx, payload as CreatePayload);
      await tx.bankAccountChangeRequest.update({ where: { id }, data: { bankAccountId: created.id } });
      return { accountId: created.id, oldQr: null };
    }
    const data = r.kind === 'QR' ? { qrImageKey: (payload as QrPayload).qrImageKey } : (payload as UpdatePayload);
    const oldQr = await applyPayee(tx, r.bankAccountId!, before, data);
    return { accountId: r.bankAccountId!, oldQr: r.kind === 'QR' ? oldQr : null };
  });
  if (oldQr) await storage.delete(oldQr).catch(() => undefined);

  await prisma.auditLog.create({
    data: {
      branchId: r.branchId,
      userId: auth.sub,
      action: 'UPDATE',
      entityName: 'BankAccountChangeRequest',
      entityId: id,
      oldValue: { status: 'PENDING', before } as never,
      newValue: { status: 'APPROVED', bankAccountId: accountId, payload } as never,
    },
  });
  const bankCode = r.kind === 'CREATE' ? String(payload.bankCode) : (r.bankAccount?.bank.code ?? '');
  const who = await actorName(auth.sub);
  await notifyMany(await recipients(r.branchId, [auth.sub]), {
    type: 'BANK_ACCOUNT_CHANGE_APPROVED',
    title: 'ອະນຸມັດການປ່ຽນບັນຊີຮັບເງິນແລ້ວ',
    body: `${who} ອະນຸມັດ: ${summarize(r.kind, payload, before, bankCode)} (ຂໍໂດຍ ${r.requestedBy.name})`,
    changeId: id,
    bankAccountId: accountId,
  });
  return loadView(id);
}

async function closeChange(
  auth: AccessTokenPayload,
  id: string,
  status: 'REJECTED' | 'CANCELLED',
  note: string | null,
): Promise<BankAccountChangeView> {
  const r = await loadPending(id);
  const claim = await prisma.bankAccountChangeRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status, reviewedById: auth.sub, reviewedAt: new Date(), reviewNote: note },
  });
  if (claim.count === 0) throw ApiError.conflict('ຄຳຂໍນີ້ຖືກດຳເນີນການແລ້ວ');
  // ຮູບ QR ທີ່ອັບໂຫຼດລໍໄວ້ບໍ່ຖືກໃຊ້ອີກ
  if (r.kind === 'QR') await storage.delete((r.payload as QrPayload).qrImageKey).catch(() => undefined);
  await prisma.auditLog.create({
    data: {
      branchId: r.branchId,
      userId: auth.sub,
      action: 'UPDATE',
      entityName: 'BankAccountChangeRequest',
      entityId: id,
      oldValue: { status: 'PENDING' } as never,
      newValue: { status, note } as never,
    },
  });
  if (status === 'REJECTED') {
    await notifyMany([r.requestedById], {
      type: 'BANK_ACCOUNT_CHANGE_REJECTED',
      title: 'ຄຳຂໍປ່ຽນບັນຊີຮັບເງິນຖືກປະຕິເສດ',
      body: note ?? '',
      changeId: id,
      bankAccountId: r.bankAccountId,
    });
  }
  return loadView(id);
}

export async function rejectChange(auth: AccessTokenPayload, id: string, input: RejectBankChangeInput) {
  if (!isOwner(auth)) throw ApiError.forbidden('ສະເພາະເຈົ້າຂອງ (Super admin) ເທົ່ານັ້ນທີ່ປະຕິເສດໄດ້');
  return closeChange(auth, id, 'REJECTED', input.note);
}

/** ຜູ້ຍື່ນຍົກເລີກຄຳຂໍຂອງຕົນເອງ (SUPER_ADMIN ໃຊ້ reject ແທນ). */
export async function cancelChange(auth: AccessTokenPayload, id: string) {
  const r = await loadPending(id);
  if (r.requestedById !== auth.sub) throw ApiError.forbidden('ຍົກເລີກໄດ້ສະເພາະຄຳຂໍຂອງຕົນເອງ');
  return closeChange(auth, id, 'CANCELLED', null);
}
