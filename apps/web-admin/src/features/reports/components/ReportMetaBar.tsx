import { useTranslation } from 'react-i18next';

import { formatDate, formatDateTime } from '@/lib/format';

interface Props {
  reportNo: string;
  branchName: string;
  from: string;
  to: string;
}

/** Document header strip — the identifying metadata of a printed report,
 *  on screen as well as on paper. */
export function ReportMetaBar({ reportNo, branchName, from, to }: Props) {
  const { t } = useTranslation();
  const items = [
    { label: t('reports.meta.no'), value: reportNo, mono: true },
    { label: t('reports.meta.period'), value: `${formatDate(from)} – ${formatDate(to)}` },
    { label: t('reports.branch'), value: branchName },
    { label: t('reports.meta.currency'), value: 'LAK (₭)' },
    { label: t('reports.meta.generated'), value: formatDateTime(new Date()) },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2">
        <span className="font-display text-[15px] font-semibold text-foreground">
          {t('reports.businessName')}
        </span>
        <span className="text-[11px] text-muted-foreground">· {t('reports.title')}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div key={it.label} className="min-w-0">
            <dt className="text-[11px] font-semibold text-muted-foreground">
              {it.label}
            </dt>
            <dd
              className={`mt-0.5 truncate text-xs text-foreground ${it.mono ? 'tabular-nums' : ''}`}
              title={it.value}
            >
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
