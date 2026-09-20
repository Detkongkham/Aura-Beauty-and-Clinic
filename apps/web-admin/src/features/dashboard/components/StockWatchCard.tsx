import { CheckCircle2, ClipboardList, PackageX, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import type { DashboardStats } from '@/types/models';

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

/**
 * Products at or under their reorder level, most depleted first, each with a
 * stock-vs-minimum gauge — plus inbound supply (POs on order, transfers in transit).
 */
export function StockWatchCard({ data }: { data: DashboardStats }) {
  const { t } = useTranslation();
  const items = data.lowStockItems;
  const multiBranch = data.branchId === 'all';

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Link
          to={ROUTES.inventoryPurchaseOrders}
          className="flex items-center gap-2 rounded-xl border border-border p-2.5 transition-colors hover:bg-muted/50"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-info-soft text-info">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] text-muted-foreground">
              {t('dashboard.stock.openPOs')}
            </p>
            <p className="text-sm font-semibold tabular-nums">
              {data.attention.openPurchaseOrders}
            </p>
          </div>
        </Link>
        <Link
          to={ROUTES.inventoryTransfers}
          className="flex items-center gap-2 rounded-xl border border-border p-2.5 transition-colors hover:bg-muted/50"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Truck className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] text-muted-foreground">
              {t('dashboard.stock.transfers')}
            </p>
            <p className="text-sm font-semibold tabular-nums">
              {data.attention.transfersInTransit}
            </p>
          </div>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-success/30 bg-success/[0.04] px-4 py-6 text-center">
          <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{t('dashboard.stock.allGood')}</p>
        </div>
      ) : (
        <ul className="-mx-1 space-y-1">
          {items.map((p) => {
            const ratio = p.minStockQty > 0 ? Math.min(p.stockQty / p.minStockQty, 1) : 0;
            const critical = p.stockQty <= 0 || ratio < 0.5;
            return (
              <li key={p.id} className="rounded-lg px-1 py-1.5">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      critical
                        ? 'bg-destructive-soft text-destructive'
                        : 'bg-warning-soft text-warning',
                    )}
                  >
                    <PackageX className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium">{p.name}</p>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {p.sku}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {t('dashboard.stock.left', {
                        qty: qty(p.stockQty),
                        unit: p.unit,
                        min: qty(p.minStockQty),
                      })}
                      {multiBranch ? ` · ${p.branchName}` : ''}
                    </p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          critical ? 'bg-destructive' : 'bg-warning',
                        )}
                        style={{ width: `${Math.max(ratio * 100, p.stockQty > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
