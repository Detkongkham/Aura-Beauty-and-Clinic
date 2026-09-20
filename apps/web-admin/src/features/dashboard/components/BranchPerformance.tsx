import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@/lib/format';
import type { DashboardStats } from '@/types/models';

const COLLAPSED_ROWS = 6;

/** Revenue + bookings per branch over the period — top rows first, the rest behind a toggle. */
export function BranchPerformance({ data }: { data: DashboardStats['branchPerformance'] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const rows = expanded ? data : data.slice(0, COLLAPSED_ROWS);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('dashboard.noUpcoming')}</p>;
  }

  return (
    <>
      <ul className="-mx-1.5 space-y-1">
        {rows.map((b) => (
          <li key={b.branchId} className="rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/50">
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-primary" />
                <span className="truncate font-medium">{b.name}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {t('dashboard.bookingsCount', { count: b.bookings })} · {formatCurrency(b.revenue)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500 ease-out"
                style={{ width: `${Math.max((b.revenue / max) * 100, 3)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {data.length > COLLAPSED_ROWS ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
        >
          {expanded ? t('dashboard.showLess') : t('dashboard.showAll', { count: data.length })}
        </button>
      ) : null}
    </>
  );
}
