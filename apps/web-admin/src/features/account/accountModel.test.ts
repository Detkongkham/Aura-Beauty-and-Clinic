import type { AccountOverview } from '@abcp/shared-types';
import { describe, expect, it } from 'vitest';

import {
  groupByDay,
  groupPermissions,
  passwordAgeDays,
  passwordStrength,
  securityChecks,
  securityScore,
  splitAction,
} from './accountModel';

const NOW = Date.parse('2026-09-23T05:00:00Z');

function overview(patch: Partial<AccountOverview> = {}): AccountOverview {
  return {
    user: {
      id: 'u',
      name: 'A',
      phone: '020',
      email: null,
      role: 'STAFF',
      branchId: null,
      permissions: [],
      allowDirectMessages: false,
    },
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: null,
    lastLoginDevice: null,
    passwordChangedAt: null,
    quickLogin: { eligible: true, enabled: false, updatedAt: null },
    branch: null,
    role: null,
    staff: null,
    policy: { minPasswordLength: 8, sessionTimeoutMinutes: 60 },
    stats: { activeSessions: 1, actions30d: 0, lastActionAt: null },
    currentSessionId: null,
    ...patch,
  };
}

describe('passwordStrength', () => {
  it('never rates a below-policy password above weak', () => {
    expect(passwordStrength('', 8)).toBe(0);
    expect(passwordStrength('Ab1!', 8)).toBe(1);
  });
  it('rewards variety and length', () => {
    expect(passwordStrength('abcdefgh', 8)).toBe(1);
    expect(passwordStrength('abcdefg1', 8)).toBe(1);
    expect(passwordStrength('Abcdefg1', 8)).toBe(2);
    expect(passwordStrength('Abcdefg1!', 8)).toBe(3);
    expect(passwordStrength('Abcdefg1!xyz', 8)).toBe(4);
  });
  it('respects a stricter policy minimum', () => {
    expect(passwordStrength('Abcdefg1!', 10)).toBe(1);
  });
});

describe('security checklist', () => {
  it('falls back to account creation for password age', () => {
    expect(passwordAgeDays(overview(), NOW)).toBeGreaterThan(260);
    expect(passwordAgeDays(overview({ passwordChangedAt: '2026-09-20T05:00:00Z' }), NOW)).toBe(3);
  });
  it('scores 100 only when every check passes', () => {
    const good = overview({
      passwordChangedAt: '2026-09-01T00:00:00Z',
      avatarUrl: 'data:image/png;base64,x',
      user: { ...overview().user, email: 'a@b.la' },
    });
    expect(securityScore(securityChecks(good, NOW))).toBe(100);
    expect(securityScore(securityChecks(overview(), NOW))).toBe(25);
  });
  it('flags too many open sessions', () => {
    const many = overview({ stats: { activeSessions: 5, actions30d: 0, lastActionAt: null } });
    expect(securityChecks(many, NOW).find((c) => c.key === 'sessionsTidy')?.ok).toBe(false);
  });
});

describe('activity helpers', () => {
  it('splits action heads and verbs', () => {
    expect(splitAction('auth.password_changed')).toEqual({
      head: 'auth',
      verb: 'password_changed',
    });
    expect(splitAction('UPDATE', 'User')).toEqual({ head: 'users', verb: 'updated' });
    expect(splitAction('CREATE', 'Payment')).toEqual({ head: 'payment', verb: 'created' });
  });
  it('groups consecutive items by day', () => {
    const g = groupByDay(
      [
        { createdAt: '2026-09-23T10:00:00Z' },
        { createdAt: '2026-09-23T08:00:00Z' },
        { createdAt: '2026-09-22T08:00:00Z' },
      ],
      (iso) => iso.slice(0, 10),
    );
    expect(g.map((x) => [x.day, x.items.length])).toEqual([
      ['2026-09-23', 2],
      ['2026-09-22', 1],
    ]);
  });
  it('groups permissions by module', () => {
    const m = groupPermissions(['users:view', 'users:manage', 'dashboard:view', 'bogus']);
    expect(m.get('users')).toEqual(['view', 'manage']);
    expect(m.has('bogus')).toBe(false);
  });
});
