import {
  mergePermissionOverrides,
  type CreateRoleInput,
  type PermissionOverride,
  type UpdateRoleInput,
} from '@abcp/shared-types';
import { http } from 'msw';

import { db, newId } from '../fixtures/store';
import type { MockRole } from '../fixtures/roles';
import { basePermissions, toAdminUser, type MockUser } from '../fixtures/users';
import { api, delay, fail, ok } from '../helpers';

/** Shared with auth.ts (`db.users`) so login/me reflect create/permissions/quick-login here. */
const users = db.users;
const roles = db.roles;

function toRole(r: MockRole) {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    permissions: r.permissions,
    isSystem: r.isSystem,
    memberCount: users.filter((u) => u.roleId === r.id).length,
    createdAt: r.createdAt,
  };
}

interface AppSettings {
  // Business profile
  logoUrl: string;
  businessName: string;
  legalName: string;
  contactPhone: string;
  contactEmail: string;
  addressLine: string;
  taxId: string;
  // Localization
  displayCurrency: 'LAK' | 'THB' | 'USD';
  timezone: string;
  defaultLanguage: 'lo' | 'en';
  weekStart: 'mon' | 'sun';
  dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
  // Exchange rates
  autoConvertCurrency: boolean;
  fxRefreshMinutes: number;
  // Booking rules
  bookingLeadHours: number;
  cancellationWindowHours: number;
  maxAdvanceDays: number;
  slotIntervalMinutes: number;
  allowWalkIns: boolean;
  allowOnlineBooking: boolean;
  autoConfirm: boolean;
  requireDeposit: boolean;
  depositPercent: number;
  noShowThreshold: number;
  // Queue
  queueEnabled: boolean;
  ticketPrefix: string;
  waitAlertMinutes: number;
  autoRecall: boolean;
  // Notifications
  smsSenderName: string;
  reminderOffsetsHours: string;
  sendBookingConfirmation: boolean;
  // Security
  sessionTimeoutMinutes: number;
  minPasswordLength: number;
  require2fa: boolean;
  // Data
  dataRetentionMonths: number;
}

const settings: AppSettings = {
  logoUrl: '/logo.png',
  businessName: 'Aura ຄວາມງາມ & ຄລີນິກ',
  legalName: 'ບໍລິສັດ ອໍຣາ ວེລເນສ ຈຳກັດ',
  contactPhone: '+856 20 5555 1234',
  contactEmail: 'hello@aura.la',
  addressLine: 'ບ້ານ ໂພນທັນ, ເມືອງ ໄຊເສດຖາ, ນະຄອນຫຼວງວຽງຈັນ',
  taxId: 'TIN-114-2288-0091',
  displayCurrency: 'LAK',
  timezone: 'Asia/Vientiane',
  defaultLanguage: 'lo',
  weekStart: 'mon',
  dateFormat: 'DD/MM/YYYY',
  autoConvertCurrency: true,
  fxRefreshMinutes: 30,
  bookingLeadHours: 2,
  cancellationWindowHours: 24,
  maxAdvanceDays: 60,
  slotIntervalMinutes: 30,
  allowWalkIns: true,
  allowOnlineBooking: true,
  autoConfirm: false,
  requireDeposit: false,
  depositPercent: 20,
  noShowThreshold: 3,
  queueEnabled: true,
  ticketPrefix: 'A',
  waitAlertMinutes: 20,
  autoRecall: true,
  smsSenderName: 'AURA',
  reminderOffsetsHours: '24, 3',
  sendBookingConfirmation: true,
  sessionTimeoutMinutes: 30,
  minPasswordLength: 8,
  require2fa: false,
  dataRetentionMonths: 24,
};

type NotifSeverity = 'critical' | 'warning' | 'info';

/** Mirrors the backend `AppNotificationView` (system.service.ts). */
interface MockNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: NotifSeverity;
  category: string;
  module: string;
  source: string;
  data: Record<string, unknown> | null;
  createdAt: string;
  read: boolean;
  readAt: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
}

