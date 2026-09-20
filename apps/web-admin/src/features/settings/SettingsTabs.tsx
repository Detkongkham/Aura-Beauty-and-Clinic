import {
  Bell,
  ClipboardList,
  Flag,
  LayoutGrid,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

const TAB_BASE =
  'flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-medium transition-colors';

interface SettingsTabsProps {
  active: 'general' | 'notifications' | 'modules' | 'users' | 'audit' | 'chatModeration';
}

/** Pill tab row linking the settings-family sibling routes. */
export function SettingsTabs({ active }: SettingsTabsProps) {
  const { t } = useTranslation();

  const tabs = [
    { key: 'general' as const, to: ROUTES.settings, label: t('nav.settings'), icon: SlidersHorizontal },
    {
      key: 'notifications' as const,
      to: ROUTES.settingsNotifications,
      label: t('nav.settingsNotifications'),
      icon: Bell,
    },
    {
      key: 'modules' as const,
      to: ROUTES.settingsModules,
      label: t('nav.settingsModules'),
      icon: LayoutGrid,
    },
    { key: 'users' as const, to: ROUTES.usersRoles, label: t('nav.usersRoles'), icon: ClipboardList },
    { key: 'audit' as const, to: ROUTES.auditLog, label: t('nav.auditLog'), icon: ShieldCheck },
    {
      key: 'chatModeration' as const,
      to: ROUTES.chatModeration,
      label: t('nav.chatModeration'),
      icon: Flag,
    },
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
