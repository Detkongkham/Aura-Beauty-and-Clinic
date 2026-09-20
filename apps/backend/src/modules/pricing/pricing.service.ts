import type {
  CreatePricingRuleInput,
  PriceQuoteQuery,
  PriceQuoteView,
  PricingRuleListQuery,
  PricingRuleView,
  PromotionListQuery,
  PromotionView,
  UpdatePricingRuleInput,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { PRICE_ROUNDING_LAK } from '../../constants/phase7.js';
import {
  minutesOfDayVientiane,
  timeStringToMinutes,
  vientianeDateKey,
  vientianeDayOfWeek,
  vientianeDayStart,
} from '../../utils/dateHelpers.js';
import { ApiError } from '../../utils/ApiError.js';

type Db = Prisma.TransactionClient | typeof prisma;

const RULE_INCLUDE = {
  branch: { select: { name: true } },
  service: { select: { name: true } },
} satisfies Prisma.DynamicPricingRuleInclude;

type RuleRow = Prisma.DynamicPricingRuleGetPayload<{ include: typeof RULE_INCLUDE }>;

function toView(r: RuleRow): PricingRuleView {
  return {
    id: r.id,
    branchId: r.branchId,
    branchName: r.branch.name,
    serviceId: r.serviceId,
    serviceName: r.service?.name ?? null,
    ruleName: r.ruleName,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
    discountPercent: r.discountPercent,
    priceMultiplier: r.priceMultiplier,
    isActive: r.isActive,
  };
}

function roundLak(value: number): number {
  return Math.max(0, Math.round(value / PRICE_ROUNDING_LAK) * PRICE_ROUNDING_LAK);
}

/** ລາຄາຫຼັງນຳໃຊ້ rule ໜຶ່ງ (ຍັງບໍ່ທັນປັດ). */
function applyRule(basePrice: number, rule: { discountPercent: number; priceMultiplier: number }): number {
  return basePrice * (1 - rule.discountPercent / 100) * rule.priceMultiplier;
}

// ---- engine: ໃຊ້ໂດຍ booking / quote ---------------------------------

/**
 * ຫາລາຄາຈິງຂອງບໍລິການຢູ່ສາຂາໃດໜຶ່ງ ໃນເວລາໃດໜຶ່ງ.
 * dayOfWeek / HH:MM ຂອງ rule = ເວລາທ້ອງຖິ່ນວຽງຈັນ (ຄືກັນກັບ WorkingHour / slotEngine).
 * ຖ້າມີຫຼາຍ rule ກົງຊ່ວງ → ເລືອກອັນທີ່ໃຫ້ລາຄາຖືກສຸດ (rule ສະເພາະບໍລິການຊະນະສະເໝີ).
 */
export async function resolvePrice(
  db: Db,
  params: { branchId: string; serviceId: string; basePrice: number; at?: Date },
): Promise<{
  finalPrice: number;
  savings: number;
  discountPercent: number;
  appliedRule: { id: string; ruleName: string } | null;
}> {
  const at = params.at ?? new Date();
  const nowMin = minutesOfDayVientiane(at);
  const rules = await db.dynamicPricingRule.findMany({
    where: {
      branchId: params.branchId,
      isActive: true,
      dayOfWeek: vientianeDayOfWeek(at),
      OR: [{ serviceId: params.serviceId }, { serviceId: null }],
    },
    select: {
      id: true,
      ruleName: true,
      serviceId: true,
      startTime: true,
      endTime: true,
      discountPercent: true,
      priceMultiplier: true,
    },
  });

  const inWindow = rules.filter(
    (r) => nowMin >= timeStringToMinutes(r.startTime) && nowMin < timeStringToMinutes(r.endTime),
  );
  if (inWindow.length === 0) {
    return { finalPrice: roundLak(params.basePrice), savings: 0, discountPercent: 0, appliedRule: null };
  }

  const best = inWindow
    .map((r) => ({ rule: r, price: applyRule(params.basePrice, r) }))
    .sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      // ລາຄາເທົ່າກັນ → rule ຜູກບໍລິການໂດຍກົງມາກ່ອນ
      return (a.rule.serviceId ? 0 : 1) - (b.rule.serviceId ? 0 : 1);
    })[0]!;

  const finalPrice = roundLak(best.price);
  return {
    finalPrice,
    savings: Math.max(0, roundLak(params.basePrice) - finalPrice),
    discountPercent: best.rule.discountPercent,
    appliedRule: { id: best.rule.id, ruleName: best.rule.ruleName },
  };
}

