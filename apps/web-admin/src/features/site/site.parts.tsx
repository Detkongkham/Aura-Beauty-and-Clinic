import { ChevronLeft, ChevronRight, Pause, Play, Quote, Star } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { pick, reviews, reviewsIntro, type L, type Lang } from './siteContent';
import { initials } from './site.utils';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Fade + rise once when scrolled into view. Only opacity/transform animate,
 * and reduced-motion users get the final state immediately.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'li' | 'article';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(prefersReducedMotion);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  const style: CSSProperties = { transitionDelay: shown ? `${delay}ms` : '0ms' };
  return (
    <Tag
      ref={ref as never}
      style={style}
      className={cn(
        'transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  body,
  lang,
  align = 'center',
  invert = false,
}: {
  id: string;
  eyebrow: L;
  title: L;
  body?: L;
  lang: Lang;
  align?: 'center' | 'left';
  invert?: boolean;
}) {
  return (
    <Reveal className={cn('max-w-2xl space-y-3', align === 'center' && 'mx-auto text-center')}>
      <p
        className={cn(
          'inline-flex items-center gap-2 text-sm font-semibold',
          invert ? 'text-accent-soft' : 'text-primary',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('h-px w-6', invert ? 'bg-accent-soft' : 'bg-accent')}
        />
        {pick(eyebrow, lang)}
      </p>
      <h2 id={id} className={cn('text-3xl leading-tight sm:text-4xl', invert && 'text-white')}>
        {pick(title, lang)}
      </h2>
      {body ? (
        <p
          className={cn(
            'text-base leading-relaxed',
            invert ? 'text-white/80' : 'text-muted-foreground',
          )}
        >
          {pick(body, lang)}
        </p>
      ) : null}
    </Reveal>
  );
}

export function Stars({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex gap-0.5 text-accent', className)} aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className="h-4 w-4 fill-current" />
      ))}
    </span>
  );
}

const ROTATE_MS = 7000;

/**
 * Accessible testimonial carousel: prev/next + pause controls, position is
 * announced, auto-rotation stops on hover, focus and reduced motion.
 */
export function ReviewsCarousel({ lang }: { lang: Lang }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [held, setHeld] = useState(false);
  const count = reviews.length;

  useEffect(() => {
    if (!playing || held) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [playing, held, count]);

  const go = (d: number) => setIndex((i) => (i + d + count) % count);
  const r = reviews[index];
  if (!r) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
      }}
    >
      <figure
        key={index}
        aria-live={playing && !held ? 'off' : 'polite'}
        aria-roledescription="slide"
        aria-label={`${index + 1} ${pick(reviewsIntro.of, lang)} ${count}`}
        className="relative rounded-lg border border-border bg-card p-6 shadow-md animate-in fade-in slide-in-from-right-4 duration-500 motion-reduce:animate-none sm:p-10"
      >
        <Quote
          className="absolute right-6 top-6 h-10 w-10 text-primary/10 sm:h-14 sm:w-14"
          aria-hidden="true"
        />
        <Stars />
        <blockquote className="mt-4 font-display text-xl leading-relaxed text-foreground sm:text-2xl">
          “{pick(r.quote, lang)}”
        </blockquote>
        <figcaption className="mt-6 flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-strong text-sm font-semibold text-primary-foreground">
            {initials(r.name)}
          </span>
          <span>
            <span className="block text-sm font-semibold">{r.name}</span>
            <span className="block text-xs text-muted-foreground">{pick(r.service, lang)}</span>
          </span>
        </figcaption>
      </figure>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {reviews.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-[width,background-color] duration-300',
                i === index ? 'w-6 bg-primary' : 'w-1.5 bg-border',
              )}
            />
          ))}
          <span className="ml-2 text-xs tabular-nums text-muted-foreground">
            {index + 1} / {count}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CarouselButton label={pick(reviewsIntro.prev, lang)} onClick={() => go(-1)}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </CarouselButton>
          <CarouselButton
            label={pick(playing ? reviewsIntro.pause : reviewsIntro.play, lang)}
            onClick={() => setPlaying((p) => !p)}
            pressed={!playing}
          >
            {playing ? (
              <Pause className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
          </CarouselButton>
          <CarouselButton label={pick(reviewsIntro.next, lang)} onClick={() => go(1)}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </CarouselButton>
        </div>
      </div>
    </div>
  );
}

function CarouselButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground shadow-xs transition-[background-color,border-color] duration-150 hover:border-primary/40 hover:bg-primary-subtle"
    >
      {children}
    </button>
  );
}
