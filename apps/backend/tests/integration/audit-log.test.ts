import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Phase 6 / Module 37 Audit Logging.
 *   ທຸກ write ທີ່ສຳເລັດ → AuditLog row (action `<entity>.<verb>`, actor, ip).
 *   GET ບໍ່ຂຽນ log. write ທີ່ລົ້ມ (400) ບໍ່ຂຽນ log. feed `/audit-logs` ຈັດ category ໃຫ້.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const SUPPLIER_NAME = 'ຜູ້ສະໜອງ AUDIT ທົດສອບ';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function wipe(): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { entityName: 'supplier' } });
  await prisma.supplier.deleteMany({ where: { name: SUPPLIER_NAME } });
}

/** audit ຂຽນແບບ fire-and-forget ຕອນ response finish → poll ຫາ row. */
async function waitForAudit(where: object, tries = 20): Promise<unknown> {
  for (let i = 0; i < tries; i += 1) {
    const row = await prisma.auditLog.findFirst({ where, orderBy: { createdAt: 'desc' } });
    if (row) return row;
    await sleep(50);
  }
  return null;
}

describe('Phase 6 — Audit Logging (Module 37)', () => {
  let app: Express;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    app = createApp();
    await wipe();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken;
    adminId = login.body.data.user.id;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('records a successful write with actor + action, and the feed categorises it', async () => {
    const created = await request(app)
      .post('/api/v1/suppliers')
      .set(...bearer(adminToken))
      .send({ name: SUPPLIER_NAME, phone: '020 5555 4242' });
    expect(created.status).toBe(201);
    const supplierId = created.body.data.id as string;

    const row = (await waitForAudit({ entityName: 'supplier', entityId: supplierId })) as {
      action: string;
      userId: string | null;
      newValue: unknown;
      ipAddress: string | null;
    } | null;
    expect(row).not.toBeNull();
    expect(row!.action).toBe('supplier.created');
    expect(row!.userId).toBe(adminId);
    expect(row!.newValue).toMatchObject({ name: SUPPLIER_NAME });

    const feed = await request(app)
      .get('/api/v1/audit-logs?q=supplier')
      .set(...bearer(adminToken));
    expect(feed.status).toBe(200);
    const entry = (feed.body.data.items as Array<{ action: string; category: string; actorId: string }>).find(
      (e) => e.action === 'supplier.created',
    );
    expect(entry).toBeTruthy();
    expect(entry!.category).toBe('supplier');
    expect(entry!.actorId).toBe(adminId);

    // PATCH → supplier.updated
    await request(app)
      .patch(`/api/v1/suppliers/${supplierId}`)
      .set(...bearer(adminToken))
      .send({ name: SUPPLIER_NAME, phone: '020 5555 9999' });
    const upd = await waitForAudit({ entityName: 'supplier', entityId: supplierId, action: 'supplier.updated' });
    expect(upd).not.toBeNull();

    await request(app).delete(`/api/v1/suppliers/${supplierId}`).set(...bearer(adminToken));
  });

  it('does not log GET requests or failed writes', async () => {
    const before = await prisma.auditLog.count({ where: { entityName: 'supplier' } });

    await request(app).get('/api/v1/suppliers').set(...bearer(adminToken));
    // invalid body → 400
    const bad = await request(app)
      .post('/api/v1/suppliers')
      .set(...bearer(adminToken))
      .send({ name: '' });
    expect(bad.status).toBe(400);

    await sleep(300);
    const after = await prisma.auditLog.count({ where: { entityName: 'supplier' } });
    expect(after).toBe(before);
  });
});