export async function quote(query: PriceQuoteQuery): Promise<PriceQuoteView> {
  const service = await prisma.service.findFirst({
    where: { id: query.serviceId, deletedAt: null },
    select: { price: true, branchId: true },
  });
  if (!service) throw ApiError.notFound('ບໍ່ພົບບໍລິການ');

  const basePrice = service.price.toNumber();
  const r = await resolvePrice(prisma, {
    branchId: query.branchId,
    serviceId: query.serviceId,
    basePrice,
    at: query.at,
  });
  return {
    serviceId: query.serviceId,
    branchId: query.branchId,
    basePrice: roundLak(basePrice),
    finalPrice: r.finalPrice,
    savings: r.savings,
    discountPercent: r.discountPercent,
    currency: 'LAK',
    appliedRule: r.appliedRule,
  };
}

// ---- customer promotions (Home) -----------------------------------

const DAY_MS = 86_400_000;

/** Instant ຂອງ HH:MM ວຽງຈັນ ໃນວັນທີປະຕິທິນ `dateKey`. */
function atLocalTime(dateKey: Date, hhmm: string): Date {
  return new Date(vientianeDayStart(dateKey).getTime() + timeStringToMinutes(hhmm) * 60_000);
}

/**
 * ໂປຣໂມຊັນທີ່ມີຜົນແທ້ຕອນຈ່າຍ — ບໍ່ສ້າງຂໍ້ມູນໃໝ່:
 *   HAPPY_HOUR = DynamicPricingRule ທີ່ net multiplier < 1 (ລວມ rule ດຽວກັນຫຼາຍວັນເປັນອັນດຽວ),
 *   SALE       = Service.compareAtPrice > price.
 * liveNow/nextStartAt/endsAt ຄິດຕາມເວລາວຽງຈັນ ດ້ວຍ helper ດຽວກັນກັບ resolvePrice().
 */
export async function listPromotions(query: PromotionListQuery, now = new Date()): Promise<PromotionView[]> {
  const [rules, sales] = await Promise.all([
    prisma.dynamicPricingRule.findMany({
      where: {
        branchId: query.branchId,
        isActive: true,
        OR: [{ serviceId: null }, { service: { isActive: true, deletedAt: null } }],
      },
      include: { service: { select: { name: true, imageUrl: true, price: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    }),
    prisma.service.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        compareAtPrice: { not: null },
        OR: [{ branchId: query.branchId }, { branchId: null }],
      },
      select: { id: true, name: true, imageUrl: true, price: true, compareAtPrice: true },
    }),
  ]);

  const today = vientianeDateKey(now);
  const nowDow = today.getUTCDay();
  const nowMin = minutesOfDayVientiane(now);

  type Group = { rules: typeof rules; days: Set<number> };
  const groups = new Map<string, Group>();
  for (const r of rules) {
    const net = (1 - r.discountPercent / 100) * r.priceMultiplier;
    if (Math.round((1 - net) * 100) <= 0) continue; // surge / ບໍ່ຫຼຸດ
    const key = [r.serviceId ?? '*', r.ruleName, r.startTime, r.endTime, r.discountPercent, r.priceMultiplier].join('|');
    const g = groups.get(key) ?? { rules: [], days: new Set<number>() };
    g.rules.push(r);
    g.days.add(r.dayOfWeek);
    groups.set(key, g);
  }

  const happy: PromotionView[] = [...groups.values()].map(({ rules: rs, days }) => {
    const r = rs[0]!;
    const net = (1 - r.discountPercent / 100) * r.priceMultiplier;
    const startMin = timeStringToMinutes(r.startTime);
    const endMin = timeStringToMinutes(r.endTime);
    const liveNow = days.has(nowDow) && nowMin >= startMin && nowMin < endMin;

    let nextStartAt: string | null = null;
    if (!liveNow) {
      for (let k = 0; k <= 7; k += 1) {
        const day = new Date(today.getTime() + k * DAY_MS);
        if (!days.has(day.getUTCDay()) || (k === 0 && nowMin >= startMin)) continue;
        nextStartAt = atLocalTime(day, r.startTime).toISOString();
        break;
      }
    }
    const base = r.service ? r.service.price.toNumber() : null;
    return {
      id: `rule:${rs.map((x) => x.id).sort().join(',')}`,
      kind: 'HAPPY_HOUR',
      title: r.ruleName,
      discountPercent: Math.round((1 - net) * 100),
      serviceId: r.serviceId,
      serviceName: r.service?.name ?? null,
      serviceImageUrl: r.service?.imageUrl ?? null,
      price: base == null ? null : roundLak(base * net),
      compareAtPrice: base == null ? null : roundLak(base),
      daysOfWeek: [...days].sort((a, b) => a - b),
      startTime: r.startTime,
      endTime: r.endTime,
      liveNow,
      nextStartAt,
      endsAt: liveNow ? atLocalTime(today, r.endTime).toISOString() : null,
    };
  });

  const sale: PromotionView[] = sales
    .map((s) => ({ s, price: s.price.toNumber(), compare: s.compareAtPrice!.toNumber() }))
    .filter((x) => x.compare > x.price)
    .map(({ s, price, compare }) => ({
      id: `sale:${s.id}`,
      kind: 'SALE' as const,
      title: s.name,
      discountPercent: Math.round((1 - price / compare) * 100),
      serviceId: s.id,
      serviceName: s.name,
      serviceImageUrl: s.imageUrl,
      price,
      compareAtPrice: compare,
      daysOfWeek: [],
      startTime: null,
      endTime: null,
      liveNow: true,
      nextStartAt: null,
      endsAt: null,
    }));

  // ກຳລັງມີຜົນກ່ອນ → happy hour (ທັງຮ້ານ) ກ່ອນ sale → % ຫຼຸດຫຼາຍກ່ອນ → ເລີ່ມໄວກ່ອນ.
  return [...happy, ...sale]
    .sort(
      (a, b) =>
        Number(b.liveNow) - Number(a.liveNow) ||
        Number(b.kind === 'HAPPY_HOUR') - Number(a.kind === 'HAPPY_HOUR') ||
        b.discountPercent - a.discountPercent ||
        (a.nextStartAt ?? '').localeCompare(b.nextStartAt ?? ''),
    )
    .slice(0, query.limit);
}

