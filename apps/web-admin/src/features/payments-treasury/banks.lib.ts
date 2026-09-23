import type {
  BankAccountInsight,
  BankAccountInsightsView,
  BankAccountView,
  PaymentProviderView,
  SlipSettings,
} from '@abcp/shared-types';

import type { Tone } from '@/features/payroll/payroll.lib';

/**
 * Pure logic for /payments/banks — health rules, the setup checklist and the
 * URL-backed page state. Kept out of the components so the rules are testable
 * and read in one place.
 */

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];
export type StatusFilter = 'active' | 'inactive' | 'all';
export type BanksView = 'cards' | 'table';

export function parsePeriod(v: string | null): Period {
  const n = Number(v);
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 30;
}
export function parseStatus(v: string | null): StatusFilter {
  return v === 'inactive' || v === 'all' ? v : 'active';
}
export function parseView(v: string | null): BanksView {
  return v === 'table' ? 'table' : 'cards';
}

/** % change vs the previous equal-length period; `null` = no baseline (never a fake +100%). */
export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// ── Per-account health ───────────────────────────────────────────────

export type AccountIssue = 'variance' | 'unreconciled' | 'openSlips' | 'noQr' | 'dormant';
export type HealthLevel = 'ok' | 'attention' | 'critical' | 'off';

/** Severity order drives both the pill and the sort — variance is money that doesn't add up. */
const ISSUE_ORDER: AccountIssue[] = ['variance', 'unreconciled', 'openSlips', 'noQr', 'dormant'];

export function accountIssues(a: BankAccountView, ins: BankAccountInsight | undefined, days: number): AccountIssue[] {
  if (!a.isActive) return [];
  const out = new Set<AccountIssue>();
  if (ins?.varianceDays) out.add('variance');
  if (ins?.unreconciledDays) out.add('unreconciled');
  if (ins?.openSlips) out.add('openSlips');
  if (a.bank.supportsQr && !a.qrImageUrl) out.add('noQr');
  // "dormant" only means something over a month or more — a quiet week is normal for a small branch
  if (ins && days >= 30 && ins.receivedPeriodCount === 0) out.add('dormant');
  return ISSUE_ORDER.filter((k) => out.has(k));
}

export function healthLevel(a: BankAccountView, issues: AccountIssue[]): HealthLevel {
  if (!a.isActive) return 'off';
  if (issues.includes('variance')) return 'critical';
  return issues.some((i) => i !== 'dormant') ? 'attention' : 'ok';
}

export const HEALTH_TONE: Record<HealthLevel, Tone> = {
  ok: 'success',
  attention: 'warning',
  critical: 'danger',
  off: 'neutral',
};

export const ISSUE_TONE: Record<AccountIssue, Tone> = {
  variance: 'danger',
  unreconciled: 'warning',
  openSlips: 'info',
  noQr: 'warning',
  dormant: 'neutral',
};

// ── Channels ─────────────────────────────────────────────────────────

export type ChannelHealth = 'healthy' | 'attention' | 'notReady' | 'off';

export function channelHealth(p: PaymentProviderView): ChannelHealth {
  if (!p.isActive) return 'off';
  if (!p.secretConfigured) return 'notReady';
  return p.recentIssues > 0 ? 'attention' : 'healthy';
}

export const CHANNEL_TONE: Record<ChannelHealth, Tone> = {
  healthy: 'success',
  attention: 'warning',
  notReady: 'danger',
  off: 'neutral',
};

// ── Setup checklist ──────────────────────────────────────────────────

export type SetupCheckKey =
  | 'coverage'
  | 'qr'
  | 'channel'
  | 'secrets'
  | 'webhooks'
  | 'statements'
  | 'variance'
  | 'unassigned';

export interface SetupCheck {
  key: SetupCheckKey;
  ok: boolean;
  /** Count behind a failed check (branches, accounts, days…), for the i18n string. */
  count: number;
  /** Where the fix lives. */
  fix: 'add' | 'qr' | 'channels' | 'recon' | 'filter' | null;
}

export function setupChecks(input: {
  branches: { id: string; name: string; isActive: boolean }[];
  accounts: BankAccountView[];
  providers: PaymentProviderView[];
  insights: BankAccountInsightsView | undefined;
}): SetupCheck[] {
  const { branches, accounts, providers, insights } = input;
  const active = accounts.filter((a) => a.isActive);
  const uncovered = branches.filter((b) => b.isActive && !active.some((a) => a.branchId === b.id)).length;
  const noQr = active.filter((a) => a.bank.supportsQr && !a.qrImageUrl).length;
  const liveChannels = providers.filter((p) => p.isActive);
  const noSecret = liveChannels.filter((p) => !p.secretConfigured).length;
  const issues = providers.reduce((n, p) => n + (p.isActive ? p.recentIssues : 0), 0);
  const unrec = insights?.totals.unreconciledDays ?? 0;
  const variance = insights?.totals.varianceDays ?? 0;
  const unassigned = insights?.unassigned.count ?? 0;
  return [
    { key: 'coverage', ok: uncovered === 0, count: uncovered, fix: 'add' },
    { key: 'qr', ok: noQr === 0, count: noQr, fix: 'filter' },
    { key: 'channel', ok: liveChannels.length > 0, count: liveChannels.length, fix: 'channels' },
    { key: 'secrets', ok: noSecret === 0, count: noSecret, fix: 'channels' },
    { key: 'webhooks', ok: issues === 0, count: issues, fix: 'recon' },
    { key: 'statements', ok: unrec === 0, count: unrec, fix: 'recon' },
    { key: 'variance', ok: variance === 0, count: variance, fix: 'recon' },
    { key: 'unassigned', ok: unassigned === 0, count: unassigned, fix: 'recon' },
  ];
}

// ── Misc ─────────────────────────────────────────────────────────────

/** Narrow an account's ISO code to what `formatCurrency` knows; anything else prints as kip. */
export const asCur = (c: string): 'LAK' | 'THB' | 'USD' => (c === 'THB' || c === 'USD' ? c : 'LAK');

/**
 * Stable chart-token hue per bank code, so the same bank reads the same everywhere on the page.
 * Returns an HSL colour string; `alpha` tints it (the tokens are bare `H S% L%` triples).
 */
export function bankHue(code: string, alpha?: number): string {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const v = `var(--chart-${(h % 6) + 1})`;
  return alpha == null ? `hsl(${v})` : `hsl(${v} / ${alpha})`;
}

/** Account number in groups of 4 for reading aloud / copying by eye (`0101 2000 0123 456`). */
export function groupAccountNumber(n: string): string {
  return n.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

/** Whole days between a `YYYY-MM-DD` key and today's key (both Vientiane). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

/** Top-N accounts by money received, the rest folded into one "other" bucket (composition bar). */
export function topShares<T extends { id: string; value: number }>(rows: T[], n = 4): { top: T[]; other: number } {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  return { top: sorted.slice(0, n), other: sorted.slice(n).reduce((s, r) => s + r.value, 0) };
}

export type { SlipSettings };
