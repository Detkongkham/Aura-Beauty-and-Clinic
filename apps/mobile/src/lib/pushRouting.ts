/**
 * Push-tap deep links — ແປງ `data` ຂອງ notification (ຈາກ backend `notifyUser` / `pushOnly`) ເປັນ
 * ໜ້າຈໍທີ່ຈະເປີດ. Pure (ບໍ່ແຕະ native / navigation) ເພື່ອ unit test ໄດ້.
 * ບໍ່ຮູ້ຈັກ type → ໜ້າ Notifications (ລູກຄ້າ) ຫຼື ບໍ່ໄປໃສ (ພະນັກງານ — ບໍ່ມີ inbox).
 */

export type PushRoute = { name: string; params?: Record<string, unknown> };

type Data = Record<string, unknown> & { type?: unknown };

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export function routeForNotification(
  data: Data | null | undefined,
  role: string | null | undefined,
  title?: string | null,
): PushRoute | null {
  if (!data) return null;
  const type = str(data.type) ?? '';
  const isStaff = role === 'STAFF';
  const appointmentId = str(data.appointmentId);
  const threadId = str(data.threadId);

  if (type === 'CHAT_MESSAGE' && threadId) {
    const threadType = str(data.threadType);
    if (threadType === 'CONSULTATION' || (!threadType && appointmentId)) {
      if (isStaff) return appointmentId ? { name: 'StaffAppointmentDetail', params: { id: appointmentId } } : null;
      return appointmentId ? { name: 'Chat', params: { appointmentId } } : null;
    }
    return isStaff
      ? { name: 'StaffThread', params: { threadId, title: title ?? '' } }
      : { name: 'DirectThread', params: { threadId, title: title ?? '' } };
  }

  if (isStaff) {
    if (type.startsWith('PAYROLL')) return { name: 'StaffTabs', params: { screen: 'EarningsTab' } };
    if (type.startsWith('SLIP')) {
      const slipId = str(data.slipId);
      return slipId ? { name: 'StaffSlipReview', params: { slipId } } : { name: 'StaffSlipInbox' };
    }
    if (appointmentId) return { name: 'StaffAppointmentDetail', params: { id: appointmentId } };
    return null;
  }

  // Customer
  if (type.startsWith('SLIP') || type === 'PAYMENT_DUE') {
    return appointmentId ? { name: 'Payment', params: { appointmentId } } : { name: 'Notifications' };
  }
  if (type.startsWith('HOME_SERVICE') && appointmentId) {
    return { name: 'HomeServiceTracking', params: { appointmentId } };
  }
  if (type.startsWith('GIFT_CARD')) return { name: 'GiftCards' };
  if (type.startsWith('PACKAGE')) return { name: 'MyPackages' };
  if (type.startsWith('LOYALTY')) return { name: 'Loyalty' };
  if (appointmentId) return { name: 'AppointmentDetail', params: { id: appointmentId } };
  return { name: 'Notifications' };
}
