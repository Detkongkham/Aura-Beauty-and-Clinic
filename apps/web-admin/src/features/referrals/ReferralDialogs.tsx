import { type FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Percent, Search, Trash2, UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AffiliateView } from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCustomers } from '@/features/customers/customers.api';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { useEnrollAffiliate, useRemoveAffiliate, useUpdateAffiliate } from './referrals.api';

/** Reference bill used by the "what this rate is worth" preview line. */
const SAMPLE_BILL = 1_000_000;
const RATE_PRESETS = [5, 10, 15, 20];
const MAX_RATE = 50;

function RatePicker({
  rate,
  onChange,
  id,
}: {
  rate: string;
  onChange: (next: string) => void;
  id: string;
}) {
  const { t } = useTranslation();
  const numeric = Number(rate);
  const valid = Number.isFinite(numeric) && numeric >= 0 && numeric <= MAX_RATE;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('referrals.commissionRatePct')}</Label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            type="number"
            min="0"
            max={MAX_RATE}
            inputMode="numeric"
            value={rate}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={!valid || undefined}
            aria-describedby={`${id}-hint`}
            className="pr-8"
          />
          <Percent
            className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <div className="flex items-center gap-1">
          {RATE_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(String(p))}
              aria-pressed={numeric === p}
              className={cn(
                'cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                numeric === p
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary',
              )}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>
      <p
        id={`${id}-hint`}
        className={cn('text-xs', valid ? 'text-muted-foreground' : 'text-destructive')}
        role={valid ? undefined : 'alert'}
      >
        {valid
          ? t('referrals.ratePreview', {
              bill: formatCurrency(SAMPLE_BILL),
              commission: formatCurrency(Math.round((SAMPLE_BILL * numeric) / 100)),
            })
          : t('referrals.rateInvalid')}
      </p>
    </div>
  );
}

// ---- Enroll -------------------------------------------------------

export function EnrollDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [rate, setRate] = useState('10');
  const enroll = useEnrollAffiliate();
  const { data, isFetching } = useCustomers({ q: q || undefined, page: 1, pageSize: 8 });

  const reset = () => {
    setQ('');
    setPicked(null);
    setRate('10');
  };

  const numeric = Number(rate);
  const rateValid = Number.isFinite(numeric) && numeric >= 0 && numeric <= MAX_RATE;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('referrals.enrollTitle')}</DialogTitle>
          <DialogDescription>{t('referrals.enrollHint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="enroll-search">{t('referrals.partnerLabel')}</Label>
            {picked ? (
              <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <PersonAvatar name={picked.name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{picked.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{picked.phone}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={() => setPicked(null)}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                  {t('referrals.changePartner')}
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="enroll-search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t('referrals.searchCustomer')}
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                  {(data?.items ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-muted"
                      onClick={() => setPicked({ id: c.id, name: c.name, phone: c.phone })}
                    >
                      <PersonAvatar name={c.name} size={30} />
                      <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{c.phone}</span>
                    </button>
                  ))}
                  {(data?.items.length ?? 0) === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                      {isFetching ? t('common.loading') : q ? t('referrals.noMatch') : t('referrals.searchHint')}
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>

          <RatePicker id="enroll-rate" rate={rate} onChange={setRate} />
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!picked || !rateValid || enroll.isPending}
            onClick={() => {
              if (!picked || !rateValid) return;
              enroll.mutate(
                { userId: picked.id, commissionRate: numeric / 100 },
                {
                  onSuccess: () => {
                    toast.success(t('referrals.enrolled', { name: picked.name }));
                    reset();
                    onClose();
                  },
                  onError: (err) =>
                    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
                },
              );
            }}
          >
            <UserPlus className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('referrals.enroll')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Edit rate -----------------------------------------------------

export function RateDialog({
  affiliate,
  onClose,
}: {
  affiliate: AffiliateView | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateAffiliate();
  const [rate, setRate] = useState('');

  useEffect(() => {
    if (affiliate) setRate(String(Math.round(affiliate.commissionRate * 100)));
  }, [affiliate]);

  const numeric = Number(rate);
  const rateValid = Number.isFinite(numeric) && numeric >= 0 && numeric <= MAX_RATE;
  const current = Math.round((affiliate?.commissionRate ?? 0) * 100);
  const changed = rateValid && numeric !== current;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!affiliate || !rateValid) return;
    update.mutate(
      { id: affiliate.id, input: { commissionRate: numeric / 100 } },
      {
        onSuccess: () => {
          toast.success(t('common.saved'));
          onClose();
        },
        onError: (err) =>
          toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  return (
    <Dialog open={Boolean(affiliate)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('referrals.editRateTitle')}</DialogTitle>
          <DialogDescription>{t('referrals.editRateHint')}</DialogDescription>
        </DialogHeader>
        {affiliate ? (
          <form className="space-y-4" onSubmit={submit}>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <PersonAvatar name={affiliate.userName} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{affiliate.userName}</p>
                <p className="truncate text-xs text-muted-foreground">{affiliate.userPhone}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant="neutral">{t('referrals.ratePct', { rate: current })}</Badge>
                {changed ? (
                  <>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <Badge variant="primary">{t('referrals.ratePct', { rate: numeric })}</Badge>
                  </>
                ) : null}
              </div>
            </div>

            <RatePicker id="edit-rate" rate={rate} onChange={setRate} />

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={update.isPending || !changed}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ---- Remove --------------------------------------------------------

export function RemovePartnerDialog({
  affiliate,
  onClose,
}: {
  affiliate: AffiliateView | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const removeM = useRemoveAffiliate();
  // Backend rejects removal while commission is still owed (affiliate.service.ts) —
  // surface that here instead of letting the user hit a 409.
  const blocked = (affiliate?.unpaidBalance ?? 0) > 0;

  return (
    <Dialog open={Boolean(affiliate)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('referrals.removeTitle')}</DialogTitle>
          <DialogDescription>{t('referrals.removeHint')}</DialogDescription>
        </DialogHeader>

        {affiliate ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <PersonAvatar name={affiliate.userName} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{affiliate.userName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t('referrals.lifetimeEarnings')} <CurrencyText amount={affiliate.totalEarnings} />
                </p>
              </div>
            </div>

            {blocked ? (
              <div
                className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning-soft/60 px-3 py-2.5"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <p className="text-xs text-foreground">
                  {t('referrals.removeBlocked')}{' '}
                  <CurrencyText amount={affiliate.unpaidBalance} className="font-semibold" />
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} autoFocus>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={removeM.isPending || blocked}
            onClick={() => {
              if (!affiliate) return;
              removeM.mutate(affiliate.id, {
                onSuccess: () => {
                  toast.success(t('common.deleted'));
                  onClose();
                },
                onError: (err) =>
                  toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
              });
            }}
          >
            <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('common.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
