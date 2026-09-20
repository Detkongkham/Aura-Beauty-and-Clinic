import { Download, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type RangeDays = 7 | 14;

interface Props {
  range: RangeDays;
  onRangeChange: (r: RangeDays) => void;
  branchId: string;
  onBranchChange: (id: string) => void;
  branches: Array<{ id: string; name: string }>;
  onPrint: () => void;
  onExport: () => void;
}

/** Sticky filter + actions row above the report body. Hidden when printing. */
export function ReportsToolbar({
  range,
  onRangeChange,
  branchId,
  onBranchChange,
  branches,
  onPrint,
  onExport,
}: Props) {
  const { t } = useTranslation();
  const ranges: RangeDays[] = [7, 14];

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm print:hidden">
      <div
        className="inline-flex rounded-lg border border-border p-0.5"
        role="group"
        aria-label={t('reports.period')}
      >
        {ranges.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onRangeChange(r)}
            aria-pressed={range === r}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium tabular-nums transition-colors',
              range === r
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('reports.rangeDays', { count: r })}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {t('reports.branch')}
        <Select
          className="h-8 min-w-[160px] text-xs"
          value={branchId}
          onChange={(e) => onBranchChange(e.target.value)}
          options={[
            { value: 'all', label: t('branch.all') },
            ...branches.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
      </label>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
          {t('reports.print')}
        </button>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {t('reports.export')}
        </button>
      </div>
    </div>
  );
}