const NOTIF_TEMPLATES: {
  type: string;
  module: string;
  category: string;
  severity: NotifSeverity;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}[] = [
  {
    type: 'HOME_SERVICE_SLA_NO_MATCH',
    module: 'homeService',
    category: 'booking',
    severity: 'critical',
    title: 'Home Service ຄ້າງດົນ — ຕ້ອງການຄວາມສົນໃຈ',
    body: 'ນາງ ມະນີວັນ ຍັງບໍ່ໄດ້ຈັບຄູ່ຊ່າງ (MATCHING)',
    data: { tripId: 'trip-1' },
  },
  {
    type: 'stock_reconciliation_mismatch',
    module: 'inventory',
    category: 'inventory',
    severity: 'critical',
    title: 'ພົບຂໍ້ມູນສະຕັອກບໍ່ກົງກັນ (2 ລາຍການ)',
    body: 'ເຊຣັ່ມວິຕາມິນຊີ: ລະບົບ=12 ledger=10 (ຕ່າງ 2)\nມາສໜ້າຄໍລາເຈນ: ລະບົບ=40 ledger=38 (ຕ່າງ 2)',
    data: { mismatchCount: 2 },
  },
  {
    type: 'INVENTORY_LOW_STOCK',
    module: 'inventory',
    category: 'inventory',
    severity: 'warning',
    title: 'ສິນຄ້າໃກ້ໝົດສະຕັອກ',
    body: 'ນ້ຳຢາບຳລຸງຜິວເຫຼືອ 3 ຊິ້ນ ທີ່ສາຂາ ໜອງບອນ.',
  },
  {
    type: 'STAFF_TIMEOFF_REQUEST',
    module: 'staff',
    category: 'staff',
    severity: 'warning',
    title: 'ຄຳຮ້ອງລາພັກ',
    body: 'ພະນັກງານສົ່ງຄຳຮ້ອງລາພັກໃໝ່, ລໍຖ້າອະນຸມັດ.',
  },
  {
    type: 'APPOINTMENT_REMINDER',
    module: 'appointments',
    category: 'booking',
    severity: 'info',
    title: 'ເຕືອນນັດໝາຍມື້ອື່ນ',
    body: 'ນວດໜ້າ ທີ່ ສາຂາ ໃຈກາງ — 10:30',
    data: { appointmentId: 'appt-1', offsetHours: 24 },
  },
  {
    type: 'PAYMENT_RECEIPT',
    module: 'payments',
    category: 'payment',
    severity: 'info',
    title: 'ຊຳລະເງິນສຳເລັດ',
    body: 'ຮັບຊຳລະ 350,000 LAK ຮຽບຮ້ອຍ.',
    data: { paymentId: 'pay-1' },
  },
  {
    type: 'CAMPAIGN',
    module: 'marketing',
    category: 'marketing',
    severity: 'info',
    title: 'ໂປຣໂມຊັ່ນພິເສດ',
    body: 'ສ່ວນຫຼຸດ 20% ສຳລັບສະມາຊິກ VIP.',
    data: { campaignId: 'cmp-1' },
  },
];

const notifications: MockNotification[] = Array.from({ length: 48 }, (_, i) => {
  const tpl = NOTIF_TEMPLATES[i % NOTIF_TEMPLATES.length]!;
  const createdAt = new Date(Date.now() - i * 5 * 3_600_000).toISOString();
  const resolved = i % 9 === 0 && i > 0;
  const read = resolved || i % 4 === 0;
  return {
    id: `ntf-${i}`,
    type: tpl.type,
    title: tpl.title,
    body: tpl.body,
    severity: tpl.severity,
    category: tpl.category,
    module: tpl.module,
    source: tpl.module,
    data: tpl.data ?? null,
    createdAt,
    read,
    readAt: read ? createdAt : null,
    resolved,
    resolvedAt: resolved ? createdAt : null,
    resolvedBy: resolved ? { id: 'u-admin', name: 'Admin' } : null,
  };
});

function notificationSummary() {
  const today = new Date().toDateString();
  return {
    total: notifications.length,
    unread: notifications.filter((n) => !n.read).length,
    needsAction: notifications.filter((n) => !n.resolved && n.severity !== 'info').length,
    critical: notifications.filter((n) => !n.resolved && n.severity === 'critical').length,
    today: notifications.filter((n) => new Date(n.createdAt).toDateString() === today).length,
    resolved7d: notifications.filter((n) => n.resolved).length,
    medianResolveMinutes: 95,
  };
}

function notificationDaily() {
  return Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10);
    const rows = notifications.filter((n) => n.createdAt.slice(0, 10) === day);
    return {
      date: day,
      total: rows.length,
      critical: rows.filter((n) => n.severity === 'critical').length,
      warning: rows.filter((n) => n.severity === 'warning').length,
    };
  });
}

