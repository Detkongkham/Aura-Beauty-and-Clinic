import type { PricingRuleView } from '@abcp/shared-types';

import type { WeekStart } from '@/lib/format';

/** ນາທີໃນໜຶ່ງມື້ — ແກນຂອງ week grid. */
export const MINUTES_PER_DAY = 1440;

/** ປັດເສດລາຄາເປັນ 100 ກີບ — ຄືກັນກັບ `PRICE_ROUNDING_LAK` ຢູ່ backend. */
export const PRICE_ROUNDING_LAK = 100;

/** "HH:MM" → ນາທີນັບຈາກທ່ຽງຄືນ. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** ນາທີ → "HH:MM". */
export function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(total)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type TimeWindow = { startTime: string; endTime: string };

/** ຄວາມຍາວຂອງຊ່ວງເປັນນາທີ (0 ຖ້າເວລາບໍ່ຖືກລຳດັບ). */
export function windowMinutes(w: TimeWindow): number {
  return Math.max(0, toMinutes(w.endTime) - toMinutes(w.startTime));
}

export type EffectKind = 'discount' | 'surge' | 'flat';

export interface RuleEffect {
  /** ໂຕຄູນສຸດທ້າຍ = (1 − discount%) × multiplier. */
  multiplier: number;
  /** ເປີເຊັນສຸດທິ: ບວກ = ຖືກລົງ, ລົບ = ແພງຂຶ້ນ. */
  netPercent: number;
  kind: EffectKind;
}

/**
 * ຜົນລວມຂອງກົດໜຶ່ງ — ສະທ້ອນສູດດຽວກັນກັບ `applyRule()` ຢູ່ backend
 * (`basePrice × (1 − discount/100) × priceMultiplier`) ເພື່ອໃຫ້ preview
 * ໃນໜ້ານີ້ກົງກັບລາຄາຈິງທີ່ລູກຄ້າເຫັນຕອນຈອງ.
 */
export function ruleEffect(rule: { discountPercent: number; priceMultiplier: number }): RuleEffect {
  const multiplier = (1 - rule.discountPercent / 100) * rule.priceMultiplier;
  const netPercent = Math.round((1 - multiplier) * 1000) / 10;
  const kind: EffectKind = netPercent > 0.05 ? 'discount' : netPercent < -0.05 ? 'surge' : 'flat';
  return { multiplier, netPercent, kind };
}

export function roundLak(value: number): number {
  return Math.max(0, Math.round(value / PRICE_ROUNDING_LAK) * PRICE_ROUNDING_LAK);
}

export interface PricePreview {
  base: number;
  final: number;
  /** base − final: ບວກ = ລູກຄ້າປະຢັດ, ລົບ = ຈ່າຍເພີ່ມ (surge). */
  savings: number;
  netPercent: number;
  kind: EffectKind;
}

export function previewPrice(
  basePrice: number,
  rule: { discountPercent: number; priceMultiplier: number },
): PricePreview {
  const effect = ruleEffect(rule);
  const base = roundLak(basePrice);
  const final = roundLak(basePrice * effect.multiplier);
  return { base, final, savings: base - final, netPercent: effect.netPercent, kind: effect.kind };
}

export interface NowContext {
  dayOfWeek: number;
  minutes: number;
}

/** Asia/Vientiane = UTC+7 ຄົງທີ່ (ບໍ່ມີ DST). */
const VIENTIANE_OFFSET_MS = 7 * 3_600_000;

/**
 * ວັນ/ນາທີ "ດຽວນີ້" ຕາມເວລາວຽງຈັນ — ກົງກັບ `resolvePrice()` ຢູ່ backend
 * (`vientianeDayOfWeek` / `minutesOfDayVientiane`). ບໍ່ຂຶ້ນກັບ timezone ຂອງ browser.
 */
