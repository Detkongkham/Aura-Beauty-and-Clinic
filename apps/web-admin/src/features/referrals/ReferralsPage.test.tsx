import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { ReferralsPage } from './ReferralsPage';

describe('ReferralsPage', () => {
  it('renders the referrals heading and subtitle', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ReferralsPage />, { route: '/referrals' });

    expect(screen.getByRole('heading', { level: 1, name: /referrals/i })).toBeInTheDocument();
    expect(screen.getByText(/affiliate partners earn a commission/i)).toBeInTheDocument();
  });

  it('shows the overview layer — stat tiles, commission split and leaderboard', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ReferralsPage />, { route: '/referrals' });

    await waitFor(() => expect(screen.getByText('Referred customers')).toBeInTheDocument());
    expect(screen.getByText('Total earnings')).toBeInTheDocument();
    expect(screen.getByText('Commission flow')).toBeInTheDocument();
    expect(screen.getByText('Top earning partners')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Affiliate partners' })).toBeInTheDocument();
  });

  it('exposes the roster filters and disables export while the roster is empty', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ReferralsPage />, { route: '/referrals' });

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: 'Rate' })).toBeInTheDocument();
    expect(screen.getByLabelText('Owing only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });
});
