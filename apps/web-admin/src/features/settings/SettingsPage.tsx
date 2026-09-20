import {
  Bell,
  Building2,
  CalendarClock,
  Database,
  Globe,
  ListOrdered,
  Palette,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/features/auth/useAuth';
import { ROUTES } from '@/router/paths';

import { AppearanceControls } from './AppearanceCard';
import { ExchangeRatesPanel } from './components/ExchangeRatesPanel';
import { LogoUploadField } from './components/LogoUploadField';
import { SettingsIdentityCard } from './components/SettingsIdentityCard';
import { SettingsNav, type SettingsNavItem } from './components/SettingsNav';
import { SettingsRow } from './components/SettingsRow';
import { SettingsSection } from './components/SettingsSection';
import { StickySaveBar } from './components/StickySaveBar';
import { type AppSettings, useSaveSettings, useSettings } from './settings.api';
import { SettingsTabs } from './SettingsTabs';

const SECTIONS = [
  { id: 'sec-business', icon: Building2, key: 'business' },
  { id: 'sec-localization', icon: Globe, key: 'localization' },
  { id: 'sec-fx', icon: TrendingUp, key: 'fx' },
  { id: 'sec-booking', icon: CalendarClock, key: 'booking' },
  { id: 'sec-queue', icon: ListOrdered, key: 'queue' },
  { id: 'sec-notifications', icon: Bell, key: 'notifications' },
  { id: 'sec-appearance', icon: Palette, key: 'appearance' },
  { id: 'sec-security', icon: ShieldCheck, key: 'security' },
  { id: 'sec-data', icon: Database, key: 'data' },
] as const;

export function SettingsPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('settings:manage');

  const { data, isLoading } = useSettings();
  const save = useSaveSettings();
  const { hash } = useLocation();

  const [form, setForm] = useState<AppSettings | null>(null);
  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  // Deep-links here (e.g. the Topbar FX ticker → /settings#sec-fx) land on the right
  // section — React Router doesn't repeat the browser's native hash-scroll on a
  // client-side route change, so once the sections exist we do it ourselves.
  useEffect(() => {
    if (!form || !hash) return;
    const id = hash.slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [form, hash]);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const dirty = Boolean(data && form && (Object.keys(form) as (keyof AppSettings)[]).some((k) => form[k] !== data[k]));

  const navItems: SettingsNavItem[] = SECTIONS.map((s) => ({
    id: s.id,
    icon: s.icon,
    label: t(`settings.sec.${s.key}.title`),
  }));

  if (isLoading || !form) {
    return (
      <div className="space-y-5">
        <StickyPageHeader>
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
              {t('nav.settings')}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('settings.subtitle')}</p>
          </div>
          <SettingsTabs active="general" />
        </StickyPageHeader>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-[188px_minmax(0,1fr)]">
          <Skeleton className="hidden h-64 w-full rounded-2xl lg:block" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const currencyOptions = [
    { value: 'LAK', label: 'LAK ₭' },
    { value: 'THB', label: 'THB ฿' },
    { value: 'USD', label: 'USD $' },
  ];
  const languageOptions = [
    { value: 'lo', label: t('settings.language.lo') },
    { value: 'en', label: t('settings.language.en') },
  ];
  const weekStartOptions = [
    { value: 'mon', label: t('settings.weekStart.mon') },
    { value: 'sun', label: t('settings.weekStart.sun') },
  ];
  const dateFormatOptions = [
    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  ];
  const fxRefreshOptions = [
    { value: '10', label: t('settings.fx.every', { minutes: 10 }) },
    { value: '30', label: t('settings.fx.every', { minutes: 30 }) },
    { value: '60', label: t('settings.fx.every', { minutes: 60 }) },
    { value: '240', label: t('settings.fx.every', { minutes: 240 }) },
  ];

  return (
    <div className="space-y-5">
      <StickyPageHeader>
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
            {t('nav.settings')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('settings.subtitle')}</p>
        </div>
        <SettingsTabs active="general" />
      </StickyPageHeader>

      <SettingsIdentityCard
        logoUrl={form.logoUrl}
        businessName={form.businessName}
        legalName={form.legalName}
        displayCurrency={form.displayCurrency}
        timezone={form.timezone}
        defaultLanguage={form.defaultLanguage}
      />

      <div className="lg:hidden">
        <SettingsNav items={navItems} variant="chips" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[188px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <SettingsNav items={navItems} variant="rail" />
        </div>

        <div className="space-y-4 pb-4 lg:min-w-0">
          <SettingsSection
            id="sec-business"
            icon={Building2}
            index={0}
            title={t('settings.sec.business.title')}
            desc={t('settings.sec.business.desc')}
          >
            <SettingsRow label={t('settings.logo.label')} hint={t('settings.logo.hint')} stack>
              <LogoUploadField
                value={form.logoUrl}
                disabled={!canManage}
                onChange={(dataUrl) => set('logoUrl', dataUrl)}
              />
            </SettingsRow>
            {renderText(t, form, canManage, set, 'businessName', 'businessName')}
            {renderText(t, form, canManage, set, 'legalName', 'legalName')}
            {renderText(t, form, canManage, set, 'contactPhone', 'contactPhone')}
            {renderText(t, form, canManage, set, 'contactEmail', 'contactEmail')}
            {renderText(t, form, canManage, set, 'addressLine', 'addressLine', true)}
            {renderText(t, form, canManage, set, 'taxId', 'taxId')}
          </SettingsSection>

          <SettingsSection
            id="sec-localization"
            icon={Globe}
            index={1}
            title={t('settings.sec.localization.title')}
            desc={t('settings.sec.localization.desc')}
          >
            {renderSelect(t, form, canManage, set, 'displayCurrency', 'currency', currencyOptions)}
            {renderText(t, form, canManage, set, 'timezone', 'timezone', false, true)}
            {renderSelect(t, form, canManage, set, 'defaultLanguage', 'defaultLanguage', languageOptions)}
            {renderSelect(t, form, canManage, set, 'weekStart', 'weekStartLabel', weekStartOptions)}
            {renderSelect(t, form, canManage, set, 'dateFormat', 'dateFormatLabel', dateFormatOptions)}
          </SettingsSection>

          <SettingsSection
            id="sec-fx"
            icon={TrendingUp}
            index={2}
            title={t('settings.sec.fx.title')}
            desc={t('settings.sec.fx.desc')}
          >
            {renderToggle(t, form, canManage, set, 'autoConvertCurrency', 'autoConvertCurrency')}
            <SettingsRow label={t('settings.fxRefreshMinutesLabel')} htmlFor="set-fxRefreshMinutes">
              <Select
                id="set-fxRefreshMinutes"
                value={String(form.fxRefreshMinutes)}
                disabled={!canManage}
                onChange={(e) => set('fxRefreshMinutes', Number(e.target.value))}
                options={fxRefreshOptions}
              />
            </SettingsRow>
            <ExchangeRatesPanel refreshMinutes={form.fxRefreshMinutes} />
          </SettingsSection>

          <SettingsSection
            id="sec-booking"
            icon={CalendarClock}
            index={3}
            title={t('settings.sec.booking.title')}
            desc={t('settings.sec.booking.desc')}
          >
            {renderNumber(t, form, canManage, set, 'bookingLeadHours', 'bookingLead')}
            {renderNumber(t, form, canManage, set, 'cancellationWindowHours', 'cancelWindow')}
            {renderNumber(t, form, canManage, set, 'maxAdvanceDays', 'maxAdvanceDays')}
            {renderNumber(t, form, canManage, set, 'slotIntervalMinutes', 'slotInterval')}
            {renderToggle(t, form, canManage, set, 'allowWalkIns', 'allowWalkIns')}
            {renderToggle(t, form, canManage, set, 'allowOnlineBooking', 'allowOnlineBooking')}
            {renderToggle(t, form, canManage, set, 'autoConfirm', 'autoConfirm')}
            {renderToggle(t, form, canManage, set, 'requireDeposit', 'requireDeposit')}
            {form.requireDeposit ? renderNumber(t, form, canManage, set, 'depositPercent', 'depositPercent') : null}
            {renderNumber(t, form, canManage, set, 'noShowThreshold', 'noShowThreshold')}
          </SettingsSection>

          <SettingsSection
            id="sec-queue"
            icon={ListOrdered}
            index={4}
            title={t('settings.sec.queue.title')}
            desc={t('settings.sec.queue.desc')}
          >
            {renderToggle(t, form, canManage, set, 'queueEnabled', 'queueEnabled')}
            {renderText(t, form, canManage, set, 'ticketPrefix', 'ticketPrefix')}
            {renderNumber(t, form, canManage, set, 'waitAlertMinutes', 'waitAlertMinutes')}
            {renderToggle(t, form, canManage, set, 'autoRecall', 'autoRecall')}
          </SettingsSection>

          <SettingsSection
            id="sec-notifications"
            icon={Bell}
            index={5}
            title={t('settings.sec.notifications.title')}
            desc={t('settings.sec.notifications.desc')}
            actions={
              <Button asChild variant="secondary" size="sm">
                <Link to={ROUTES.settingsNotifications}>{t('settings.manageTemplates')}</Link>
              </Button>
            }
          >
            {renderText(t, form, canManage, set, 'smsSenderName', 'smsSenderName')}
            {renderText(t, form, canManage, set, 'reminderOffsetsHours', 'reminderOffsets')}
            {renderToggle(t, form, canManage, set, 'sendBookingConfirmation', 'sendBookingConfirmation')}
          </SettingsSection>

          <SettingsSection
            id="sec-appearance"
            icon={Palette}
            index={6}
            title={t('settings.appearance')}
            desc={t('settings.sec.appearance.desc')}
          >
            <AppearanceControls />
          </SettingsSection>

          <SettingsSection
            id="sec-security"
            icon={ShieldCheck}
            index={7}
            title={t('settings.sec.security.title')}
            desc={t('settings.sec.security.desc')}
          >
            {renderNumber(t, form, canManage, set, 'sessionTimeoutMinutes', 'sessionTimeout')}
            {renderNumber(t, form, canManage, set, 'minPasswordLength', 'minPasswordLength')}
            {renderToggle(t, form, canManage, set, 'require2fa', 'require2fa')}
          </SettingsSection>

          <SettingsSection
            id="sec-data"
            icon={Database}
            index={8}
            title={t('settings.sec.data.title')}
            desc={t('settings.sec.data.desc')}
            actions={
              <div className="flex gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link to={ROUTES.importExport}>{t('settings.importExport')}</Link>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <Link to={ROUTES.auditLog}>{t('nav.auditLog')}</Link>
                </Button>
              </div>
            }
          >
            {renderNumber(t, form, canManage, set, 'dataRetentionMonths', 'dataRetentionMonths')}
          </SettingsSection>
        </div>
      </div>

      {canManage ? (
        <StickySaveBar
          visible={dirty}
          saving={save.isPending}
          onDiscard={() => data && setForm(data)}
          onSave={() => form && save.mutate(form)}
        />
      ) : null}
    </div>
  );
}

// --- Row renderers: plain functions (not components) so inputs never remount on keystroke ---

type TFn = ReturnType<typeof useTranslation>['t'];
type SetFn = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;

function renderText(
  t: TFn,
  form: AppSettings,
  canManage: boolean,
  set: SetFn,
  key: keyof AppSettings & string,
  labelKey: string,
  stack = false,
  disabled = false,
) {
  const id = `set-${key}`;
  return (
    <SettingsRow key={key} label={t(`settings.${labelKey}`)} htmlFor={id} stack={stack}>
      <Input
        id={id}
        value={String(form[key] ?? '')}
        disabled={!canManage || disabled}
        onChange={(e) => set(key, e.target.value as AppSettings[typeof key])}
      />
    </SettingsRow>
  );
}

function renderNumber(
  t: TFn,
  form: AppSettings,
  canManage: boolean,
  set: SetFn,
  key: keyof AppSettings & string,
  labelKey: string,
) {
  const id = `set-${key}`;
  return (
    <SettingsRow key={key} label={t(`settings.${labelKey}`)} htmlFor={id}>
      <Input
        id={id}
        type="number"
        value={String(form[key] ?? '')}
        disabled={!canManage}
        onChange={(e) => set(key, Number(e.target.value) as AppSettings[typeof key])}
      />
    </SettingsRow>
  );
}

function renderSelect(
  t: TFn,
  form: AppSettings,
  canManage: boolean,
  set: SetFn,
  key: keyof AppSettings & string,
  labelKey: string,
  options: { value: string; label: string }[],
) {
  const id = `set-${key}`;
  return (
    <SettingsRow key={key} label={t(`settings.${labelKey}`)} htmlFor={id}>
      <Select
        id={id}
        value={String(form[key] ?? '')}
        disabled={!canManage}
        onChange={(e) => set(key, e.target.value as AppSettings[typeof key])}
        options={options}
      />
    </SettingsRow>
  );
}

function renderToggle(
  t: TFn,
  form: AppSettings,
  canManage: boolean,
  set: SetFn,
  key: keyof AppSettings & string,
  labelKey: string,
) {
  const id = `set-${key}`;
  return (
    <SettingsRow key={key} label={t(`settings.${labelKey}`)} htmlFor={id} trailing>
      <Switch
        id={id}
        checked={Boolean(form[key])}
        disabled={!canManage}
        onCheckedChange={(v) => set(key, v as AppSettings[typeof key])}
      />
    </SettingsRow>
  );
}
