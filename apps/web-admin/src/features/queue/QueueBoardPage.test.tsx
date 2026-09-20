import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@abcp/shared-types';
import { useAuthStore } from '@/features/auth/auth.store';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { QueueBoardPage } from './QueueBoardPage';
import { estimateStartTimes } from './queue.lib';
import type { QueueTicket } from '@/types/models';

function signIn() {
  useAuthStore.getState().setSession({
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Admin',
      phone: '2021000001',
      email: null,
      role: 'SUPER_ADMIN',
      branchId: null,
      permissions: [...PERMISSIONS],
      allowDirectMessages: false,
    },
    tokens: { accessToken: 'mock-access.x', refreshToken: 'mock-refresh.x', expiresIn: 900 },
  });
  useAuthStore.getState().setHydrated(true);
}

describe('QueueBoardPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    signIn();
  });

  it('renders the work view and switches to the summary view from the mock API', async () => {
    renderWithProviders(<QueueBoardPage />, { route: '/queue' });

    expect(screen.getByRole('heading', { level: 1, name: 'Queue' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/^A0\d\d$/).length).toBeGreaterThan(0));
    expect(screen.getByRole('region', { name: 'Queue control' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hourly flow' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Summary/ }));
    expect(await screen.findByRole('tab', { name: /Completed/ })).toBeInTheDocument();
  });

  it('opens the ticket detail sheet from a card', async () => {
    renderWithProviders(<QueueBoardPage />, { route: '/queue' });
    const lane = await screen.findByRole('region', { name: /^Waiting/ });
    const openers = await within(lane).findAllByRole('button', { name: /^View details A0/ });
    fireEvent.click(openers[0]!);
    expect(await screen.findByText('Ticket details')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Timeline' })).toBeInTheDocument();
  });
});

describe('estimateStartTimes', () => {
  const base = (id: string, extra: Partial<QueueTicket> = {}): QueueTicket => ({
    id,
    number: id,
    branchId: 'b',
    customerName: id,
    serviceName: 's',
    serviceDurationMin: 30,
    staffName: null,
    status: 'WAITING',
    issuedAt: new Date(0).toISOString(),
    calledAt: null,
    ...extra,
  });

  it('queues work behind busy staff and idle capacity', () => {
    const now = 60 * 60_000;
    const busy = base('busy', { status: 'IN_SERVICE', startedAt: new Date(now - 10 * 60_000).toISOString() });
    const eta = estimateStartTimes([], [base('w1'), base('w2'), base('w3')], [busy], 2, now);
    expect(eta.get('w1')).toBe(0); // one idle staff member
    expect(eta.get('w2')).toBe(20); // busy one frees up after 20 more minutes
    expect(eta.get('w3')).toBe(30); // idle one is free again after w1's 30 minutes
  });
});
