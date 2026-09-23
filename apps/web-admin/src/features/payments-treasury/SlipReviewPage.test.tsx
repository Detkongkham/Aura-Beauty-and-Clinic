import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

import { SlipReviewPage } from './SlipReviewPage';
import { signInAsOwner } from './testUtils';

// the inbox joins a socket room for live updates — not under test here
vi.mock('@/services/socket', () => ({
  connectAppSocket: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));

beforeEach(signInAsOwner);

describe('SlipReviewPage', () => {
  it('queues slips that need eyes ahead of clean auto-matches, and hides finished ones', async () => {
    await i18n.changeLanguage('en');
    renderWithProviders(<SlipReviewPage />, { route: '/payments/slips' });

    expect(screen.getByRole('heading', { level: 1, name: /slip review/i })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Slip queue' });
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(2));
    const names = within(list)
      .getAllByRole('button')
      .map((b) => b.textContent ?? '');
    expect(names[0]).toContain('Somchai Vong');
    expect(names[0]).toContain('Needs review');
    expect(names[1]).toContain('Noy Keo');
    expect(within(list).queryByText('Dara P')).not.toBeInTheDocument();
  });

  it('opens the comparison with the mismatching field flagged as text, not just colour', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<SlipReviewPage />, { route: '/payments/slips' });

    const list = await screen.findByRole('list', { name: 'Slip queue' });
    await user.click(await within(list).findByText('Somchai Vong'));

    const dialog = await screen.findByRole('dialog');
    const table = within(dialog).getByRole('table', { name: 'Expected versus read values' });
    const flagged = within(table)
      .getAllByRole('row')
      .filter((r) => r.getAttribute('data-mismatch') === 'true');
    expect(flagged).toHaveLength(1);
    expect(within(flagged[0]!).getByLabelText('Does not match')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Confirm payment' })).toBeEnabled();
  });

  it('will not reject without a reason', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<SlipReviewPage />, { route: '/payments/slips' });

    const list = await screen.findByRole('list', { name: 'Slip queue' });
    await user.click(await within(list).findByText('Somchai Vong'));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Reject' }));

    const reasonDialogs = await screen.findAllByRole('dialog');
    const reasonDialog = reasonDialogs[reasonDialogs.length - 1]!;
    const confirm = within(reasonDialog).getByRole('button', { name: 'Reject' });
    expect(confirm).toBeDisabled();
    await user.type(within(reasonDialog).getByLabelText('Reason'), 'Amount is short');
    expect(confirm).toBeEnabled();
  });

  it('shows the review health band from the server summary, with one-click attention filters', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<SlipReviewPage />, { route: '/payments/slips' });

    const band = (await screen.findByText('Waiting for review')).closest('section')!;
    expect(within(band).getByRole('button', { name: '2' })).toBeInTheDocument();
    expect(await screen.findByText('Confirmed today')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();

    // "Amount" in the failed-check flags narrows the queue to the one slip whose amount is off
    await user.click(screen.getByRole('button', { name: 'Amount', pressed: false }));
    const list = await screen.findByRole('list', { name: 'Slip queue' });
    await waitFor(() => expect(within(list).queryByText('Noy Keo')).not.toBeInTheDocument());
    expect(within(list).getByText('Somchai Vong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Amount', pressed: true })).toBeInTheDocument();
  });

  it('groups the to-do queue and bulk-confirms only slips that passed every check', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<SlipReviewPage />, { route: '/payments/slips' });

    const list = await screen.findByRole('list', { name: 'Slip queue' });
    await within(list).findByText('Somchai Vong');
    // only the auto-matched slip offers a checkbox
    expect(within(list).getAllByRole('checkbox', { name: /bulk confirm/ })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Select 1 ready' }));
    await user.click(screen.getByRole('button', { name: 'Confirm 1 slip' }));
    const dlg = await screen
      .findByRole('alertdialog')
      .catch(() => screen.findAllByRole('dialog').then((d) => d[d.length - 1]!));
    await user.click(within(dlg).getByRole('button', { name: 'Confirm 1 slip' }));
    // selection clears once the server answers
    expect(await screen.findByRole('button', { name: 'Select 1 ready' })).toBeInTheDocument();
  });

  it('steps through the queue with J and offers one-tap reject reasons', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<SlipReviewPage />, {
      route: '/payments/slips?s=00000000-0000-4000-8000-000000000021',
    });

    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText('1 check failed')).toBeInTheDocument();
    expect(within(sheet).getByText('1/2')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Reject' }));
    const dialogs = await screen.findAllByRole('dialog');
    const reasonDialog = dialogs[dialogs.length - 1]!;
    await user.click(
      within(reasonDialog).getByRole('button', {
        name: 'The amount on the slip is less than the bill',
      }),
    );
    expect(within(reasonDialog).getByLabelText('Reason')).toHaveValue(
      'The amount on the slip is less than the bill',
    );
    expect(within(reasonDialog).getByRole('button', { name: 'Reject' })).toBeEnabled();
    await user.click(within(reasonDialog).getByRole('button', { name: 'Cancel' }));

    await user.keyboard('j');
    expect(
      await within(await screen.findByRole('dialog')).findByText('Ready to confirm', {
        selector: 'p',
      }),
    ).toBeInTheDocument();
  });
});
