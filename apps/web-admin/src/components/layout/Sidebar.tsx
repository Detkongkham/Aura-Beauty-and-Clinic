import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';

import { useAuth } from '@/features/auth/useAuth';
import { useSettings } from '@/features/settings/settings.api';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

import type { NavItem } from './nav-items';
import { useNavGroups } from './useNavGroups';

const ROW_BASE =
  'inline-flex h-10 w-full min-w-0 items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-xl px-3 py-2 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function NavRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const label = t(`nav.${item.labelKey}`);
  return (
    <NavLink to={item.to} end={item.end} className="block w-full" title={collapsed ? label : undefined}>
      {({ isActive }) => (
        <span
          className={cn(
            ROW_BASE,
            collapsed ? 'justify-center' : 'justify-start',
            isActive ? 'bg-primary-subtle hover:bg-primary-subtle' : 'hover:bg-primary-subtle/60',
          )}
        >
          <Icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
          {!collapsed && (
            <span className={cn('flex-1 truncate text-left text-[15px]', isActive ? 'text-primary' : 'font-normal text-muted-foreground')}>
              {label}
            </span>
          )}
        </span>
      )}
    </NavLink>
  );
}

/** Collapsible group — e.g. "ຕັ້ງຄ່າຜູ້ໃຊ້" expanding into its own sub-pages. */
function ExpandableNavGroup({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const children = item.children ?? [];
  const hasActiveChild = children.some((c) => location.pathname.startsWith(c.to));
  const [open, setOpen] = useState(hasActiveChild);
  const Icon = item.icon;
  const label = t(`nav.${item.labelKey}`);

  if (collapsed) return <NavRow item={item} collapsed={collapsed} />;

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-state={open ? 'open' : 'closed'}
        data-testid="sidebar-user-settings-trigger"
        className={cn(ROW_BASE, 'justify-start', open ? 'bg-primary-subtle hover:bg-primary-subtle' : 'hover:bg-primary-subtle/60')}
      >
        <Icon className={cn('h-5 w-5 shrink-0', open ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
        <span className={cn('flex-1 truncate text-left text-[15px]', open ? 'text-primary' : 'font-normal text-muted-foreground')}>
          {label}
        </span>
        <ChevronRight
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-90')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="flex flex-col gap-1 py-0.5">
          {children.map((child) => (
            <div key={child.to} className="flex items-center gap-1.5 pl-6">
              <div className="w-px self-stretch bg-border" />
              <NavLink
                to={child.to}
                end={child.end}
                data-testid={`sidebar-user-settings-${child.labelKey}`}
                className="flex-1"
              >
                {({ isActive }) => (
                  <span
                    className={cn(
                      'flex h-8 items-center gap-1.5 rounded-lg px-3 text-[14px]',
                      isActive ? 'bg-primary-subtle text-primary' : 'text-muted-foreground hover:bg-primary-subtle/60',
                    )}
                  >
                    {child.labelKey === 'quickLoginManagement' ? (
                      <child.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : null}
                    <span className="truncate">{t(`nav.${child.labelKey}`)}</span>
                  </span>
                )}
              </NavLink>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Module sidebar — layout mirrored from the provided reference markup: fixed rail,
 * centred logo header, sectioned nav with 11px group labels and h-9 `rounded-xl`
 * rows. Colours use the design tokens (`--primary*`, `--muted*`, `--border`) so the
 * sidebar re-tints with the brand tone chosen in Settings ▸ Appearance.
 * Collapsed state is driven by `sidebarCollapsed`; the toggle lives in the Topbar.
 * AppShell keeps this whole element pinned to the viewport while page content scrolls.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const { data: settings } = useSettings();
  const groups = useNavGroups(hasPermission);

  return (
    <aside
      className={cn(
        'hidden h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-all duration-300 lg:flex',
        collapsed
          ? 'w-[88px] min-w-[88px] max-w-[88px] px-2'
          : 'w-[320px] min-w-[320px] max-w-[320px] px-3',
      )}
      aria-label={t('nav.overview')}
    >
      <header className="flex h-[116px] shrink-0 items-center justify-center">
        {/* Logo is always constrained to a 92px frame. */}
        <img
          alt={t('app.name')}
          className={cn(
            'object-contain',
            collapsed ? 'h-12 w-12 rounded-[14px]' : 'h-[92px] w-[92px] rounded-[22px]',
          )}
          src={settings?.logoUrl?.trim() || '/logo.png'}
        />
      </header>

      <div className="relative flex-1 overflow-y-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <nav className="flex flex-col gap-4 overflow-hidden">
          {groups.map((group) => {
            const items = group.items;
            return (
              <section key={group.labelKey} className="flex flex-col gap-0">
                {!collapsed && (
                  <div className="flex select-none items-center gap-1.5 px-3 py-1.5 uppercase tracking-wider">
                    <span className="flex-1 text-[11px] font-normal text-muted-foreground">
                      {t(`nav.${group.labelKey}`)}
                    </span>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  {items.map((item) =>
                    item.children ? (
                      <ExpandableNavGroup key={item.to} item={item} collapsed={collapsed} />
                    ) : (
                      <NavRow key={item.to} item={item} collapsed={collapsed} />
                    ),
                  )}
                </div>
              </section>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
