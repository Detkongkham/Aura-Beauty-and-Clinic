import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@abcp/shared-types';
import { useAuthStore } from '@/features/auth/auth.store';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { CategoriesPage } from './CategoriesPage';

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

describe('CategoriesPage', () => {
  it('edits a category name through the dialog', async () => {
    await i18n.changeLanguage('en');
    asSuperAdmin();
    renderWithProviders(<CategoriesPage />, { route: '/services/categories' });

    const cell = await screen.findByText('ຜົມ');
    const row = cell.closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Edit category')).toBeInTheDocument();

    const input = within(dialog).getByLabelText('Name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Hair Studio');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('Hair Studio')).toBeInTheDocument();
    });
  });
});
