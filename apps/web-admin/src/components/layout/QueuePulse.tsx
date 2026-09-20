import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useQueuePulse } from '@/features/queue/queue.api';
import { useWaitFormatter } from '@/features/queue/queue.lib';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import { useUiStore } from '@/store/ui.store';

/** Waiting > this many minutes turns the pill amber — the floor is falling behind. */
const LATE_WAIT_MIN = 20;

/**
 * Live walk-in pressure, visible from every page. The Queue board already
 * exists, but nobody watching Finance or Inventory knew people were piling up
 * at the counter — this is the one operational number that has to follow the
 * operator around. Renders nothing when the queue is empty, so a calm day
 * keeps the chrome calm.
 */
export function QueuePulse() {
  const { t } = useTranslation();
  const branchId = useUiStore((s) => s.activeBranchId);
  const { data } = useQueuePulse(branchId);
  const formatWait = useWaitFormatter();

  const waiting = (data?.items ?? []).filter((x) => x.status === 'WAITING');
  if (waiting.length === 0) return null;

  const oldest = waiting.reduce((a, b) => (a.issuedAt <= b.issuedAt ? a : b));
  const waitMin = Math.max(0, Math.round((Date.now() - new Date(oldest.issuedAt).getTime()) / 60000));
  const late = waitMin >= LATE_WAIT_MIN;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={ROUTES.queue}
          aria-label={`${t('queue.stat.waiting')}: ${waiting.length}`}
          className={cn(
            'hidden h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold tabular-nums',
            'transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-sm motion-reduce:hover:translate-y-0 md:inline-flex',
            late
              ? 'border-warning/30 bg-warning-soft text-warning'
              : 'border-border/80 bg-muted/60 text-foreground hover:border-primary/30',
          )}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              aria-hidden="true"
              className={cn(
                'absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping',
                late ? 'bg-warning' : 'bg-success',
              )}
            />
            <span
              aria-hidden="true"
              className={cn('relative inline-flex h-2 w-2 rounded-full', late ? 'bg-warning' : 'bg-success')}
            />
          </span>
          <Users className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          {waiting.length}
          <span className="hidden font-medium opacity-70 xl:inline">· {formatWait(waitMin)}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {t('queue.pulseTooltip', { count: waiting.length, wait: formatWait(waitMin) })}
      </TooltipContent>
    </Tooltip>
  );
}