export function nowContext(at: Date = new Date()): NowContext {
  const local = new Date(at.getTime() + VIENTIANE_OFFSET_MS);
  return { dayOfWeek: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

export function isLiveNow(rule: PricingRuleView, now: NowContext): boolean {
  if (!rule.isActive || rule.dayOfWeek !== now.dayOfWeek) return false;
  return now.minutes >= toMinutes(rule.startTime) && now.minutes < toMinutes(rule.endTime);
}

/** ນາທີກ່ອນກົດຈະເລີ່ມໃນມື້ດຽວກັນ (null = ຜ່ານໄປແລ້ວ ຫຼື ບໍ່ແມ່ນມື້ນີ້). */
export function minutesUntilStart(rule: PricingRuleView, now: NowContext): number | null {
  if (!rule.isActive || rule.dayOfWeek !== now.dayOfWeek) return null;
  const start = toMinutes(rule.startTime);
  return start > now.minutes ? start - now.minutes : null;
}

function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  return toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(a.endTime) > toMinutes(b.startTime);
}

/**
 * ສອງກົດ "ຕຳກັນ" ເມື່ອທັງສອງເປີດຢູ່, ສາຂາ+ວັນດຽວກັນ, ເວລາຊ້ອນກັນ ແລະ ຂອບເຂດ
 * ບໍລິການທັບກັນ (serviceId ດຽວກັນ ຫຼື ຝ່າຍໃດຝ່າຍໜຶ່ງເປັນ "ທຸກບໍລິການ").
 * ບໍ່ແມ່ນ error — engine ຈະເລືອກອັນທີ່ໃຫ້ລາຄາຖືກສຸດ — ແຕ່ຜົນມັກຈະບໍ່ຄືທີ່ຄິດ.
 */
export function rulesCollide(a: PricingRuleView, b: PricingRuleView): boolean {
  if (a.id === b.id) return false;
  if (!a.isActive || !b.isActive) return false;
  if (a.branchId !== b.branchId || a.dayOfWeek !== b.dayOfWeek) return false;
  if (a.serviceId && b.serviceId && a.serviceId !== b.serviceId) return false;
  return windowsOverlap(a, b);
}

export interface ConflictPair {
  a: PricingRuleView;
  b: PricingRuleView;
  /** ນາທີທີ່ຊ້ອນກັນ. */
  overlapMinutes: number;
  /** ກົດທີ່ engine ຈະເລືອກ (ລາຄາຖືກສຸດ; ສະເໝີກັນ → ກົດທີ່ຜູກບໍລິການໂດຍກົງ). */
  winner: PricingRuleView;
}

export function conflictPairs(rules: PricingRuleView[]): ConflictPair[] {
  const pairs: ConflictPair[] = [];
  for (let i = 0; i < rules.length; i += 1) {
    for (let j = i + 1; j < rules.length; j += 1) {
      const a = rules[i]!;
      const b = rules[j]!;
      if (!rulesCollide(a, b)) continue;
      const overlapMinutes =
        Math.min(toMinutes(a.endTime), toMinutes(b.endTime)) -
        Math.max(toMinutes(a.startTime), toMinutes(b.startTime));
      const ma = ruleEffect(a).multiplier;
      const mb = ruleEffect(b).multiplier;
      const winner =
        ma !== mb ? (ma < mb ? a : b) : a.serviceId && !b.serviceId ? a : b.serviceId && !a.serviceId ? b : a;
      pairs.push({ a, b, overlapMinutes, winner });
    }
  }
  return pairs;
}

export function conflictIdSet(rules: PricingRuleView[]): Set<string> {
  const ids = new Set<string>();
  for (const pair of conflictPairs(rules)) {
    ids.add(pair.a.id);
    ids.add(pair.b.id);
  }
  return ids;
}

type Interval = [number, number];

function unionMinutes(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].filter(([s, e]) => e > s).sort((x, y) => x[0] - y[0]);
  const merged: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

function totalMinutes(intervals: Interval[]): number {
  return intervals.reduce((sum, [s, e]) => sum + (e - s), 0);
}

function subtract(base: Interval[], cut: Interval[]): Interval[] {
  let result = base;
  for (const [cs, ce] of cut) {
    const next: Interval[] = [];
    for (const [s, e] of result) {
      if (ce <= s || cs >= e) next.push([s, e]);
      else {
        if (s < cs) next.push([s, cs]);
        if (ce < e) next.push([ce, e]);
      }
    }
    result = next;
  }
  return result;
}

export interface WeekCoverage {
  /** ນາທີໃນອາທິດທີ່ມີກົດຫຼຸດລາຄາ. */
  discountMinutes: number;
  /** ນາທີທີ່ມີແຕ່ກົດເພີ່ມລາຄາ (ບໍ່ນັບບ່ອນທີ່ຫຼຸດທັບຢູ່). */
  surgeMinutes: number;
  /** ນາທີທີ່ບໍ່ມີກົດໃດຄຸມ — ຂາຍລາຄາເຕັມ. */
  uncoveredMinutes: number;
  totalMinutes: number;
  coveredPercent: number;
}

/** ສັດສ່ວນຂອງອາທິດ (7 × 1440 ນາທີ) ທີ່ຖືກກົດຄຸມ — ນັບສະເພາະກົດທີ່ເປີດຢູ່. */
export function weekCoverage(rules: PricingRuleView[]): WeekCoverage {
  const active = rules.filter((r) => r.isActive);
  const discount: Interval[] = [];
  const surge: Interval[] = [];
  for (const r of active) {
    const offset = r.dayOfWeek * MINUTES_PER_DAY;
    const interval: Interval = [offset + toMinutes(r.startTime), offset + toMinutes(r.endTime)];
    if (ruleEffect(r).kind === 'surge') surge.push(interval);
    else if (ruleEffect(r).kind === 'discount') discount.push(interval);
  }
  const discountUnion = unionMinutes(discount);
  const surgeOnly = subtract(unionMinutes(surge), discountUnion);
  const total = 7 * MINUTES_PER_DAY;
  const discountMinutes = totalMinutes(discountUnion);
  const surgeMinutes = totalMinutes(surgeOnly);
  return {
    discountMinutes,
    surgeMinutes,
    uncoveredMinutes: Math.max(0, total - discountMinutes - surgeMinutes),
    totalMinutes: total,
    coveredPercent: Math.round(((discountMinutes + surgeMinutes) / total) * 100),
  };
}

/** ລຳດັບວັນຂອງ week grid ຕາມ Settings ▸ Localization ▸ "ອາທິດເລີ່ມວັນ". */
export function dayOrder(weekStart: WeekStart): number[] {
  const start = weekStart === 'mon' ? 1 : 0;
  return Array.from({ length: 7 }, (_, i) => (start + i) % 7);
}
