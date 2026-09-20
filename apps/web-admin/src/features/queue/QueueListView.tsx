import { useTranslation } from 'react-i18next';

import { StatusPill } from '@/components/shared/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { QueueTicket } from '@/types/models';

import { TicketActionsMenu, type TicketHandlers } from './TicketActionsMenu';
import { TicketTags } from './TicketTags';
import type { QueueStatus } from './queue.api';
import {
  ADVANCE_BTN,
  ADVANCE_ICON,
  NEXT,
  NUM_CHIP,
  urgencyOf,
  type ActiveStatus,
} from './queue.lib';

interface Props {
  /** Active tickets, already search/lane filtered and sorted. */
  tickets: QueueTicket[];
  now: number;
  canManage: boolean;
  pendingId?: string;
  compact: boolean;
  showBranch: boolean;
  eta: Map<string, number>;
  fmtWait: (m: number) => string;
  handlers: TicketHandlers;
}

/** One dense table of every active ticket — the narrow-screen / front-desk view. */
export function QueueListView({
  tickets,
  now,
  canManage,
  pendingId,
  compact,
  showBranch,
  eta,
  fmtWait,
  handlers,
}: Props) {
  const { t } = useTranslation();
  const cell = compact ? 'py-1.5' : '';

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-20">{t('queue.ticketNo')}</TableHead>
            <TableHead>{t('appointments.customer')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('appointments.service')}</TableHead>
            <TableHead className="hidden lg:table-cell">{t('appointments.staff')}</TableHead>
            <TableHead className="w-32">{t('appointments.status')}</TableHead>
            <TableHead className="w-20 text-right">{t('queue.waitTime')}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((tk) => {
            const status = tk.status as ActiveStatus;
            const next = NEXT[tk.status as QueueStatus];
            const NextIcon = next ? ADVANCE_ICON[next] : null;
            const { elapsedMin, level } = urgencyOf(tk, now);
            const waitVariant = level === 'late' ? 'danger' : level === 'warn' ? 'warning' : 'neutral';
            return (
              <TableRow
                key={tk.id}
                className="cursor-pointer"
                onClick={() => handlers.openDetail(tk)}
              >
                <TableCell className={cell}>
                  <span
                    className={cn(
                      'inline-flex rounded-md px-1.5 py-0.5 text-sm font-semibold tabular-nums',
                      NUM_CHIP[status],
                    )}
                  >
                    {tk.number}
                  </span>
                </TableCell>
                <TableCell className={cell}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{tk.customerName}</p>
                    <TicketTags ticket={tk} className="my-0.5" />
                    <p className="truncate text-2xs text-muted-foreground">
                      {tk.customerPhone ? (
                        <a
                          href={`tel:${tk.customerPhone}`}
                          className="hover:text-foreground hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {tk.customerPhone}
                        </a>
                      ) : null}
                      {showBranch && tk.branchName ? (
                        <span className={tk.customerPhone ? 'ml-2' : undefined}>
                          {tk.branchName}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </TableCell>
                <TableCell className={cn(cell, 'hidden md:table-cell')}>
                  <span className="flex items-center gap-1.5 text-sm">
                    <span className="truncate">{tk.serviceName}</span>
                    {tk.serviceDurationMin ? (
                      <span className="shrink-0 rounded bg-muted px-1 py-px text-2xs tabular-nums text-muted-foreground">
                        {t('queue.estDuration', { n: tk.serviceDurationMin })}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className={cn(cell, 'hidden lg:table-cell text-sm')}>
                  {tk.staffName ?? t('queue.anyStaff')}
                </TableCell>
                <TableCell className={cell}>
                  <StatusPill status={tk.status} label={t(`status.${tk.status}`)} />
                </TableCell>
                <TableCell className={cn(cell, 'text-right')}>
                  <Badge variant={waitVariant} className="tabular-nums">
                    {fmtWait(elapsedMin)}
                  </Badge>
                  {eta.has(tk.id) && !tk.carriedOver ? (
                    <p className="mt-0.5 text-2xs tabular-nums text-muted-foreground">
                      {eta.get(tk.id) === 0 ? t('queue.readyNow') : t('queue.inAbout', { t: fmtWait(eta.get(tk.id)!) })}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className={cn(cell, 'text-right')}>
                  {canManage && next ? (
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        className={cn('h-8', ADVANCE_BTN[status])}
                        disabled={pendingId === tk.id}
                        onClick={() => handlers.advance(tk)}
                      >
                        {NextIcon ? <NextIcon className="h-4 w-4" aria-hidden="true" /> : null}
                        <span className="hidden xl:inline">{t(`queue.advanceTo.${next}`)}</span>
                      </Button>
                      <TicketActionsMenu ticket={tk} handlers={handlers} disabled={pendingId === tk.id} />
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
