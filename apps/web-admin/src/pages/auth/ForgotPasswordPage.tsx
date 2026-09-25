import { forgotPasswordSchema, type ForgotPasswordInput } from '@abcp/shared-types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Building2, KeyRound, Loader2, Mail, MessageSquareText, Phone } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { authApi } from '@/features/auth/auth.api';
import { AuthCard, AuthShell } from '@/features/auth/components/AuthShell';
import { AuthNotice, AuthStepper, FieldError, IconInput } from '@/features/auth/components/authParts';
import { NormalizedApiError } from '@/services/apiError';
import { ROUTES } from '@/router/paths';

/** Codes live this long unless the API says otherwise. */
const DEFAULT_TTL_MIN = 10;

/**
 * Step 1 of a reset: ask for a code by SMS / e-mail. The API never says whether the phone exists,
 * so we always move on to step 2 — which also accepts a code issued by an admin.
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { phone: '' },
  });
  const send = useMutation({
    mutationFn: (v: ForgotPasswordInput) => authApi.forgotPassword(v.phone),
    onSuccess: (res, v) => {
      // Absolute expiry travels with the URL so step 2 can count down even after a refresh.
      const exp = Date.now() + (res?.expiresInMinutes ?? DEFAULT_TTL_MIN) * 60_000;
      navigate(`${ROUTES.resetPassword}?phone=${encodeURIComponent(v.phone)}&exp=${exp}&sent=${Date.now()}`);
    },
    onError: (err) =>
      form.setError('root', { message: err instanceof NormalizedApiError ? err.message : t('auth.loginFailed') }),
  });
  const rootError = form.formState.errors.root?.message;
  const channels = [
    { icon: MessageSquareText, label: t('auth.channel.sms') },
    { icon: Mail, label: t('auth.channel.email') },
    { icon: Building2, label: t('auth.channel.admin') },
  ];

  return (
    <AuthShell>
      <AuthCard
        icon={KeyRound}
        eyebrow={
          <AuthStepper
            steps={[t('auth.flow.request'), t('auth.flow.newPassword'), t('auth.flow.done')]}
            current={0}
            label={t('auth.flow.resetTitle')}
          />
        }
        title={t('auth.forgotPassword')}
        subtitle={t('auth.forgotSubtitle')}
      >
        <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => send.mutate(v))}>
          {rootError ? <AuthNotice tone="error">{rootError}</AuthNotice> : null}

          <div className="space-y-1.5">
            <Label htmlFor="phone">{t('auth.phone')}</Label>
            <IconInput
              id="phone"
              icon={Phone}
              type="tel"
              inputMode="tel"
              autoComplete="username"
              placeholder="20xx xxx xxx"
              aria-invalid={Boolean(form.formState.errors.phone)}
              aria-describedby={form.formState.errors.phone ? 'phone-error' : 'phone-hint'}
              {...form.register('phone')}
            />
            {form.formState.errors.phone ? (
              <FieldError id="phone-error">{form.formState.errors.phone.message}</FieldError>
            ) : (
              <p id="phone-hint" className="text-xs text-muted-foreground">
                {t('auth.phoneHint')}
              </p>
            )}
          </div>

          {/* Where the code can arrive — sets expectations before the wait. */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t('auth.channel.title')}</p>
            <ul className="grid grid-cols-3 gap-2">
              {channels.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex flex-col items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-2.5 text-center text-2xs text-foreground"
                >
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <Button type="submit" className="h-11 w-full gap-2" disabled={send.isPending}>
            {send.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t('auth.sending')}
              </>
            ) : (
              <>
                {t('auth.sendResetCode')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>

          <div className="flex flex-col gap-1 border-t border-border pt-4 text-center text-sm sm:flex-row sm:items-center sm:justify-between">
            <Link
              to={ROUTES.login}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('auth.backToSignIn')}
            </Link>
            <span className="text-xs text-muted-foreground">
              {t('auth.haveAdminCode')}{' '}
              <Link to={ROUTES.resetPassword} className="font-medium text-primary hover:underline">
                {t('auth.enterCode')}
              </Link>
            </span>
          </div>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
