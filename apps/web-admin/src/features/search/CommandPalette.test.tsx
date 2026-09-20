import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { CommandPalette } from './CommandPalette';

describe('CommandPalette', () => {
  it('shows navigation items and searches across entities', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<CommandPalette open onOpenChange={() => {}} />, { route: '/' });

    // static navigate items visible immediately
    expect(screen.getByText('Dashboard')).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText(/Type to search/i),
      'ຈັດແຕ່ງ',
    );
    await waitFor(() => {
      expect(screen.getAllByText(/ຈັດແຕ່ງຊົງເອກະລັກ/).length).toBeGreaterThan(0);
    });
  });
});
