import { Plus, Split, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

import type { SplitRow } from './recurringSplit.lib';

/**
 * Wave 11 — allocation template on a recurring rule: every expense the rule generates is split
 * across branches by these percentages. Owner-only (splitting to other branches is a company decision).
 */
export function RecurringSplitEditor({
  rows,
  onChange,
  branches,
  payingBranchId,
}: {
  rows: SplitRow[];
  onChange: (rows: SplitRow[]) => void;
  branches: { id: string; name: string }[];
  payingBranchId: string;
}) {
  const { t } = useTranslation();
  const sum = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0);
  if (rows.length === 0) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-self-start"
        onClick={() => onChange([{ branchId: payingBranchId, percent: '50' }, { branchId: '', percent: '50' }])}
      >
        <Split className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        {t('payTreasury.exp.recurringSplit.add')}
      </Button>
    );
  }
  return (
    <div className="space-y-1.5 rounded-md border border-border p-2 sm:col-span-2">
      <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.recurringSplit.hint')}</p>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_auto] items-center gap-1.5">
          <Select
            aria-label={t('payTreasury.col.branch')}
            value={r.branchId}
            placeholder={t('payTreasury.exp.recurringSplit.pickBranch')}
            onChange={(e) => onChange(rows.map((x, k) => (k === i ? { ...x, branchId: e.target.value } : x)))}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
          <Input
            aria-label="%"
            type="number"
            min={0}
            max={100}
            value={r.percent}
            onChange={(e) => onChange(rows.map((x, k) => (k === i ? { ...x, percent: e.target.value } : x)))}
            className="h-9 tabular-nums"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={t('common.remove', { defaultValue: 'Remove' })}
            onClick={() => onChange(rows.filter((_, k) => k !== i))}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button type="button" size="sm" variant="ghost" disabled={rows.length >= 20} onClick={() => onChange([...rows, { branchId: '', percent: '' }])}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {t('payTreasury.exp.recurringSplit.addBranch')}
        </Button>
        <span className={`text-2xs tabular-nums ${Math.abs(sum - 100) < 0.01 ? 'text-success' : 'text-destructive'}`}>
          {t('payTreasury.exp.recurringSplit.sum', { sum: Math.round(sum * 100) / 100 })}
        </span>
      </div>
    </div>
  );
}
