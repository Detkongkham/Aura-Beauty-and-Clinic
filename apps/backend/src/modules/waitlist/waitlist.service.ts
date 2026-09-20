import type { JoinWaitlistInput, WaitlistEntryView } from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { startOfDayUTC, vientianeDateKey } from '../../utils/dateHelpers.js';

const ENTRY_SELECT = {
  id: true,
  branchId: true,
  serviceId: true,
  preferredDate: true,
  createdAt: true,
  branch: { select: { name: true } },
  service: { select: { name: true } },
} satisfies Prisma.WaitlistSelect;

type EntryRow = Prisma.WaitlistGetPayload<{ select: typeof ENTRY_SELECT }>;

function toView(e: EntryRow): WaitlistEntryView {
  return {
    id: e.id,
    branchId: e.branchId,
    branchName: e.branch.name,
    serviceId: e.serviceId,
    serviceName: e.service.name,
    preferredDate: e.preferredDate.toISOString().slice(0, 10),
    createdAt: e.createdAt.toISOString(),
  };
}

export async function joinWaitlist(
  customerId: string,
  input: JoinWaitlistInput,
): Promise<WaitlistEntryView> {
  const preferredDate = startOfDayUTC(new Date(input.preferredDate));
  if (preferredDate.getTime() < vientianeDateKey(new Date()).getTime()) {
    throw ApiError.badRequest('ວັນທີ່ຕ້ອງເປັນມື້ນີ້ ຫຼື ອະນາຄົດ');
  }

  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, deletedAt: null },
    select: { id: true },
  });
  if (!service) throw ApiError.notFound('ບໍ່ພົບບໍລິການ');

  const existing = await prisma.waitlist.findFirst({
    where: { customerId, branchId: input.branchId, serviceId: input.serviceId, preferredDate },
    select: ENTRY_SELECT,
  });
  if (existing) return toView(existing);

  const created = await prisma.waitlist.create({
    data: { customerId, branchId: input.branchId, serviceId: input.serviceId, preferredDate },
    select: ENTRY_SELECT,
  });
  return toView(created);
}

export async function myWaitlist(customerId: string): Promise<{ items: WaitlistEntryView[] }> {
  const rows = await prisma.waitlist.findMany({
    where: { customerId, preferredDate: { gte: vientianeDateKey(new Date()) } },
    orderBy: { preferredDate: 'asc' },
    select: ENTRY_SELECT,
  });
  return { items: rows.map(toView) };
}

export async function leaveWaitlist(customerId: string, id: string): Promise<{ id: string }> {
  const row = await prisma.waitlist.findFirst({ where: { id, customerId }, select: { id: true } });
  if (!row) throw ApiError.notFound('ບໍ່ພົບລາຍການ');
  await prisma.waitlist.delete({ where: { id } });
  return { id };
}
