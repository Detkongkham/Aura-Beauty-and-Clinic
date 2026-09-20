import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { ResourcesPage } from './ResourcesPage';

describe('ResourcesPage', () => {
  it('renders the resources heading and subtitle', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<ResourcesPage />, { route: '/resources' });

    expect(
      screen.getByRole('heading', { level: 1, name: /rooms & equipment/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/manage rooms and equipment/i)).toBeInTheDocument();
  });
});
