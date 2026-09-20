import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@abcp/shared-types';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/features/auth/auth.api';
import { useAuthStore } from '@/features/auth/auth.store';
import { useAuth } from '@/features/auth/useAuth';
import { isAdminRole } from '@/lib/rbac';
import { NormalizedApiError } from '@/services/apiError';
import { ROUTES } from '@/router/paths';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const { isAuthenticated, isAdmin } = useAuth();

  const setSession = useAuthStore((s) => s.setSession);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: LoginInput) => authApi.login(values),
    onSuccess: (res) => {
      if (!isAdminRole(res.user.role)) {
        form.setError('root', { message: t('auth.notAdmin') });
        return;
      }
      setSession({ user: res.user, tokens: res.tokens });
      setHydrated(true);
      navigate(location.state?.from ?? ROUTES.dashboard, { replace: true });
    },
    onError: (err) => {
      const message =
        err instanceof NormalizedApiError ? err.message : t('auth.loginFailed');
      form.setError('root', { message });
    },
  });

  if (isAuthenticated && isAdmin) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  const rootError = form.formState.errors.root?.message;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="font-display text-2xl text-primary">{t('app.name')}</p>
          <p className="text-sm text-muted-foreground">{t('auth.signInSubtitle')}</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          noValidate
        >
          {rootError ? (
            <p
              role="alert"
              className="rounded-sm bg-destructive-soft px-3 py-2 text-sm text-destructive"
            >
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

          <div className="space-y-1.5">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(form.formState.errors.password)}
              aria-describedby={form.formState.errors.password ? 'password-error' : undefined}
              {...form.register('password')}
            />
            {form.formState.errors.password ? (
              <p id="password-error" role="alert" className="text-xs text-destructive">
                {form.formState.errors.password.message}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.loading') : t('auth.signIn')}
          </Button>

          <div className="text-center">
            <Link to={ROUTES.forgotPassword} className="text-xs text-primary hover:underline">
              {t('auth.forgotPassword')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
