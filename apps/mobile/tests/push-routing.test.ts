import { describe, expect, it } from 'vitest';
import { routeForNotification } from '../src/lib/pushRouting';

describe('push-tap routing', () => {
  it('chat: DM/staff threads open the thread; consultation opens the appointment chat', () => {
    expect(routeForNotification({ type: 'CHAT_MESSAGE', threadId: 't1', threadType: 'DIRECT' }, 'CUSTOMER', 'Noy')).toEqual({
      name: 'DirectThread',
      params: { threadId: 't1', title: 'Noy' },
    });
    expect(routeForNotification({ type: 'CHAT_MESSAGE', threadId: 't1', threadType: 'STAFF_INTERNAL' }, 'STAFF', 'Kham')).toEqual({
      name: 'StaffThread',
      params: { threadId: 't1', title: 'Kham' },
    });
    expect(
      routeForNotification({ type: 'CHAT_MESSAGE', threadId: 't1', threadType: 'CONSULTATION', appointmentId: 'a1' }, 'CUSTOMER'),
    ).toEqual({ name: 'Chat', params: { appointmentId: 'a1' } });
  });

  it('payment slips take the customer to the payment screen', () => {
    expect(routeForNotification({ type: 'SLIP_REJECTED', appointmentId: 'a1', slipId: 's1' }, 'CUSTOMER')).toEqual({
      name: 'Payment',
      params: { appointmentId: 'a1' },
    });
    expect(routeForNotification({ type: 'SLIP_APPROVED', slipId: 's1' }, 'STAFF')).toEqual({
      name: 'StaffSlipReview',
      params: { slipId: 's1' },
    });
  });

  it('appointments, payslips and fallbacks', () => {
    expect(routeForNotification({ type: 'APPOINTMENT_REMINDER', appointmentId: 'a1' }, 'CUSTOMER')).toEqual({
      name: 'AppointmentDetail',
      params: { id: 'a1' },
    });
    expect(routeForNotification({ type: 'PAYROLL_PAYSLIP_PAID' }, 'STAFF')).toEqual({
      name: 'StaffTabs',
      params: { screen: 'EarningsTab' },
    });
    expect(routeForNotification({ type: 'CAMPAIGN' }, 'CUSTOMER')).toEqual({ name: 'Notifications' });
    expect(routeForNotification({ type: 'CAMPAIGN' }, 'STAFF')).toBeNull();
    expect(routeForNotification(undefined, 'CUSTOMER')).toBeNull();
  });
});
