import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAuth } from '@/features/auth/useAuth';
import { useDisclosure } from '@/hooks/useDisclosure';
import { cn } from '@/lib/utils';

import { LanguageToggle } from './LanguageToggle';
import { useNavGroups } from './useNavGroups';

/**
 * Drawer navigation below `lg`. Split out of Topbar — it was ~70 lines of
 * markup inside a component whose job is the utility row, which made both
 * harder to read. Rows now match the sidebar's language: active row tinted,
 * icon coloured, and a left rail so the active item is findable at a glance
 * without relying on colour alone.
 */
export function MobileNav() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const groups = useNavGroups(hasPermission);
  const nav = useDisclosure();
  const { pathname } = useLocation();

  return (
    <Sheet open={nav.isOpen} onOpenChange={nav.setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 lg:hidden" aria-label={t('nav.overview')}>
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="flex max-w-[320px] flex-col">
        <SheetHeader>
          <SheetTitle className="font-display text-primary">{t('app.name')}</SheetTitle>
        </SheetHeader>

        <SheetBody className="flex-1 py-3">
          <nav className="space-y-4">
            {groups.map((group) => (
              <div key={group.labelKey}>
                <p className="px-2 pb-1.5 text-2xs font-semibold text-muted-foreground">
                  {t(`nav.${group.labelKey}`)}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = item.end
                      ? pathname === item.to
                      : pathname === item.to || pathname.startsWith(`${item.to}/`);
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.end}
                          onClick={nav.close}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'relative flex items-center gap-2.5 rounded-sm py-2 pl-3 pr-2 text-sm transition-colors',
                            active
                              ? 'bg-primary-subtle font-semibold text-primary'
                              : 'text-foreground hover:bg-muted',
                          )}
                        >
                          {active && (
                            <span
                              aria-hidden="true"
                              className="absolute left-0 top-1.5 h-[calc(100%-0.75rem)] w-0.5 rounded-full bg-primary"
                            />
                          )}
                          <Icon
                            className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate">{t(`nav.${item.labelKey}`)}</span>
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </SheetBody>

        {/* The topbar hides the language switch below `sm`; it lives here instead. */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 sm:hidden">
          <span className="text-xs font-medium text-muted-foreground">{t('common.language')}</span>
          <LanguageToggle className="inline-flex" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
