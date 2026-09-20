import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import type { QueueTicket } from '@/types/models';

import { initials, serviceProgress, useTeamLoad } from './queue.lib';

interface Props {
  inService: QueueTicket[];
  rosterNames: string[];
  now: number;
}

export function TeamCapacityCard({ inService, rosterNames, now }: Props) {
  const { t } = useTranslation();
  const team = useTeamLoad(inService, rosterNames);
  const utilisation = team.total ? Math.round((team.busy / team.total) * 100) : 0;

  return (
    <section className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          {t('queue.teamCapacity')}
        </h2>
        <span className="text-2xs tabular-nums text-muted-foreground">
          {t('queue.busyOfTotal', { busy: team.busy, total: team.total })}
        </span>
      </header>

      <div className="mt-3 flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={utilisation}
          aria-label={t('queue.utilisation')}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none',
              utilisation >= 90 ? 'bg-destructive' : utilisation >= 70 ? 'bg-warning' : 'bg-success',
            )}
            style={{ width: `${utilisation}%` }}
          />
        </div>
        <span className="text-sm font-semibold tabular-nums">{utilisation}%</span>
      </div>

      {team.rows.length === 0 ? (
        <p className="mt-4 text-center text-2xs text-muted-foreground">{t('queue.noRoster')}</p>
      ) : (
        <ul className="mt-3 grid max-h-[320px] gap-x-4 gap-y-1 overflow-y-auto pr-0.5 sm:grid-cols-2">
          {team.rows.map(({ name, ticket }) => {
            const prog = ticket ? serviceProgress(ticket, now) : null;
            return (
              <li key={name} className="flex items-center gap-2.5 rounded-md px-1 py-1">
                <span className="relative shrink-0">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-2xs font-semibold',
                      ticket ? 'bg-primary/10 text-primary' : 'bg-success-soft text-success',
                    )}
                  >
                    {initials(name)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card',
                      ticket ? 'bg-warning' : 'bg-success',
                    )}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{name}</p>
                  {ticket && prog ? (
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn('block h-full rounded-full', (prog.pct ?? 0) > 100 ? 'bg-destructive' : 'bg-primary')}
                          style={{ width: `${Math.min(100, prog.pct ?? 50)}%` }}
                        />
                      </span>
                      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{ticket.number}</span>
                    </div>
                  ) : (
                    <p className="text-2xs text-success">{t('queue.freeStaff')}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
