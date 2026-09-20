import { Download, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { formatDateTime } from '@/lib/format';

interface Props {
  title: string;
  desc?: string;
  /** Scope chips: date/range, branch, etc. */
  scope: string[];
  onPrint: () => void;
  onExport: () => void;
  /** Extra control shown under the scope row (e.g. a date field). */
  control?: ReactNode;
}

/** The masthead of a single standard report — title, scope, generated time,
 *  and the print / export actions. */
export function ReportDocHeader({ title, desc, scope, onPrint, onExport, control }: Props) {
  const { t } = useTranslation();
  return (
    <div className="border-b border-border pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold leading-tight text-foreground">
            {title}
          </h2>
          {desc ? <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 print:hidden">
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

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        {scope.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            {i > 0 ? <span aria-hidden="true" className="text-border">·</span> : null}
            <span>{s}</span>
          </span>
        ))}
        <span aria-hidden="true" className="text-border">·</span>
        <span>{t('reports.generatedAt', { at: formatDateTime(new Date()) })}</span>
      </div>

      {control ? <div className="mt-3 print:hidden">{control}</div> : null}
    </div>
  );
}
