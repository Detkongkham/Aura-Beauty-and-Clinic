import { CalendarCheck2, Clock3, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';

import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

import { useApiHealth } from '../useApiHealth';
import { CLINIC_TZ as TZ, useNow } from '../authTime';
import { SystemStatusCard, SystemStatusPill } from './SystemStatusCard';


function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-10 w-10 items-center justify-center rounded-md bg-primary-foreground/15 ring-1 ring-primary-foreground/25 ${className ?? ''}`}
    >
      <Sparkles className="h-5 w-5" />
    </span>
  );
}

/** Live Vientiane wall clock — the clinic's time, whatever the device's zone. */
function ClinicClock() {
  const { t, i18n } = useTranslation();
  const now = useNow(15_000);
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'lo-LA';
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(now);
  const date = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).format(now);
  return (
    <p className="flex items-center gap-2 text-xs text-primary-foreground/80">
      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
      <span>
        {t('auth.hero.clinicTime')} · <span className="font-semibold tabular-nums text-primary-foreground">{time}</span> · {date}
      </span>
    </p>
  );
}

/**
 * Split-screen frame for /login, /forgot-password and /reset-password.
 * Left (lg+): brand story + live system status. Right: the form, language/theme
 * toggles, and a compact status pill on narrow screens where the panel is hidden.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const health = useApiHealth();
  const features = [
    { icon: CalendarCheck2, title: t('auth.hero.f1'), body: t('auth.hero.f1Body') },
    { icon: CreditCard, title: t('auth.hero.f2'), body: t('auth.hero.f2Body') },
    { icon: ShieldCheck, title: t('auth.hero.f3'), body: t('auth.hero.f3Body') },
  ];

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Form column */}
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-2 lg:invisible">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-hidden="true">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="font-display text-lg text-primary">{t('app.name')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <LanguageToggle className="inline-flex" />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-6 sm:px-8">
          <div className="w-full max-w-[26rem] animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
            {children}
          </div>
        </main>

        <footer className="flex flex-col items-center gap-2 px-4 pb-6 text-2xs text-muted-foreground sm:flex-row sm:justify-between sm:px-8">
          <span className="lg:hidden">
            <SystemStatusPill health={health} />
          </span>
          <span>
            © {new Date().getFullYear()} {t('app.tagline')}
          </span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {t('auth.footerSecurity')}
          </span>
        </footer>
      </div>
      {/* Brand panel — after the form in DOM so tab order and headings start with the form. */}
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:sticky lg:top-0 lg:order-first lg:self-start lg:flex lg:h-screen lg:flex-col">
        {/* decorative wash */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary-foreground/10 blur-3xl" />
          <div className="absolute -bottom-32 right-[-6rem] h-[28rem] w-[28rem] rounded-full bg-accent/25 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />
        </div>

        <div className="relative flex flex-1 flex-col justify-between gap-8 overflow-y-auto p-10 xl:p-14">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="font-display text-xl leading-tight">{t('app.name')}</p>
              <p className="text-xs text-primary-foreground/75">{t('app.tagline')}</p>
            </div>
          </div>

          <div className="max-w-lg space-y-8">
            <div className="space-y-3">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 py-1 text-xs font-medium ring-1 ring-primary-foreground/20">
                <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {t('auth.hero.eyebrow')}
              </p>
              <p className="font-display text-4xl leading-tight xl:text-[2.75rem]">{t('auth.hero.title')}</p>
              <p className="max-w-md text-sm leading-relaxed text-primary-foreground/80">{t('auth.hero.body')}</p>
            </div>

            <ul className="grid gap-3">
              {features.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-xs text-primary-foreground/75">{body}</span>
                  </span>
                </li>
              ))}
            </ul>

            <SystemStatusCard health={health} className="max-w-md" />
          </div>

          <ClinicClock />
        </div>
      </aside>

    </div>
  );
}

/** Card chrome shared by every auth step: icon badge, title, subtitle, body. */
export function AuthCard({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  children,
  tone = 'primary',
}: {
  icon: React.ComponentType<{ className?: string }>;
  eyebrow?: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'primary' | 'success';
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <span
          aria-hidden="true"
          className={`flex h-12 w-12 items-center justify-center rounded-lg ring-1 ${
            tone === 'success' ? 'bg-success-soft text-success ring-success/20' : 'bg-primary-subtle text-primary ring-primary/15'
          }`}
        >
          <Icon className="h-6 w-6" />
        </span>
        {eyebrow ? <div className="text-xs font-medium text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {subtitle ? <p className="text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">{children}</div>
    </div>
  );
}
