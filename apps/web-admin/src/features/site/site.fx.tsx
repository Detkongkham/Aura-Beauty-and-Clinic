import { ArrowUp } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

/**
 * Small, dependency-free motion helpers for the public site. Every effect
 * animates opacity/transform or a CSS variable only, and collapses to its
 * final state under `prefers-reduced-motion`.
 */

function reducedMotion() {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function finePointer() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
  );
}

export function useInView<T extends Element>(opts: IntersectionObserverInit = { threshold: 0.3 }) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        io.disconnect();
      }
    }, opts);
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, inView] as const;
}

/**
 * Counts up to the numeric part of `value` ("40K+", "4.9", "8+") when scrolled
 * into view, keeping the prefix/suffix and decimal places intact.
 */
export function CountUp({
  value,
  className,
  duration = 1400,
}: {
  value: string;
  className?: string;
  duration?: number;
}) {
  const match = /^([^\d]*)([\d.,]+)(.*)$/.exec(value);
  const [ref, inView] = useInView<HTMLSpanElement>({ threshold: 0.6 });
  const target = match ? Number(match[2]?.replace(/,/g, '')) : NaN;
  const decimals = match?.[2]?.includes('.') ? (match[2].split('.')[1]?.length ?? 0) : 0;
  const [n, setN] = useState(() => (reducedMotion() ? target : 0));

  useEffect(() => {
    if (!inView || Number.isNaN(target) || reducedMotion()) {
      setN(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration]);

  if (!match) return <span className={className}>{value}</span>;
  const shown = decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString('en-US');
  return (
    <span ref={ref} className={cn('tabular-nums', className)} aria-label={value}>
      <span aria-hidden="true">
        {match[1]}
        {shown}
        {match[3]}
      </span>
    </span>
  );
}

/**
 * Cursor spotlight: sets --mx/--my on the element so a radial highlight
 * follows the pointer. Pair with the `.spotlight` class in index.css.
 */
export function onSpotlight(e: ReactMouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}

export function useSpotlight() {
  return useCallback(onSpotlight, []);
}

/** Gentle 3D tilt toward the pointer (fine pointers only). */
export function Tilt({
  children,
  className,
  max = 8,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  const onMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (reducedMotion() || !finePointer() || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setStyle({
      transform: `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg)`,
    });
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => setStyle({ transform: 'perspective(900px) rotateX(0) rotateY(0)' })}
      style={style}
      className={cn(
        'transition-transform duration-300 ease-out will-change-transform [transform-style:preserve-3d]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Cycles through words with a vertical slide; static first word under reduced motion. */
export function RotatingWord({
  words,
  className,
  interval = 2600,
}: {
  words: string[];
  className?: string;
  interval?: number;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reducedMotion() || words.length < 2) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % words.length), interval);
    return () => window.clearInterval(id);
  }, [words.length, interval]);

  return (
    <span className={cn('relative inline-grid overflow-hidden align-bottom', className)}>
      {/* widest word reserves the box so the line never reflows */}
      {words.map((w) => (
        <span key={w} aria-hidden="true" className="invisible col-start-1 row-start-1">
          {w}
        </span>
      ))}
      <span
        key={i}
        className="col-start-1 row-start-1 animate-in fade-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none"
      >
        {words[i]}
      </span>
    </span>
  );
}

/** Thin page-scroll progress line (sits at the bottom edge of the sticky header). */
export function useScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setP(max > 0 ? Math.min(1, window.scrollY / max) : 0);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  return p;
}

/** Floating back-to-top button with a ring showing how far down the page you are. */
export function BackToTop({ label, progress }: { label: string; progress: number }) {
  const visible = progress > 0.08;
  const C = 2 * Math.PI * 20;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })}
      aria-label={label}
      tabIndex={visible ? 0 : -1}
      className={cn(
        'fixed bottom-24 right-4 z-40 inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-card text-primary shadow-lg ring-1 ring-border transition-[opacity,transform] duration-300 hover:-translate-y-0.5 sm:bottom-6 sm:right-6',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
      )}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="hsl(var(--primary) / 0.15)"
          strokeWidth="2.5"
        />
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
        />
      </svg>
      <ArrowUp className="relative h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/** Decorative twinkling sparkles scattered over a hero-sized area. */
const SPARKS = [
  { top: '12%', left: '8%', size: 10, delay: 0 },
  { top: '22%', left: '46%', size: 7, delay: 1.2 },
  { top: '64%', left: '4%', size: 8, delay: 2.1 },
  { top: '8%', left: '72%', size: 12, delay: 0.6 },
  { top: '78%', left: '52%', size: 9, delay: 1.7 },
  { top: '40%', left: '92%', size: 7, delay: 2.6 },
  { top: '88%', left: '86%', size: 10, delay: 0.3 },
];

export function Sparkles() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
      {SPARKS.map((s, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={s.size}
          height={s.size}
          style={{ top: s.top, left: s.left, animationDelay: `${s.delay}s` }}
          className="absolute animate-twinkle text-accent"
        >
          <path
            fill="currentColor"
            d="M12 0c.6 5.4 3 9.2 12 12-9 2.8-11.4 6.6-12 12-.6-5.4-3-9.2-12-12 9-2.8 11.4-6.6 12-12z"
          />
        </svg>
      ))}
    </div>
  );
}

/** Soft wave divider between sections — `from` is the colour of the section above. */
export function Wave({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 64"
      preserveAspectRatio="none"
      className={cn('block h-10 w-full sm:h-16', flip && 'rotate-180', className)}
    >
      <path
        fill="currentColor"
        d="M0 32c120 20 240 30 360 22S600 18 720 14s240 6 360 18 240 24 360 16V64H0z"
      />
    </svg>
  );
}
