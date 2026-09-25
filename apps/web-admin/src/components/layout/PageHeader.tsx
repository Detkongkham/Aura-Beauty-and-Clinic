import type { ReactNode } from 'react';

import { HeaderFrame } from './HeaderFrame';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Primary + secondary actions, right-aligned (design.md §8). */
  actions?: ReactNode;
  /** Optional tab row below the title. */
  tabs?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, tabs, className }: PageHeaderProps) {
  return (
    <div className="animate-in fade-in slide-in-from-top-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none">
      <HeaderFrame className={className}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h1>{title}</h1>
              {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
          {tabs}
        </div>
      </HeaderFrame>
    </div>
  );
}
