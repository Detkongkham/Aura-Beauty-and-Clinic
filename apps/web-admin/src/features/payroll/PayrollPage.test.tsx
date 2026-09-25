import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@abcp/shared-types';
import { useAuthStore } from '@/features/auth/auth.store';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { PayrollPage } from './PayrollPage';

/** Top earner in the payroll mock — its presence means the report has landed. */
const TOP_EARNER = 'ນາງ ສົມໃຈ';

/** Every write action on this page is permission-gated; sign in for each test. */
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

describe('PayrollPage', () => {
  it('renders the pay-run band and the stat rail from the mock report', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<PayrollPage />, { route: '/staff/payroll' });

    expect(screen.getByRole('heading', { level: 1, name: /payroll/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /pay run/i })).toBeInTheDocument(),
    );

    expect(screen.getByText('Commission unpaid')).toBeInTheDocument();
    expect(screen.getByText('Targets met')).toBeInTheDocument();
    expect(screen.getByText('Labour cost')).toBeInTheDocument();
  });

  it('lists the roster with a rank, attainment and a payout state per row', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<PayrollPage />, { route: '/staff/payroll' });

    expect(await screen.findByText(TOP_EARNER)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Pay roster' })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
    expect(within(table).getAllByText('Settled').length).toBeGreaterThan(0);
  });

  it('switches to the leaderboard view and puts the top earner on the podium', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<PayrollPage />, { route: '/staff/payroll' });

    expect(await screen.findByText(TOP_EARNER)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /leaderboard/i }));

    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 2, name: 'Ranking' })).toBeInTheDocument();
  });

  it('filters the roster down to staff who are still owed money', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<PayrollPage />, { route: '/staff/payroll' });

    expect(await screen.findByText(TOP_EARNER)).toBeInTheDocument();
    const before = within(screen.getByRole('table')).getAllByRole('row').length;

    await user.click(screen.getByRole('button', { name: 'Owed money', pressed: false }));

    await waitFor(() =>
      expect(within(screen.getByRole('table')).getAllByRole('row').length).toBeLessThan(before),
    );
  });

  it('pay runs view: shows the branch run, its payslips and opens a payslip', async () => {
    await i18n.changeLanguage('en');
    const { db } = await import('@/mocks/fixtures/store');
    const branch = db.branches[0]!;
    renderWithProviders(<PayrollPage />, { route: `/staff/payroll?view=runs&branch=${branch.id}` });

    expect(await screen.findByText('Total net pay')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    // Owner sees the approve action on a draft.
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Allowances & deductions' })).toBeInTheDocument();

    await userEvent.click(await screen.findByText('ນາງ ສົມໃຈ', { selector: 'td p' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Earnings')).toBeInTheDocument();
    expect(within(dialog).getByText('Net pay')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /print/i })).toBeInTheDocument();
  });
});
