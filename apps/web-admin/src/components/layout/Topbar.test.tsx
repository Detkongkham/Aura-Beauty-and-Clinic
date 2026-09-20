import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/auth.store';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';
import { useUiStore } from '@/store/ui.store';

import { PageToolbar } from './PageToolbar';
import { Topbar } from './Topbar';

const ADMIN = {
  id: 'u1',
  name: 'Admin User',
  phone: '02000000000',
  role: 'SUPER_ADMIN',
  branchId: 'b1',
  permissions: [],
} as never;

describe('Topbar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useAuthStore.setState({ user: ADMIN, tokens: { accessToken: 'a', refreshToken: 'r', expiresIn: 900 }, hydrated: true });
    useUiStore.setState({ sidebarCollapsed: false, activeBranchId: 'all' });
  });

  it('renders the utility bar: search trigger, bell and account', async () => {
    renderWithProviders(<Topbar />, { route: '/appointments' });

    expect(await screen.findAllByRole('button', { name: /^search$/i })).not.toHaveLength(0);
    expect(screen.getByTestId('topbar-bell')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Admin User' })).toBeInTheDocument();
  });

  // NOTE: the bell's preview panel is deliberately not opened here. Radix's
  // Popper positioning blocks jsdom's event loop for ~8s per open in this
  // environment (reproducible with a bare <Popover>, and equally true of the
  // shipped <Combobox>), which would quadruple the whole suite's runtime for
  // one assertion. The trigger's contract is covered above.

  it('renders the breadcrumb trail in the row below', async () => {
    renderWithProviders(<PageToolbar />, { route: '/appointments' });

    expect(await screen.findByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
    expect(screen.getByText('Appointments')).toBeInTheDocument();
  });

  it('collapses the sidebar from the toggle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PageToolbar />, { route: '/' });

    await user.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    await waitFor(() => expect(useUiStore.getState().sidebarCollapsed).toBe(true));
  });

  it('switches language from the segmented toggle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Topbar />, { route: '/' });

    await user.click(screen.getByRole('button', { name: /language: ລາວ/i }));
    await waitFor(() => expect(i18n.resolvedLanguage).toBe('lo'));
    await i18n.changeLanguage('en');
  });
});
