import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SettingsRowProps {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
  /** Right-align the control against the label instead of a 2-col grid (switches). */
  trailing?: boolean;
  /** Stack label/control vertically full-width (long inputs, textareas). */
  stack?: boolean;
}

/** One labelled field row inside a SettingsSection body. */
export function SettingsRow({ label, hint, children, htmlFor, trailing, stack }: SettingsRowProps) {
  if (trailing) {
    return (
      <div className="flex items-center justify-between gap-4 py-2.5 first:pt-3 last:pb-3">
        <div className="min-w-0">
          <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
            {label}
          </label>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid gap-x-6 gap-y-1 py-2.5 first:pt-3 last:pb-3',
        stack ? 'grid-cols-1' : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:items-center',
      )}
    >
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className={cn(!stack && 'sm:pt-0', stack && 'mt-1')}>{children}</div>
    </div>
  );
}
