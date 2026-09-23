import type { SlipVerdict } from '@abcp/shared-types';
import {
  BadgeCheck,
  Banknote,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleX,
  Copy,
  Hash,
  Landmark,
  Clock3,
  ScanLine,
  Sparkles,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { Tone } from '@/features/payroll/payroll.lib';

import type { CheckKey, CheckState } from './slipModel';

export const VERDICT_TONE: Record<SlipVerdict, Tone> = {
  PENDING: 'neutral',
  NEEDS_REVIEW: 'warning',
  AUTO_MATCHED: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  DUPLICATE: 'danger',
  REVERSED: 'danger',
};

export const VERDICT_ICON: Record<SlipVerdict, LucideIcon> = {
  PENDING: ScanLine,
  NEEDS_REVIEW: TriangleAlert,
  AUTO_MATCHED: Sparkles,
  APPROVED: BadgeCheck,
  REJECTED: CircleX,
  DUPLICATE: Copy,
  REVERSED: Undo2,
};

export const CHECK_ICON: Record<CheckKey, LucideIcon> = {
  amount: Banknote,
  account: Landmark,
  time: Clock3,
  ref: Hash,
};

export const STATE_ICON: Record<CheckState, LucideIcon> = {
  pass: CircleCheck,
  fail: CircleX,
  unread: CircleHelp,
  pending: CircleDashed,
};

/** "12 min", "2 h 5 min", "3 d" — compact waiting time. */
export function useFormatWait() {
  const { t } = useTranslation();
  return (minutes: number) => {
    if (minutes < 1) return t('payTreasury.slips.wait.now');
    if (minutes < 60) return t('payTreasury.slips.wait.m', { m: minutes });
    if (minutes < 60 * 24) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m ? t('payTreasury.slips.wait.hm', { h, m }) : t('payTreasury.slips.wait.h', { h });
    }
    return t('payTreasury.slips.wait.d', { d: Math.floor(minutes / 1440) });
  };
}
