import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/ui/sonner';
import { http } from '@/services/http';

export interface AppSettings {
  // Business profile
  logoUrl: string;
  businessName: string;
  legalName: string;
  contactPhone: string;
  contactEmail: string;
  addressLine: string;
  taxId: string;
  // Localization
  displayCurrency: 'LAK' | 'THB' | 'USD';
  timezone: string;
  defaultLanguage: 'lo' | 'en';
  weekStart: 'mon' | 'sun';
  dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
  // Exchange rates
  autoConvertCurrency: boolean;
  fxRefreshMinutes: number;
  // Booking rules
  bookingLeadHours: number;
  cancellationWindowHours: number;
  maxAdvanceDays: number;
  slotIntervalMinutes: number;
  allowWalkIns: boolean;
  allowOnlineBooking: boolean;
  autoConfirm: boolean;
  requireDeposit: boolean;
  depositPercent: number;
  noShowThreshold: number;
  // Queue
  queueEnabled: boolean;
  ticketPrefix: string;
  waitAlertMinutes: number;
  autoRecall: boolean;
  // Notifications
  smsSenderName: string;
  reminderOffsetsHours: string;
  sendBookingConfirmation: boolean;
  // Security
  sessionTimeoutMinutes: number;
  minPasswordLength: number;
  require2fa: boolean;
  // Data
  dataRetentionMonths: number;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await http.get<{ data: AppSettings }>('/settings');
      return res.data.data;
    },
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) =>
      http.put<{ data: AppSettings }>('/settings', patch).then((r) => r.data.data),
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data);
      void qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success(t('settings.saved'));
    },
    onError: () => toast.error(t('services.saveError')),
  });
}
