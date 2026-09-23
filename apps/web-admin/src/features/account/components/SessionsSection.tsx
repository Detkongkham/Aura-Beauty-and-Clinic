import type { AccountSession } from '@abcp/shared-types';
import {
  HelpCircle,
  LogOut,
  Monitor,
  MonitorSmartphone,
  ShieldAlert,
  Smartphone,
  Tablet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/features/auth/useAuth';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

import { useAccountSessions, useRevokeOtherSessions, useRevokeSession } from '../account.api';
import { SESSION_SOFT_LIMIT } from '../accountModel';

const KIND_ICON: Record<AccountSession['deviceKind'], LucideIcon> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: HelpCircle,
};

/** Online if seen within the access-token lifetime (tokens refresh every ≤15 min while in use). */
const ONLINE_WINDOW_MS = 16 * 60_000;

interface SessionsSectionProps {
  index: number;
  lang: 'lo' | 'en';
}

export function SessionsSection({ index, lang }: SessionsSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { data: sessions, isLoading, isError, refetch } = useAccountSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();

  const [target, setTarget] = useState<AccountSession | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const others = (sessions ?? []).filter((s) => !s.isCurrent);
  const deviceName = (s: AccountSession) => s.deviceLabel ?? t('account.sessions.unknownDevice');

  const doRevoke = () => {
    if (!target) return;
    const wasCurrent = target.isCurrent;
    revoke.mutate(target.id, {
      onSuccess: () => {
        setTarget(null);
        if (wasCurrent) {
          logout();
          navigate(ROUTES.login);
          return;
        }
        toast.success(t('account.sessions.revoked', { device: deviceName(target) }));
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const doRevokeOthers = () =>
    revokeOthers.mutate(undefined, {
      onSuccess: (r) => {
        setConfirmAll(false);
        toast.success(t('account.sessions.revokedOthers', { count: r.revoked }));
      },
      onError: (e) => toast.error((e as Error).message),
    });

  return (
    <SettingsSection
      id="acc-sessions"
      icon={MonitorSmartphone}
      index={index}
      title={t('account.sessions.title')}
      desc={t('account.sessions.desc')}
      actions={
        others.length > 0 ? (
          <Button variant="secondary" size="sm" onClick={() => setConfirmAll(true)}>
            <LogOut aria-hidden="true" />
            <span className="hidden sm:inline">{t('account.sessions.revokeOthers')}</span>
            <span className="sm:hidden">{t('account.sessions.revokeOthersShort')}</span>
          </Button>
        ) : null
      }
    >
      {isLoading ? (
        <div className="space-y-2 py-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 py-4 text-sm">
          <span className="text-muted-foreground">{t('account.loadError')}</span>
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <>
          {others.length >= SESSION_SOFT_LIMIT ? (
            <div className="my-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <span className="text-foreground">
                {t('account.sessions.manyWarning', { count: others.length + 1 })}
              </span>
            </div>
          ) : null}

          <ul className="divide-y divide-border/70">
            {(sessions ?? []).map((s) => {
              const Icon = KIND_ICON[s.deviceKind];
              const online =
                s.isCurrent || Date.now() - Date.parse(s.lastSeenAt) < ONLINE_WINDOW_MS;
              return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <span
                    className={cn(
                      'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      s.isCurrent
                        ? 'bg-primary-subtle text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {online ? (
                      <span
                        className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card"
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {deviceName(s)}
                      </span>
                      {s.isCurrent ? (
                        <Badge variant="success">{t('account.sessions.thisDevice')}</Badge>
                      ) : null}
                      {s.method !== 'PASSWORD' ? (
                        <Badge variant="neutral">{t(`account.sessions.method.${s.method}`)}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[
                        s.ipAddress,
                        t('account.sessions.signedIn', { date: formatDateTime(s.createdAt) }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  <div className="hidden shrink-0 text-right sm:block">
                    <p
                      className={cn(
                        'text-xs font-medium',
                        online ? 'text-success' : 'text-muted-foreground',
                      )}
                      title={formatDateTime(s.lastSeenAt)}
                    >
                      {online
                        ? t('account.sessions.activeNow')
                        : formatRelative(s.lastSeenAt, lang)}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                    aria-label={t('account.sessions.revokeOne', { device: deviceName(s) })}
                    title={t('account.sessions.revokeOne', { device: deviceName(s) })}
                    onClick={() => setTarget(s)}
                  >
                    <LogOut aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>

          <p className="py-3 text-2xs leading-relaxed text-muted-foreground">
            {t('account.sessions.footnote')}
          </p>
        </>
      )}

      <ConfirmDialog
        open={target != null}
        destructive
        busy={revoke.isPending}
        title={
          target?.isCurrent
            ? t('account.sessions.confirmSelfTitle')
            : t('account.sessions.confirmTitle', { device: target ? deviceName(target) : '' })
        }
        description={
          target?.isCurrent
            ? t('account.sessions.confirmSelfDesc')
            : t('account.sessions.confirmDesc')
        }
        confirmLabel={t('account.sessions.signOut')}
        onConfirm={doRevoke}
        onCancel={() => setTarget(null)}
      />
      <ConfirmDialog
        open={confirmAll}
        destructive
        busy={revokeOthers.isPending}
        title={t('account.sessions.confirmAllTitle', { count: others.length })}
        description={t('account.sessions.confirmAllDesc')}
        confirmLabel={t('account.sessions.revokeOthers')}
        onConfirm={doRevokeOthers}
        onCancel={() => setConfirmAll(false)}
      />
    </SettingsSection>
  );
}
