import type { AccountOverview } from '@abcp/shared-types';
import { Check, Eye, EyeOff, KeyRound, Minus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { NormalizedApiError } from '@/services/apiError';

import { useChangePassword } from '../account.api';
import {
  PASSWORD_MAX_AGE_DAYS,
  passwordAgeDays,
  passwordRules,
  passwordStrength,
} from '../accountModel';

const STRENGTH_BAR = ['', 'bg-destructive', 'bg-warning', 'bg-info', 'bg-success'] as const;
const STRENGTH_TEXT = [
  '',
  'text-destructive',
  'text-warning',
  'text-info',
  'text-success',
] as const;

type Field = 'current' | 'next' | 'confirm';

interface PasswordSectionProps {
  data: AccountOverview;
  index: number;
  lang: 'lo' | 'en';
}

export function PasswordSection({ data, index, lang }: PasswordSectionProps) {
  const { t } = useTranslation();
  const change = useChangePassword();
  const min = data.policy.minPasswordLength;

  const [values, setValues] = useState<Record<Field, string>>({
    current: '',
    next: '',
    confirm: '',
  });
  const [touched, setTouched] = useState<Record<Field, boolean>>({
    current: false,
    next: false,
    confirm: false,
  });
  const [serverErr, setServerErr] = useState<Partial<Record<Field, string>>>({});
  const [signOutOthers, setSignOutOthers] = useState(true);

  const rules = passwordRules(values.next, min);
  const strength = passwordStrength(values.next, min);
  const ageDays = passwordAgeDays(data);
  const stale = ageDays > PASSWORD_MAX_AGE_DAYS;

  const clientErr: Partial<Record<Field, string>> = {
    current: values.current ? undefined : t('account.password.errCurrentRequired'),
    next: !values.next
      ? t('account.password.errNewRequired')
      : !rules.minLength
        ? t('account.password.errMin', { count: min })
        : values.next === values.current
          ? t('account.password.errSame')
          : undefined,
    confirm:
      values.confirm && values.confirm !== values.next
        ? t('account.password.errMismatch')
        : undefined,
  };
  const errorFor = (f: Field) => serverErr[f] ?? (touched[f] ? clientErr[f] : undefined);
  const canSubmit =
    !clientErr.current && !clientErr.next && values.confirm === values.next && !change.isPending;

  const set = (f: Field, v: string) => {
    setValues((x) => ({ ...x, [f]: v }));
    setServerErr((x) => ({ ...x, [f]: undefined }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ current: true, next: true, confirm: true });
    if (!canSubmit) return;
    change.mutate(
      { currentPassword: values.current, newPassword: values.next, signOutOthers },
      {
        onSuccess: (res) => {
          toast.success(
            res.revokedSessions > 0
              ? t('account.password.savedSignedOut', { count: res.revokedSessions })
              : t('account.password.saved'),
          );
          setValues({ current: '', next: '', confirm: '' });
          setTouched({ current: false, next: false, confirm: false });
        },
        onError: (err) => {
          const ae = err as NormalizedApiError;
          if (ae.code === 'INVALID_CREDENTIALS')
            setServerErr({ current: t('account.password.errCurrentWrong') });
          else if (ae.status === 400) setServerErr({ next: ae.message });
          else toast.error(ae.message);
        },
      },
    );
  };

  return (
    <SettingsSection
      id="acc-security"
      icon={KeyRound}
      index={index}
      title={t('account.password.title')}
      desc={t('account.password.desc')}
      actions={
        <Badge
          variant={stale ? 'warning' : 'neutral'}
          className="whitespace-nowrap"
          title={data.passwordChangedAt ? formatDateTime(data.passwordChangedAt) : undefined}
        >
          {data.passwordChangedAt
            ? t('account.password.changedAgo', {
                when: formatRelative(data.passwordChangedAt, lang),
              })
            : t('account.password.neverChanged')}
        </Badge>
      }
    >
      <form
        onSubmit={submit}
        noValidate
        className="grid gap-5 py-4 md:grid-cols-[minmax(0,1fr)_15rem]"
      >
        {/* Hidden username lets password managers pair the new secret with this account. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={data.user.phone}
          readOnly
          hidden
        />

        <div className="space-y-3.5">
          <PasswordField
            label={t('account.currentPassword')}
            autoComplete="current-password"
            value={values.current}
            error={errorFor('current')}
            onChange={(v) => set('current', v)}
            onBlur={() => setTouched((x) => ({ ...x, current: true }))}
          />
          <PasswordField
            label={t('auth.newPassword')}
            autoComplete="new-password"
            value={values.next}
            error={errorFor('next')}
            onChange={(v) => set('next', v)}
            onBlur={() => setTouched((x) => ({ ...x, next: true }))}
            after={
              <div className="mt-2" aria-live="polite">
                <div className="flex gap-1" aria-hidden="true">
                  {[1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-colors duration-300',
                        strength >= i ? STRENGTH_BAR[strength] : 'bg-muted',
                      )}
                    />
                  ))}
                </div>
                {strength > 0 ? (
                  <p className={cn('mt-1 text-xs font-medium', STRENGTH_TEXT[strength])}>
                    {t('account.password.strength')}: {t(`account.password.level.${strength}`)}
                  </p>
                ) : null}
              </div>
            }
          />
          <PasswordField
            label={t('account.password.confirm')}
            autoComplete="new-password"
            value={values.confirm}
            error={errorFor('confirm')}
            onChange={(v) => set('confirm', v)}
            onBlur={() => setTouched((x) => ({ ...x, confirm: true }))}
          />

          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-foreground">
                {t('account.password.signOutOthers')}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t('account.password.signOutOthersHint')}
              </span>
            </span>
            <Switch
              checked={signOutOthers}
              onCheckedChange={setSignOutOthers}
              aria-label={t('account.password.signOutOthers')}
            />
          </label>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? t('common.saving') : t('account.password.submit')}
            </Button>
          </div>
        </div>

        {/* Requirements */}
        <div className="h-fit rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-xs font-semibold text-foreground">
            {t('account.password.requirements')}
          </p>
          <ul className="mt-2 space-y-1.5">
            <Rule
              ok={rules.minLength}
              required
              label={t('account.password.rule.min', { count: min })}
            />
            <Rule ok={rules.mixedCase} label={t('account.password.rule.mixedCase')} />
            <Rule ok={rules.number} label={t('account.password.rule.number')} />
            <Rule ok={rules.symbol} label={t('account.password.rule.symbol')} />
            <Rule ok={rules.long} label={t('account.password.rule.long')} />
          </ul>
          <p className="mt-3 border-t border-border pt-2 text-2xs leading-relaxed text-muted-foreground">
            {t('account.password.policyNote', { count: min })}
          </p>
        </div>
      </form>
    </SettingsSection>
  );
}

function Rule({ ok, label, required }: { ok: boolean; label: string; required?: boolean }) {
  const { t } = useTranslation();
  return (
    <li
      className={cn(
        'flex items-center gap-2 text-xs',
        ok ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors duration-200',
          ok ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {ok ? (
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        ) : (
          <Minus className="h-2.5 w-2.5" strokeWidth={3} />
        )}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      {required ? (
        <span className="text-2xs font-semibold text-muted-foreground">
          {t('account.password.required')}
        </span>
      ) : null}
      <span className="sr-only">{ok ? t('account.score.done') : t('account.score.todo')}</span>
    </li>
  );
}

interface PasswordFieldProps {
  label: string;
  value: string;
  autoComplete: string;
  error?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  after?: ReactNode;
}

function PasswordField({
  label,
  value,
  autoComplete,
  error,
  onChange,
  onBlur,
  after,
}: PasswordFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          className="pr-11"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? t('account.password.hide') : t('account.password.show')}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {show ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {after}
    </div>
  );
}
