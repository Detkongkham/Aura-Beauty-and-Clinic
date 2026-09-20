import { Maximize, Minimize } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QueueTicket } from '@/types/models';

interface Props {
  called: QueueTicket[];
  /** WAITING in serve order. */
  waiting: QueueTicket[];
  inService: QueueTicket[];
  eta: Map<string, number>;
  /** Ticket just called/re-called — gets the pulse spotlight. */
  highlightId: string | null;
  branchLabel: string;
  fmtWait: (m: number) => string;
}

const NEXT_UP_LIMIT = 9;
const HONORIFICS = new Set(['ທ້າວ', 'ນາງ', 'ທ່ານ', 'Mr', 'Mr.', 'Mrs', 'Mrs.', 'Ms', 'Ms.']);

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Vientiane',
  }).format(now);
}

/** Big, glanceable display for a TV in the waiting area. Read-only — no customer phone numbers. */
export function QueueWallboard({ called, waiting, inService, eta, highlightId, branchLabel, fmtWait }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(false);
  const clock = useClock();

  useEffect(() => {
    const onChange = () => setFs(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void ref.current?.requestFullscreen?.();
  };

  const ordered = [...called].sort(
    (a, b) =>
      new Date(b.lastCalledAt ?? b.calledAt ?? b.issuedAt).getTime() -
      new Date(a.lastCalledAt ?? a.calledAt ?? a.issuedAt).getTime(),
  );
  const hero = ordered.find((tk) => tk.id === highlightId) ?? ordered[0] ?? null;
  const rest = ordered.filter((tk) => tk !== hero);
  const nextUp = waiting.slice(0, NEXT_UP_LIMIT);
  // Masks the surname for privacy on a public screen: "ນາງ ຄຳແພງ ສ." / "Somchai K."
  const publicName = (name: string) => {
    const parts = name.trim().split(/\s+/);
    const keep = HONORIFICS.has(parts[0] ?? '') ? 2 : 1;
    return parts.length > keep ? `${parts.slice(0, keep).join(' ')} ${[...parts[parts.length - 1]!][0]}.` : name;
  };

  return (
    <div
      ref={ref}
      className={cn(
        'flex min-h-[72vh] flex-col gap-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/[0.06] p-6 shadow-sm',
        fs && 'rounded-none border-0 bg-background p-10',
      )}
    >
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{branchLabel}</p>
          <p className="text-2xl font-semibold">{t('queue.wallTitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-4xl font-semibold tabular-nums xl:text-5xl" aria-label={t('queue.clock')}>
            {clock}
          </p>
          <Button variant="secondary" size="sm" onClick={toggleFs}>
            {fs ? <Minimize className="h-4 w-4" aria-hidden="true" /> : <Maximize className="h-4 w-4" aria-hidden="true" />}
            {fs ? t('queue.exitFullscreen') : t('queue.fullscreen')}
          </Button>
        </div>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* now calling */}
        <section className="flex flex-col gap-4" aria-live="assertive" aria-atomic="true">
          <h2 className="text-lg font-semibold text-muted-foreground">{t('queue.nowServing')}</h2>
          {!hero ? (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center text-2xl font-medium text-muted-foreground">
              {t('queue.nowServingEmpty')}
            </div>
          ) : (
            <>
              <div
                key={`${hero.id}:${hero.callCount}`}
                className={cn(
                  'relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-3xl bg-primary p-8 text-center text-primary-foreground shadow-lg',
                  'animate-in zoom-in-95 fade-in duration-500 motion-reduce:animate-none',
                )}
              >
                {hero.id === highlightId ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 animate-pulse rounded-3xl ring-8 ring-inset ring-primary-foreground/25 motion-reduce:animate-none"
                  />
                ) : null}
                <p className="text-lg opacity-80">{t('queue.pleaseProceed')}</p>
                <p className="mt-2 text-[clamp(4rem,11vw,9rem)] font-bold leading-none tabular-nums">{hero.number}</p>
                <p className="mt-4 text-2xl font-medium xl:text-3xl">{publicName(hero.customerName)}</p>
                {hero.staffName ? (
                  <p className="mt-2 text-lg opacity-80">
                    {t('queue.withStaff', { name: hero.staffName })}
                  </p>
                ) : null}
              </div>
              {rest.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {rest.slice(0, 6).map((tk) => (
                    <div key={tk.id} className="rounded-xl border border-primary/30 bg-primary/[0.07] p-3 text-center">
                      <p className="text-3xl font-bold tabular-nums text-primary">{tk.number}</p>
                      <p className="truncate text-xs text-muted-foreground">{publicName(tk.customerName)}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>

        {/* next up */}
        <section className="flex flex-col gap-4">
          <h2 className="flex items-baseline gap-2 text-lg font-semibold text-muted-foreground">
            {t('queue.stat.next')}
            <span className="text-sm tabular-nums">({waiting.length})</span>
          </h2>
          {nextUp.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border p-8 text-lg text-muted-foreground">
              {t('queue.laneEmpty')}
            </div>
          ) : (
            <ol className="grid content-start gap-2.5">
              {nextUp.map((tk, i) => {
                const e = eta.get(tk.id);
                return (
                  <li
                    key={tk.id}
                    className={cn(
                      'flex items-center gap-4 rounded-xl border bg-card px-4 py-3',
                      i === 0 ? 'border-primary/40 shadow-sm' : 'border-border',
                    )}
                  >
                    <span className="w-6 text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="text-3xl font-semibold tabular-nums">{tk.number}</span>
                    <span className="min-w-0 flex-1 truncate text-base text-muted-foreground">{publicName(tk.customerName)}</span>
                    {e != null && !tk.carriedOver ? (
                      <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-sm font-medium tabular-nums">
                        {e === 0 ? t('queue.readyNow') : `~${fmtWait(e)}`}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {inService.length > 0 ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="text-sm font-medium text-muted-foreground">{t('status.IN_SERVICE')}</span>
          {inService.map((tk) => (
            <span key={tk.id} className="rounded-lg bg-success-soft px-3 py-1 text-lg font-semibold tabular-nums text-success">
              {tk.number}
            </span>
          ))}
        </footer>
      ) : null}
    </div>
  );
}
