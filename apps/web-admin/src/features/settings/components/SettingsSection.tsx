import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SettingsSectionProps {
  id: string;
  icon: LucideIcon;
  title: string;
  desc?: string;
  actions?: ReactNode;
  children: ReactNode;
  index: number;
  className?: string;
}

/**
 * Anchored settings block — Settings' own identity, distinct from the reports
 * ledger style: an icon tile + serif title in the header and a **gold** hairline
 * (vs. reports' azure) underneath. `id` + `scroll-mt-*` let the section rail
 * scroll-spy and smooth-scroll land correctly under the sticky header + tabs.
 */
export function SettingsSection({
  id,
  icon: Icon,
  title,
  desc,
  actions,
  children,
  index,
  className,
}: SettingsSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-44 overflow-hidden rounded-2xl border border-border bg-card shadow-sm',
        'animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 motion-reduce:animate-none',
        className,
      )}
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      <header className="relative flex items-start gap-2.5 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 pt-px">
          <h2 className="font-display text-[15px] font-semibold leading-tight text-foreground">
            {title}
          </h2>
          {desc ? <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
        <span
          aria-hidden="true"
          className="absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-accent/70 via-accent/25 to-transparent"
        />
      </header>
      <div className="divide-y divide-border/70 px-4">{children}</div>
    </section>
  );
}
