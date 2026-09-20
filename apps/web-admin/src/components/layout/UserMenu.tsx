import { Building2, Keyboard, LogOut, Monitor, Moon, Settings, Sun, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd, shortcutLabel } from '@/components/ui/kbd';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import { COLOR_MODES, useUiStore, type ColorMode } from '@/store/ui.store';

const MODE_ICON: Record<ColorMode, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

/**
 * Account menu. Beyond the old three rows it now states *who you are signed in
 * as and where* — name, translated role, home branch — because this console is
 * routinely used from a shared workstation, and it carries the full
 * light/dark/system choice, which previously only existed in Settings even
 * though the topbar already toggled two thirds of it.
 */
export function UserMenu() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: branches = [] } = useBranches();
  const colorMode = useUiStore((s) => s.colorMode);
  const setColorMode = useUiStore((s) => s.setColorMode);

  if (!user) return null;

  const roleLabel = role ? t(`messaging.role.${role}`, { defaultValue: role }) : '';
  const branchName = branches.find((b) => b.id === user.branchId)?.name;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={user.name}
          className="h-9 shrink-0 gap-2 rounded-full px-1 pr-1 xl:pr-2.5 data-[state=open]:bg-muted"
        >
          <PersonAvatar name={user.name} size={28} />
          <span className="hidden min-w-0 flex-col items-start leading-tight xl:flex">
            <span className="max-w-[10rem] truncate text-xs font-semibold text-foreground">
              {user.name}
            </span>
            <span className="max-w-[10rem] truncate text-2xs font-medium text-muted-foreground">
              {roleLabel}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[15rem] p-1.5">
        <div className="flex items-center gap-2.5 rounded-sm px-1.5 py-2">
          <PersonAvatar name={user.name} size={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
            {branchName && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-2xs text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                {branchName}
              </p>
            )}
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Appearance — all three states, unlike the topbar's two-way quick toggle. */}
        <div className="px-1.5 pb-1 pt-1.5 text-2xs font-semibold text-muted-foreground">
          {t('settings.colorMode.label')}
        </div>
        <div
          role="group"
          aria-label={t('settings.colorMode.label')}
          className="mb-1 flex items-center gap-0.5 rounded-full border border-border/80 bg-muted/50 p-0.5"
        >
          {COLOR_MODES.map((m) => {
            const Icon = MODE_ICON[m];
            const active = colorMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setColorMode(m)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-full text-2xs font-semibold',
                  'transition-colors duration-150 ease-out',
                  active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{t(`settings.colorMode.${m}`)}</span>
              </button>
            );
          })}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => navigate(ROUTES.account)}>
          <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('nav.account')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(ROUTES.settings)}>
          <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('nav.settings')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled className="opacity-100 focus:bg-transparent">
          <Keyboard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 text-muted-foreground">{t('search.title')}</span>
          <Kbd>{shortcutLabel('mod+K')}</Kbd>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-destructive focus:bg-destructive-soft focus:text-destructive"
          onSelect={() => {
            logout();
            navigate(ROUTES.login);
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t('auth.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
