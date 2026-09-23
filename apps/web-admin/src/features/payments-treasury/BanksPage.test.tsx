import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { BanksPage } from './BanksPage';
import { signInAsOwner } from './testUtils';

beforeEach(signInAsOwner);

describe('BanksPage', () => {
  it('shows the receiving accounts with the default flagged and numbers masked', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<BanksPage />, { route: '/payments/banks' });

    expect(screen.getByRole('heading', { level: 1, name: /banks & channels/i })).toBeInTheDocument();
    const accounts = await screen.findByRole('region', { name: /receiving accounts/i });
    await waitFor(() => expect(within(accounts).getByText('Aura Clinic Main')).toBeInTheDocument());
    expect(within(accounts).getByText('Aura Clinic LDB')).toBeInTheDocument();
    expect(within(accounts).getByText('Default')).toBeInTheDocument();
    // full account number never printed in the list — only the tail
    expect(screen.queryByText('010120000123456')).not.toBeInTheDocument();
    expect(screen.getByText(/BCEL · •+3456/)).toBeInTheDocument();
  });

  it('lists the payment channels with mode, health and the webhook path', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<BanksPage />, { route: '/payments/banks' });

    await waitFor(() => expect(screen.getByText('BCEL One (simulated)')).toBeInTheDocument());
    expect(screen.getAllByText('Simulated').length).toBeGreaterThan(0);
    expect(screen.getByText('/api/v1/payments/webhooks/MOCK_BCEL')).toBeInTheDocument();
    expect(screen.getByText('Webhook secret ready')).toBeInTheDocument();
    expect(screen.getByText('Webhook secret is not configured')).toBeInTheDocument();
  });

  it('asks for an explicit risk confirmation before turning on auto-confirm', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<BanksPage />, { route: '/payments/banks' });

    const toggle = await screen.findByRole('switch', { name: 'Auto-confirm matching slips' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Turn on auto-confirm?')).toBeInTheDocument();
    expect(within(dialog).getByText(/forged slip/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('switch', { name: 'Auto-confirm matching slips' })).toHaveAttribute('aria-checked', 'false');
  });

  it('opens the add-account dialog', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<BanksPage />, { route: '/payments/banks' });

    await user.click(await screen.findByRole('button', { name: /add account/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Account number')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows the period inflow, the go-live checklist and the unassigned-transfer warning', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<BanksPage />, { route: '/payments/banks' });

    expect(await screen.findByRole('heading', { name: 'Money received · last 30 days' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Go-live checklist' })).toBeInTheDocument();
    // LDB has 1 variance day + 3 unreconciled days in the mock; Main has no QR image
    expect(await screen.findByText("1 account-day doesn't match the bank")).toBeInTheDocument();
    expect(screen.getByText('3 account-days still need a statement')).toBeInTheDocument();
    expect(screen.getByText('1 account is missing its QR image')).toBeInTheDocument();
    expect(screen.getByText(/1 transfer \(₭ 150,000\) isn't linked to any account/)).toBeInTheDocument();
  });

  it('switching the period updates the band title', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<BanksPage />, { route: '/payments/banks' });

    await user.click(await screen.findByRole('button', { name: '7 days' }));
    expect(await screen.findByRole('heading', { name: 'Money received · last 7 days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens the account drawer with the payer view and the full, grouped number', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<BanksPage />, { route: '/payments/banks' });

    await user.click(await screen.findByRole('button', { name: 'Open details of Aura Clinic LDB' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('What the payer sees')).toBeInTheDocument();
    expect(within(sheet).getByText('2200 9988 77')).toBeInTheDocument();
    expect(within(sheet).getByText('Figures don\'t match')).toBeInTheDocument();
    expect(within(sheet).getByText('2 slips waiting for review')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: /review/i })).toHaveAttribute('href', '/payments/slips');
  });

  it('the attention tile filters the cards down to accounts that need a look', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<BanksPage />, { route: '/payments/banks' });

    await screen.findByText('Aura Clinic Main');
    const tile = await screen.findByRole('button', { name: /need attention/i });
    await user.click(tile);
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    // Main is only missing its QR (attention) and LDB has a variance (critical) — both stay
    const accounts = screen.getByRole('region', { name: /receiving accounts/i });
    expect(within(accounts).getByText('Aura Clinic Main')).toBeInTheDocument();
    expect(within(accounts).getByText('Aura Clinic LDB')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove filter' }));
    expect(tile).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches to the dense table view', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<BanksPage />, { route: '/payments/banks' });

    await user.click(await screen.findByRole('button', { name: 'Table' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Aura Clinic Main')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Received · 30 days' })).toBeInTheDocument();
  });
});

