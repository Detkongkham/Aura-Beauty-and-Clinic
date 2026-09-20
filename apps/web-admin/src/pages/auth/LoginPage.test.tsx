import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/auth.store';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    useAuthStore.getState().setHydrated(false);
    return i18n.changeLanguage('en');
  });
  afterEach(() => useAuthStore.getState().clear());

  it('signs in an admin and stores the session', async () => {
    renderWithProviders(<LoginPage />, { route: '/login' });

    await userEvent.type(screen.getByLabelText('Phone number'), '2021000001');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(useAuthStore.getState().user?.role).toBe('SUPER_ADMIN');
      expect(useAuthStore.getState().tokens?.accessToken).toBeTruthy();
    });
  });

  it('shows an inline error on bad credentials', async () => {
    renderWithProviders(<LoginPage />, { route: '/login' });

    await userEvent.type(screen.getByLabelText('Phone number'), '2021000001');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/ບໍ່ຖືກຕ້ອງ|incorrect|invalid/i);
    expect(useAuthStore.getState().tokens).toBeNull();
  });
});
