import { LAK_DENOMINATIONS, type CashDrawerSessionView } from '@abcp/shared-types';
import { ArrowDownToLine, ArrowUpFromLine, Banknote, Calculator, Coins, History, HandCoins, Lock, Unlock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { TONE } from '@/features/payroll/payroll.lib';
import { SectionCard } from '@/features/payroll/payroll.parts';
import { formatDateTime, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { CashVarianceCard } from './CashVarianceCard';
import { SignedAmount } from './recon.parts';
import { ZReportDialog } from './ZReportDialog';
import { useCloseDrawer, useCurrentDrawer, useDrawerMovement, useDrawerSessions, useOpenDrawer } from './reconciliation.api';

type MovementType = 'DROP' | 'PAYIN' | 'PAYOUT';
const MOVE_ICON = { DROP: ArrowUpFromLine, PAYIN: ArrowDownToLine, PAYOUT: HandCoins } as const;

interface Props {
  branchId: string;
  branches: { id: string; name: string }[];
  /** SUPER_ADMIN picks the branch here when the page isn't filtered to one. */
  onBranch: ((id: string) => void) | null;
  canOperate: boolean;
}

/**
 * G10 — the till. Card payments and transfers are checked against the bank; cash
 * never reaches a bank statement until someone deposits it, so it is checked here:
 * float + cash sales − cash refunds + pay-ins − drops − payouts = what should be in
 * the drawer. Closing is a banknote count, and any difference needs a note.
 */
export function ReconCashDrawer({ branchId, branches, onBranch, canOperate }: Props) {
  const { t } = useTranslation();
  const current = useCurrentDrawer(branchId || null);
  const history = useDrawerSessions(branchId || null);
  const [zId, setZId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {onBranch ? (
        <div className="flex items-center gap-2">
          <Label htmlFor="drawer-branch" className="text-xs">
            {t('payTreasury.col.branch')}
          </Label>
          <Select
            id="drawer-branch"
            className="h-9 w-[220px]"
            value={branchId}
            onChange={(e) => onBranch(e.target.value)}
            placeholder={t('payTreasury.allBranches')}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
      ) : null}

      {!branchId ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {t('payTreasury.recon.cash.pickBranch')}
        </p>
      ) : current.isLoading ? (
        <Skeleton className="h-[260px] w-full rounded-xl" />
      ) : current.data ? (
        <>
          <OpenDrawer session={current.data} canOperate={canOperate} />
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setZId(current.data!.id)}>
            {t('payTreasury.recon.cash.z.preview')}
          </button>
        </>
      ) : (
        <ClosedDrawer branchId={branchId} canOperate={canOperate} />
      )}

      {branchId ? (
        <SectionCard icon={History} title={t('payTreasury.recon.cash.historyTitle')} bodyClassName="p-0">
          {history.isLoading ? (
            <Skeleton className="m-4 h-24" />
          ) : !(history.data ?? []).filter((s) => s.status === 'CLOSED').length ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('payTreasury.recon.cash.noHistory')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-2xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">{t('payTreasury.recon.cash.shift')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('payTreasury.recon.cash.countedBy')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('payTreasury.recon.cash.expected')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('payTreasury.recon.cash.counted')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('payTreasury.recon.variance')}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {history.data!
                    .filter((s) => s.status === 'CLOSED')
                    .map((s) => (
                      <tr key={s.id}>
                        <td className="whitespace-nowrap px-4 py-2">
                          {formatDateTime(s.openedAt)} – {s.closedAt ? formatTime(s.closedAt) : ''}
                          <div className="text-2xs text-muted-foreground">
                            {t('payTreasury.recon.cash.salesN', { count: s.cashSalesCount })} · <CurrencyText amount={s.cashSales} />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {s.closedByName ?? '—'}
                          {s.closingNote ? <div className="max-w-[240px] truncate text-2xs text-muted-foreground">{s.closingNote}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <CurrencyText amount={s.expectedAmount} />
                        </td>
                        <td className="px-3 py-2 text-right">{s.countedAmount != null ? <CurrencyText amount={s.countedAmount} /> : '—'}</td>
                        <td className="px-4 py-2 text-right">
                          <SignedAmount value={s.variance} zeroLabel={t('payTreasury.recon.cash.exact')} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setZId(s.id)}>
                            {t('payTreasury.recon.cash.z.open')}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      {branchId ? <CashVarianceCard branchId={branchId} /> : null}
      <ZReportDialog sessionId={zId} onClose={() => setZId(null)} />
    </div>
  );
}

const onErr = (t: (k: string) => string) => (e: unknown) => toast.error(e instanceof NormalizedApiError ? e.message : t('common.saveError'));

function ClosedDrawer({ branchId, canOperate }: { branchId: string; canOperate: boolean }) {
  const { t } = useTranslation();
  const open = useOpenDrawer();
  const [float, setFloat] = useState('');
  const [note, setNote] = useState('');
  const n = Number(float);
  return (
    <section className="rounded-xl border border-dashed border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Lock className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{t('payTreasury.recon.cash.closedTitle')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('payTreasury.recon.cash.closedHint')}</p>
          {canOperate ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="drawer-float">{t('payTreasury.recon.cash.float')}</Label>
                <Input id="drawer-float" type="number" inputMode="numeric" min={0} className="tabular-nums" value={float} onChange={(e) => setFloat(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="drawer-open-note">{t('payTreasury.recon.note')}</Label>
                <Input id="drawer-open-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <Button
                disabled={float === '' || !Number.isFinite(n) || n < 0 || open.isPending}
                onClick={() =>
                  open.mutate(
                    { branchId, openingFloat: n, note: note.trim() || undefined },
                    { onSuccess: () => toast.success(t('payTreasury.recon.cash.opened')), onError: onErr(t) },
                  )
                }
              >
                <Unlock className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payTreasury.recon.cash.open')}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function OpenDrawer({ session: s, canOperate }: { session: CashDrawerSessionView; canOperate: boolean }) {
  const { t } = useTranslation();
  const move = useDrawerMovement();
  const [moveType, setMoveType] = useState<MovementType | null>(null);
  const [amount, setAmount] = useState('');
  const [moveNote, setMoveNote] = useState('');
  const [counting, setCounting] = useState(false);

  const lines: { key: string; label: string; value: number; sign: 1 | -1 }[] = [
    { key: 'float', label: t('payTreasury.recon.cash.float'), value: s.openingFloat, sign: 1 },
    { key: 'sales', label: t('payTreasury.recon.cash.sales', { count: s.cashSalesCount }), value: s.cashSales, sign: 1 },
    { key: 'refunds', label: t('payTreasury.recon.cash.refunds'), value: s.cashRefunds, sign: -1 },
    { key: 'payins', label: t('payTreasury.recon.cash.move.PAYIN'), value: s.payIns, sign: 1 },
    { key: 'drops', label: t('payTreasury.recon.cash.move.DROP'), value: s.drops, sign: -1 },
    { key: 'payouts', label: t('payTreasury.recon.cash.move.PAYOUT'), value: s.payouts, sign: -1 },
  ];
  const a = Number(amount);

  return (
    <section
      aria-labelledby="drawer-title"
      className="relative overflow-hidden rounded-xl border border-success/25 bg-gradient-to-br from-success-soft/40 via-card to-card p-4 shadow-sm sm:p-5"
    >
      <Coins className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 text-success/[0.07]" aria-hidden="true" />
      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <p id="drawer-title" className="flex items-center gap-1.5 text-[13px] font-medium text-success">
            <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
            {t('payTreasury.recon.cash.openTitle', { name: s.openedByName ?? '—', at: formatDateTime(s.openedAt) })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t('payTreasury.recon.cash.expectedNow')}</p>
          <p className="text-3xl font-bold leading-tight tabular-nums">
            <CurrencyText amount={s.expectedAmount} currency={s.currency as 'LAK'} />
          </p>

          <dl className="mt-3 divide-y divide-border rounded-lg border border-border bg-card/70 text-sm">
            {lines.map((l) => (
              <div key={l.key} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <dt className="text-xs text-muted-foreground">{l.label}</dt>
                <dd className={cn('tabular-nums', l.value === 0 && 'text-muted-foreground')}>
                  {l.value === 0 ? '—' : (
                    <>
                      {l.sign > 0 ? '+' : '−'}
                      <CurrencyText amount={l.value} currency={s.currency as 'LAK'} />
                    </>
                  )}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 bg-muted/40 px-3 py-2 font-semibold">
              <dt className="text-xs">{t('payTreasury.recon.cash.expected')}</dt>
              <dd className="tabular-nums">
                <CurrencyText amount={s.expectedAmount} currency={s.currency as 'LAK'} />
              </dd>
            </div>
          </dl>

          {s.movements.length ? (
            <ul className="mt-3 space-y-1 text-xs">
              {s.movements.map((m) => {
                const Icon = MOVE_ICON[m.type];
                return (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">{t(`payTreasury.recon.cash.move.${m.type}`)}</span>
                      <span className="truncate text-muted-foreground">
                        {formatTime(m.createdAt)} · {m.createdByName ?? '—'}
                        {m.note ? ` · ${m.note}` : ''}
                      </span>
                    </span>
                    <CurrencyText amount={m.amount} className="shrink-0 font-semibold tabular-nums" />
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {canOperate ? (
          <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card/80 p-3.5">
            <p className="text-xs font-semibold">{t('payTreasury.recon.cash.movementTitle')}</p>
            <div role="radiogroup" aria-label={t('payTreasury.recon.cash.movementTitle')} className="grid grid-cols-3 gap-1">
              {(['DROP', 'PAYIN', 'PAYOUT'] as const).map((mt) => {
                const Icon = MOVE_ICON[mt];
                return (
                  <button
                    key={mt}
                    type="button"
                    role="radio"
                    aria-checked={moveType === mt}
                    onClick={() => setMoveType(mt)}
                    className={cn(
                      'flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-2xs font-medium transition-colors',
                      moveType === mt ? cn(TONE.primary.chip, 'border-primary/40') : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {t(`payTreasury.recon.cash.move.${mt}`)}
                  </button>
                );
              })}
            </div>
            {moveType ? (
              <div className="grid gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="tabular-nums"
                  value={amount}
                  placeholder={t('payTreasury.recon.cash.amount')}
                  aria-label={t('payTreasury.recon.cash.amount')}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Input value={moveNote} maxLength={300} placeholder={t('payTreasury.recon.note')} aria-label={t('payTreasury.recon.note')} onChange={(e) => setMoveNote(e.target.value)} />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!(a > 0) || move.isPending}
                  onClick={() =>
                    move.mutate(
                      { id: s.id, input: { type: moveType, amount: a, note: moveNote.trim() || undefined } },
                      {
                        onSuccess: () => {
                          toast.success(t('common.saved'));
                          setAmount('');
                          setMoveNote('');
                          setMoveType(null);
                        },
                        onError: onErr(t),
                      },
                    )
                  }
                >
                  {t('payTreasury.recon.cash.record')}
                </Button>
              </div>
            ) : null}
            <Button className="mt-auto" onClick={() => setCounting((v) => !v)} aria-expanded={counting}>
              <Calculator className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('payTreasury.recon.cash.countClose')}
            </Button>
          </div>
        ) : null}
      </div>

      {counting && canOperate ? <CountAndClose session={s} onDone={() => setCounting(false)} /> : null}
    </section>
  );
}

function CountAndClose({ session: s, onDone }: { session: CashDrawerSessionView; onDone: () => void }) {
  const { t } = useTranslation();
  const close = useCloseDrawer();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const counted = useMemo(
    () => LAK_DENOMINATIONS.reduce((n, d) => n + d * (Number(qty[String(d)]) || 0), 0),
    [qty],
  );
  const variance = Math.round((counted - s.expectedAmount) * 100) / 100;
  const off = Math.abs(variance) > 0.01;

  return (
    <div className="relative mt-5 rounded-lg border border-border bg-card p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Banknote className="h-4 w-4 text-primary" aria-hidden="true" />
        {t('payTreasury.recon.cash.countTitle')}
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LAK_DENOMINATIONS.map((d) => {
          const q = Number(qty[String(d)]) || 0;
          return (
            <div key={d} className="rounded-md border border-border px-2.5 py-2">
              <Label htmlFor={`den-${d}`} className="text-2xs text-muted-foreground">
                <CurrencyText amount={d} />
              </Label>
              <Input
                id={`den-${d}`}
                type="number"
                inputMode="numeric"
                min={0}
                className="mt-1 h-8 tabular-nums"
                value={qty[String(d)] ?? ''}
                placeholder="0"
                onChange={(e) => setQty((p) => ({ ...p, [String(d)]: e.target.value }))}
              />
              <p className="mt-1 text-right text-2xs tabular-nums text-muted-foreground">{q ? <CurrencyText amount={q * d} /> : '—'}</p>
            </div>
          );
        })}
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <dt className="text-2xs text-muted-foreground">{t('payTreasury.recon.cash.counted')}</dt>
          <dd className="text-lg font-bold tabular-nums">
            <CurrencyText amount={counted} />
          </dd>
        </div>
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <dt className="text-2xs text-muted-foreground">{t('payTreasury.recon.cash.expected')}</dt>
          <dd className="text-lg font-bold tabular-nums">
            <CurrencyText amount={s.expectedAmount} />
          </dd>
        </div>
        <div className={cn('rounded-md px-3 py-2', off ? TONE.danger.chip : TONE.success.chip)}>
          <dt className="text-2xs">{variance > 0 ? t('payTreasury.recon.cash.over') : variance < 0 ? t('payTreasury.recon.cash.short') : t('payTreasury.recon.variance')}</dt>
          <dd className="text-lg font-bold tabular-nums">
            <SignedAmount value={variance} zeroLabel={t('payTreasury.recon.cash.exact')} className="text-inherit" />
          </dd>
        </div>
      </dl>
      <div className="mt-3 grid gap-1.5">
        <Label htmlFor="drawer-close-note">{off ? t('payTreasury.recon.cash.noteRequired') : t('payTreasury.recon.note')}</Label>
        <Textarea id="drawer-close-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={close.isPending || (off && !note.trim())}
          onClick={() =>
            close.mutate(
              {
                id: s.id,
                input: {
                  denominations: Object.fromEntries(
                    Object.entries(qty)
                      .map(([k, v]) => [k, Number(v) || 0] as const)
                      .filter(([, v]) => v > 0),
                  ),
                  note: note.trim() || undefined,
                },
              },
              {
                onSuccess: () => {
                  toast.success(t('payTreasury.recon.cash.closed'));
                  onDone();
                },
                onError: onErr(t),
              },
            )
          }
        >
          <Lock className="mr-1 h-4 w-4" aria-hidden="true" />
          {t('payTreasury.recon.cash.close')}
        </Button>
      </div>
    </div>
  );
}
