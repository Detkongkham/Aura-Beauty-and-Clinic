import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { CustomersPage } from './CustomersPage';

describe('CustomersPage', () => {
  it('lists customers from the mock API', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<CustomersPage />, { route: '/customers' });

    expect(screen.getByRole('heading', { level: 1, name: 'Customers' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Total spent')).toBeInTheDocument();
      // at least one data row rendered (phone column shows 20287…)
      expect(screen.getAllByText(/^20287/).length).toBeGreaterThan(0);
    });
  });
});
