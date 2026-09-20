import { Search, X } from 'lucide-react';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Extra filter controls (selects, date range, etc.). */
  children?: ReactNode;
  onClear?: () => void;
  hasActiveFilters?: boolean;
  className?: string;
}

/** Toolbar above data tables (design.md §8). Filters collapse into a Sheet on mobile (step 4). */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  children,
  onClear,
  hasActiveFilters,
  className,
}: FilterBarProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {onSearchChange ? (
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder ?? t('common.search')}
            className="pl-9"
            aria-label={searchPlaceholder ?? t('common.search')}
          />
        </div>
      ) : null}
      {children}
      {hasActiveFilters && onClear ? (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="h-4 w-4" aria-hidden="true" />
          {t('common.cancel')}
        </Button>
      ) : null}
    </div>
  );
}
