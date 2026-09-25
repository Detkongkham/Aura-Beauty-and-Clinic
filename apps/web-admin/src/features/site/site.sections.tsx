import {
  ArrowRight,
  CalendarCheck,
  Check,
  Clock,
  Crown,
  Droplets,
  Flower2,
  Gauge,
  Phone,
  RotateCcw,
  ScanFace,
  Sparkles as SparklesIcon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import { Reveal, SectionHeading } from './site.parts';
import { SERVICE_ICONS } from './site.utils';
import { useSpotlight } from './site.fx';
import {
  calculator,
  concerns,
  finderIntro,
  footer,
  nav,
  pick,
  serviceCategories,
  servicesIntro,
  type ConcernIcon,
  type Lang,
  type ServiceIcon,
} from './siteContent';

const CONCERN_ICONS: Record<ConcernIcon, LucideIcon> = {
  acne: ScanFace,
  spots: Sun,
  dull: Droplets,
  ageing: SparklesIcon,
  hair: Gauge,
  stress: Flower2,
};

const ALL_SERVICES = serviceCategories.flatMap((c) =>
  c.items.map((s) => ({ ...s, cat: c.id as ServiceIcon })),
);

/** Interactive concern picker → suggested treatments (static mapping in siteContent.concerns). */
export function TreatmentFinder({ lang, container }: { lang: Lang; container: string }) {
  const [picked, setPicked] = useState<ConcernIcon[]>([]);
  const toggle = (id: ConcernIcon) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const matches = useMemo(() => {
    const names = new Set(concerns.filter((c) => picked.includes(c.id)).flatMap((c) => c.services));
    return ALL_SERVICES.filter((s) => names.has(s.name.en));
  }, [picked]);

  return (
    <section
      id="finder"
      aria-labelledby="finder-title"
      className="relative scroll-mt-20 overflow-hidden py-20 sm:py-28"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-10 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>
      <div className={cn(container, 'relative')}>
        <SectionHeading id="finder-title" lang={lang} {...finderIntro} />

        <Reveal className="mx-auto mt-10 max-w-4xl">
          <div
            role="group"
            aria-label={pick(finderIntro.title, lang)}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            {concerns.map((c) => {
              const Icon = CONCERN_ICONS[c.id];
              const on = picked.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(c.id)}
                  className={cn(
                    'group relative flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.98] sm:p-4',
                    on
                      ? 'border-primary bg-primary-subtle shadow-md'
                      : 'border-border bg-card hover:border-primary/40 hover:shadow-sm',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-200',
                      on
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground group-hover:text-primary',
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-medium leading-snug">{pick(c.label, lang)}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[opacity,transform] duration-200',
                      on ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="mt-8 rounded-lg border border-dashed border-border bg-card/70 p-5 backdrop-blur sm:p-6"
            aria-live="polite"
          >
            {matches.length === 0 ? (
              <p className="flex items-center justify-center gap-2 py-4 text-center text-sm text-muted-foreground">
                <SparklesIcon className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick(finderIntro.empty, lang)}
              </p>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">
                    {pick(finderIntro.matches, lang)}{' '}
                    <span className="tabular-nums text-muted-foreground">· {matches.length}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setPicked([])}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    {pick(finderIntro.reset, lang)}
                  </button>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {matches.map((s, i) => {
                    const Icon = SERVICE_ICONS[s.cat];
                    return (
                      <li
                        key={s.name.en}
                        style={{ animationDelay: `${i * 60}ms` }}
                        className="flex items-center gap-3 rounded-md border border-border bg-background p-3 animate-in fade-in zoom-in-95 fill-mode-both duration-300 motion-reduce:animate-none"
                      >
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {pick(s.name, lang)}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {s.minutes} {pick(servicesIntro.minutes, lang)}
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {s.from === 0
                                ? pick(servicesIntro.free, lang)
                                : formatCurrency(s.from)}
                            </span>
                          </span>
                        </span>
                        <a
                          href="#app"
                          aria-label={`${pick(servicesIntro.book, lang)}: ${pick(s.name, lang)}`}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary-subtle"
                        >
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** Tier earn rates + thresholds mirror siteContent.tiers copy (Silver 1×, Gold 1.5× @ ₭5M, Platinum 2× @ ₭15M). */
const RATE = [
  { name: 'Silver', from: 0, mult: 1 },
  { name: 'Gold', from: 5_000_000, mult: 1.5 },
  { name: 'Platinum', from: 15_000_000, mult: 2 },
] as const;
const PER_POINT = 10_000;
const POINT_VALUE = 100;
const STEPS = [300_000, 500_000, 800_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000];

function simulateYear(monthly: number) {
  let spent = 0;
  let points = 0;
  const reached: Array<{ name: string; month: number }> = [];
  for (let m = 1; m <= 12; m++) {
    const tier = [...RATE].reverse().find((t) => spent >= t.from) ?? RATE[0];
    points += (monthly / PER_POINT) * tier.mult;
    spent += monthly;
    for (const t of RATE) {
      if (t.from > 0 && spent >= t.from && !reached.some((r) => r.name === t.name))
        reached.push({ name: t.name, month: m });
    }
  }
  return { points: Math.round(points), reached };
}

/** Membership points estimator — a slider over typical monthly spends. */
export function PointsCalculator({ lang }: { lang: Lang }) {
  const id = useId();
  const [step, setStep] = useState(3);
  const monthly = STEPS[step] ?? STEPS[0] ?? 0;
  const { points, reached } = simulateYear(monthly);
  const top = reached[reached.length - 1];
  const onMove = useSpotlight();

  return (
    <div
      onMouseMove={onMove}
      className="spotlight rounded-lg border border-white/15 bg-white/[0.06] p-6 backdrop-blur sm:p-8"
    >
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-lg font-semibold text-white">
            <Crown className="h-5 w-5 text-accent-soft" aria-hidden="true" />
            {pick(calculator.title, lang)}
          </p>
          <label
            htmlFor={id}
            className="mt-5 flex items-baseline justify-between gap-3 text-sm text-white/80"
          >
            {pick(calculator.spend, lang)}
            <span className="text-xl font-semibold tabular-nums text-white">
              {formatCurrency(monthly)}
            </span>
          </label>
          <input
            id={id}
            type="range"
            min={0}
            max={STEPS.length - 1}
            step={1}
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            aria-valuetext={formatCurrency(monthly)}
            className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-[hsl(var(--accent))]"
          />
          <div
            className="mt-2 flex justify-between text-2xs tabular-nums text-white/60"
            aria-hidden="true"
          >
            <span>{formatCurrency(STEPS[0])}</span>
            <span>{formatCurrency(STEPS[STEPS.length - 1])}</span>
          </div>
          <p className="mt-5 text-xs text-white/60">{pick(calculator.note, lang)}</p>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="col-span-2 rounded-md bg-white/10 p-4">
            <dt className="text-xs text-white/70">{pick(calculator.yearPoints, lang)}</dt>
            <dd
              key={points}
              className="mt-1 text-3xl font-semibold tabular-nums text-white animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none"
            >
              {points.toLocaleString('en-US')}
            </dd>
          </div>
          <div className="rounded-md bg-white/10 p-4">
            <dt className="text-xs text-white/70">{pick(calculator.worth, lang)}</dt>
            <dd className="mt-1 text-base font-semibold tabular-nums text-white">
              {formatCurrency(points * POINT_VALUE)}
            </dd>
          </div>
          <div className="rounded-md bg-accent/90 p-4 text-accent-foreground">
            <dt className="text-xs opacity-80">{pick(calculator.tierIn, lang)}</dt>
            <dd className="mt-1 text-base font-semibold">
              {top ? `${top.name} · ${top.month} ${pick(calculator.months, lang)}` : 'Silver'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/** Phone-only bottom action bar — the two things a visitor on mobile most wants. */
export function MobileActionBar({ lang }: { lang: Lang }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:hidden">
      <div className="flex gap-2">
        <a
          href={`tel:${footer.phone.replace(/\s+/g, '')}`}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-input bg-card text-sm font-semibold"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          {pick(nav.call, lang)}
        </a>
        <a
          href="#app"
          className="shine inline-flex h-12 flex-[2] items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-md"
        >
          <CalendarCheck className="h-4 w-4" aria-hidden="true" />
          {pick(nav.book, lang)}
        </a>
      </div>
    </div>
  );
}
