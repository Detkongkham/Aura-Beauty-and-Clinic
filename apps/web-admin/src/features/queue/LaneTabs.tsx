import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { ACTIVE_ORDER, LANES, type ActiveStatus } from './queue.lib';

interface Props {
  value: ActiveStatus | null;
  onChange: (s: ActiveStatus | null) => void;
  counts: Record<ActiveStatus, number>;
  /** Offer an "All" tab (list view); the phone board always shows exactly one lane. */
  allowAll: boolean;
  className?: string;
}

/** Status tabs with counts — picks the lane on phones, filters the list view. */
export function LaneTabs({ value, onChange, counts, allowAll, className }: Props) {
  const { t } = useTranslation();
  const total = counts.WAITING + counts.CALLED + counts.IN_SERVICE;
  const tab = (active: boolean) =>
    cn(
      'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors duration-150 sm:flex-none sm:px-3',
      active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
    );
  return (
    <div role="tablist" aria-label={t('queue.filterLane')} className={cn('flex gap-1 rounded-lg bg-muted p-1', className)}>
      {allowAll ? (
        <button type="button" role="tab" aria-selected={value == null} onClick={() => onChange(null)} className={tab(value == null)}>
          {t('queue.showAll')}
          <span className="tabular-nums text-muted-foreground">{total}</span>
        </button>
      ) : null}
      {ACTIVE_ORDER.map((s) => {
        const lane = LANES.find((l) => l.status === s)!;
        const Icon = lane.icon;
        const active = value === s;
        return (
          <button key={s} type="button" role="tab" aria-selected={active} onClick={() => onChange(s)} className={tab(active)}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="truncate">{t(`status.${s}`)}</span>
            <span className={cn('rounded-full px-1.5 text-2xs font-semibold tabular-nums', active ? lane.count : 'bg-background')}>
              {counts[s]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
