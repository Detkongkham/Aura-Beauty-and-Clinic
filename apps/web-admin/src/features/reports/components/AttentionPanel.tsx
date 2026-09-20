import { CalendarClock, ChevronRight, Clock, Stamp, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import type { DashboardStats } from '@/types/models';

import { ReportSection } from './ReportSection';

type Tone = 'warning' | 'info' | 'destructive';

const TONE: Record<Tone, string> = {
  warning: 'text-warning bg-warning-soft',
  info: 'text-info bg-info-soft',
  destructive: 'text-destructive bg-destructive-soft',
};

interface Row {
  key: string;
  icon: LucideIcon;
  tone: Tone;
  label: string;
  meta: string;
  to: string;
  count: number;
}

/** Operational follow-ups pulled out of the stats payload — the report's
 *  "what needs a decision" list. Rows with a zero count are dropped. */
export function AttentionPanel({ data, index }: { data: DashboardStats; index?: number }) {
  const { t } = useTranslation();

  const rows: Row[] = [
    {
      key: 'approvals',
      icon: Stamp,
      tone: 'warning',
      label: t('reports.attention.pendingApprovals'),
      meta: t('reports.countItems', { count: data.pendingApprovals }),
      to: ROUTES.timeOff,
      count: data.pendingApprovals,
    },
    {
      key: 'confirm',
      icon: CalendarClock,
      tone: 'info',
      label: t('reports.attention.awaitingConfirmation'),
      meta: t('reports.countItems', { count: data.pendingConfirmation }),
      to: ROUTES.calendar,
      count: data.pendingConfirmation,
    },
    {
      key: 'cancelled',
      icon: XCircle,
      tone: 'destructive',
      label: t('reports.attention.cancellationsToday'),
      meta: t('reports.countItems', { count: data.cancelledToday + data.noShowToday }),
      to: ROUTES.appointments,
      count: data.cancelledToday + data.noShowToday,
    },
    {
      key: 'wait',
      icon: Clock,
      tone: 'warning',
      label: t('reports.attention.longestWait'),
      meta: t('reports.minutes', { count: data.queueLongestWaitMin }),
      to: ROUTES.queue,
      count: data.queueLongestWaitMin,
    },
  ];

  const visible = rows.filter((r) => r.count > 0);

  return (
    <ReportSection index={index} title={t('reports.section.attention')} flush>
      {visible.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          {t('reports.attention.allClear')}
        </p>
      ) : (
        <ul>
          {visible.map((r) => {
            const Icon = r.icon;
            return (
              <li key={r.key} className="border-b border-border/50 last:border-0">
                <Link
                  to={r.to}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                      TONE[r.tone],
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {r.label}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {r.meta}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground/60"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ReportSection>
  );
}
