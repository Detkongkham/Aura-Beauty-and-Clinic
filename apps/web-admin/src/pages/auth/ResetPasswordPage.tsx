import { resetPasswordSchema, type ResetPasswordInput } from '@abcp/shared-types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/features/auth/auth.api';
import { NormalizedApiError } from '@/services/apiError';
import { ROUTES } from '@/router/paths';

const formSchema = resetPasswordSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.confirm === v.newPassword, { path: ['confirm'], message: 'mismatch' });
type FormValues = z.infer<typeof formSchema>;

/** Step 2: code (SMS / e-mail / admin-issued) + new password. Signs out every device on success. */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { phone: params.get('phone') ?? '', code: '', newPassword: '', confirm: '' },
  });
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
  const errors = form.formState.errors;
  const fieldError = (name: keyof FormValues) =>
    errors[name] ? (
      <p id={`${name}-error`} role="alert" className="text-xs text-destructive">
        {name === 'confirm' ? t('auth.passwordMismatch') : errors[name]?.message}
      </p>
    ) : null;

  if (reset.isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden="true" />
          <p className="font-display text-xl text-foreground">{t('auth.resetDone')}</p>
          <p className="text-sm text-muted-foreground">{t('auth.resetDoneHint')}</p>
          <Button asChild className="w-full">
            <Link to={ROUTES.login}>{t('auth.signIn')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="font-display text-2xl text-primary">{t('auth.resetPassword')}</p>
          <p className="text-sm text-muted-foreground">{t('auth.resetSubtitle')}</p>
        </div>
        <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => reset.mutate(v))}>
          {errors.root ? (
            <p role="alert" className="rounded-sm bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {errors.root.message}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="phone">{t('auth.phone')}</Label>
            <Input id="phone" type="tel" autoComplete="username" aria-invalid={Boolean(errors.phone)} {...form.register('phone')} />
            {fieldError('phone')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="code">{t('auth.resetCode')}</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              className="font-mono tracking-widest"
              aria-invalid={Boolean(errors.code)}
              aria-describedby={errors.code ? 'code-error' : 'code-hint'}
              {...form.register('code', { setValueAs: (v: string) => v.replace(/\D/g, '') })}
            />
            {fieldError('code') ?? (
              <p id="code-hint" className="text-xs text-muted-foreground">
                {t('auth.resetCodeHint')}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t('auth.newPassword')}</Label>
            <Input id="password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.newPassword)} {...form.register('newPassword')} />
            {fieldError('newPassword')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">{t('auth.confirmPassword')}</Label>
            <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.confirm)} {...form.register('confirm')} />
            {fieldError('confirm')}
          </div>
          <Button type="submit" className="w-full" disabled={reset.isPending}>
            {reset.isPending ? t('common.loading') : t('auth.setNewPassword')}
          </Button>
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
