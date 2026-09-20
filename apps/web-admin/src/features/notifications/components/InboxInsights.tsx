import { Activity, Keyboard } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { dayjs } from '@/lib/format';
import { cn } from '@/lib/utils';

import { CATEGORY_META, CATEGORY_ORDER } from '../notificationModel';
import type { AppNotification, Category, NotificationList } from '../notifications.api';

interface InboxInsightsProps {
  items: AppNotification[];
  daily: NotificationList['daily'];
  category: Category | 'all';
  onCategory: (c: Category | 'all') => void;
  className?: string;
}

const SHORTCUTS: [string, string][] = [
  ['j / k', 'notifications.kbNav'],
  ['Enter', 'notifications.kbOpen'],
  ['e', 'notifications.kbResolve'],
  ['u', 'notifications.kbRead'],
  ['x', 'notifications.kbSelect'],
  ['/', 'notifications.kbSearch'],
  ['Esc', 'notifications.kbClose'],
];

/**
 * Side panel shown when nothing is open: 14-day volume by severity (stacked bars drawn with divs —
 * no chart lib needed for 14 columns, and each bar carries a text title + sr-only table),
 * category mix that doubles as a filter, and the keyboard shortcut legend.
 */
export function InboxInsights({
  items,
  daily,
  category,
  onCategory,
  className,
}: InboxInsightsProps) {
  const { t } = useTranslation();

  const peak = Math.max(1, ...daily.map((d) => d.total));
  const total14 = daily.reduce((s, d) => s + d.total, 0);

  const byCategory = useMemo(() => {
    const map = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, { total: 0, open: 0 }])) as Record<
      Category,
      { total: number; open: number }
    >;
    for (const n of items) {
      map[n.category].total += 1;
      if (!n.resolved && n.severity !== 'info') map[n.category].open += 1;
    }
    return map;
  }, [items]);
  const maxCat = Math.max(1, ...CATEGORY_ORDER.map((c) => byCategory[c].total));

  return (
    <div className={cn('space-y-4', className)}>
      <section
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
        aria-labelledby="ntf-activity"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="ntf-activity" className="flex items-center gap-1.5 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
              {t('notifications.activityTitle')}
            </h2>
            <p className="text-2xs text-muted-foreground">
              {t('notifications.activityHint', { count: total14 })}
            </p>
          </div>
        </div>

        <div
          className="mt-4 flex h-28 items-end gap-1"
          role="img"
          aria-label={t('notifications.activityAria', { count: total14, peak })}
        >
          {daily.map((d, i) => {
            const info = d.total - d.critical - d.warning;
            const isToday = i === daily.length - 1;
            return (
              <div
                key={d.date}
                className="group flex h-full min-w-0 flex-1 flex-col justify-end"
                title={`${dayjs(d.date).format('DD/MM')} — ${d.total} (${t('notifications.severity.critical')} ${d.critical}, ${t('notifications.severity.warning')} ${d.warning})`}
              >
                <div
                  className={cn(
                    'flex w-full origin-bottom flex-col-reverse overflow-hidden rounded-t-[3px] transition-opacity duration-150 group-hover:opacity-80',
                    'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-out motion-reduce:animate-none',
                    d.total === 0 && 'bg-muted',
                  )}
                  style={{
                    height: d.total === 0 ? '3px' : `${Math.max(6, (d.total / peak) * 100)}%`,
                    animationDelay: `${i * 25}ms`,
                  }}
                >
                  {info > 0 ? (
                    <div
                      className={cn('bg-info/70', isToday && 'bg-info')}
                      style={{ flexGrow: info }}
                    />
                  ) : null}
                  {d.warning > 0 ? (
                    <div className="bg-warning" style={{ flexGrow: d.warning }} />
                  ) : null}
                  {d.critical > 0 ? (
                    <div className="bg-destructive" style={{ flexGrow: d.critical }} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-2xs tabular-nums text-muted-foreground">
          <span>{daily[0] ? dayjs(daily[0].date).format('DD/MM') : ''}</span>
          <span>{t('notifications.groupToday')}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground">
          {(
            [
              ['bg-destructive', 'critical'],
              ['bg-warning', 'warning'],
              ['bg-info', 'info'],
            ] as const
          ).map(([cls, key]) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-sm', cls)} aria-hidden="true" />
              {t(`notifications.severity.${key}`)}
            </span>
          ))}
        </div>
        <table className="sr-only">
          <caption>{t('notifications.activityTitle')}</caption>
          <tbody>
            {daily.map((d) => (
              <tr key={d.date}>
                <th scope="row">{d.date}</th>
                <td>{d.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
        aria-labelledby="ntf-mix"
      >
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 id="ntf-mix" className="text-sm font-semibold">
            {t('notifications.distribution')}
          </h2>
          {category !== 'all' ? (
            <button
              type="button"
              onClick={() => onCategory('all')}
              className="cursor-pointer text-2xs font-medium text-primary hover:underline"
            >
              {t('notifications.clearFilter')}
            </button>
          ) : null}
        </div>
        <ul className="space-y-1">
          {CATEGORY_ORDER.map((c) => {
            const Icon = CATEGORY_META[c].icon;
            const { total, open } = byCategory[c];
            const active = category === c;
            return (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => onCategory(active ? 'all' : c)}
                  aria-pressed={active}
                  disabled={total === 0}
                  className={cn(
                    'w-full cursor-pointer rounded-lg px-2 py-1.5 text-left transition-colors duration-150 disabled:cursor-default disabled:opacity-50',
                    active ? 'bg-primary/[0.08] ring-1 ring-primary/30' : 'hover:bg-muted/60',
                  )}
                >
                  <span className="flex items-center gap-2 text-xs">
                    <Icon
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {t(`notifications.category.${c}`)}
                    </span>
                    {open > 0 ? (
                      <span className="rounded-full bg-warning-soft px-1.5 text-2xs font-medium text-warning">
                        {t('notifications.openCount', { count: open })}
                      </span>
                    ) : null}
                    <span className="w-7 text-right font-semibold tabular-nums">{total}</span>
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        'block h-full rounded-full transition-[width] duration-500',
                        CATEGORY_META[c].bar,
                      )}
                      style={{ width: `${(total / maxCat) * 100}%` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="hidden rounded-xl border border-dashed border-border p-4 md:block"
        aria-labelledby="ntf-kb"
      >
        <h2
          id="ntf-kb"
          className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
        >
          <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
          {t('notifications.kbTitle')}
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-2xs">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                  {keys}
                </kbd>
              </dt>
              <dd className="self-center text-muted-foreground">{t(label)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
