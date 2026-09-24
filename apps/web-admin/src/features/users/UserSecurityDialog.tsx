import type { AdminSession } from '@abcp/shared-types';
import {
  HelpCircle,
  KeyRound,
  LockKeyhole,
  LogOut,
  Monitor,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Tablet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  useIssueResetCode,
  useResetUserTwoFactor,
  useRevokeAllUserSessions,
  useRevokeUserSession,
  useUnlockUser,
  useUserSecurity,
} from './users.api';

const KIND_ICON: Record<AdminSession['deviceKind'], LucideIcon> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: HelpCircle,
};

type Confirm = 'revokeAll' | 'reset2fa' | 'issueCode' | null;

/**
 * An admin's view of someone else's account security — used from Users (admins) and Staff detail.
 * Lists live + recently ended sessions, failed sign-ins, lock state; can sign devices out (e.g. when
 * a staff member leaves), unlock, reset a lost authenticator, or issue a one-time reset code.
 */
export function UserSecurityDialog({
  userId,
  name,
  open,
  onClose,
}: {
  userId: string | null;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en' : 'lo';
  const { data, isLoading, isError } = useUserSecurity(open ? userId : null);
  const revoke = useRevokeUserSession(userId);
  const revokeAll = useRevokeAllUserSessions(userId);
  const unlock = useUnlockUser(userId);
  const reset2fa = useResetUserTwoFactor(userId);
  const issue = useIssueResetCode(userId);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);

  const fail = (e: unknown) => toast.error((e as Error).message);
  const live = data?.sessions.filter((s) => !s.revokedAt) ?? [];
  const ended = data?.sessions.filter((s) => s.revokedAt) ?? [];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            setIssued(null);
            onClose();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('userSecurity.title', { name })}</DialogTitle>
            <DialogDescription>{t('userSecurity.desc')}</DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-2 py-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError || !data ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('userSecurity.loadError')}</p>
          ) : (
            <div className="space-y-5 py-1">
              {/* Status tiles */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Tile
                  icon={data.twoFactorEnabled ? ShieldCheck : ShieldOff}
                  tone={data.twoFactorEnabled ? 'success' : 'muted'}
                  label={t('userSecurity.twoFactor')}
                  value={data.twoFactorEnabled ? t('twoFactor.on') : t('twoFactor.off')}
                />
                <Tile
                  icon={LockKeyhole}
                  tone={data.lockedUntil ? 'danger' : 'muted'}
                  label={t('userSecurity.lock')}
                  value={data.lockedUntil ? t('userSecurity.lockedUntil', { time: formatDateTime(data.lockedUntil) }) : t('userSecurity.notLocked')}
                />
                <Tile
                  icon={Monitor}
                  tone="muted"
                  label={t('userSecurity.activeSessions')}
                  value={String(live.length)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {data.lockedUntil ? (
                  <Button
                    size="sm"
                    disabled={unlock.isPending}
                    onClick={() => unlock.mutate(undefined, { onSuccess: () => toast.success(t('userSecurity.unlocked')), onError: fail })}
                  >
                    {t('userSecurity.unlock')}
                  </Button>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => setConfirm('issueCode')}>
                  <KeyRound aria-hidden="true" />
                  {t('userSecurity.issueCode')}
                </Button>
                {data.twoFactorEnabled ? (
                  <Button size="sm" variant="secondary" onClick={() => setConfirm('reset2fa')}>
                    {t('userSecurity.reset2fa')}
                  </Button>
                ) : null}
                {live.length > 0 ? (
                  <Button size="sm" variant="danger" onClick={() => setConfirm('revokeAll')}>
                    <LogOut aria-hidden="true" />
                    {t('userSecurity.revokeAll')}
                  </Button>
                ) : null}
              </div>

              {issued ? (
                <div role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">{t('userSecurity.codeIssuedHint')}</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em] text-foreground">{issued.code}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('userSecurity.codeExpires', { time: formatDateTime(issued.expiresAt) })}
                  </p>
                </div>
              ) : null}

              {/* Sessions */}
              <section>
                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t('userSecurity.sessions')}</h3>
                {live.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('userSecurity.noSessions')}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {live.map((s) => (
                      <SessionRow
                        key={s.id}
                        s={s}
                        locale={locale}
                        action={
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={revoke.isPending}
                            onClick={() => revoke.mutate(s.id, { onSuccess: () => toast.success(t('userSecurity.revoked')), onError: fail })}
                          >
                            {t('userSecurity.signOut')}
                          </Button>
                        }
                      />
                    ))}
                  </ul>
                )}
                {ended.length > 0 ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      {t('userSecurity.ended', { count: ended.length })}
                    </summary>
                    <ul className="mt-1.5 divide-y divide-border rounded-lg border border-border">
                      {ended.map((s) => (
                        <SessionRow
                          key={s.id}
                          s={s}
                          locale={locale}
                          action={
                            <Badge variant="neutral" className="whitespace-nowrap">
                              {t(`userSecurity.reason.${s.revokedReason ?? 'USER'}`, { defaultValue: s.revokedReason ?? '' })}
                            </Badge>
                          }
                        />
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>

              {/* Failed sign-ins */}
              <section>
                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t('userSecurity.failures')}</h3>
                {data.recentFailures.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('userSecurity.noFailures')}</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {data.recentFailures.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
                        <span className="text-foreground">
                          {t(`userSecurity.failReason.${f.reason ?? 'bad_password'}`, { defaultValue: f.reason ?? '' })}
                          {f.device ? <span className="text-muted-foreground"> · {f.device}</span> : null}
                        </span>
                        <span className="text-muted-foreground">
                          {f.ipAddress ? `${f.ipAddress} · ` : ''}
                          {formatRelative(f.createdAt, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm === 'revokeAll'}
        destructive
        busy={revokeAll.isPending}
        title={t('userSecurity.revokeAllTitle')}
        description={t('userSecurity.revokeAllDesc', { name })}
        confirmLabel={t('userSecurity.revokeAll')}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          revokeAll.mutate(undefined, {
            onSuccess: (r) => {
              setConfirm(null);
              toast.success(t('userSecurity.revokedAll', { count: r.revoked }));
            },
            onError: fail,
          })
        }
      />
      <ConfirmDialog
        open={confirm === 'reset2fa'}
        destructive
        busy={reset2fa.isPending}
        title={t('userSecurity.reset2faTitle')}
        description={t('userSecurity.reset2faDesc', { name })}
        confirmLabel={t('userSecurity.reset2fa')}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          reset2fa.mutate(undefined, {
            onSuccess: () => {
              setConfirm(null);
              toast.success(t('userSecurity.reset2faDone'));
            },
            onError: fail,
          })
        }
      />
      <ConfirmDialog
        open={confirm === 'issueCode'}
        busy={issue.isPending}
        title={t('userSecurity.issueCodeTitle')}
        description={t('userSecurity.issueCodeDesc', { name })}
        confirmLabel={t('userSecurity.issueCode')}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          issue.mutate(undefined, {
            onSuccess: (r) => {
              setConfirm(null);
              setIssued(r);
            },
            onError: fail,
          })
        }
      />
    </>
  );
}

function Tile({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: LucideIcon;
  tone: 'success' | 'danger' | 'muted';
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon
          className={cn('h-3.5 w-3.5', tone === 'success' && 'text-success', tone === 'danger' && 'text-destructive')}
          aria-hidden="true"
        />
        {label}
      </div>
      <p className={cn('mt-0.5 truncate text-sm font-medium', tone === 'danger' ? 'text-destructive' : 'text-foreground')}>
        {value}
      </p>
    </div>
  );
}

function SessionRow({ s, locale, action }: { s: AdminSession; locale: 'lo' | 'en'; action: React.ReactNode }) {
  const { t } = useTranslation();
  const Icon = KIND_ICON[s.deviceKind];
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{s.deviceLabel ?? t('userSecurity.unknownDevice')}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[s.ipAddress, t('userSecurity.lastSeen', { when: formatRelative(s.lastSeenAt, locale) })].filter(Boolean).join(' · ')}
        </p>
      </div>
      {action}
    </li>
  );
}
