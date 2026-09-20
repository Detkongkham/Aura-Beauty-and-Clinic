import type {
  CustomerCreateInput,
  CustomerDetailView,
  CustomerListQuery,
  CustomerUpdateInput,
  CustomerView,
  Gender,
  Paginated,
} from '@abcp/shared-types';
import type { LoyaltyTier, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  ADMIN_APPOINTMENT_INCLUDE,
  toAdminListItem,
} from '../appointments/appointments.mapper.js';

type CustomerRow = Prisma.UserGetPayload<{
  include: { loyaltyAccount: { select: { points: true; tierLevel: true } } };
}>;

/** COMPLETED-appointment aggregates keyed by customerId. */
type VisitAgg = { totalVisits: number; totalSpent: number; lastVisitAt: string | null };

async function visitAggregates(customerIds: string[]): Promise<Map<string, VisitAgg>> {
  const out = new Map<string, VisitAgg>();
  if (customerIds.length === 0) return out;
  const rows = await prisma.appointment.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customerIds }, status: 'COMPLETED', deletedAt: null },
    _count: { _all: true },
    _sum: { totalAmount: true },
    _max: { startAt: true },
  });
  for (const r of rows) {
    out.set(r.customerId, {
      totalVisits: r._count._all,
      totalSpent: r._sum.totalAmount?.toNumber() ?? 0,
      lastVisitAt: r._max.startAt?.toISOString() ?? null,
    });
  }
  return out;
}

function toCustomerView(u: CustomerRow, agg?: VisitAgg): CustomerView {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    gender: (u.gender as Gender | null) ?? null,
    birthDate: u.dateOfBirth ? u.dateOfBirth.toISOString().slice(0, 10) : null,
    loyaltyPoints: u.loyaltyAccount?.points ?? 0,
    loyaltyTier: (u.loyaltyAccount?.tierLevel as LoyaltyTier | undefined) ?? null,
    totalVisits: agg?.totalVisits ?? 0,
    totalSpent: agg?.totalSpent ?? 0,
    lastVisitAt: agg?.lastVisitAt ?? null,
    notes: u.notes,
    createdAt: u.createdAt.toISOString(),
  };
}

const INCLUDE = { loyaltyAccount: { select: { points: true, tierLevel: true } } } as const;

/** GET /customers — ລາຍຊື່ລູກຄ້າ + KPI ການເຂົ້າໃຊ້ບໍລິການ. */
export async function listCustomers(
  query: CustomerListQuery,
): Promise<Paginated<CustomerView>> {
  const where: Prisma.UserWhereInput = {
    role: 'CUSTOMER',
    deletedAt: null,
    ...(query.q
      ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { phone: { contains: query.q } }] }
      : {}),
    ...(query.tier ? { loyaltyAccount: { tierLevel: query.tier } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  const agg = await visitAggregates(rows.map((r) => r.id));
  return {
    items: rows.map((r) => toCustomerView(r, agg.get(r.id))),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

async function findCustomer(id: string): Promise<CustomerRow> {
  const row = await prisma.user.findFirst({
    where: { id, role: 'CUSTOMER', deletedAt: null },
    include: INCLUDE,
  });
  if (!row) throw ApiError.notFound('ບໍ່ພົບລູກຄ້າ');
  return row;
}

/** GET /customers/:id — ໂປຣຟາຍ + 20 ນັດໝາຍລ່າສຸດ. */
export async function getCustomerDetail(id: string): Promise<CustomerDetailView> {
  const row = await findCustomer(id);
  const [agg, history] = await Promise.all([
    visitAggregates([id]),
    prisma.appointment.findMany({
      where: { customerId: id, deletedAt: null },
      include: ADMIN_APPOINTMENT_INCLUDE,
      orderBy: { startAt: 'desc' },
      take: 20,
    }),
  ]);
  return { ...toCustomerView(row, agg.get(id)), history: history.map(toAdminListItem) };
}

function clean(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

export async function createCustomer(input: CustomerCreateInput): Promise<CustomerView> {
  const clash = await prisma.user.findFirst({ where: { phone: input.phone.trim() } });
  if (clash) throw ApiError.conflict('ເບີໂທນີ້ຖືກໃຊ້ແລ້ວ');
  const row = await prisma.user.create({
    data: {
      role: 'CUSTOMER',
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: clean(input.email) ?? null,
      gender: input.gender ?? null,
      dateOfBirth: input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : null,
      notes: clean(input.notes) ?? null,
    },
    include: INCLUDE,
  });
  return toCustomerView(row);
}

export async function updateCustomer(
  id: string,
  input: CustomerUpdateInput,
): Promise<CustomerView> {
  await findCustomer(id);
  if (input.phone !== undefined) {
    const clash = await prisma.user.findFirst({
      where: { phone: input.phone.trim(), NOT: { id } },
    });
    if (clash) throw ApiError.conflict('ເບີໂທນີ້ຖືກໃຊ້ແລ້ວ');
  }
  const row = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
      ...(input.email !== undefined ? { email: clean(input.email) } : {}),
      ...(input.gender !== undefined ? { gender: input.gender ?? null } : {}),
      ...(input.birthDate !== undefined
        ? { dateOfBirth: input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : null }
        : {}),
      ...(input.notes !== undefined ? { notes: clean(input.notes) } : {}),
    },
    include: INCLUDE,
  });
  const agg = await visitAggregates([id]);
  return toCustomerView(row, agg.get(id));
}
