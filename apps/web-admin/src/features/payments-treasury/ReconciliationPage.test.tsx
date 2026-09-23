import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { ReconciliationPage } from './ReconciliationPage';
import { signInAsOwner } from './testUtils';

beforeEach(signInAsOwner);

async function renderPage(route = '/payments/reconciliation') {
  await i18n.changeLanguage('en');
  renderWithProviders(<ReconciliationPage />, { route });
  await waitFor(() => expect(screen.getAllByText('Aura Clinic Main').length).toBeGreaterThan(0));
}

describe('ReconciliationPage', () => {
  it('classifies each account-day and signs the difference', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Reconciliation' })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Matched')).toBeInTheDocument();
    expect(within(table).getByText('No statement')).toBeInTheDocument();
    // the ₭50,000 difference is signed and labelled, not colour-only
    expect(within(table).getAllByText(/^\+/).length).toBeGreaterThan(0);
    // who checked it is on the row
    expect(within(table).getAllByText('Owner').length).toBe(2);
  });

  it('health band shows progress and routes to the oldest missing statement', async () => {
    await renderPage();
    const health = screen.getByRole('region', { name: 'Reconciliation health' });
    expect(within(health).getByText('account-days checked against the bank')).toBeInTheDocument();
    expect(within(health).getByText('33% tie out')).toBeInTheDocument();
    expect(within(health).getByText('1 statement line not matched')).toBeInTheDocument();
    expect(within(health).getByText('Largest difference')).toBeInTheDocument();
    expect(within(health).getByText('Oldest day without a statement')).toBeInTheDocument();
  });

  it('explains likely causes: open slips and unbooked webhook events', async () => {
    await renderPage();
    expect(await screen.findByText('2 slips still waiting for review')).toBeInTheDocument();
    expect(screen.getByText('1 webhook events were not booked')).toBeInTheDocument();
    expect(screen.getByText(/amount does not match the bill/)).toBeInTheDocument();
  });

  it('status chips filter the ledger', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: /^Matched\s*1$/ }));
    const table = screen.getByRole('table');
    await waitFor(() => expect(within(table).queryByText('No statement')).not.toBeInTheDocument());
    expect(within(table).getByText('Matched')).toBeInTheDocument();
  });

  it('opens the day drawer with empty inputs, the lines behind the total, and a live preview', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: 'Next missing statement' }));
    const drawer = await screen.findByRole('dialog');
    // never pre-filled with the system figures
    const credit = within(drawer).getByLabelText('Statement — money in');
    expect(credit).toHaveValue(null);
    expect(within(drawer).getByRole('button', { name: 'Save' })).toBeDisabled();
    // the transactions behind the ₭1,000,000
    expect(await within(drawer).findByText('Somchai K.')).toBeInTheDocument();
    expect(within(drawer).getByText('Noy P.')).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: 'Use system totals' }));
    expect(credit).toHaveValue(1000000);
    expect(within(drawer).getByText('Will be saved as')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Save' })).toBeEnabled();

    await user.clear(credit);
    await user.type(credit, '990000');
    // a difference asks for a note, and the hint lists the likely causes
    expect(within(drawer).getByText(/Write down the cause/)).toBeInTheDocument();
    expect(within(drawer).getByText('The bank shows less than the system booked')).toBeInTheDocument();
  });

  it('calendar view renders an account × day matrix of labelled cells', async () => {
    await renderPage('/payments/reconciliation?view=calendar&from=2026-09-18&to=2026-09-20');
    const cell = await screen.findByRole('button', { name: /Aura Clinic Main · Difference/ });
    expect(cell).toBeInTheDocument();
    expect(screen.getByText('Account × day')).toBeInTheDocument();
  });

  it('accounts view shows one card per account with its last statement', async () => {
    await renderPage('/payments/reconciliation?view=accounts&from=2026-09-01&to=2026-09-20');
    expect(await screen.findAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getAllByText(/Last statement/).length).toBe(2);
  });

  it('an explained difference shows its reason and counts as explained', async () => {
    await renderPage();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Explained')).toBeInTheDocument();
    expect(within(table).getByText('Bank fee')).toBeInTheDocument();
    expect(within(table).getByText('net')).toBeInTheDocument();
  });

  it('day drawer: statement lines with match actions, balance checks and the explain panel', async () => {
    const user = userEvent.setup();
    await renderPage('/payments/reconciliation?day=2026-09-19%7C00000000-0000-4000-8000-000000000011');
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('Bank statement lines')).toBeInTheDocument();
    expect(within(drawer).getByText('Auto-matched')).toBeInTheDocument();
    expect(within(drawer).getByText('Opening + in − out = closing')).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: /Find match/ }));
    const candidates = await within(drawer).findByRole('list', { name: 'Possible matches' });
    expect(within(candidates).getByText('exact amount')).toBeInTheDocument();

    expect(within(drawer).getByRole('heading', { name: 'Explain this difference' })).toBeInTheDocument();
    const approve = within(drawer).getByRole('button', { name: 'Approve explanation' });
    expect(approve).toBeDisabled();
    await user.click(within(drawer).getByRole('radio', { name: 'Slip not booked yet' }));
    expect(approve).toBeEnabled();
    await user.click(within(drawer).getByRole('button', { name: /Change history/ }));
    expect(await within(drawer).findByText('Changed')).toBeInTheDocument();
  });

  it('import dialog: previews detected columns before anything is saved', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: 'Import statement' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Choose CSV file');
    await user.upload(input, new File(['Date,Description,Reference,Credit,Balance\n19/09/2026,Transfer,BCEL123,"50,000","1,850,000"'], 's.csv', { type: 'text/csv' }));
    expect(await within(dialog).findByText('Columns detected automatically')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Import 2 rows' })).toBeEnabled();
  });

  it('month close dialog lists what blocks the close', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: 'Close month' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Every day has a statement')).toBeInTheDocument();
    expect(within(dialog).getByText('Fix the open items first.')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: 'Close month' }).at(-1)).toBeDisabled();
    expect(within(dialog).getByText('Closed months')).toBeInTheDocument();
  });

  it('cash drawer: expected cash breakdown and a banknote count that shows over/short', async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage('en');
    renderWithProviders(<ReconciliationPage />, { route: '/payments/reconciliation?view=cash&branch=11111111-1111-1111-1111-111111111111' });
    expect(await screen.findByText('Should be in the drawer now')).toBeInTheDocument();
    expect(screen.getByText('Cash sales (7)')).toBeInTheDocument();
    expect(screen.getByText('Change given twice')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Count & close' }));
    const hundredK = screen.getByLabelText(/^[^0-9]*100,000[^0-9]*$/);
    await user.type(hundredK, '7');
    // 7 × 100,000 = the expected 700,000 → exact, no note needed
    expect(await screen.findByText('exact')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close shift' })).toBeEnabled();
    await user.clear(hundredK);
    await user.type(hundredK, '8');
    expect(await screen.findByText('Over')).toBeInTheDocument();
    const closeBtn = screen.getByRole('button', { name: 'Close shift' });
    expect(closeBtn).toBeDisabled();
    await user.type(screen.getByLabelText(/Note \(required/), 'tip jar mixed in');
    expect(closeBtn).toBeEnabled();
  });
});
