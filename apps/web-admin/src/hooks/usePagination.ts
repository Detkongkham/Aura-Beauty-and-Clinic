import { useCallback, useMemo, useState } from 'react';

import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

interface UsePaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
}

/** 1-indexed pagination state matching the backend `paginationQuerySchema`. */
export function usePagination({
  initialPage = 1,
  initialPageSize = DEFAULT_PAGE_SIZE,
}: UsePaginationOptions = {}) {
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSizeRaw] = useState(initialPageSize);

  const setPageSize = useCallback((next: number) => {
    setPageSizeRaw(next);
    setPage(1); // page size changes reset to the first page
  }, []);

  const next = useCallback(() => setPage((p) => p + 1), []);
  const prev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);

  const range = useCallback(
    (total: number) => {
      const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
      const to = Math.min(page * pageSize, total);
      return { from, to, total };
    },
    [page, pageSize],
  );

  return useMemo(
    () => ({ page, pageSize, setPage, setPageSize, next, prev, range, query: { page, pageSize } }),
    [page, pageSize, setPageSize, next, prev, range],
  );
}
