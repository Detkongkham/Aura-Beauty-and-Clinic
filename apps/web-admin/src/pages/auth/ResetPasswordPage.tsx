import { resetPasswordSchema, type ResetPasswordInput } from '@abcp/shared-types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Hash,
  Loader2,
  LockKeyhole,
  Phone,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { authApi } from '@/features/auth/auth.api';
import { AuthCard, AuthShell } from '@/features/auth/components/AuthShell';
import {
  AuthNotice,
  AuthStepper,
  CodeProgress,
  CountdownBar,
  FieldError,
  IconInput,
  PasswordInput,
  PasswordStrengthMeter,
} from '@/features/auth/components/authParts';
import { formatClock, useNow } from '@/features/auth/authTime';
import { NormalizedApiError } from '@/services/apiError';
import { ROUTES } from '@/router/paths';

const formSchema = resetPasswordSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.confirm === v.newPassword, { path: ['confirm'], message: 'mismatch' });
type FormValues = z.infer<typeof formSchema>;

const RESEND_COOLDOWN_MS = 60_000;
const DEFAULT_TTL_MIN = 10;
const REDIRECT_MS = 10_000;

const num = (v: string | null) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Step 2: code (SMS / e-mail / admin-issued) + new password. Signs out every device on success. */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Only present when the user came from step 1 — an admin-issued code has its own expiry we can't see.
  const [code, setCode] = useState<{ exp: number; sent: number } | null>(() => {
    const exp = num(params.get('exp'));
    return exp ? { exp, sent: num(params.get('sent')) ?? exp - DEFAULT_TTL_MIN * 60_000 } : null;
  });
  const [expired, setExpired] = useState(false);
  const now = useNow(1000, Boolean(code));

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { phone: params.get('phone') ?? '', code: '', newPassword: '', confirm: '' },
  });
  const [codeValue, newPassword, confirm] = form.watch(['code', 'newPassword', 'confirm']);

  const reset = useMutation({
    mutationFn: ({ confirm: _c, ...input }: FormValues) => authApi.resetPassword(input as ResetPasswordInput),
    onError: (err) => {
      const e = err instanceof NormalizedApiError ? err : null;
      const reason = (e?.details as { reason?: string; field?: string } | undefined) ?? {};
      if (reason.reason === 'CODE_INVALID') form.setError('code', { message: t('auth.codeInvalid') });
      else if (reason.field === 'newPassword') form.setError('newPassword', { message: e!.message });
      else form.setError('root', { message: e?.message ?? t('auth.loginFailed') });
    },
  });

  const resend = useMutation({
    mutationFn: () => authApi.forgotPassword(form.getValues('phone').trim()),
    onSuccess: (res) => {
      const sent = Date.now();
      setCode({ sent, exp: sent + (res?.expiresInMinutes ?? DEFAULT_TTL_MIN) * 60_000 });
      setExpired(false);
      form.clearErrors('code');
      form.clearErrors('root');
    },
    onError: (err) =>
      form.setError('root', { message: err instanceof NormalizedApiError ? err.message : t('auth.loginFailed') }),
  });

  const steps = [t('auth.flow.request'), t('auth.flow.newPassword'), t('auth.flow.done')];
  const cooldownLeft = code ? Math.max(0, code.sent + RESEND_COOLDOWN_MS - now) : 0;
  const phoneValid = resetPasswordSchema.shape.phone.safeParse(form.watch('phone')).success;

  if (reset.isSuccess) return <ResetSuccess steps={steps} onGo={() => navigate(ROUTES.login, { replace: true })} />;

  const errors = form.formState.errors;
  const fieldError = (name: keyof FormValues) =>
    errors[name] ? (
      <FieldError id={`${name}-error`}>{name === 'confirm' ? t('auth.passwordMismatch') : errors[name]?.message}</FieldError>
    ) : null;

  return (
    <AuthShell>
      <AuthCard
        icon={ShieldCheck}
        eyebrow={<AuthStepper steps={steps} current={1} label={t('auth.flow.resetTitle')} />}
        title={t('auth.resetPassword')}
        subtitle={t('auth.resetSubtitle')}
      >
        <form className="space-y-5" noValidate onSubmit={form.handleSubmit((v) => reset.mutate(v))}>
          {errors.root ? <AuthNotice tone="error">{errors.root.message}</AuthNotice> : null}

          {code ? (
            expired ? (
              <AuthNotice tone="warning">
                <p>{t('auth.codeExpired')}</p>
              </AuthNotice>
            ) : (
              <AuthNotice tone="info">
                <p>{t('auth.codeSent')}</p>
                <CountdownBar
                  until={code.exp}
                  total={code.exp - code.sent}
                  label={t('auth.codeExpiresIn')}
                  onDone={() => setExpired(true)}
                />
              </AuthNotice>
            )
          ) : null}

          {/* 1 — who + code */}
          <fieldset className="space-y-4">
            <legend className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-subtle text-2xs text-primary">1</span>
              {t('auth.section.verify')}
            </legend>
            <div className="space-y-1.5">
              <Label htmlFor="phone">{t('auth.phone')}</Label>
              <IconInput
                id="phone"
                icon={Phone}
                type="tel"
                inputMode="tel"
                autoComplete="username"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? 'phone-error' : undefined}
                {...form.register('phone')}
              />
              {fieldError('phone')}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="code">{t('auth.resetCode')}</Label>
                <button
                  type="button"
                  onClick={() => resend.mutate()}
                  disabled={!phoneValid || resend.isPending || cooldownLeft > 0}
                  className="inline-flex min-h-[32px] items-center gap-1 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                >
                  <RefreshCw className={`h-3 w-3 ${resend.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {cooldownLeft > 0
                    ? t('auth.resendIn', { time: formatClock(cooldownLeft) })
                    : t('auth.resendCode')}
                </button>
              </div>
              <IconInput
                id="code"
                icon={Hash}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="••••••"
                className="font-mono text-lg tracking-[0.35em]"
                aria-invalid={Boolean(errors.code)}
                aria-describedby={errors.code ? 'code-error' : 'code-hint'}
                {...form.register('code', { setValueAs: (v: string) => v.replace(/\D/g, '') })}
              />
              <CodeProgress value={(codeValue ?? '').replace(/\D/g, '')} />
              {fieldError('code') ?? (
                <p id="code-hint" className="text-xs text-muted-foreground">
                  {t('auth.resetCodeHint')}
                </p>
              )}
            </div>
          </fieldset>

          {/* 2 — new password */}
          <fieldset className="space-y-4 border-t border-border pt-5">
            <legend className="sr-only">{t('auth.section.password')}</legend>
            <p aria-hidden="true" className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-subtle text-2xs text-primary">2</span>
              {t('auth.section.password')}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t('auth.newPassword')}</Label>
              <PasswordInput
                id="password"
                icon={LockKeyhole}
                autoComplete="new-password"
                aria-invalid={Boolean(errors.newPassword)}
                aria-describedby={errors.newPassword ? 'newPassword-error' : undefined}
                {...form.register('newPassword')}
              />
              {fieldError('newPassword')}
              <PasswordStrengthMeter value={newPassword ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">{t('auth.confirmPassword')}</Label>
              <PasswordInput
                id="confirm"
                icon={LockKeyhole}
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirm)}
                aria-describedby={errors.confirm ? 'confirm-error' : undefined}
                {...form.register('confirm')}
              />
              {fieldError('confirm') ??
                (confirm ? (
                  confirm === newPassword ? (
                    <p className="flex items-center gap-1 text-xs text-success">
                      <Check className="h-3 w-3" aria-hidden="true" />
                      {t('auth.passwordMatch')}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <X className="h-3 w-3" aria-hidden="true" />
                      {t('auth.passwordNoMatchYet')}
                    </p>
                  )
                ) : null)}
            </div>
          </fieldset>

          <Button type="submit" className="h-11 w-full gap-2" disabled={reset.isPending}>
            {reset.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t('common.loading')}
              </>
            ) : (
              <>
                {t('auth.setNewPassword')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t('auth.resetSignsOut')}</p>

          <div className="border-t border-border pt-3 text-center">
            <Link
              to={ROUTES.login}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('auth.backToSignIn')}
            </Link>
          </div>
        </form>
      </AuthCard>
    </AuthShell>
  );
}

function ResetSuccess({ steps, onGo }: { steps: string[]; onGo: () => void }) {
  const { t } = useTranslation();
  const [until] = useState(() => Date.now() + REDIRECT_MS);
  return (
    <AuthShell>
      <AuthCard
        icon={CheckCircle2}
        tone="success"
        eyebrow={<AuthStepper steps={steps} current={steps.length} label={t('auth.flow.resetTitle')} />}
        title={t('auth.resetDone')}
        subtitle={t('auth.resetDoneHint')}
      >
        <div className="space-y-4">
          <ul className="space-y-2 text-sm">
            {[t('auth.done.updated'), t('auth.done.signedOut'), t('auth.done.nextLogin')].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
          <div className="rounded-md bg-muted/50 p-3 text-muted-foreground">
            <CountdownBar until={until} total={REDIRECT_MS} label={t('auth.redirecting')} onDone={onGo} />
          </div>
          <Button asChild className="h-11 w-full gap-2">
            <Link to={ROUTES.login} replace>
              {t('auth.signIn')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
