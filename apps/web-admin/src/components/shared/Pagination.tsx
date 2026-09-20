import { useTranslation } from 'react-i18next';

import { Select } from '@/components/ui/select';
import { PAGE_SIZE_OPTIONS } from '@/lib/constants';

import { PageNav } from './PageNav';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/** design.md §8 — page-size select + range text on the left, numbered pager on
 *  the right (shared {@link PageNav}). Footer stays visible below data tables. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const { t } = useTranslation();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>{t('pagination.rowsPerPage')}</span>
        <Select
          className="h-8 w-[68px]"
          value={String(pageSize)}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          aria-label={t('pagination.rowsPerPage')}
        />
        <span aria-hidden="true" className="text-border">
          |
        </span>
        <span className="tabular-nums">{t('pagination.range', { from, to, total })}</span>
      </div>

      <PageNav page={page} pageCount={lastPage} onChange={onPageChange} className="!pt-0" />
    </div>
  );
}
