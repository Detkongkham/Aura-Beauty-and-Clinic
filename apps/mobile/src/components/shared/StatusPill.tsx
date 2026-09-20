import type { AppointmentListItem } from '@abcp/shared-types';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge';

type Status = AppointmentListItem['status'];

const TONE: Record<Status, React.ComponentProps<typeof Badge>['tone']> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'destructive',
  NO_SHOW: 'neutral',
};

export function StatusPill({ status }: { status: Status }): React.JSX.Element {
  const { t } = useTranslation();
  return <Badge dot label={t(`status.${status}`)} tone={TONE[status]} />;
}
