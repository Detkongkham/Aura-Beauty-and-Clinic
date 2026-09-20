import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { CampaignsPage } from './CampaignsPage';

describe('CampaignsPage', () => {
  it('renders the campaigns heading and subtitle', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<CampaignsPage />, { route: '/marketing' });

    expect(screen.getByRole('heading', { level: 1, name: /campaigns/i })).toBeInTheDocument();
    expect(screen.getByText(/who it reached and who came back/i)).toBeInTheDocument();
  });

  it('shows the overview layer — stat tiles, funnel and top campaigns', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<CampaignsPage />, { route: '/marketing' });

    await waitFor(() => expect(screen.getByText('Customers reached')).toBeInTheDocument());
    expect(screen.getByText('Conversion rate')).toBeInTheDocument();
    expect(screen.getByText('Conversion funnel')).toBeInTheDocument();
    expect(screen.getByText('Top performing campaigns')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'All campaigns' })).toBeInTheDocument();
  });

  it('exposes filters, type chips and disables export while empty', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<CampaignsPage />, { route: '/marketing' });

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /birthday/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });
});
