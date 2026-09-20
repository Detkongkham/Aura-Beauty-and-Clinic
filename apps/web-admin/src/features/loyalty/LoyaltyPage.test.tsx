import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { LoyaltyPage } from './LoyaltyPage';

describe('LoyaltyPage', () => {
  it('renders the loyalty heading and subtitle', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<LoyaltyPage />, { route: '/loyalty' });

    expect(screen.getByRole('heading', { level: 1, name: /loyalty/i })).toBeInTheDocument();
    expect(screen.getByText(/member points, vip tiers/i)).toBeInTheDocument();
  });

  it('shows the overview layer — stat tiles, tier mix, programme rules and leaderboard', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<LoyaltyPage />, { route: '/loyalty' });

    await waitFor(() => expect(screen.getByText('Outstanding points')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /close to upgrade/i })).toBeInTheDocument();
    expect(screen.getByText('Tier mix')).toBeInTheDocument();
    expect(screen.getByText('Redeem value')).toBeInTheDocument();
    expect(screen.getByText('Top members')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Members' })).toBeInTheDocument();
  });

  it('exposes the roster filters and disables export while the roster is empty', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<LoyaltyPage />, { route: '/loyalty' });

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: 'Tier' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });
});
