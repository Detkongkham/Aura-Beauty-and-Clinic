import {
  BellRing,
  Grid3x3,
  History,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { AppearanceControls } from '@/features/settings/AppearanceCard';
import { SettingsNav, type SettingsNavItem } from '@/features/settings/components/SettingsNav';
import { SettingsRow } from '@/features/settings/components/SettingsRow';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { ROUTES } from '@/router/paths';

import { useAccountOverview } from './account.api';
import { securityChecks, securityScore } from './accountModel';
import { AccessSection } from './components/AccessSection';
import { AccountHero } from './components/AccountHero';
import { ActivitySection } from './components/ActivitySection';
import { NotificationPrefsSection } from './components/NotificationPrefsSection';
import { PasswordSection } from './components/PasswordSection';
import { ProfileSection } from './components/ProfileSection';
import { QuickPinSection } from './components/QuickPinSection';
import { SessionsSection } from './components/SessionsSection';
import { TwoFactorSection } from './components/TwoFactorSection';

function jump(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

/**
 * /account — the signed-in user's own console: identity + security score up top,
 * then Profile · Password · Sessions · Quick PIN · Preferences · Access · Activity,
 * on the same section-rail layout as /settings. Everything here acts on *self* only.
 */
export function AccountPage() {
  const { t, i18n } = useTranslation();
  const lang: 'lo' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { data, isLoading, isError, refetch } = useAccountOverview();

  const checks = useMemo(() => (data ? securityChecks(data) : []), [data]);
  const score = securityScore(checks);
  const showPin = data?.quickLogin.eligible ?? false;

  const navItems: SettingsNavItem[] = [
    { id: 'acc-profile', icon: UserRound, label: t('account.profile.title') },
    { id: 'acc-security', icon: KeyRound, label: t('account.password.title') },
    { id: 'acc-2fa', icon: Smartphone, label: t('twoFactor.title') },
    { id: 'acc-sessions', icon: MonitorSmartphone, label: t('account.sessions.title') },
    ...(showPin ? [{ id: 'acc-pin', icon: Grid3x3, label: t('account.pin.title') }] : []),
    { id: 'acc-preferences', icon: Palette, label: t('account.preferences') },
    { id: 'acc-notifications', icon: BellRing, label: t('account.notifPrefs.title') },
    { id: 'acc-access', icon: ShieldCheck, label: t('account.access.title') },
    { id: 'acc-activity', icon: History, label: t('account.activity.title') },
  ];

  // Deep links (e.g. /account#acc-sessions) — the router doesn't replay native hash scroll.
  useEffect(() => {
    if (data && hash) jump(hash.slice(1));
  }, [data, hash]);

  const header = (
    <StickyPageHeader>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
            {t('nav.account')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('account.subtitle')}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          aria-label={t('auth.logout')}
          onClick={() => {
            logout();
            navigate(ROUTES.login);
          }}
        >
          <LogOut aria-hidden="true" />
          <span className="hidden sm:inline">{t('auth.logout')}</span>
        </Button>
      </div>
    </StickyPageHeader>
  );

  if (isLoading) {
    return (
      <div className="space-y-5">
        {header}
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[188px_minmax(0,1fr)]">
          <Skeleton className="hidden h-64 w-full rounded-2xl lg:block" />
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-5">
        {header}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('account.loadError')}</p>
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    );
  }

  let i = 0;
  return (
    <div className="space-y-5">
      {header}

      <AccountHero data={data} checks={checks} score={score} lang={lang} onJump={jump} />

      <div className="lg:hidden">
        <SettingsNav items={navItems} variant="chips" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[188px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <SettingsNav items={navItems} variant="rail" />
        </div>

        <div className="space-y-4 pb-6 lg:min-w-0">
          <ProfileSection data={data} index={i++} />
          <PasswordSection data={data} index={i++} lang={lang} />
          <TwoFactorSection data={data} index={i++} />
          <SessionsSection index={i++} lang={lang} />
          {showPin ? <QuickPinSection data={data} index={i++} /> : null}

          <SettingsSection
            id="acc-preferences"
            icon={Palette}
            index={i++}
            title={t('account.preferences')}
            desc={t('account.prefsDesc')}
          >
            <SettingsRow label={t('common.language')} hint={t('account.languageHint')} trailing>
              <LanguageToggle />
            </SettingsRow>
            <AppearanceControls />
          </SettingsSection>

          <NotificationPrefsSection index={i++} />

          <AccessSection data={data} index={i++} />
          <ActivitySection index={i++} />
        </div>
      </div>
    </div>
  );
}
