import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { EndOfDayPage } from './EndOfDayPage';

describe('EndOfDayPage (reports hub)', () => {
  it('renders the overview with KPI figures from the dashboard stats endpoint', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<EndOfDayPage />, { route: '/reports' });

    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Revenue by day' })).toBeInTheDocument();
    });
    expect(screen.getByText('Headline figures')).toBeInTheDocument();
    expect(screen.getByText('Average ticket')).toBeInTheDocument();
    expect(screen.getByText('Completion rate')).toBeInTheDocument();
    expect(screen.getByText('Staff performance')).toBeInTheDocument();
  });

  it('opens the standard End-of-day report from its tab', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<EndOfDayPage />, { route: '/reports' });

    await user.click(screen.getByRole('tab', { name: 'Standard reports' }));

    const panel = await screen.findByRole('heading', { name: 'End-of-day summary' });
    expect(panel).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Top services')).toBeInTheDocument();
      expect(screen.getByText('Deposits')).toBeInTheDocument();
    });
  });

  it('groups the custom report by a chosen dimension', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<EndOfDayPage />, { route: '/reports' });

    await user.click(screen.getByRole('tab', { name: 'Custom report' }));
    expect(await screen.findByText('Report designer')).toBeInTheDocument();
    expect(await screen.findByText(/Service × /)).toBeInTheDocument();
    expect((await screen.findAllByRole('table')).length).toBeGreaterThan(0);

    // switching the grouping dimension re-renders the document
    await user.selectOptions(screen.getByDisplayValue('Service'), 'Staff');
    expect(await screen.findByText(/Staff × /)).toBeInTheDocument();
  });
});
