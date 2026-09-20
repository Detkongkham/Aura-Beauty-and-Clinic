import { useTranslation } from 'react-i18next';
import { useBookingPolicy } from './booking.api';

/**
 * ຂໍ້ຄວາມນະໂຍບາຍຍົກເລີກ/ເລື່ອນນັດ — ຕົວເລກຊົ່ວໂມງມາຈາກ Web Admin ▸ Settings (GET /booking/policy),
 * ບໍ່ hard-code. ລະຫວ່າງໂຫຼດ ຫຼື window = 0 → ຂໍ້ຄວາມທົ່ວໄປ (ໄດ້ຈົນຮອດເວລານັດ).
 */
export function useCancelPolicyText(): string {
  const { t } = useTranslation();
  const hours = useBookingPolicy().data?.cancellationWindowHours ?? 0;
  return hours > 0 ? t('confirm.cancelPolicyBody', { hours }) : t('confirm.cancelPolicyAnytime');
}
