import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@abcp/shared-types';
import { useAuthStore } from '@/features/auth/auth.store';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { ServicesPage } from './ServicesPage';

function asSuperAdmin() {
  useAuthStore.getState().setSession({
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Admin',
      phone: '2021000001',
      email: null,
      role: 'SUPER_ADMIN',
      branchId: null,
      permissions: [...PERMISSIONS],
      allowDirectMessages: false,
    },
    tokens: { accessToken: 'mock-access.x', refreshToken: 'mock-refresh.x', expiresIn: 900 },
  });
  useAuthStore.getState().setHydrated(true);
}

describe('ServicesPage', () => {
  it('lists services from the mock API and can open the create sheet', async () => {
    await i18n.changeLanguage('en');
    asSuperAdmin();
    renderWithProviders(<ServicesPage />, { route: '/services' });

    await waitFor(() => {
      expect(screen.getByText('ຕັດ & ຈັດແຕ່ງຊົງເອກະລັກ')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Add service' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Add service')).toBeInTheDocument();
  });

  it('shows the aggregated stats strip and by-category bars', async () => {
    await i18n.changeLanguage('en');
    asSuperAdmin();
    renderWithProviders(<ServicesPage />, { route: '/services' });

    await waitFor(() => {
      expect(screen.getByText('Total services')).toBeInTheDocument();
    });
    expect(screen.getByText('Avg. price')).toBeInTheDocument();
    expect(screen.getByText('Services by category')).toBeInTheDocument();

    // The active/inactive card is a toggle that drives the list filter.
    await userEvent.click(screen.getByRole('button', { name: /Active \/ inactive/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Active \/ inactive/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });
});
