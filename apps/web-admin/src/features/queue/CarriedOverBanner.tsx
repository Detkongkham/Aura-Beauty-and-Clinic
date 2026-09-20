import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

interface Props {
  count: number;
  canClear: boolean;
  pending: boolean;
  onClear: () => void;
}

/** Warns when yesterday's (or older) tickets are still sitting in the active lanes —
 *  they skew every wait/SLA figure until closed. */
export function CarriedOverBanner({ count, canClear, pending, onClear }: Props) {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/35 bg-warning-soft/50 px-3 py-2"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning">
        <History className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t('queue.carriedOverTitle', { n: count })}</p>
        <p className="truncate text-2xs text-muted-foreground" title={t('queue.carriedOverBody')}>{t('queue.carriedOverBody')}</p>
      </div>
      {canClear ? (
        <Button variant="secondary" size="sm" className="h-8" disabled={pending} onClick={onClear}>
          {t('queue.clearStale')}
        </Button>
      ) : null}
    </div>
  );
}
