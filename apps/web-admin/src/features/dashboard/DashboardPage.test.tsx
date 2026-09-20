import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  beforeEach(() => {
    try {
      window.localStorage.removeItem('aura.dashboard.days');
    } catch {
      /* ignore */
    }
  });

  it('renders stat cards and resolves values from the mock API', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<DashboardPage />, { route: '/' });

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Revenue today')).toBeInTheDocument();

    // charts + range note only appear once the query resolves
    await waitFor(() => {
      expect(screen.getByText(/bookings total/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Revenue trend (14 days)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeInTheDocument();
    expect(screen.getByText("Today's schedule")).toBeInTheDocument();
    expect(screen.getByText('Cash & receivables')).toBeInTheDocument();
    expect(screen.getByText('Customer health')).toBeInTheDocument();
    expect(screen.getByText('Stock watch')).toBeInTheDocument();
  });

  it('switches the analysis period and remembers it', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<DashboardPage />, { route: '/' });
    await waitFor(() => expect(screen.getByText('Revenue trend (14 days)')).toBeInTheDocument());

    const seven = screen.getByRole('radio', { name: '7 days' });
    fireEvent.click(seven);
    expect(seven).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(screen.getByText('Revenue trend (7 days)')).toBeInTheDocument());
    expect(window.localStorage.getItem('aura.dashboard.days')).toBe('7');
  });
});
