import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { ExpensesPage } from './ExpensesPage';
import { bucketTrend, detectPreset, presetRange } from './expenses.lib';
import { signInAsOwner } from './testUtils';

beforeEach(signInAsOwner);

describe('ExpensesPage', () => {
  it('renders the spend band with the delta, the action queue and the tile rail', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses' });

    expect(screen.getByRole('heading', { level: 1, name: 'Expenses' })).toBeInTheDocument();
    expect(await screen.findByText('Recognised spend')).toBeInTheDocument();
    // 1.2M vs 1.0M in the previous period → +20%
    expect(screen.getByText('+20% vs previous period')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Oldest waiting 4 days')).toBeInTheDocument();
    expect(screen.getByText('Average per day')).toBeInTheDocument();
  });

  it('lists expenses with a status pill and the next workflow action per row', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses' });

    // Rows can re-render once the summary/list queries settle — re-query inside waitFor, never hold a node.
    await waitFor(
      () => {
        const row = screen.getByText('September rent').closest('tr')!;
        expect(within(row).getByText('Awaiting approval')).toBeInTheDocument();
        expect(within(row).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
        const water = screen.getByText('Water bill').closest('tr')!;
        expect(within(water).getByRole('button', { name: 'Submit for approval' })).toBeInTheDocument();
        expect(screen.getAllByText('Electricity').map((n) => n.closest('tr')).find(Boolean)).toHaveTextContent('Paid');
      },
      { timeout: 4000 },
    );
  });

  it('opens the drawer from the URL with the workflow stepper and approver actions', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses?id=00000000-0000-4000-8000-000000000041' });

    const sheet = await screen.findByRole('dialog', {}, { timeout: 4000 });
    expect(await within(sheet).findByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(within(sheet).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(within(sheet).getByRole('list', { name: 'Approval progress' })).toBeInTheDocument();
    expect(within(sheet).getAllByText('Missing receipt').length).toBeGreaterThan(0);
  });

  it('offers edit + submit only while an expense is still a draft', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses?id=00000000-0000-4000-8000-000000000043' });

    const sheet = await screen.findByRole('dialog', {}, { timeout: 4000 });
    expect(await within(sheet).findByRole('button', { name: 'Submit for approval' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('switches to the board and groups cards into workflow lanes', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses?view=board' });

    const lane = await screen.findByRole('region', { name: 'Awaiting approval' });
    expect(await within(lane).findByText('September rent')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Draft / returned' })).getByText('Water bill')).toBeInTheDocument();
  });

  it('renders the insights view with the P&L', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses?view=insights' });

    expect(await screen.findByText('Spend trend')).toBeInTheDocument();
    expect(screen.getByText('Spend by category')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Profit & loss')).toBeInTheDocument());
    expect(screen.getByText('Net profit')).toBeInTheDocument();
  });

  it('new-expense form validates before saving', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses' });

    await user.click(await screen.findByRole('button', { name: /New expense/ }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 4000 });
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    expect(within(dialog).getByText('Enter an amount greater than 0')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a category')).toBeInTheDocument();
  });
});

describe('ExpensesPage — audit follow-ups (E1–E12)', () => {
  it('drawer shows due date / invoice / overdue callout and the change history', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses?id=00000000-0000-4000-8000-000000000041' });
    const sheet = await screen.findByRole('dialog', {}, { timeout: 4000 });
    expect(await within(sheet).findByText('INV-0901')).toBeInTheDocument();
    expect(within(sheet).getByText(/^Overdue by \d+ days?$/)).toBeInTheDocument();
    expect(await within(sheet).findByText('History')).toBeInTheDocument();
    expect(within(sheet).getByText('Edited')).toBeInTheDocument();
  });

  it('a paid expense can be voided with a reason', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses?id=00000000-0000-4000-8000-000000000042' });
    const sheet = await screen.findByRole('dialog', {}, { timeout: 4000 });
    await user.click(await within(sheet).findByRole('button', { name: 'Void' }));
    const dlg = await screen.findByRole('dialog', { name: 'Void this expense?' });
    const confirm = within(dlg).getByRole('button', { name: 'Void' });
    expect(confirm).toBeDisabled();
    await user.type(within(dlg).getByLabelText('Reason'), 'Duplicate');
    expect(confirm).toBeEnabled();
  });

  it('insights show budget vs actual with the over-budget line', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses?view=insights' });
    expect(await screen.findByText('Budget vs actual')).toBeInTheDocument();
    expect(screen.getByText('120%')).toBeInTheDocument();
    expect(screen.getAllByText('Over by').length).toBeGreaterThan(0);
  });

  it('overdue expenses surface in the attention queue and as a filter chip', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses' });
    expect(await screen.findByRole('button', { name: 'Overdue' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Overdue').length).toBeGreaterThan(1));
  });

  it('rules tab shows the approval limit and booking rates', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses' });
    await user.click(await screen.findByRole('button', { name: /Recurring & categories/ }));
    const sheet = await screen.findByRole('dialog', {}, { timeout: 4000 });
    await user.click(within(sheet).getByRole('tab', { name: /Rules/ }));
    expect(await within(sheet).findByDisplayValue('5000000')).toBeInTheDocument();
    expect(within(sheet).getByDisplayValue('600')).toBeInTheDocument();
  });
});

describe('ExpensesPage — E6 / E9 / E10', () => {
  it('drawer shows the bank-statement match and the branch split', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses?id=00000000-0000-4000-8000-000000000042' });
    const sheet = await screen.findByRole('dialog', {}, { timeout: 4000 });
    expect(await within(sheet).findByText(/^Matched /)).toBeInTheDocument();
    expect(within(sheet).getByText('Split across branches')).toBeInTheDocument();
    expect(within(sheet).getByText('Pakse')).toBeInTheDocument();
    expect(within(sheet).getByText('30%')).toBeInTheDocument();
  });

  it('petty-cash tab shows the box balance, last count and a count preview', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses' });
    await user.click(await screen.findByRole('button', { name: /Recurring & categories/ }));
    const sheet = await screen.findByRole('dialog', {}, { timeout: 4000 });
    await user.click(within(sheet).getByRole('tab', { name: /Petty cash/ }));
    expect(await within(sheet).findByText('Front desk')).toBeInTheDocument();
    expect(within(sheet).getByText(/difference -20,000/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Count' }));
    await user.type(within(sheet).getByLabelText('Counted amount'), '300000');
    expect(within(sheet).getByText(/difference -50,000/)).toBeInTheDocument();
  });

  it('owner can split a new expense across branches; shares must total 100%', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<ExpensesPage />, { route: '/payments/expenses' });
    await user.click(await screen.findByRole('button', { name: /New expense/ }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 4000 });
    const splitBtn = await within(dialog).findByRole('button', { name: 'Split this cost' });
    await user.click(splitBtn);
    expect(within(dialog).getByText('Σ 100%')).toBeInTheDocument();
    const shares = within(dialog).getAllByLabelText('Share %');
    await user.clear(shares[0]!);
    await user.type(shares[0]!, '40');
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    expect(within(dialog).getByText('Shares must add up to 100%')).toBeInTheDocument();
  });
});

describe('expenses.lib', () => {
  it('detects the preset a range came from', () => {
    expect(detectPreset(presetRange('month').from, presetRange('month').to)).toBe('month');
    expect(detectPreset(presetRange('d30').from, presetRange('d30').to)).toBe('d30');
    expect(detectPreset('2020-01-03', '2020-01-09')).toBeNull();
  });

  it('last month is the whole previous calendar month', () => {
    expect(presetRange('lastMonth', '2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetRange('lastMonth', '2026-01-02')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('buckets long ranges into weeks and keeps running totals', () => {
    const days = Array.from({ length: 70 }, (_, i) => ({ date: `d${i}`, amount: 1 }));
    const out = bucketTrend(days, days);
    expect(out).toHaveLength(10);
    expect(out[0]).toMatchObject({ amount: 7, previous: 7, cumulative: 7 });
    expect(out.at(-1)!.cumulative).toBe(70);
    expect(bucketTrend(days.slice(0, 30), [])).toHaveLength(30);
  });
});
