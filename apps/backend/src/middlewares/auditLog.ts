import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';

/**
 * ໂມດູນ 37 — Audit Logging.
 * ບັນທຶກທຸກ write (POST/PATCH/PUT/DELETE) ທີ່ສຳເລັດ (2xx) ລົງ `AuditLog`.
 * ເປັນ middleware ກາງ — ດັກ `res.json` ເພື່ອເອົາ payload ຕອບ, ຂຽນ log ແບບ fire-and-forget
 * ຕອນ response finish. `oldValue` ບໍ່ຖືກເກັບ (middleware ກາງບໍ່ຮູ້ state ກ່ອນໜ້າ) — feed ຮອງຮັບ null.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_VALUE_BYTES = 8_192;

/** ຊື່ resource (ຫຼາຍພົດ) → entity head. head ຄວນກົງກັບ AUDIT_CATEGORIES ໃນ system.service.ts. */
const RESOURCE_ENTITY: Record<string, string> = {
  services: 'service',
  'service-categories': 'service',
  suppliers: 'supplier',
  products: 'product',
  'stock-movements': 'stock',
  'purchase-orders': 'purchase_order',
  appointments: 'appointment',
  booking: 'appointment',
  customers: 'customer',
  staff: 'staff',
  'staff-portal': 'staff',
  payroll: 'staff',
  branches: 'branch',
  'branch-closures': 'branch',
  users: 'users',
  roles: 'users',
  settings: 'settings',
  'notification-templates': 'settings',
  queue: 'queue',
  payments: 'payment',
  loyalty: 'loyalty',
  'gift-cards': 'giftcard',
  marketing: 'marketing',
  waitlist: 'waitlist',
  conversations: 'conversation',
};

const SKIP_HEAD = new Set(['auth', 'audit-logs', 'notifications', 'dashboard', 'reports', 'catalog']);

function verbFor(method: string, path: string): string {
  const tail = path.split('/').filter(Boolean).pop() ?? '';
  if (method === 'DELETE') return 'deleted';
  const suffixVerb: Record<string, string> = {
    receive: 'received',
    adjust: 'adjusted',
    cancel: 'cancelled',
    reschedule: 'rescheduled',
    status: 'status_changed',
    approve: 'approved',
    reject: 'rejected',
    'check-in': 'checked_in',
    'walk-in': 'walkin_created',
    resolve: 'resolved',
    lock: 'lock_toggled',
    report: 'reported',
    read: 'read',
    review: 'reviewed',
  };
  if (suffixVerb[tail]) return suffixVerb[tail]!;
  if (method === 'POST') return 'created';
  return 'updated';
}

function pickEntityId(req: Request, data: unknown): string | null {
  const p = (req.params as Record<string, string | undefined>).id;
  if (p && UUID_RE.test(p)) return p;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const k of ['id', 'appointmentId']) {
      if (typeof d[k] === 'string' && UUID_RE.test(d[k] as string)) return d[k] as string;
    }
  }
  return null;
}

function pickUuid(v: unknown): string | null {
  return typeof v === 'string' && UUID_RE.test(v) ? v : null;
}

function clampValue(data: unknown): object | null {
  if (!data || typeof data !== 'object') return null;
  try {
    const json = JSON.stringify(data);
    if (json.length > MAX_VALUE_BYTES) return { note: 'truncated', size: json.length };
    return JSON.parse(json) as object;
  } catch {
    return null;
  }
}

export function auditLog(req: Request, res: Response, next: NextFunction): void {
  const method = req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  // req.path here is relative to the /api/v1 mount (e.g. "/suppliers/<id>").
  const head = req.path.split('/').filter(Boolean)[0] ?? '';
  if (SKIP_HEAD.has(head)) {
    next();
    return;
  }
  const entity = RESOURCE_ENTITY[head];
  if (!entity) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  let captured: unknown;
  res.json = (body: unknown) => {
    captured = body;
    return originalJson(body as never);
  };

  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const data = (captured as { data?: unknown } | undefined)?.data ?? captured;
    const action = `${entity}.${verbFor(method, req.path)}`;
    const bodyBranchId = (req.body as Record<string, unknown> | undefined)?.branchId;
    const branchId = pickUuid(req.auth?.branchId) ?? pickUuid(bodyBranchId) ?? null;

    prisma.auditLog
      .create({
        data: {
          action,
          entityName: entity,
          entityId: pickEntityId(req, data),
          userId: pickUuid(req.auth?.sub),
          branchId,
          newValue: clampValue(data) ?? undefined,
          ipAddress: req.ip ?? null,
        },
      })
      .catch((err: unknown) => logger.warn({ err, action }, 'audit log write failed'));
  });

  next();
}
