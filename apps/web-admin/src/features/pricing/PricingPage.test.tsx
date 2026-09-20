import { screen } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import type { PricingRuleView } from '@abcp/shared-types';

import i18n from '@/i18n';
import { api, ok } from '@/mocks/helpers';
import { server } from '@/mocks/server';
import { renderWithProviders } from '@/test/test-utils';

import { PricingPage } from './PricingPage';

const rule = (over: Partial<PricingRuleView> = {}): PricingRuleView => ({
  id: 'r1',
  branchId: 'b1',
  branchName: 'Vientiane Main',
  serviceId: null,
  serviceName: null,
  ruleName: 'Afternoon happy hour',
  dayOfWeek: 1,
  startTime: '13:00',
  endTime: '16:00',
  discountPercent: 20,
  priceMultiplier: 1,
  isActive: true,
  ...over,
});

const serveRules = (rules: PricingRuleView[]) =>
  server.use(http.get(api('/pricing-rules'), () => ok(rules)));

describe('PricingPage', () => {
  it('renders the dynamic-pricing heading and subtitle', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<PricingPage />, { route: '/pricing' });

    expect(
      screen.getByRole('heading', { level: 1, name: /dynamic pricing/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/discount or surge service prices/i)).toBeInTheDocument();
  });

  it('summarises the rules and plots them on the weekly schedule', async () => {
    await i18n.changeLanguage('en');
    serveRules([rule(), rule({ id: 'r2', ruleName: 'Friday peak', dayOfWeek: 5, priceMultiplier: 1.25, discountPercent: 0 })]);

    renderWithProviders(<PricingPage />, { route: '/pricing' });

    // stat tiles
    expect(await screen.findByText('Deepest discount')).toBeInTheDocument();
    expect(screen.getByText('Surge windows')).toBeInTheDocument();
    // the −20% figure shows up on the stat tile, the week-grid block and the table badge
    expect(screen.getAllByText('−20%').length).toBeGreaterThan(1);

    // weekly grid + both rules in the table
    expect(screen.getByRole('region', { name: /weekly pricing schedule/i })).toBeInTheDocument();
    expect(screen.getByText('Afternoon happy hour')).toBeInTheDocument();
    expect(screen.getByText('Friday peak')).toBeInTheDocument();
  });

  it('warns when two active rules overlap the same window', async () => {
    await i18n.changeLanguage('en');
    serveRules([
      rule({ id: 'a', ruleName: 'Rule A' }),
      rule({ id: 'b', ruleName: 'Rule B', startTime: '15:00', endTime: '17:00', discountPercent: 30 }),
    ]);

    renderWithProviders(<PricingPage />, { route: '/pricing' });

    expect(await screen.findByText(/overlapping rule pair/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review overlaps/i })).toBeInTheDocument();
  });

  it('shows an empty state when the branch has no rules', async () => {
    await i18n.changeLanguage('en');
    serveRules([]);

    renderWithProviders(<PricingPage />, { route: '/pricing' });

    expect(await screen.findByText(/no pricing rules yet/i)).toBeInTheDocument();
  });
});
