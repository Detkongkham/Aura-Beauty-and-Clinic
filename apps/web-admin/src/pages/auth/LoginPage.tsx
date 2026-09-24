import { zodResolver } from '@hookform/resolvers/zod';
import {
  isMfaChallenge,
  loginSchema,
  type AuthResponse,
  type LoginInput,
  type MfaChallenge,
  type TwoFactorSetup,
} from '@abcp/shared-types';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/features/auth/auth.api';
import { useAuthStore } from '@/features/auth/auth.store';
import { OtpInput, RecoveryCodes, TotpQr } from '@/features/auth/components/TwoFactorParts';
import { isOtpComplete } from '@/features/auth/otp';
import { useAuth } from '@/features/auth/useAuth';
import { formatDateTime } from '@/lib/format';
import { isAdminRole } from '@/lib/rbac';
import { NormalizedApiError } from '@/services/apiError';
import { ROUTES } from '@/router/paths';

type Step =
  | { kind: 'credentials' }
  | { kind: 'verify'; challenge: MfaChallenge }
  | { kind: 'setup'; challenge: MfaChallenge; setup: TwoFactorSetup | null }
  | { kind: 'recovery'; auth: AuthResponse; codes: string[] };

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [params] = useSearchParams();
  const reason = params.get('reason');
  const { isAuthenticated, isAdmin } = useAuth();

  const setSession = useAuthStore((s) => s.setSession);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: '', password: '' },
  });

  const errorText = (err: unknown) => {
    if (err instanceof NormalizedApiError) {
      if (err.code === 'ACCOUNT_LOCKED') {
        const until = (err.details as { lockedUntil?: string } | undefined)?.lockedUntil;
        return until ? t('auth.lockedUntil', { time: formatDateTime(until) }) : t('auth.locked');
      }
      if (err.code === 'MFA_INVALID') return t('twoFactor.wrongCode');
      return err.message;
    }
    return t('auth.loginFailed');
  };

  const finish = (res: AuthResponse) => {
    if (!isAdminRole(res.user.role)) {
      setStep({ kind: 'credentials' });
      form.setError('root', { message: t('auth.notAdmin') });
      // Tokens were minted — drop that session server-side too.
      void authApi.logout(res.tokens.refreshToken).catch(() => {});
      return;
    }
    setSession({ user: res.user, tokens: res.tokens });
    setHydrated(true);
    navigate(location.state?.from ?? ROUTES.dashboard, { replace: true });
  };

  const backToCredentials = (message?: string) => {
    setStep({ kind: 'credentials' });
    setCode('');
    setCodeError(null);
    if (message) form.setError('root', { message });
  };

  const login = useMutation({
    mutationFn: (values: LoginInput) => authApi.login(values),
    onSuccess: (res) => {
      setCode('');
      setCodeError(null);
      if (!isMfaChallenge(res)) return finish(res);
      if (res.mode === 'verify') setStep({ kind: 'verify', challenge: res });
      else setStep({ kind: 'setup', challenge: res, setup: null });
    },
    onError: (err) => form.setError('root', { message: errorText(err) }),
  });

  const verify = useMutation({
    mutationFn: ({ token, value }: { token: string; value: string }) => authApi.mfaVerify(token, value),
    onSuccess: finish,
    onError: (err) => {
      // An expired ticket can't be retried — start over.
      if (err instanceof NormalizedApiError && err.code === 'TOKEN_EXPIRED') {
        backToCredentials(t('twoFactor.expired'));
      } else if (err instanceof NormalizedApiError && err.code === 'ACCOUNT_LOCKED') {
        backToCredentials(errorText(err));
      } else setCodeError(errorText(err));
    },
  });

  const setupFetch = useMutation({
    mutationFn: (token: string) => authApi.mfaSetup(token),
    onSuccess: (setup) =>
      setStep((s) => (s.kind === 'setup' ? { ...s, setup } : s)),
    onError: () => backToCredentials(t('twoFactor.expired')),
  });

  const activate = useMutation({
    mutationFn: ({ token, value }: { token: string; value: string }) => authApi.mfaActivate(token, value),
    onSuccess: (res) => setStep({ kind: 'recovery', auth: res, codes: res.recoveryCodes }),
    onError: (err) => setCodeError(errorText(err)),
  });

  // Fetch the enrolment secret as soon as the forced-setup step opens.
  const setupToken = step.kind === 'setup' && !step.setup ? step.challenge.mfaToken : null;
  useEffect(() => {
    if (setupToken) setupFetch.mutate(setupToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupToken]);

  if (isAuthenticated && isAdmin && step.kind !== 'recovery') {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  const rootError = form.formState.errors.root?.message;
  const notice =
    reason === 'idle' ? t('auth.reason.idle') : reason === 'mfa' ? t('auth.reason.mfa') : reason === 'revoked' ? t('auth.reason.revoked') : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="font-display text-2xl text-primary">{t('app.name')}</p>
          <p className="text-sm text-muted-foreground">
            {step.kind === 'credentials'
              ? t('auth.signInSubtitle')
              : step.kind === 'verify'
                ? t('twoFactor.verifySubtitle')
                : step.kind === 'setup'
                  ? t('twoFactor.setupRequiredSubtitle')
                  : t('twoFactor.recoveryTitle')}
          </p>
        </div>

        {step.kind === 'credentials' ? (
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => login.mutate(values))}
            noValidate
          >
            {rootError ? (
              <p role="alert" className="rounded-sm bg-destructive-soft px-3 py-2 text-sm text-destructive">
                {rootError}
              </p>
            ) : notice ? (
              <p role="status" className="rounded-sm bg-info-soft px-3 py-2 text-sm text-info">
                {notice}
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

            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? t('common.loading') : t('auth.signIn')}
            </Button>

            <div className="text-center">
              <Link to={ROUTES.forgotPassword} className="text-xs text-primary hover:underline">
                {t('auth.forgotPassword')}
              </Link>
            </div>
          </form>
        ) : null}

        {step.kind === 'verify' ? (
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!isOtpComplete(code, true)) return setCodeError(t('twoFactor.enterCode'));
              verify.mutate({ token: step.challenge.mfaToken, value: code });
            }}
          >
            <div className="flex justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              </span>
            </div>
            <OtpInput id="mfa-code" value={code} onChange={(v) => { setCode(v); setCodeError(null); }} error={codeError} allowRecovery />
            <p className="text-xs text-muted-foreground">{t('twoFactor.recoveryHint')}</p>
            <Button type="submit" className="w-full" disabled={verify.isPending}>
              {verify.isPending ? t('common.loading') : t('twoFactor.verify')}
            </Button>
            <button type="button" className="w-full text-center text-xs text-primary hover:underline" onClick={() => backToCredentials()}>
              {t('auth.backToSignIn')}
            </button>
          </form>
        ) : null}

        {step.kind === 'setup' ? (
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!isOtpComplete(code)) return setCodeError(t('twoFactor.enterCode'));
              activate.mutate({ token: step.challenge.mfaToken, value: code });
            }}
          >
            <p className="rounded-sm bg-info-soft px-3 py-2 text-xs text-info">{t('twoFactor.requiredNotice')}</p>
            {step.setup ? <TotpQr setup={step.setup} /> : <p className="text-center text-sm text-muted-foreground">{t('common.loading')}</p>}
            <OtpInput id="mfa-setup-code" value={code} onChange={(v) => { setCode(v); setCodeError(null); }} error={codeError} autoFocus={false} />
            <Button type="submit" className="w-full" disabled={activate.isPending || !step.setup}>
              {activate.isPending ? t('common.loading') : t('twoFactor.activate')}
            </Button>
            <button type="button" className="w-full text-center text-xs text-primary hover:underline" onClick={() => backToCredentials()}>
              {t('auth.backToSignIn')}
            </button>
          </form>
        ) : null}

        {step.kind === 'recovery' ? (
          <div className="space-y-4">
            <RecoveryCodes codes={step.codes} />
            <Button className="w-full" onClick={() => finish(step.auth)}>
              {t('twoFactor.savedContinue')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
