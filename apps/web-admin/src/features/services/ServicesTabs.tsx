import { Package, Sparkles, Tags } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

const TAB_BASE =
  'flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-medium transition-colors';

interface ServicesTabsProps {
  active: 'services' | 'categories' | 'packages';
}

/** Pill tab row shared by the catalog master-data screens (Services / Categories / Packages). */
export function ServicesTabs({ active }: ServicesTabsProps) {
  const { t } = useTranslation();

  const tabs = [
    { key: 'services' as const, to: ROUTES.services, label: t('nav.services'), icon: Sparkles },
    { key: 'categories' as const, to: ROUTES.categories, label: t('nav.categories'), icon: Tags },
    { key: 'packages' as const, to: ROUTES.servicePackages, label: t('nav.packages'), icon: Package },
  ];

  return (
    <nav className="mt-4 flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
      {tabs.map(({ key, to, label, icon: Icon }) => {
        const isActive = key === active;
        const className = cn(
          TAB_BASE,
          isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
        );
        const inner = (
          <>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </>
        );
        return isActive ? (
          <span key={key} aria-current="page" className={className} data-testid={`tab-${key}`}>
            {inner}
          </span>
        ) : (
          <Link key={key} to={to} className={className} data-testid={`tab-${key}`}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
