import { z } from 'zod';

import { UserRole } from './enums.js';

/**
 * web-admin /portal — launcher state synced to the account, the cross-module
 * summary, team announcements, the super-admin system status card and the
 * per-branch daily checklist.
 */

// --- Launcher prefs (stored under UserPreferences.portal) ------------------------

export const portalPrefsSchema = z.object({
  /** Module paths in the user's chosen order. */
  pins: z.array(z.string().max(120)).max(60).optional(),
  /** Newest first; `at` = epoch ms. */
  recent: z
    .array(z.object({ path: z.string().max(200), at: z.number().int().nonnegative() }))
    .max(40)
    .optional(),
  view: z.enum(['grid', 'list']).optional(),
});
export type PortalPrefs = z.infer<typeof portalPrefsSchema>;

// --- Summary ----------------------------------------------------------------------

/**
 * Every count the portal can show. The server only returns the keys the caller is
 * allowed to see, so a missing key means "not for you", not zero.
 */
export const PORTAL_COUNT_KEYS = [
  'appointmentsPending',
  'appointmentsToday',
  'queueWaiting',
  'queueLongestWaitMin',
  'waitlist',
  'homeServiceActive',
  'timeOffPending',
  'lowStock',
  'openPurchaseOrders',
  'transfersInTransit',
  'stockCountsOpen',
  'adjustmentsPending',
  'slipsToReview',
  'expensesToApprove',
  'expensesDueSoon',
  'statementLinesUnmatched',
  'cashDrawersOpen',
  'unpaidBills',
  'notificationsUnread',
  'notificationsCritical',
  'messagesUnread',
  'announcementsUnread',
] as const;
export type PortalCountKey = (typeof PORTAL_COUNT_KEYS)[number];

export interface PortalSummary {
  generatedAt: string;
  branchId: string | 'all';
  counts: Partial<Record<PortalCountKey, number>>;
  /** Previous Vientiane month not yet closed in reconciliation (YYYY-MM), when visible. */
  reconOpenMonth?: string | null;
}

export const portalScopeQuerySchema = z.object({
  branchId: z.union([z.literal('all'), z.string().uuid()]).optional(),
});

// --- Announcements ------------------------------------------------------------------

export const ANNOUNCEMENT_SEVERITIES = ['INFO', 'SUCCESS', 'WARNING', 'CRITICAL'] as const;
export type AnnouncementSeverity = (typeof ANNOUNCEMENT_SEVERITIES)[number];
export const ANNOUNCEMENT_KINDS = ['ANNOUNCEMENT', 'CHANGELOG'] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

const staffRole = UserRole.exclude(['CUSTOMER', 'AFFILIATE_PARTNER']);

export const announcementInputSchema = z.object({
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().max(4000).default(''),
  kind: z.enum(ANNOUNCEMENT_KINDS).default('ANNOUNCEMENT'),
  severity: z.enum(ANNOUNCEMENT_SEVERITIES).default('INFO'),
  /** Empty = every staff role. */
  audienceRoles: z.array(staffRole).max(3).default([]),
  /** null = every branch. */
  branchId: z.string().uuid().nullable().default(null),
  pinned: z.boolean().default(false),
  /** Future date = scheduled. Defaults to now. */
  publishedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});
export type AnnouncementInput = z.input<typeof announcementInputSchema>;
export const announcementPatchSchema = announcementInputSchema.partial();
export type AnnouncementPatch = z.input<typeof announcementPatchSchema>;

export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  kind: AnnouncementKind;
  severity: AnnouncementSeverity;
  audienceRoles: string[];
  branchId: string | null;
  branchName: string | null;
  pinned: boolean;
  publishedAt: string;
  expiresAt: string | null;
  createdAt: string;
  author: { id: string; name: string } | null;
  read: boolean;
  /** Manage list only. */
  readCount?: number;
}

// --- System status (SUPER_ADMIN) ------------------------------------------------------

export type ProbeState = 'ok' | 'degraded' | 'down' | 'unknown';

export interface SystemStatusQueue {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  workers: number;
  lastCompletedAt: string | null;
  lastFailedAt: string | null;
  lastFailedReason: string | null;
}

export interface SystemStatus {
  checkedAt: string;
  api: { state: ProbeState; uptimeSec: number; version: string; node: string; memoryMb: number };
  database: { state: ProbeState; latencyMs: number | null };
  redis: { state: ProbeState; latencyMs: number | null };
  socket: { state: ProbeState; clients: number };
  worker: { state: ProbeState; workers: number };
  queues: SystemStatusQueue[];
  backup: {
    state: ProbeState;
    configured: boolean;
    lastAt: string | null;
    file: string | null;
    sizeBytes: number | null;
    ageHours: number | null;
  };
}

// --- Daily checklist -----------------------------------------------------------------

export const CHECKLIST_TASK_KEYS = [
  'openDrawer',
  'confirmBookings',
  'reviewSlips',
  'approveExpenses',
  'clearCritical',
  'checkLowStock',
  'weeklyStockCount',
  'matchStatement',
  'closeDrawer',
  'verifyBackup',
] as const;
export type ChecklistTaskKey = (typeof CHECKLIST_TASK_KEYS)[number];

export type ChecklistSlot = 'open' | 'during' | 'close';

export interface ChecklistTask {
  key: ChecklistTaskKey;
  slot: ChecklistSlot;
  /** Web route the task is done on. */
  to: string;
  /** Detected from live data (drawer opened, 0 pending slips…). */
  autoDone: boolean;
  /** Ticked by hand. */
  ticked: boolean;
  done: boolean;
  doneAt: string | null;
  doneBy: string | null;
  /** Live count behind the task, when there is one. */
  count: number | null;
}

export interface ChecklistDay {
  date: string;
  branchId: string | 'all';
  tasks: ChecklistTask[];
}

export const checklistToggleSchema = z.object({
  done: z.boolean(),
  branchId: z.union([z.literal('all'), z.string().uuid()]).optional(),
});
