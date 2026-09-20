import { Search, X } from 'lucide-react';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  /** Keyboard hint rendered inside the field while it is empty (e.g. "/"). */
  shortcut?: string;
}

/** Compact search field — icon, clearable, focus-tinted. Shared by the board + completed list. */
export const QueueSearchField = forwardRef<HTMLInputElement, Props>(function QueueSearchField(
  { value, onChange, placeholder, className, shortcut },
  ref,
) {
  const { t } = useTranslation();
  return (
    <div className={cn('group relative', className)}>
      <Input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={t('common.search')}
        className={cn(
          'peer h-9 rounded-md border-transparent bg-card pl-9 text-sm shadow-xs',
          'focus-visible:border-ring [&::-webkit-search-cancel-button]:appearance-none',
          value || shortcut ? 'pr-8' : 'pr-3',
        )}
      />
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors peer-focus:text-primary"
        aria-hidden="true"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('queue.clearSearch')}
          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : shortcut ? (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-2xs text-muted-foreground sm:inline-flex"
        >
          {shortcut}
        </kbd>
      ) : null}
    </div>
  );
});
