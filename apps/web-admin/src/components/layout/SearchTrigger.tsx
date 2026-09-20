import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Kbd, shortcutLabel } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Command-palette entry point. Rendered as a *field*, not an icon: the palette
 * is the fastest way through this console, so it gets the one affordance users
 * already read as "type here" — plus a visible ⌘K chip instead of a `title`
 * tooltip nobody discovers. Below `md` the field would eat the breadcrumb row,
 * so it degrades to the icon button it used to be.
 */
export function SearchTrigger({ onOpen }: { onOpen?: () => void }) {
  const { t } = useTranslation();
  const label = t('search.title');
  const hint = shortcutLabel('mod+K');

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(
          'group hidden h-9 w-full min-w-0 items-center gap-2 rounded-full border border-input bg-background/60 pl-3 pr-2 md:flex',
          'text-left text-sm text-muted-foreground shadow-xs transition-colors duration-150 ease-out',
          'hover:border-primary/40 hover:bg-card hover:text-foreground',
          'focus-visible:border-ring focus-visible:outline-none',
        )}
      >
        <Search
          className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
          aria-hidden="true"
        />
        <span className="flex-1 truncate">{t('search.topbarPlaceholder')}</span>
        <Kbd className="hidden shrink-0 bg-muted/80 lg:inline-flex">{hint}</Kbd>
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpen}
            aria-label={label}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-foreground transition-colors hover:bg-muted md:hidden"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {label} · {hint}
        </TooltipContent>
      </Tooltip>
    </>
  );
}
