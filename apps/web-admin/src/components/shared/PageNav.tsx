import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

interface PageNavProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  className?: string;
}

/** Numbered pager — shows a sliding window of up to 5 page boxes, plus the
 *  first/last page with `…` when there is more. Empty for a single page. */
const WINDOW = 5;

function pages(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= WINDOW) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const start = Math.min(Math.max(page - Math.floor(WINDOW / 2), 1), pageCount - WINDOW + 1);
  const win = Array.from({ length: WINDOW }, (_, i) => start + i);

  const out: Array<number | 'gap'> = [];
  if (win[0]! > 1) {
    out.push(1);
    if (win[0]! > 2) out.push('gap');
  }
  out.push(...win);
  if (win[WINDOW - 1]! < pageCount) {
    if (win[WINDOW - 1]! < pageCount - 1) out.push('gap');
    out.push(pageCount);
  }
  return out;
}

export function PageNav({ page, pageCount, onChange, className }: PageNavProps) {
  const { t } = useTranslation();
  if (pageCount <= 1) return null;

  const btn =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-input px-2 text-sm tabular-nums transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40';

  return (
    <nav className={cn('flex items-center justify-center gap-1 pt-3', className)} aria-label={t('pagination.next')}>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label={t('pagination.prev')}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>

      {pages(page, pageCount).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={cn(btn, p === page && 'border-primary bg-primary text-primary-foreground hover:bg-primary')}
            onClick={() => onChange(p)}
            aria-label={t('pagination.goToPage', { n: p })}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        ),
      )}

      <button
        type="button"
        className={btn}
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        aria-label={t('pagination.next')}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
