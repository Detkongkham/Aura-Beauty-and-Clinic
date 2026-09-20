import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { HomeServiceDispatchPage } from './HomeServiceDispatchPage';

describe('HomeServiceDispatchPage', () => {
  it('renders the dispatch heading and subtitle', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<HomeServiceDispatchPage />, { route: '/home-service/dispatch' });

    expect(
      screen.getByRole('heading', { level: 1, name: /home service dispatch/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/live status of on-demand home-service bookings/i)).toBeInTheDocument();
  });
});