// ---- admin CRUD ----------------------------------------------------

export async function listRules(query: PricingRuleListQuery): Promise<PricingRuleView[]> {
  const rows = await prisma.dynamicPricingRule.findMany({
    where: {
      ...(query.branchId !== 'all' ? { branchId: query.branchId } : {}),
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    },
    include: RULE_INCLUDE,
    orderBy: [{ branchId: 'asc' }, { dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
  return rows.map(toView);
}

async function assertRefs(branchId: string, serviceId: string | null | undefined): Promise<void> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) throw ApiError.badRequest('ບໍ່ພົບສາຂາ');
  if (serviceId) {
    const svc = await prisma.service.findFirst({
      where: { id: serviceId, branchId, deletedAt: null },
      select: { id: true },
    });
    if (!svc) throw ApiError.badRequest('ບໍລິການບໍ່ຢູ່ໃນສາຂານີ້');
  }
}

export async function createRule(input: CreatePricingRuleInput): Promise<PricingRuleView> {
  await assertRefs(input.branchId, input.serviceId);
  const row = await prisma.dynamicPricingRule.create({
    data: {
      branchId: input.branchId,
      serviceId: input.serviceId ?? null,
      ruleName: input.ruleName,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      discountPercent: input.discountPercent,
      priceMultiplier: input.priceMultiplier,
      isActive: input.isActive,
    },
    include: RULE_INCLUDE,
  });
  return toView(row);
}

export async function updateRule(id: string, input: UpdatePricingRuleInput): Promise<PricingRuleView> {
  const existing = await prisma.dynamicPricingRule.findUnique({
    where: { id },
    select: { branchId: true },
  });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບກົດລາຄາ');
  if (input.serviceId !== undefined) await assertRefs(existing.branchId, input.serviceId);

  const row = await prisma.dynamicPricingRule.update({
    where: { id },
    data: {
      ...(input.serviceId !== undefined ? { serviceId: input.serviceId } : {}),
      ...(input.ruleName !== undefined ? { ruleName: input.ruleName } : {}),
      ...(input.dayOfWeek !== undefined ? { dayOfWeek: input.dayOfWeek } : {}),
      ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
      ...(input.discountPercent !== undefined ? { discountPercent: input.discountPercent } : {}),
      ...(input.priceMultiplier !== undefined ? { priceMultiplier: input.priceMultiplier } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: RULE_INCLUDE,
  });
  return toView(row);
}

export async function deleteRule(id: string): Promise<{ id: string }> {
  const existing = await prisma.dynamicPricingRule.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບກົດລາຄາ');
  await prisma.dynamicPricingRule.delete({ where: { id } });
  return { id };
}
