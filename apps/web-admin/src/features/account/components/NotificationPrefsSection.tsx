import { NOTIFICATION_PREF_MODULES, type NotificationPrefModule } from '@abcp/shared-types';
import { BellRing, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import { MODULE_ICON } from '@/features/notifications/notificationModel';
import { SettingsSection } from '@/features/settings/components/SettingsSection';

import { useMyPreferences, useUpdatePreferences } from '../account.api';

/**
 * Per-source notification choices, saved on the account (so they follow you to every device and
 * the mobile app). "Inbox" off drops that source entirely; "Push" off keeps it in the inbox only.
 * Security alerts and critical items always arrive.
 */
export function NotificationPrefsSection({ index }: { index: number }) {
  const { t } = useTranslation();
  const { data, isLoading } = useMyPreferences();
  const update = useUpdatePreferences();
  const prefs = data?.preferences.notifications ?? {};

  const set = (module: NotificationPrefModule, patch: { inbox?: boolean; push?: boolean }) =>
    update.mutate(
      { notifications: { [module]: patch } },
      { onError: (e) => toast.error((e as Error).message) },
    );

  return (
    <SettingsSection
      id="acc-notifications"
      icon={BellRing}
      index={index}
      title={t('account.notifPrefs.title')}
      desc={t('account.notifPrefs.desc')}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_56px_56px] items-center gap-x-2 border-b border-border pb-2 pt-3 text-xs font-medium text-muted-foreground">
        <span>{t('account.notifPrefs.source')}</span>
        <span className="text-center">{t('account.notifPrefs.inbox')}</span>
        <span className="text-center">{t('account.notifPrefs.push')}</span>
      </div>
      {isLoading ? (
        <div className="space-y-2 py-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          <li className="grid grid-cols-[minmax(0,1fr)_56px_56px] items-center gap-x-2 py-2.5">
            <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{t('notifications.module.security')}</span>
            </span>
            <span className="col-span-2 text-center text-xs text-muted-foreground">
              {t('account.notifPrefs.alwaysOn')}
            </span>
          </li>
          {NOTIFICATION_PREF_MODULES.map((m) => {
            const Icon = MODULE_ICON[m];
            const inbox = prefs[m]?.inbox ?? true;
            const push = inbox && (prefs[m]?.push ?? true);
            const label = t(`notifications.module.${m}`);
            return (
              <li key={m} className="grid grid-cols-[minmax(0,1fr)_56px_56px] items-center gap-x-2 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </span>
                <span className="flex justify-center">
                  <Switch
                    checked={inbox}
                    disabled={update.isPending}
                    aria-label={`${label} — ${t('account.notifPrefs.inbox')}`}
                    onCheckedChange={(v) => set(m, { inbox: v })}
                  />
                </span>
                <span className="flex justify-center">
                  <Switch
                    checked={push}
                    disabled={update.isPending || !inbox}
                    aria-label={`${label} — ${t('account.notifPrefs.push')}`}
                    onCheckedChange={(v) => set(m, { push: v })}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="pb-3 pt-1 text-xs text-muted-foreground">{t('account.notifPrefs.criticalNote')}</p>
    </SettingsSection>
  );
}
