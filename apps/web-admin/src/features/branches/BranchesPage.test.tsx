import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { signInAsOwner } from '@/features/payments-treasury/testUtils';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { BranchesPage } from './BranchesPage';

beforeEach(signInAsOwner);

describe('BranchesPage', () => {
  it('opens on the province map by default', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<BranchesPage />, { route: '/branches' });

    expect(await screen.findByRole('heading', { level: 2, name: 'Branches by province' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders the network band, attention list and branch cards', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<BranchesPage />, { route: '/branches?view=cards' });

    expect(screen.getByRole('heading', { level: 1, name: /branch network/i })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: /network revenue/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /needs attention/i })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelectorAll('[data-testid^="branch-card-"]').length).toBeGreaterThan(0));
  });

  it('switches to the compare table and opens a branch in the detail sheet', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<BranchesPage />, { route: '/branches' });

    await user.click(await screen.findByRole('button', { name: 'Compare' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: /revenue/i })).toHaveAttribute('aria-sort', 'descending');

    const firstRowButton = within(table).getAllByRole('button').find((b) => b.closest('tbody'));
    await user.click(firstRowButton!);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Work in this branch')).toBeInTheDocument();
    expect(within(sheet).getByText('Setup')).toBeInTheDocument();
  });
});
