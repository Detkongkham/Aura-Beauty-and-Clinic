import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/router/paths';

import { useGlobalSearch } from './useGlobalSearch';

export function SearchPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const { data, isLoading } = useGlobalSearch(q);

  const sections = [
    { key: 'customers', title: t('nav.customers'), to: (id: string) => ROUTES.customerDetail(id) },
    { key: 'appointments', title: t('nav.appointments'), to: (id: string) => ROUTES.appointmentDetail(id) },
    { key: 'services', title: t('nav.services'), to: () => ROUTES.services },
  ] as const;

  const total =
    (data?.customers.length ?? 0) + (data?.appointments.length ?? 0) + (data?.services.length ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader title={t('search.title')} description={q ? t('search.resultsFor', { q }) : ''} />

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !q || q.trim().length < 2 ? (
        <EmptyState title={t('search.hint')} />
      ) : total === 0 ? (
        <EmptyState title={t('search.noResults')} />
      ) : (
        <div className="space-y-6">
          {sections.map((s) => {
            const rows = data?.[s.key] ?? [];
            if (rows.length === 0) return null;
            return (
              <div key={s.key}>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{s.title}</h2>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={s.to(r.id)}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted"
                      >
                        <span className="min-w-0 truncate font-medium">{r.label}</span>
                        <span className="shrink-0 truncate text-xs text-muted-foreground">{r.sub}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
