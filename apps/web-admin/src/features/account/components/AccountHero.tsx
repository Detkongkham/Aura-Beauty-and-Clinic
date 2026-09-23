import type { AccountOverview, RoleIconKey } from '@abcp/shared-types';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Check,
  Building2,
  Clock,
  KeyRound,
  Mail,
  MonitorSmartphone,
  Phone,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CardCount } from '@/components/shared/CardCount';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { RoleIcon } from '@/features/users/RoleIcon';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

import { passwordAgeDays, scoreTone, type SecurityCheck } from '../accountModel';

interface AccountHeroProps {
  data: AccountOverview;
  checks: SecurityCheck[];
  score: number;
  lang: 'lo' | 'en';
  onJump: (id: string) => void;
}

const TONE_STROKE = {
  success: 'stroke-success',
  warning: 'stroke-warning',
  danger: 'stroke-destructive',
} as const;
const TONE_TEXT = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
} as const;

/**
 * "Who am I, and how safe is this account" — identity on the left, a security score
 * ring with its fix-it checklist on the right, and a row of stat cards underneath.
 */
export function AccountHero({ data, checks, score, lang, onJump }: AccountHeroProps) {
  const { t } = useTranslation();
  const { user } = data;
  const tone = scoreTone(score);
  const roleLabel =
    data.role?.name ?? t(`messaging.role.${user.role}`, { defaultValue: user.role });
  const pwAge = passwordAgeDays(data);

  return (
    <div className="space-y-3">
      <section
        aria-label={t('account.hero.label')}
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm',
          'animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none',
        )}
      >
        {/* Brand wash + soft gold glow — decorative. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-subtle/80 via-card to-card"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl"
        />

        <div className="relative grid grid-cols-[minmax(0,1fr)] gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          {/* Identity */}
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative shrink-0">
              <PersonAvatar
                name={user.name}
                src={data.avatarUrl}
                mode="auto"
                size={76}
                className="ring-4 ring-card shadow-md"
              />
              <span
                className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-success text-success-foreground ring-2 ring-card"
                title={t('account.hero.active')}
              >
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{t('account.hero.active')}</span>
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-xl font-semibold leading-tight text-foreground sm:text-2xl">
                {user.name}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {data.role ? (
                  <span
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ background: `${data.role.color}1a`, color: data.role.color }}
                  >
                    <RoleIcon icon={data.role.icon as RoleIconKey} className="h-3 w-3" />
                    {roleLabel}
                  </span>
                ) : (
                  <Badge variant="primary" className="whitespace-nowrap">
                    {roleLabel}
                  </Badge>
                )}
                {data.staff?.title ? (
                  <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground">
                    {data.staff.title}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground">
                  <Building2 className="h-3 w-3 text-primary" aria-hidden="true" />
                  {data.branch?.name ?? t('account.hero.allBranches')}
                </span>
              </div>

              <dl className="mt-3 grid gap-x-5 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <dt className="sr-only">{t('auth.phone')}</dt>
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <dd className="truncate tabular-nums text-foreground">{user.phone}</dd>
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                  <dt className="sr-only">{t('users.email')}</dt>
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <dd className={cn('truncate', user.email ? 'text-foreground' : 'italic')}>
                    {user.email ?? t('account.hero.noEmail')}
                  </dd>
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                  <dt className="sr-only">{t('account.hero.memberSince')}</dt>
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <dd className="truncate">
                    {t('account.hero.memberSinceValue', { date: formatDate(data.createdAt) })}
                  </dd>
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                  <dt className="sr-only">{t('account.hero.lastLogin')}</dt>
                  <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <dd
                    className="truncate"
                    title={data.lastLoginAt ? formatDateTime(data.lastLoginAt) : undefined}
                  >
                    {data.lastLoginAt
                      ? t('account.hero.lastLoginValue', {
                          when: formatRelative(data.lastLoginAt, lang),
                          device: data.lastLoginDevice ?? t('account.sessions.unknownDevice'),
                        })
                      : t('account.hero.neverLoggedIn')}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Security score */}
          <div className="flex min-w-0 items-center gap-4 rounded-xl border border-border/80 bg-card/80 p-3 backdrop-blur-sm lg:w-[22rem]">
            <ScoreRing score={score} tone={tone} label={t('account.score.label')} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground">
                {t('account.score.label')}
              </p>
              <p className={cn('text-sm font-semibold', TONE_TEXT[tone])}>
                {t(`account.score.level.${tone}`)}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {checks.map((c) => (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => onJump(c.target)}
                      className={cn(
                        'group flex w-full items-center gap-1.5 rounded text-left text-xs transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        c.ok ? 'text-muted-foreground' : 'text-foreground hover:text-primary',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                          c.ok ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
                        )}
                      >
                        {c.ok ? (
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        ) : (
                          <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.5} />
                        )}
                      </span>
                      {/* No strike-through: it cuts through Lao vowel marks and hurts legibility. */}
                      <span className="truncate">{t(`account.score.check.${c.key}`)}</span>
                      <span className="sr-only">
                        {c.ok ? t('account.score.done') : t('account.score.todo')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardCount
          index={0}
          icon={<MonitorSmartphone className="h-4 w-4 text-primary" aria-hidden="true" />}
          label={t('account.stats.sessions')}
          value={data.stats.activeSessions}
          onClick={() => onJump('acc-sessions')}
        />
        <CardCount
          index={1}
          icon={<KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />}
          label={t('account.stats.passwordAge')}
          value={t('account.stats.days', { count: pwAge })}
          onClick={() => onJump('acc-security')}
        />
        <CardCount
          index={2}
          icon={<Activity className="h-4 w-4 text-primary" aria-hidden="true" />}
          label={t('account.stats.actions30d')}
          value={data.stats.actions30d}
          onClick={() => onJump('acc-activity')}
        />
        <CardCount
          index={3}
          icon={<BadgeCheck className="h-4 w-4 text-primary" aria-hidden="true" />}
          label={t('account.stats.permissions')}
          value={user.permissions.length}
          onClick={() => onJump('acc-access')}
        />
      </div>
    </div>
  );
}

function ScoreRing({
  score,
  tone,
  label,
}: {
  score: number;
  tone: keyof typeof TONE_STROKE;
  label: string;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`${label}: ${score}/100`}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className={cn(
            TONE_STROKE[tone],
            'transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none',
          )}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-base font-bold tabular-nums text-foreground">
        {score}
      </span>
    </div>
  );
}
