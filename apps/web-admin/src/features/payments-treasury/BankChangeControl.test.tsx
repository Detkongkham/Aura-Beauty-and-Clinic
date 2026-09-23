import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PaymentSlipView } from '@abcp/shared-types';

import i18n from '@/i18n';
import { api, ok } from '@/mocks/helpers';
import { mockSlips } from '@/mocks/handlers/payments-treasury';
import { server } from '@/mocks/server';
import { renderWithProviders } from '@/test/test-utils';

import { BanksPage } from './BanksPage';
import { SlipDetail } from './SlipDetail';
import { signInAsOwner } from './testUtils';

beforeEach(signInAsOwner);

describe('payee change control + receiving account', () => {
  it('shows the owner the pending change with the old → new number and gates approval on the password', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<BanksPage />, { route: '/payments/banks' });

    const queue = await screen.findByRole('region', { name: /1 account change waiting for approval/i });
    expect(within(queue).getByText('2200 9988 77')).toBeInTheDocument();
    expect(within(queue).getByText('2200 5544 33')).toBeInTheDocument();
    expect(within(queue).getByText(/By Branch Manager/)).toBeInTheDocument();
    // the account card carries the pending flag too
    expect(screen.getAllByText('Change pending').length).toBeGreaterThan(0);

    await user.click(within(queue).getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: 'Approve' });
    expect(confirmBtn).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Confirm with your password'), 'Admin@12345');
    expect(confirmBtn).toBeEnabled();
    await user.click(confirmBtn);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('asks for the password only when payee details change in the edit dialog', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<BanksPage />, { route: '/payments/banks?a=00000000-0000-4000-8000-000000000011' });

    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Edit account' }));
    const dialogs = await screen.findAllByRole('dialog');
    const form = dialogs[dialogs.length - 1]!;
    expect(within(form).queryByLabelText('Confirm with your password')).not.toBeInTheDocument();

    const number = within(form).getByLabelText('Account number');
    await user.clear(number);
    await user.type(number, '0101999900001111');
    expect(within(form).getByLabelText('Confirm with your password')).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(within(form).getByLabelText('Confirm with your password'), 'x');
    expect(within(form).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('assigns a receiving account to a transfer booked without one', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWithProviders(<BanksPage />, { route: '/payments/banks' });

    await user.click(await screen.findByRole('button', { name: 'Assign accounts' }));
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText('₭ 150,000')).toBeInTheDocument();
    const select = within(sheet).getByRole('combobox', { name: 'Receiving account' });
    expect((select as HTMLSelectElement).value).toBe('00000000-0000-4000-8000-000000000011');
    const assign = within(sheet).getByRole('button', { name: 'Assign' });
    expect(assign).toBeEnabled();
    await user.click(assign);
    await waitFor(() => expect(assign).toBeEnabled());
  });

  it('slip review blocks approval until the receiving account is chosen when the branch has several', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    const slip: PaymentSlipView = { ...mockSlips[0]!, bankAccount: null };
    server.use(http.get(api('/payments-treasury/slips/:id'), () => ok(slip)));
    renderWithProviders(<SlipDetail slip={slip} canReview onOpenSlip={() => undefined} slaMinutes={30} now={Date.now()} hotkeys={false} />);

    const picker = await screen.findByRole('combobox', { name: 'Receiving account' });
    const approve = screen.getByRole('button', { name: 'Confirm payment' });
    await waitFor(() => expect(approve).toBeDisabled());
    expect(screen.getByText(/Choose the receiving account before approving/)).toBeInTheDocument();
    await user.selectOptions(picker, '00000000-0000-4000-8000-000000000012');
    expect(approve).toBeEnabled();
  });
});
