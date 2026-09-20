import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { NotificationsPage } from './NotificationsPage';
import { recencyOf, relatedLink } from './notificationModel';
import type { AppNotification } from './notifications.api';

describe('NotificationsPage', () => {
  it('renders header, summary tiles, views and insights', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });

    expect(screen.getByRole('heading', { level: 1, name: /notifications/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Needs action', { selector: 'p' })).toBeInTheDocument(),
    );
    expect(screen.getByText('Median time to resolve')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Inbox view' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Activity · 14 days' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark all read/i })).toBeEnabled();
  });

  it('filters to the needs-action view and opens a notification with its lifecycle', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });

    await waitFor(() => expect(screen.getByTestId('notification-ntf-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('view-action'));
    // ntf-4 is a PAYMENT_RECEIPT (info) → hidden in "needs action"; ntf-1 is critical.
    await waitFor(() => expect(screen.queryByTestId('notification-ntf-4')).not.toBeInTheDocument());
    const row = screen.getByTestId('notification-ntf-1');
    fireEvent.click(within(row).getAllByRole('button')[0]!);

    const detail = await screen.findByTestId('notification-detail-ntf-1');
    expect(within(detail).getByText('Lifecycle')).toBeInTheDocument();
    expect(within(detail).getByText('stock_reconciliation_mismatch')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /resolve/i })).toBeInTheDocument();
  });

  it('shows a bulk action bar after selecting rows', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });

    const row = await screen.findByTestId('notification-ntf-0');
    fireEvent.click(within(row).getByRole('checkbox'));
    expect(await screen.findByText('1 selected')).toBeInTheDocument();
    expect(screen.getByTestId('button-bulk-resolve')).toBeInTheDocument();
  });
});

describe('notificationModel', () => {
  const base: AppNotification = {
    id: 'x',
    type: 'APPOINTMENT_REMINDER',
    title: 't',
    body: 'b',
    severity: 'info',
    category: 'booking',
    module: 'appointments',
    source: 'appointments',
    data: { appointmentId: 'abc' },
    createdAt: new Date().toISOString(),
    read: false,
    readAt: null,
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
  };

  it('deep-links to the exact record when the payload has an id', () => {
    expect(relatedLink(base)).toEqual({ to: '/appointments/abc', exact: true });
    expect(relatedLink({ ...base, data: null })).toEqual({ to: '/appointments', exact: false });
    expect(relatedLink({ ...base, module: 'system', type: 'SYSTEM_BACKUP' })).toBeNull();
  });

  it('buckets by Vientiane calendar day', () => {
    // 2026-09-17 10:00 Vientiane = 03:00Z
    const now = Date.parse('2026-09-17T03:00:00Z');
    expect(recencyOf('2026-09-16T18:00:00Z', now)).toBe('today'); // 01:00 local on the 17th
    expect(recencyOf('2026-09-16T16:00:00Z', now)).toBe('yesterday'); // 23:00 local on the 16th
    expect(recencyOf('2026-09-12T03:00:00Z', now)).toBe('week');
    expect(recencyOf('2026-09-01T03:00:00Z', now)).toBe('earlier');
  });
});
