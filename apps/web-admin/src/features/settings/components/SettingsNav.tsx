import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface SettingsNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface SettingsNavProps {
  items: SettingsNavItem[];
  variant: 'rail' | 'chips';
  className?: string;
}

/**
 * In-page section navigator for the Settings sections below. `rail` renders a
 * sticky vertical list (desktop); `chips` renders a horizontal scroller
 * (mobile). Both share one IntersectionObserver-driven active id, rooted on
 * the app's scroll container (`<main>` in AppShell — the only scrollable
 * ancestor) so scroll-spy works regardless of viewport.
 */
export function SettingsNav({ items, variant, className }: SettingsNavProps) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = railRef.current?.closest('main');
    const els = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el != null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { root, rootMargin: '-180px 0px -60% 0px', threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    setActiveId(id);
  };

  if (variant === 'chips') {
    return (
      <nav className={cn('flex items-center gap-1.5 overflow-x-auto pb-1', className)} aria-label="Settings sections">
        {items.map(({ id, label, icon: Icon }) => {
          const active = id === activeId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => goTo(id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-primary/30 bg-primary-subtle text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      ref={railRef}
      className={cn('sticky top-44 flex flex-col gap-0.5', className)}
      aria-label="Settings sections"
    >
      {items.map(({ id, label, icon: Icon }) => {
        const active = id === activeId;
        return (
          <button
            key={id}
            type="button"
            onClick={() => goTo(id)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-lg border-l-2 px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors',
              active
                ? 'border-primary bg-primary-subtle text-primary'
                : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {active ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </nav>
  );
}