function applyNotificationAction(n: MockNotification, action: string) {
  const now = new Date().toISOString();
  if (action === 'read' && !n.read) Object.assign(n, { read: true, readAt: now });
  if (action === 'unread') Object.assign(n, { read: false, readAt: null });
  if (action === 'resolve' && !n.resolved) {
    Object.assign(n, {
      resolved: true,
      resolvedAt: now,
      resolvedBy: { id: 'u-admin', name: 'Admin' },
      read: true,
      readAt: n.readAt ?? now,
    });
  }
  if (action === 'reopen')
    Object.assign(n, { resolved: false, resolvedAt: null, resolvedBy: null });
}

export const miscHandlers = [
  http.get(api('/users'), async () => {
    await delay(120);
    return ok({ items: users.map((u) => toAdminUser(u, db.branches, roles)) });
  }),
  http.post(api('/users'), async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => ({}))) as Partial<MockUser> & {
      roleId?: string | null;
    };
    if (!body.name?.trim() || !body.phone?.trim() || !body.role) {
      return fail(400, 'VALIDATION_ERROR', 'ຕ້ອງໃສ່ຊື່ ເບີໂທ ແລະ ບົດບາດ');
    }
    const u: MockUser = {
      id: newId('usr'),
      name: body.name.trim(),
      phone: body.phone.trim(),
      email: body.email ?? null,
      role: body.role,
      roleId: body.roleId ?? null,
      branchId: body.branchId ?? null,
      avatarUrl: null,
      password: '',
      isActive: true,
      quickLoginPin: null,
      quickLoginUpdatedAt: null,
      lastLoginAt: null,
      lastLoginDevice: null,
      overrides: [],
      createdAt: new Date().toISOString(),
    };
    users.push(u);
    return ok(toAdminUser(u, db.branches, roles), { status: 201 });
  }),
  http.patch(api('/users/:id'), async ({ params, request }) => {
    await delay();
    const u = users.find((x) => x.id === params.id);
    if (!u) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບຜູ້ໃຊ້');
    const body = (await request.json().catch(() => ({}))) as Partial<MockUser>;
    Object.assign(u, body);
    return ok(toAdminUser(u, db.branches, roles));
  }),

  // Static sub-route registered before ":id/permissions" below so it isn't shadowed.
  http.get(api('/users/quick-login'), async () => {
    await delay(120);
    return ok({ items: users.map((u) => toAdminUser(u, db.branches, roles)) });
  }),

  http.get(api('/users/:id/permissions'), async ({ params }) => {
    await delay();
    const u = users.find((x) => x.id === params.id);
    if (!u) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບຜູ້ໃຊ້');
    const role = roles.find((r) => r.id === u.roleId);
    const base = basePermissions(u, roles);
    return ok({
      userId: u.id,
      role: u.role,
      roleId: role?.id ?? null,
      roleName: role?.name ?? null,
      rolePermissions: [...base],
      overrides: u.overrides,
      effective: mergePermissionOverrides(base, u.overrides),
    });
  }),
  http.put(api('/users/:id/permissions'), async ({ params, request }) => {
    await delay();
    const u = users.find((x) => x.id === params.id);
    if (!u) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບຜູ້ໃຊ້');
    const body = (await request.json().catch(() => ({}))) as { overrides?: PermissionOverride[] };
    u.overrides = body.overrides ?? [];
    const role = roles.find((r) => r.id === u.roleId);
    const base = basePermissions(u, roles);
    return ok({
      userId: u.id,
      role: u.role,
      roleId: role?.id ?? null,
      roleName: role?.name ?? null,
      rolePermissions: [...base],
      overrides: u.overrides,
      effective: mergePermissionOverrides(base, u.overrides),
    });
  }),

  http.post(api('/users/:id/quick-login'), async ({ params, request }) => {
    await delay();
    const u = users.find((x) => x.id === params.id);
    if (!u) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບຜູ້ໃຊ້');
    const body = (await request.json().catch(() => ({}))) as { pin?: string };
    if (!body.pin || !/^\d{4,6}$/.test(body.pin)) {
      return fail(400, 'VALIDATION_ERROR', 'PIN ຕ້ອງເປັນຕົວເລກ 4-6 ຫຼັກ');
    }
    u.quickLoginPin = body.pin;
    u.quickLoginUpdatedAt = new Date().toISOString();
    return ok(toAdminUser(u, db.branches, roles));
  }),
  http.delete(api('/users/:id/quick-login'), async ({ params }) => {
    await delay();
    const u = users.find((x) => x.id === params.id);
    if (!u) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບຜູ້ໃຊ້');
    u.quickLoginPin = null;
    u.quickLoginUpdatedAt = null;
    return ok(toAdminUser(u, db.branches, roles));
  }),

  http.get(api('/roles'), async () => {
    await delay(120);
    return ok({ items: roles.map(toRole) });
  }),
  http.post(api('/roles'), async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => ({}))) as Partial<CreateRoleInput>;
    if (!body.name?.trim()) return fail(400, 'VALIDATION_ERROR', 'ຕ້ອງໃສ່ຊື່ບົດບາດ');
    if (roles.some((r) => r.name === body.name))
      return fail(409, 'CONFLICT', 'ມີບົດບາດຊື່ນີ້ຢູ່ແລ້ວ');
    const r: MockRole = {
      id: newId('role'),
      name: body.name.trim(),
      icon: body.icon ?? 'UsersRound',
      color: body.color ?? '#4f46e5',
      permissions: body.permissions ?? [],
      isSystem: false,
      createdAt: new Date().toISOString(),
    };
    roles.push(r);
    return ok(toRole(r), { status: 201 });
  }),
  http.patch(api('/roles/:id'), async ({ params, request }) => {
    await delay();
    const r = roles.find((x) => x.id === params.id);
    if (!r) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບບົດບາດ');
    const body = (await request.json().catch(() => ({}))) as Partial<UpdateRoleInput>;
    if (body.name && roles.some((x) => x.name === body.name && x.id !== r.id)) {
      return fail(409, 'CONFLICT', 'ມີບົດບາດຊື່ນີ້ຢູ່ແລ້ວ');
    }
    Object.assign(r, body);
    return ok(toRole(r));
  }),
  http.delete(api('/roles/:id'), async ({ params }) => {
    await delay();
    const r = roles.find((x) => x.id === params.id);
    if (!r) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບບົດບາດ');
    if (r.isSystem) return fail(400, 'VALIDATION_ERROR', 'ບໍ່ສາມາດລຶບບົດບາດຫຼັກຂອງລະບົບໄດ້');
    if (users.some((u) => u.roleId === r.id)) {
      return fail(
        400,
        'VALIDATION_ERROR',
        'ຍັງມີຜູ້ໃຊ້ຢູ່ໃນບົດບາດນີ້ — ຍ້າຍພວກເຂົາອອກກ່ອນຈຶ່ງລຶບໄດ້',
      );
    }
    roles.splice(roles.indexOf(r), 1);
    return new Response(null, { status: 204 });
  }),

  http.get(api('/settings'), async () => {
    await delay(120);
    return ok(settings);
  }),
  http.put(api('/settings'), async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => ({}))) as Partial<AppSettings>;
    Object.assign(settings, body);
    return ok(settings);
  }),

  http.get(api('/notifications'), async () => {
    await delay(120);
    return ok({
      items: notifications,
      summary: notificationSummary(),
      daily: notificationDaily(),
      limit: 300,
    });
  }),
  http.get(api('/notifications/unread-count'), async () => {
    await delay(60);
    const s = notificationSummary();
    return ok({
      unread: s.unread,
      critical: notifications.filter((n) => !n.read && !n.resolved && n.severity === 'critical')
        .length,
    });
  }),
  http.post(api('/notifications/read-all'), async () => {
    await delay(80);
    let updated = 0;
    for (const n of notifications) {
      if (!n.read) {
        applyNotificationAction(n, 'read');
        updated += 1;
      }
    }
    return ok({ updated });
  }),
  http.post(api('/notifications/bulk'), async ({ request }) => {
    await delay(80);
    const { ids, action } = (await request.json()) as { ids: string[]; action: string };
    let updated = 0;
    for (const id of ids) {
      const idx = notifications.findIndex((x) => x.id === id);
      if (idx < 0) continue;
      if (action === 'delete') notifications.splice(idx, 1);
      else applyNotificationAction(notifications[idx]!, action);
      updated += 1;
    }
    return ok({ updated });
  }),
  http.patch(api('/notifications/:id/:action'), async ({ params }) => {
    await delay(80);
    const n = notifications.find((x) => x.id === params.id);
    if (!n) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບ');
    applyNotificationAction(n, String(params.action));
    return ok(n);
  }),
  http.delete(api('/notifications/:id'), async ({ params }) => {
    await delay(80);
    const idx = notifications.findIndex((x) => x.id === params.id);
    if (idx < 0) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບ');
    notifications.splice(idx, 1);
    return ok({ id: params.id });
  }),
];
