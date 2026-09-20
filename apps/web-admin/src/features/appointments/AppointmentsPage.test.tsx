import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@abcp/shared-types';
import { useAuthStore } from '@/features/auth/auth.store';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { AppointmentsPage } from './AppointmentsPage';

const ROUTE = '/appointments?range=all';

/** The console's write actions are permission-gated; sign in for every test. */
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

beforeEach(signIn);

describe('AppointmentsPage', () => {
  it('renders the table view with rows from the mock API', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<AppointmentsPage />, { route: ROUTE });

    expect(screen.getByRole('heading', { level: 1, name: 'Appointments' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    });
    expect(screen.queryByText('No appointments found')).not.toBeInTheDocument();
  });

  it('renders the attention band once the server summary resolves', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<AppointmentsPage />, { route: ROUTE });

    // Every figure in this band comes from GET /appointments/summary, so its
    // presence is the proof the page is no longer adding up rows client-side.
    expect(await screen.findByRole('heading', { name: 'Needs action' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Overdue/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deposit due/ })).toBeInTheDocument();
  });

  it('switches to the board view', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<AppointmentsPage />, { route: ROUTE });

    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));

    const board = screen.getByRole('button', { name: 'Board' });
    await user.click(board);

    await waitFor(() => expect(board).toHaveAttribute('aria-pressed', 'true'));
    // Board lanes are headed by the status names.
    expect(await screen.findByRole('heading', { name: 'Confirmed' })).toBeInTheDocument();
  });
});

describe('AppointmentsPage — conflicts and booking', () => {
  it('offers the double-booking quick filter', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<AppointmentsPage />, { route: ROUTE });

    // The tile is fed by summary.ops.conflicts and filters via ?flag=conflict.
    const tile = await screen.findByRole('button', { name: /Double-booked/ });
    expect(tile).toBeInTheDocument();
    expect(tile).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the booking sheet from the header action', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<AppointmentsPage />, { route: ROUTE });

    await user.click(await screen.findByRole('button', { name: 'New booking' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Pick an open slot')).toBeInTheDocument();
    // Nothing can be booked until a real slot has been chosen.
    expect(within(dialog).getByRole('button', { name: /Confirm booking/ })).toBeDisabled();
  });

  it('switches the timeline between time and staff layouts', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<AppointmentsPage />, { route: ROUTE });

    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
    await user.click(screen.getByRole('button', { name: 'Timeline' }));

    const byStaff = await screen.findByRole('button', { name: 'By staff' });
    await user.click(byStaff);
    await waitFor(() => expect(byStaff).toHaveAttribute('aria-pressed', 'true'));
  });
});
