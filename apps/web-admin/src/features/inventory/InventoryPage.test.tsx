import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { InventoryPage } from './InventoryPage';

describe('InventoryPage', () => {
  it('renders the products screen with stat cards and the tab row', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<InventoryPage />, { route: '/inventory' });

    expect(screen.getByRole('heading', { level: 1, name: /inventory/i })).toBeInTheDocument();
    expect(screen.getByTestId('tab-products')).toBeInTheDocument();
    expect(screen.getByTestId('tab-purchaseOrders')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Total products')).toBeInTheDocument();
    });
  });
});
