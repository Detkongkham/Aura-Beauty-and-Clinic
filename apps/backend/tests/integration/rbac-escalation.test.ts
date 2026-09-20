import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/password.js';

/**
 * Integration — backend permission gates + anti-escalation rules.
 * Before: `/users`, `/roles`, `/branches/:id`, `/branch-closures`, `/services` writes only checked the
 * coarse role, so any BRANCH_ADMIN could create a SUPER_ADMIN or grant itself permissions.
 * ຕ້ອງມີ PostgreSQL (abcp_test) + `pnpm db:seed`.
 */
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const MANAGER_PHONE = '02000000001'; // seeded BRANCH_ADMIN, no users:* permissions
const MANAGER_PASSWORD = 'Manager@12345';

// Test-owned accounts — cleaned up by phone prefix.
const DELEGATE_PHONE = '02099910001'; // BRANCH_ADMIN + override users:view/users:manage
const CREATED_PHONE = '02099910002';
const SUPER_ONLY_PHONE = '02099910003';
const DELEGATE_PASSWORD = 'Delegate@12345';
const ROLE_PREFIX = 'rbac-escalation-test';

async function cleanup() {
  const phones = [DELEGATE_PHONE, CREATED_PHONE, SUPER_ONLY_PHONE];
  const users = await prisma.user.findMany({ where: { phone: { in: phones } }, select: { id: true } });
  await prisma.userPermissionOverride.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  await prisma.role.deleteMany({ where: { name: { startsWith: ROLE_PREFIX } } });
}

