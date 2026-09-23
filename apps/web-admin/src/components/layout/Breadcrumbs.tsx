import { ChevronRight, Home } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

/**
 * Segment → i18n key. Every route in `router/paths.ts` that can appear as a
 * URL segment is listed; anything missing used to fall through and print the
 * raw slug ("gift-cards", "purchase-orders") next to properly translated
 * crumbs, which looked like a bug in Lao.
 */
const SEGMENT_LABELS: Record<string, string> = {
  calendar: 'nav.calendar',
  appointments: 'nav.appointments',
  queue: 'nav.queue',
  'home-service': 'nav.homeServiceDispatch',
  dispatch: 'nav.homeServiceDispatch',
  resources: 'nav.resources',
  messaging: 'nav.messaging',
  services: 'nav.services',
  categories: 'nav.categories',
  staff: 'nav.staff',
  roster: 'nav.roster',
  'time-off': 'nav.timeOff',
  payroll: 'nav.payroll',
  customers: 'nav.customers',
  branches: 'nav.branches',
  closures: 'nav.closures',
  settings: 'nav.settings',
  users: 'nav.usersRoles',
  permissions: 'nav.userPermissions',
  'quick-login': 'nav.quickLoginManagement',
  modules: 'nav.settingsModules',
  audit: 'nav.auditLog',
  'chat-moderation': 'nav.chatModeration',
  notifications: 'nav.notifications',
  reports: 'nav.reports',
  'import-export': 'nav.importExport',
  onboarding: 'nav.onboarding',
  finance: 'nav.finance',
  loyalty: 'nav.loyalty',
  'gift-cards': 'nav.giftCards',
  marketing: 'nav.marketing',
  pricing: 'nav.pricing',
  referrals: 'nav.referrals',
  payments: 'nav.payments',
  banks: 'nav.paymentsBanks',
  slips: 'nav.paymentsSlips',
  expenses: 'nav.paymentsExpenses',
  reconciliation: 'nav.paymentsReconciliation',
  inventory: 'nav.inventory',
  suppliers: 'nav.inventorySuppliers',
  'purchase-orders': 'nav.inventoryPurchaseOrders',
  transfers: 'nav.inventoryTransfers',
  ledger: 'nav.inventoryLedger',
  search: 'search.title',
  account: 'nav.account',
};

/** Record ids (uuid / cuid / numeric) are noise in a trail — they become "Detail". */
function isRecordId(segment: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
    /^c[a-z0-9]{20,}$/i.test(segment) ||
    /^\d+$/.test(segment)
  );
}

/**
 * Trail of the current location, rendered in `PageToolbar` (design.md §8).
 *
 * Crumbs are hit targets, so each one is a padded pill rather than bare text —
 * an 11px inline link is below the comfortable pointer target size. Below `sm`
 * only the current page is kept — intermediate crumbs are the first to go,
 * since the browser's own Back covers the same ground.
 */
export function Breadcrumbs() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, i) => {
    const to = '/' + segments.slice(0, i + 1).join('/');
    const key = SEGMENT_LABELS[seg];
    return { to, label: key ? t(key) : isRecordId(seg) ? t('common.detail') : seg };
  });

  const linkClass =
    'truncate rounded-sm px-1.5 py-1 transition-colors duration-150 hover:bg-muted hover:text-foreground';

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center text-xs text-muted-foreground">
      <Link to={ROUTES.dashboard} className={cn(linkClass, 'shrink-0')} aria-label={t('nav.dashboard')}>
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <Fragment key={c.to}>
            {last ? (
              <>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
                <span className="truncate px-1.5 py-1 font-semibold text-foreground" aria-current="page">
                  {c.label}
                </span>
              </>
            ) : (
              // Intermediate crumbs — and their separators — are the first thing
              // to go when space runs out.
              <span className="hidden min-w-0 items-center sm:flex">
                <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
                <Link to={c.to} className={cn(linkClass, 'max-w-[10rem]')}>
                  {c.label}
                </Link>
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
