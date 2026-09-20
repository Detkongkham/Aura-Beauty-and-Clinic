import { Building2, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SupplierView } from '@abcp/shared-types';

import { cn } from '@/lib/utils';

const MEDAL: Record<number, { chip: string; ring: string }> = {
  0: { chip: 'bg-amber-400/15 text-amber-600 dark:text-amber-400', ring: 'ring-amber-400/40' },
  1: { chip: 'bg-slate-400/15 text-slate-500 dark:text-slate-300', ring: 'ring-slate-400/40' },
  2: { chip: 'bg-orange-400/15 text-orange-600 dark:text-orange-400', ring: 'ring-orange-400/40' },
};

interface SupplierLeaderboardProps {
  suppliers: SupplierView[];
  loading?: boolean;
}

/**
 * Ranked "top suppliers by purchase order volume" panel for the Suppliers page —
 * medal-toned rank badges for the top 3, a proportional bar per row (relative to
 * the #1 supplier), and contact details so the ranking doubles as a quick-glance
 * directory. Mirrors the StaffLeaderboard / StockHealthBar card treatment so the
 * Inventory module stays visually consistent.
 */
export function SupplierLeaderboard({ suppliers, loading = false }: SupplierLeaderboardProps) {
  const { t } = useTranslation();
  const ranked = suppliers.filter((s) => s.purchaseOrderCount > 0);
  const max = ranked[0]?.purchaseOrderCount ?? 0;

  if (loading) {
    return <div className="h-[168px] w-full animate-pulse rounded-lg border border-border bg-card" />;
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-3 shadow-sm',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
      )}
      style={{ animationDelay: '220ms' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Trophy className="h-3 w-3" aria-hidden="true" />
          </span>
          <p className="text-xs font-medium text-foreground">{t('inventory.supplier.leaderboard.title')}</p>
        </div>
        <p className="text-2xs text-muted-foreground">
          {t('inventory.supplier.leaderboard.hint', { count: ranked.length })}
        </p>
      </div>

      {ranked.length === 0 ? (
        <p className="mt-3 py-3 text-center text-xs text-muted-foreground">
          {t('inventory.supplier.leaderboard.empty')}
        </p>
      ) : (
        <ol className="mt-2 space-y-1">
          {ranked.slice(0, 5).map((s, i) => {
            const medal = MEDAL[i];
            const pct = max > 0 ? Math.max((s.purchaseOrderCount / max) * 100, 4) : 0;
            return (
              <li
                key={s.id}
                className={cn(
                  'rounded-md px-1.5 py-1.5 transition-colors duration-150 hover:bg-muted/50',
                  'animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
                )}
                style={{ animationDelay: `${260 + i * 45}ms` }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-2xs font-semibold tabular-nums ring-1',
                      medal ? cn(medal.chip, medal.ring) : 'bg-muted text-muted-foreground ring-border',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
                    aria-hidden="true"
                  >
                    <Building2 className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-xs font-medium leading-snug text-foreground">{s.name}</p>
                    <p className="truncate text-2xs leading-snug text-muted-foreground">
                      {s.contactPerson || s.phone}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-baseline gap-1">
                    <p className="tabular-nums text-xs font-semibold text-foreground">
                      {s.purchaseOrderCount.toLocaleString()}
                    </p>
                    <p className="text-2xs text-muted-foreground">
                      {t('inventory.supplier.leaderboard.posUnit')}
                    </p>
                  </div>
                </div>
                <div className="ml-[26px] mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-700 ease-out',
                      i === 0
                        ? 'bg-gradient-to-r from-primary/70 to-primary'
                        : 'bg-primary/40',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