describe('RBAC — permission gates + anti-escalation', () => {
  let app: Express;
  let adminToken: string;
  let managerToken: string;
  let delegateToken: string;
  let delegateId: string;
  let superAdminId: string;

  const login = async (phone: string, password: string) =>
    (await request(app).post('/api/v1/auth/login').send({ phone, password })).body.data.tokens
      .accessToken as string;

  beforeAll(async () => {
    app = createApp();
    await cleanup();
    adminToken = await login(ADMIN_PHONE, ADMIN_PASSWORD);
    managerToken = await login(MANAGER_PHONE, MANAGER_PASSWORD);
    superAdminId = (await prisma.user.findUniqueOrThrow({ where: { phone: ADMIN_PHONE } })).id;

    const manager = await prisma.user.findUniqueOrThrow({ where: { phone: MANAGER_PHONE } });
    const delegate = await prisma.user.create({
      data: {
        name: 'RBAC Delegate',
        phone: DELEGATE_PHONE,
        password: await hashPassword(DELEGATE_PASSWORD),
        role: 'BRANCH_ADMIN',
        branchId: manager.branchId,
      },
    });
    delegateId = delegate.id;
    await prisma.userPermissionOverride.createMany({
      data: [
        { userId: delegate.id, permission: 'users:view', granted: true },
        { userId: delegate.id, permission: 'users:manage', granted: true },
      ],
    });
    delegateToken = await login(DELEGATE_PHONE, DELEGATE_PASSWORD);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: object) =>
      request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url: string, body: object) =>
      request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
    put: (url: string, body: object) =>
      request(app).put(url).set('Authorization', `Bearer ${token}`).send(body),
  });

  it('BRANCH_ADMIN without users:/branches:/services:manage is blocked before validation (403, not 400)', async () => {
    const m = as(managerToken);
    const zero = '00000000-0000-0000-0000-000000000000';
    expect((await m.get('/api/v1/users')).status).toBe(403);
    expect((await m.post('/api/v1/users', {})).status).toBe(403);
    expect((await m.put(`/api/v1/users/${zero}/permissions`, {})).status).toBe(403);
    expect((await m.post(`/api/v1/users/${zero}/quick-login`, {})).status).toBe(403);
    expect((await m.get('/api/v1/roles')).status).toBe(403);
    expect((await m.post('/api/v1/roles', {})).status).toBe(403);
    expect((await m.patch(`/api/v1/branches/${zero}`, {})).status).toBe(403);
    expect((await m.post('/api/v1/branch-closures', {})).status).toBe(403);
    expect((await m.post('/api/v1/services', {})).status).toBe(403);
    expect((await m.post('/api/v1/service-categories', {})).status).toBe(403);
    // reads they are entitled to still work
    expect((await m.get('/api/v1/branches')).status).toBe(200);
    expect((await m.get('/api/v1/services')).status).toBe(200);
  });

  it('SUPER_ADMIN still passes the gates', async () => {
    const a = as(adminToken);
    expect((await a.get('/api/v1/users')).status).toBe(200);
    expect((await a.get('/api/v1/roles')).status).toBe(200);
  });

  it('users:manage delegate cannot create or promote to SUPER_ADMIN', async () => {
    const d = as(delegateToken);
    const res = await d.post('/api/v1/users', {
      name: 'Should Fail',
      phone: SUPER_ONLY_PHONE,
      role: 'SUPER_ADMIN',
    });
    expect(res.status).toBe(403);
    expect(await prisma.user.findUnique({ where: { phone: SUPER_ONLY_PHONE } })).toBeNull();

    const ok = await d.post('/api/v1/users', {
      name: 'Created By Delegate',
      phone: CREATED_PHONE,
      role: 'BRANCH_ADMIN',
    });
    expect(ok.status).toBe(201);
    const promote = await d.patch(`/api/v1/users/${ok.body.data.id}`, { role: 'SUPER_ADMIN' });
    expect(promote.status).toBe(403);
  });

  it('delegate cannot touch a SUPER_ADMIN account (edit, permissions, quick-login PIN)', async () => {
    const d = as(delegateToken);
    expect((await d.patch(`/api/v1/users/${superAdminId}`, { name: 'Hijacked' })).status).toBe(403);
    expect(
      (await d.put(`/api/v1/users/${superAdminId}/permissions`, { overrides: [] })).status,
    ).toBe(403);
    expect(
      (await d.post(`/api/v1/users/${superAdminId}/quick-login`, { pin: '1234' })).status,
    ).toBe(403);
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: superAdminId } });
    expect(admin.name).not.toBe('Hijacked');
  });

  it('delegate cannot change its own role or permissions', async () => {
    const d = as(delegateToken);
    expect((await d.patch(`/api/v1/users/${delegateId}`, { role: 'SUPER_ADMIN' })).status).toBe(403);
    expect(
      (
        await d.put(`/api/v1/users/${delegateId}/permissions`, {
          overrides: [{ permission: 'settings:manage', granted: true }],
        })
      ).status,
    ).toBe(403);
  });

  it('delegate cannot grant permissions it does not hold (user overrides + roles)', async () => {
    const d = as(delegateToken);
    const created = await prisma.user.findUniqueOrThrow({ where: { phone: CREATED_PHONE } });

    const tooMuch = await d.put(`/api/v1/users/${created.id}/permissions`, {
      overrides: [{ permission: 'settings:manage', granted: true }],
    });
    expect(tooMuch.status).toBe(403);
    const fine = await d.put(`/api/v1/users/${created.id}/permissions`, {
      overrides: [{ permission: 'users:view', granted: true }],
    });
    expect(fine.status).toBe(200);

    const badRole = await d.post('/api/v1/roles', {
      name: `${ROLE_PREFIX}-too-much`,
      color: '#123456',
      permissions: ['settings:manage'],
    });
    expect(badRole.status).toBe(403);
    const goodRole = await d.post('/api/v1/roles', {
      name: `${ROLE_PREFIX}-ok`,
      color: '#123456',
      permissions: ['dashboard:view'],
    });
    expect(goodRole.status).toBe(201);
  });

  it('revoking a permission takes effect immediately (read from DB, not the JWT)', async () => {
    await prisma.userPermissionOverride.deleteMany({ where: { userId: delegateId } });
    expect((await as(delegateToken).get('/api/v1/users')).status).toBe(403);
  });
});
