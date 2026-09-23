import type { CashFundView } from '@abcp/shared-types';
import { ArrowDownToLine, ArrowUpFromLine, Calculator, ChevronDown, Coins, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { useCashFundAction, useCashFundEntries, useCashFunds, useSaveCashFund } from './expenses.api';

type Mode = { fundId: string; kind: 'TOPUP' | 'WITHDRAW' | 'COUNT' } | null;

/**
 * E9 — petty-cash boxes per branch. The balance is never typed in: it is the sum of the ledger
 * (top-ups, withdrawals, expenses paid from the box, reversals, counts), so the figure on screen is
 * always explainable line by line. A count records the difference between the drawer and the ledger.
 */
export function CashFundsPanel({
  branches,
  defaultBranchId,
  canEdit,
}: {
  branches: { id: string; name: string }[];
  defaultBranchId?: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || '');
  // Branches arrive after mount — pick one once they do.
  useEffect(() => {
    if (!branchId && branches[0]) setBranchId(defaultBranchId || branches[0].id);
  }, [branches, branchId, defaultBranchId]);
  const { data: funds = [] } = useCashFunds(branchId || undefined, { enabled: Boolean(branchId) });
  const save = useSaveCashFund();
  const act = useCashFundAction();
  const [mode, setMode] = useState<Mode>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', opening: '', float: '' });

  const onError = (err: unknown) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));
  const total = funds.filter((f) => f.isActive && f.currency === 'LAK').reduce((a, f) => a + f.balance, 0);

  function submitMode(f: CashFundView) {
    if (!mode) return;
    const n = Number(value);
    if (!(n >= 0) || (mode.kind !== 'COUNT' && !(n > 0))) return;
    act.mutate(
      mode.kind === 'COUNT'
        ? { id: f.id, kind: 'count', input: { countedAmount: n, note: note.trim() || undefined } }
        : { id: f.id, kind: 'move', input: { type: mode.kind, amount: n, note: note.trim() || undefined } },
      {
        onSuccess: (v) => {
          toast.success(
            mode.kind === 'COUNT' && v.lastCount && v.lastCount.difference !== 0
              ? t('payTreasury.exp.petty.countDiff', { diff: v.lastCount.difference.toLocaleString() })
              : t('common.saved'),
          );
          setMode(null);
          setValue('');
          setNote('');
        },
        onError,
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {branches.length > 1 ? (
          <Select className="h-9 w-[180px]" value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.name }))} aria-label={t('payTreasury.col.branch')} />
        ) : (
          <span />
        )}
        <p className="text-2xs text-muted-foreground">
          {t('payTreasury.exp.petty.totalOnHand')} <CurrencyText amount={total} className="font-semibold text-foreground" />
        </p>
      </div>

      {funds.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">{t('payTreasury.exp.petty.none')}</p>
      ) : (
        <ul className="space-y-2">
          {funds.map((f) => {
            const fill = f.floatAmount ? Math.min(100, Math.max(0, (f.balance / f.floatAmount) * 100)) : null;
            const low = f.floatAmount != null && f.balance < f.floatAmount * 0.25;
            const active = mode?.fundId === f.id;
            return (
              <li key={f.id} className={cn('rounded-lg border border-border p-3', !f.isActive && 'opacity-60')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-foreground">
                      <Coins className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{f.name}</p>
                      <p className="truncate text-2xs text-muted-foreground">
                        {t('payTreasury.exp.petty.spent30', { amount: f.spent30d.toLocaleString() })} · {f.currency}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn('text-lg font-bold tabular-nums', low ? 'text-warning' : 'text-foreground')}>
                      <CurrencyText amount={f.balance} currency={f.currency as 'LAK'} />
                    </p>
                    {f.floatAmount ? (
                      <p className="text-2xs text-muted-foreground">
                        {t('payTreasury.exp.petty.float')} <CurrencyText amount={f.floatAmount} currency={f.currency as 'LAK'} />
                      </p>
                    ) : null}
                  </div>
                </div>

                {fill != null ? (
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={t('payTreasury.exp.petty.fillAria', { pct: Math.round(fill) })}>
                    <span className={cn('block h-full rounded-full', low ? 'bg-warning' : 'bg-success')} style={{ width: `${fill}%` }} />
                  </span>
                ) : null}

                <p className="mt-1.5 text-2xs text-muted-foreground">
                  {f.lastCount ? (
                    <>
                      {t('payTreasury.exp.petty.lastCount', { at: formatDateTime(f.lastCount.at), by: f.lastCount.by })}{' '}
                      <span className={cn('font-medium', f.lastCount.difference === 0 ? 'text-success' : 'text-destructive')}>
                        {f.lastCount.difference === 0
                          ? t('payTreasury.exp.petty.balanced')
                          : t('payTreasury.exp.petty.diff', { diff: (f.lastCount.difference > 0 ? '+' : '') + f.lastCount.difference.toLocaleString() })}
                      </span>
                    </>
                  ) : (
                    <span className="text-warning">{t('payTreasury.exp.petty.neverCounted')}</span>
                  )}
                  {f.floatAmount && f.balance < f.floatAmount ? (
                    <span className="ml-2">
                      · {t('payTreasury.exp.petty.suggestTopup', { amount: (f.floatAmount - f.balance).toLocaleString() })}
                    </span>
                  ) : null}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {canEdit && f.isActive ? (
                    <>
                      {(['TOPUP', 'WITHDRAW', 'COUNT'] as const).map((k) => {
                        const Icon = k === 'TOPUP' ? ArrowDownToLine : k === 'WITHDRAW' ? ArrowUpFromLine : Calculator;
                        return (
                          <Button
                            key={k}
                            size="sm"
                            variant={active && mode?.kind === k ? 'primary' : 'secondary'}
                            className="h-7 text-2xs"
                            onClick={() => {
                              setMode(active && mode?.kind === k ? null : { fundId: f.id, kind: k });
                              setValue(k === 'TOPUP' && f.floatAmount && f.balance < f.floatAmount ? String(f.floatAmount - f.balance) : '');
                              setNote('');
                            }}
                          >
                            <Icon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            {t(`payTreasury.exp.petty.${k}`)}
                          </Button>
                        );
                      })}
                    </>
                  ) : null}
                  <Button size="sm" variant="ghost" className="h-7 text-2xs" onClick={() => setOpenHistory(openHistory === f.id ? null : f.id)} aria-expanded={openHistory === f.id}>
                    {t('payTreasury.exp.history')}
                    <ChevronDown className={cn('ml-1 h-3.5 w-3.5 transition-transform', openHistory === f.id && 'rotate-180')} aria-hidden="true" />
                  </Button>
                  {canEdit ? (
                    <Switch
                      className="ml-auto"
                      checked={f.isActive}
                      aria-label={t('payTreasury.exp.petty.toggle', { name: f.name })}
                      onCheckedChange={(isActive) => save.mutate({ id: f.id, update: { isActive } }, { onError })}
                    />
                  ) : null}
                </div>

                {active && mode ? (
                  <form
                    className="mt-2 grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[140px_1fr_auto]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitMode(f);
                    }}
                  >
                    <Input
                      type="number"
                      min={0}
                      autoFocus
                      aria-label={mode.kind === 'COUNT' ? t('payTreasury.exp.petty.counted') : t('payTreasury.exp.amount')}
                      placeholder={mode.kind === 'COUNT' ? t('payTreasury.exp.petty.counted') : t('payTreasury.exp.amount')}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="h-8 tabular-nums"
                    />
                    <Input aria-label={t('payTreasury.exp.notes')} placeholder={t('payTreasury.exp.notes')} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="h-8" />
                    <Button type="submit" size="sm" className="h-8" disabled={act.isPending || value === ''}>
                      {t('common.save')}
                    </Button>
                    {mode.kind === 'COUNT' && value !== '' ? (
                      <p className="text-2xs text-muted-foreground sm:col-span-3">
                        {t('payTreasury.exp.petty.countPreview', {
                          expected: f.balance.toLocaleString(),
                          diff: ((Number(value) || 0) - f.balance > 0 ? '+' : '') + ((Number(value) || 0) - f.balance).toLocaleString(),
                        })}
                      </p>
                    ) : null}
                  </form>
                ) : null}

                {openHistory === f.id ? <FundHistory fundId={f.id} currency={f.currency} /> : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <fieldset className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3">
          <legend className="px-1 text-xs font-medium">{t('payTreasury.exp.petty.add')}</legend>
          <Input aria-label={t('payTreasury.exp.petty.name')} placeholder={t('payTreasury.exp.petty.namePh')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-9 sm:col-span-3" />
          <Input aria-label={t('payTreasury.exp.petty.opening')} placeholder={t('payTreasury.exp.petty.opening')} type="number" min={0} value={draft.opening} onChange={(e) => setDraft({ ...draft, opening: e.target.value })} className="h-9 tabular-nums" />
          <Input aria-label={t('payTreasury.exp.petty.float')} placeholder={t('payTreasury.exp.petty.float')} type="number" min={0} value={draft.float} onChange={(e) => setDraft({ ...draft, float: e.target.value })} className="h-9 tabular-nums" />
          <Button
            disabled={!draft.name.trim() || !branchId || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  create: {
                    branchId,
                    name: draft.name.trim(),
                    currency: 'LAK',
                    ...(Number(draft.opening) > 0 ? { openingBalance: Number(draft.opening) } : {}),
                    ...(Number(draft.float) > 0 ? { floatAmount: Number(draft.float) } : {}),
                  },
                },
                {
                  onSuccess: () => {
                    toast.success(t('common.saved'));
                    setDraft({ name: '', opening: '', float: '' });
                  },
                  onError,
                },
              )
            }
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('payTreasury.exp.petty.create')}
          </Button>
        </fieldset>
      ) : null}
    </div>
  );
}

function FundHistory({ fundId, currency }: { fundId: string; currency: string }) {
  const { t } = useTranslation();
  const { data: rows = [], isLoading } = useCashFundEntries(fundId);
  if (isLoading) return <p className="mt-2 text-2xs text-muted-foreground">…</p>;
  return (
    <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
      {rows.map((r) => (
        <li key={r.id} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 px-2.5 py-1.5 text-2xs">
          <span className="min-w-0">
            <span className="font-medium text-foreground">{t(`payTreasury.exp.petty.type.${r.type}`)}</span>
            <span className="block truncate text-muted-foreground">
              {r.expense?.title ?? r.note ?? ''} · {r.createdBy} · {formatDateTime(r.createdAt)}
            </span>
          </span>
          <span className={cn('tabular-nums font-medium', r.amount < 0 ? 'text-destructive' : r.amount > 0 ? 'text-success' : 'text-muted-foreground')}>
            {r.amount > 0 ? '+' : ''}
            {r.amount.toLocaleString()}
          </span>
          <CurrencyText amount={r.balanceAfter} currency={currency as 'LAK'} className="tabular-nums text-muted-foreground" />
        </li>
      ))}
    </ul>
  );
}
