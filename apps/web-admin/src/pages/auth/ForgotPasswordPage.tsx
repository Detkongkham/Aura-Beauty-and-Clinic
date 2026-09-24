import { forgotPasswordSchema, type ForgotPasswordInput } from '@abcp/shared-types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/features/auth/auth.api';
import { NormalizedApiError } from '@/services/apiError';
import { ROUTES } from '@/router/paths';

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
    onSuccess: (_res, v) => navigate(`${ROUTES.resetPassword}?phone=${encodeURIComponent(v.phone)}`),
    onError: (err) =>
      form.setError('root', { message: err instanceof NormalizedApiError ? err.message : t('auth.loginFailed') }),
  });
  const rootError = form.formState.errors.root?.message;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="font-display text-2xl text-primary">{t('auth.forgotPassword')}</p>
          <p className="text-sm text-muted-foreground">{t('auth.forgotSubtitle')}</p>
        </div>
        <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => send.mutate(v))}>
          {rootError ? (
            <p role="alert" className="rounded-sm bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {rootError}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="phone">{t('auth.phone')}</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="username"
              aria-invalid={Boolean(form.formState.errors.phone)}
              aria-describedby={form.formState.errors.phone ? 'phone-error' : undefined}
              {...form.register('phone')}
            />
            {form.formState.errors.phone ? (
              <p id="phone-error" role="alert" className="text-xs text-destructive">
                {form.formState.errors.phone.message}
              </p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={send.isPending}>
            {send.isPending ? t('common.loading') : t('auth.sendResetCode')}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t('auth.haveAdminCode')}{' '}
            <Link to={ROUTES.resetPassword} className="text-primary hover:underline">
              {t('auth.enterCode')}
            </Link>
          </p>
          <div className="text-center">
            <Link to={ROUTES.login} className="text-xs text-primary hover:underline">
              {t('auth.backToSignIn')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
