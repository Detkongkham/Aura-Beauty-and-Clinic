import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { mockSlips } from '@/mocks/handlers/payments-treasury';
import { api, ok, paginated } from '@/mocks/helpers';
import { server } from '@/mocks/server';
import { renderWithProviders } from '@/test/test-utils';

import { SlipReviewPage } from './SlipReviewPage';
import { signInAsOwner } from './testUtils';

vi.mock('@/services/socket', () => ({
  connectAppSocket: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));

const SOMCHAI = mockSlips[0]!.id;
const NOY = mockSlips[1]!.id;
const DARA = mockSlips[2]!.id;

beforeEach(async () => {
  signInAsOwner();
  await i18n.changeLanguage('en');
});

async function openSlip(id: string) {
  renderWithProviders(<SlipReviewPage />, { route: `/payments/slips?view=all&s=${id}` });
  return screen.findByRole('dialog');
}

describe('slip review — S1–S12', () => {
  it('S2/S3: a risky slip explains the signal and links the look-alike slip', async () => {
    const pane = await openSlip(SOMCHAI);
    expect(await within(pane).findByText('Held back for a closer look')).toBeInTheDocument();
    expect(within(pane).getByText('Looks like another slip')).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: /Dara P/ })).toBeInTheDocument();
  });

  it('S1: shows what the bank statement says, with the reference match spelled out', async () => {
    const pane = await openSlip(NOY);
    const card = (await within(pane).findByRole('heading', { name: 'Bank statement' })).closest(
      'section',
    )!;
    expect(within(card).getByText('Seen in the bank')).toBeInTheDocument();
    expect(within(card).getByText('reference matches')).toBeInTheDocument();
    expect(within(card).getByText('TRF FT260920CD34')).toBeInTheDocument();
  });

  it('S5: a colleague holding the slip hides the actions until you take over', async () => {
    server.use(
      http.post(api('/payments-treasury/slips/:id/claim'), ({ params }) =>
        ok({
          ...mockSlips.find((s) => s.id === params.id)!,
          claimedBy: { id: 'someone-else', name: 'Keo', at: new Date().toISOString() },
        }),
      ),
      http.get(api('/payments-treasury/slips/:id'), ({ params }) =>
        // `/slips/summary` and `/slips/export` share this pattern — fall through to the default handlers
        params.id === 'summary' || params.id === 'export'
          ? undefined
          : ok({
              ...mockSlips.find((s) => s.id === params.id)!,
              claimedBy: { id: 'someone-else', name: 'Keo', at: new Date().toISOString() },
              ocrText: null,
              duplicateOf: null,
              nearDuplicateOf: null,
              siblings: [],
            }),
      ),
    );
    const pane = await openSlip(NOY);
    expect(await within(pane).findByText('Keo is reviewing this slip')).toBeInTheDocument();
    expect(within(pane).queryByRole('button', { name: 'Confirm payment' })).not.toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Take over' })).toBeEnabled();
  });

  it('S6: ask the customer — a preset fills the message and sending closes the dialog', async () => {
    const user = userEvent.setup();
    const pane = await openSlip(NOY);
    await user.click(await within(pane).findByRole('button', { name: 'Ask customer' }));
    const dialogs = await screen.findAllByRole('dialog');
    const ask = dialogs[dialogs.length - 1]!;
    const send = within(ask).getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await user.click(
      within(ask).getByRole('button', { name: 'Please send a clearer photo of the slip.' }),
    );
    expect(within(ask).getByLabelText('Message')).toHaveValue(
      'Please send a clearer photo of the slip.',
    );
    await user.click(send);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Ask the customer' })).not.toBeInTheDocument(),
    );
  });

  it('S7: a confirmed slip can be reversed only with a reason', async () => {
    const user = userEvent.setup();
    const pane = await openSlip(DARA);
    await user.click(await within(pane).findByRole('button', { name: 'Reverse confirmation' }));
    const dialogs = await screen.findAllByRole('dialog');
    const dlg = dialogs[dialogs.length - 1]!;
    const go = within(dlg).getByRole('button', { name: 'Reverse confirmation' });
    expect(go).toBeDisabled();
    await user.type(within(dlg).getByLabelText('Reason'), 'Not on the statement');
    expect(go).toBeEnabled();
  });

  it('S8: rejecting with a preset sends its reason code', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    server.use(
      http.post(api('/payments-treasury/slips/:id/review'), async ({ request }) => {
        sent = await request.json();
        return ok({ ...mockSlips[0]!, verdict: 'REJECTED' });
      }),
    );
    const pane = await openSlip(SOMCHAI);
    await user.click(await within(pane).findByRole('button', { name: 'Reject' }));
    const dialogs = await screen.findAllByRole('dialog');
    const dlg = dialogs[dialogs.length - 1]!;
    await user.click(
      within(dlg).getByRole('button', { name: 'The slip appears to have been edited' }),
    );
    await user.click(within(dlg).getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(sent).toMatchObject({ action: 'REJECT', reasonCode: 'SUSPECTED_FAKE' }),
    );
  });

  it('S4/S9: attention rows include risky + waiting-on-customer; insights show accuracy per bank and reject reasons', async () => {
    renderWithProviders(<SlipReviewPage />, { route: '/payments/slips' });
    expect(await screen.findByText('Risk signals (held back)')).toBeInTheDocument();
    expect(screen.getByText('Waiting on customer', { selector: 'span' })).toBeInTheDocument();
    const banks = (await screen.findByText('Read accuracy by bank (7 days)')).closest('section')!;
    expect(within(banks).getByText('75%')).toBeInTheDocument();
    const reasons = screen.getByText('Why slips were rejected (7 days)').closest('section')!;
    expect(within(reasons).getByText('Amount short')).toBeInTheDocument();
  });

  it('S12: staff upload — pick an open bill, attach an image, upload opens the new slip', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(api('/payments'), () =>
        paginated(
          [
            {
              id: '00000000-0000-4000-8000-000000000070',
              branchId: 'b',
              branchName: 'Vientiane Main',
              appointmentId: null,
              bookingGroupId: null,
              customerName: 'Lamphone S',
              totalAmount: 300000,
              depositAmount: 0,
              paidAmount: 0,
              balanceAmount: 300000,
              currency: 'LAK',
              paymentStatus: 'PENDING',
              paidAt: null,
              createdAt: new Date().toISOString(),
              transactions: [],
              invoiceNo: null,
              vatRate: null,
              vatMode: null,
              taxAmount: null,
              netAmount: null,
              refundedAmount: 0,
              voidedAt: null,
              voidReason: null,
            },
          ],
          1,
          20,
        ),
      ),
    );
    renderWithProviders(<SlipReviewPage />, { route: '/payments/slips' });
    await user.click(await screen.findByRole('button', { name: 'Upload slip' }));
    const dlg = await screen.findByRole('dialog');
    await user.click(await within(dlg).findByRole('button', { name: /Lamphone S/ }));
    expect(within(dlg).getByLabelText('Amount transferred')).toHaveValue(300000);
    const submit = within(dlg).getByRole('button', { name: 'Upload' });
    expect(submit).toBeDisabled();
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'slip.jpg', { type: 'image/jpeg' });
    await user.upload(within(dlg).getByLabelText('Choose, drop or paste the slip image'), file);
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Upload a slip for a bill' }),
      ).not.toBeInTheDocument(),
    );
  });
});
