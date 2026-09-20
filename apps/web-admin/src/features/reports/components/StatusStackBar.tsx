import { useTranslation } from 'react-i18next';

import type { DashboardStats } from '@/types/models';

import { LedgerTable } from './LedgerTable';

const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: 'hsl(var(--info))',
  PENDING: 'hsl(var(--warning))',
  IN_PROGRESS: 'hsl(var(--primary))',
  COMPLETED: 'hsl(var(--success))',
  CANCELLED: 'hsl(var(--muted-foreground))',
  NO_SHOW: 'hsl(var(--destructive))',
};

/** 100% stacked rule + a ruled legend ledger. */
export function StatusStackBar({ data }: { data: DashboardStats['statusBreakdown'] }) {
  const { t } = useTranslation();
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-3">
      <div
        className="flex h-2.5 overflow-hidden rounded-full border border-border"
        role="img"
        aria-label={t('reports.section.status')}
      >
        {data.map((d) => (
          <span
            key={d.status}
            className="h-full"
            style={{
              width: `${total ? (d.count / total) * 100 : 0}%`,
              backgroundColor: STATUS_COLOR[d.status] ?? 'hsl(var(--muted-foreground))',
            }}
          />
        ))}
      </div>

      <LedgerTable
        rows={data}
        rowKey={(r) => r.status}
        columns={[
          {
            key: 'status',
            label: t('reports.col.status'),
            render: (r) => (
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_COLOR[r.status] ?? 'hsl(var(--muted-foreground))' }}
                />
                {t(`status.${r.status}`)}
              </span>
            ),
          },
          {
            key: 'count',
            label: t('reports.col.count'),
            align: 'right',
            render: (r) => r.count,
          },
          {
            key: 'share',
            label: t('reports.col.share'),
            align: 'right',
            render: (r) => `${total ? Math.round((r.count / total) * 100) : 0}%`,
          },
        ]}
        total={[t('reports.total'), total, '100%']}
      />
    </div>
  );
}
