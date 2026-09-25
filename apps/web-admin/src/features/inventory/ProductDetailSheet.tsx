import type { ReactNode } from 'react';
import { type LucideIcon, Boxes, CalendarClock, Layers, Package, PackageOpen, ScrollText, Store, Truck, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ProductView } from '@abcp/shared-types';

import { CurrencyText, DateTimeText, EmptyState, StatusPill } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

import { useProduct, useStockLots, useStockMovements } from './inventory.api';
import { MOVEMENT_TYPE_VARIANT, signedQty } from './movementTypes';

const LOT_STATUS_VARIANT = { EXPIRED: 'danger', EXPIRING: 'warning', OK: 'success', NO_EXPIRY: 'neutral' } as const;

/**
 * L4 — product detail drawer (row click on Inventory ▸ Products): header stats, the product's lots and
 * its most recent ledger rows, with a jump to the full Stock Ledger pre-filtered to this product.
 */
export function ProductDetailSheet({
  product: seed,
  onClose,
  onLotUsage,
}: {
  product: ProductView | null;
  onClose: () => void;
  onLotUsage: (lotId: string) => void;
}) {
  const { t } = useTranslation();
  const id = seed?.id ?? null;
  const { data: fresh } = useProduct(id);
  const p = fresh ?? seed;
  const lots = useStockLots({ productId: id ?? undefined, page: 1, pageSize: 100 }, Boolean(id && p?.trackLot));
  const moves = useStockMovements({ productId: id ?? undefined, page: 1, pageSize: 15 });

  return (
    <Sheet open={Boolean(seed)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[560px]">
        <SheetHeader>
          <div className="flex items-center gap-3 pr-8">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">{p?.name ?? '—'}</SheetTitle>
              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <span className="tabular-nums">{p?.sku}</span>
                <span aria-hidden="true">·</span>
                <Store className="h-3 w-3 shrink-0" aria-hidden="true" />
                {p?.branchName}
              </p>
            </div>
            {p?.trackLot ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
                {t('inventory.lot.tag')}
              </span>
            ) : null}
          </div>
        </SheetHeader>

        <SheetBody className="space-y-5 py-4">
          {p ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile icon={Boxes} label={t('inventory.detail.onHand')} tone={p.stockQty < 0 || p.outOfStock ? 'danger' : p.lowStock ? 'warning' : 'primary'}>
                <span className="tabular-nums">
                  {p.stockQty.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{p.unit}</span>
                </span>
              </Tile>
              <Tile icon={Wallet} label={t('inventory.detail.wac')}>
                <CurrencyText amount={p.costPrice} />
              </Tile>
              <Tile icon={Layers} label={t('inventory.col.value')} tone="success">
                <CurrencyText amount={p.stockValue} />
              </Tile>
              <Tile icon={PackageOpen} label={t('inventory.detail.unlotted')} tone={p.unlottedQty > 0 ? 'warning' : 'neutral'}>
                <span className="tabular-nums">{p.trackLot ? p.unlottedQty.toLocaleString() : '—'}</span>
              </Tile>
              {/* H7 — on hand / reserved / available / on order */}
              <Tile icon={CalendarClock} label={t('inventory.reserve.reserved')} tone={p.reservedQty > 0 ? 'primary' : 'neutral'}>
                <span className="tabular-nums">{p.reservedQty.toLocaleString()}</span>
              </Tile>
              <Tile icon={Boxes} label={t('inventory.reserve.available')} tone={p.shortForUpcoming ? 'danger' : 'success'}>
                <span className="tabular-nums">{p.availableQty.toLocaleString()}</span>
              </Tile>
              <Tile icon={Truck} label={t('inventory.reserve.onOrder')}>
                <span className="tabular-nums">{p.onOrderQty.toLocaleString()}</span>
              </Tile>
              <Tile icon={Package} label={t('inventory.reorder.threshold')} tone={p.lowStock ? 'warning' : 'neutral'}>
                <span className="tabular-nums">{p.reorderThreshold.toLocaleString()}</span>
              </Tile>
            </div>
          ) : null}
          {p?.shortForUpcoming ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {t('inventory.reserve.shortWarning', { qty: Math.abs(p.availableQty), unit: p.unit })}
            </p>
          ) : null}

          {p?.trackLot ? (
            <section className="rounded-lg border border-border">
              <h3 className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-semibold">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {t('inventory.detail.lots')}
                <span className="font-normal text-muted-foreground">({lots.data?.total ?? 0})</span>
              </h3>
              {lots.isLoading ? (
                <Skeleton className="m-3 h-16" />
              ) : (lots.data?.items ?? []).length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t('inventory.detail.noLots')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {lots.data!.items.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => onLotUsage(l.id)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
                        aria-label={t('inventory.lot.open', { lot: l.lotNumber })}
                      >
                        <span className="min-w-0">
                          <span className="block font-mono font-medium text-foreground">{l.lotNumber}</span>
                          <span className="text-muted-foreground">
                            {t('inventory.lot.expiry')}: {l.expiryDate ?? '—'} · <CurrencyText amount={l.unitCost} />
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="tabular-nums font-medium">{l.qtyOnHand.toLocaleString()}</span>
                          <StatusPill status={l.status} variant={LOT_STATUS_VARIANT[l.status]} label={t(`inventory.lotStatus.${l.status}`)} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <section className="rounded-lg border border-border">
            <h3 className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-semibold">
              <ScrollText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {t('inventory.detail.recent')}
            </h3>
            {moves.isLoading ? (
              <Skeleton className="m-3 h-24" />
            ) : (moves.data?.items ?? []).length === 0 ? (
              <EmptyState icon={ScrollText} title={t('inventory.ledger.empty')} />
            ) : (
              <ul className="divide-y divide-border">
                {moves.data!.items.map((m) => {
                  const q = signedQty(m);
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <span className="min-w-0 space-y-0.5">
                        <StatusPill status={m.type} variant={MOVEMENT_TYPE_VARIANT[m.type]} label={t(`inventory.movement.${m.type}`)} />
                        <span className="block truncate text-muted-foreground">
                          <DateTimeText value={m.createdAt} />
                          {m.reasonCode ? ` · ${t(`inventory.adjReason.${m.reasonCode}`)}` : ''}
                          {m.lotNumber ? ` · ${m.lotNumber}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={cn('block tabular-nums font-medium', q < 0 ? 'text-warning' : 'text-success')}>
                          {q < 0 ? '−' : '+'}
                          {Math.abs(q).toLocaleString()}
                        </span>
                        <span className="tabular-nums text-muted-foreground">= {m.balanceAfter.toLocaleString()}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </SheetBody>

        <SheetFooter>
          {id ? (
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link to={`${ROUTES.inventoryLedger}?productId=${id}`}>
                <ScrollText className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('inventory.detail.openLedger')}
              </Link>
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const TONE: Record<'primary' | 'success' | 'warning' | 'danger' | 'neutral', string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-destructive/10 text-destructive',
  neutral: 'bg-muted text-muted-foreground',
};

function Tile({
  icon: Icon,
  label,
  tone = 'neutral',
  children,
}: {
  icon: LucideIcon;
  label: string;
  tone?: keyof typeof TONE;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <span className={cn('mb-1.5 flex h-6 w-6 items-center justify-center rounded-md', TONE[tone])}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <p className="text-2xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{children}</p>
    </div>
  );
}
