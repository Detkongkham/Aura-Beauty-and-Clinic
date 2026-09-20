import { Building2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';

import { useStaffList } from './staff.api';

interface BranchRow {
  name: string;
  active: number;
  total: number;
}

/**
 * Compact headcount-per-branch widget — div stacked bars (no chart lib), active
 * segment vs. the muted remainder. Reads a wide unscoped page; swap for a
 * server-side group-by when the admin `/staff` count endpoint lands.
 */
export function StaffByBranchCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useStaffList({ page: 1, pageSize: 500 });

  const { rows, grandTotal } = useMemo(() => {
    const byBranch = new Map<string, BranchRow>();
    for (const s of data?.items ?? []) {
      const key = s.branchName || '—';
      const row = byBranch.get(key) ?? { name: key, active: 0, total: 0 };
      if (s.isActive) row.active += 1;
      row.total += 1;
      byBranch.set(key, row);
    }
    const list = [...byBranch.values()].sort((a, b) => b.total - a.total);
    return { rows: list, grandTotal: list.reduce((n, r) => n + r.total, 0) };
  }, [data]);

  const max = Math.max(1, ...rows.map((r) => r.total));
  const VISIBLE = 3;
  const shownRows = rows.slice(0, VISIBLE);
  const hiddenCount = rows.length - shownRows.length;

  return (
    <div
      style={{ animationDelay: '180ms' }}
      className="rounded-lg border border-border bg-card p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
    >
      <div className="mb-3 flex items-center gap-2">
        <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="text-[13px] font-semibold text-foreground">{t('staff.byBranch')}</h3>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{grandTotal}</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('staff.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {shownRows.map((r) => (
            <li key={r.name}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-foreground">{r.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {r.active}
                  <span className="text-muted-foreground/50">/{r.total}</span>
                </span>
              </div>
              <div
                className="flex h-1.5 overflow-hidden rounded-full bg-muted"
                style={{ width: `${Math.max((r.total / max) * 100, 10)}%` }}
                title={`${r.name}: ${t('staff.active')} ${r.active} / ${r.total}`}
              >
                {r.active > 0 ? (
                  <span
                    className="h-full"
                    style={{
                      width: `${(r.active / r.total) * 100}%`,
                      backgroundColor: 'hsl(var(--success) / 0.6)',
                    }}
                  />
                ) : null}
              </div>
            </li>
          ))}
          {hiddenCount > 0 ? (
            <li className="pt-0.5 text-[11px] text-muted-foreground">
              {t('staff.moreBranches', { count: hiddenCount })}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
