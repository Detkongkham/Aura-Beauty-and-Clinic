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
import { ArrowRight, KeyRound, Loader2, LockKeyhole, LogIn, Phone, QrCode, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { authApi } from '@/features/auth/auth.api';
import { greetingKey, useNow } from '@/features/auth/authTime';
import { AuthCard, AuthShell } from '@/features/auth/components/AuthShell';
import {
  AuthNotice,
  AuthStepper,
  CountdownBar,
  FieldError,
  IconInput,
  PasswordInput,
} from '@/features/auth/components/authParts';
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
  const [lock, setLock] = useState<{ until: number; total: number } | null>(null);
  const now = useNow(60_000);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: '', password: '' },
  });

  const errorText = (err: unknown) => {
    if (err instanceof NormalizedApiError) {
      if (err.code === 'ACCOUNT_LOCKED') {
        const until = (err.details as { lockedUntil?: string } | undefined)?.lockedUntil;
        const untilMs = until ? new Date(until).getTime() : NaN;
        // Drives the live countdown; the text below stays as the fallback / screen-reader copy.
        if (untilMs > Date.now()) setLock({ until: untilMs, total: untilMs - Date.now() });
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

  const unlock = useCallback(() => {
    setLock(null);
    form.clearErrors('root');
  }, [form]);

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
  const errors = form.formState.errors;

  const mfaSteps =
    step.kind === 'verify'
      ? [t('auth.flow.password'), t('auth.flow.verifyCode'), t('auth.flow.workspace')]
      : [t('auth.flow.password'), t('auth.flow.linkApp'), t('auth.flow.saveCodes')];
  const mfaIndex = step.kind === 'verify' ? 1 : step.kind === 'setup' ? 1 : 2;
  const backLink = (
    <button
      type="button"
      className="inline-flex min-h-[44px] w-full items-center justify-center text-sm font-medium text-primary hover:underline"
      onClick={() => backToCredentials()}
    >
      {t('auth.backToSignIn')}
    </button>
  );

  return (
    <AuthShell>
      {step.kind === 'credentials' ? (
        <AuthCard
          icon={LogIn}
          eyebrow={t(`auth.greeting.${greetingKey(now)}`)}
          title={t('auth.welcomeBack')}
          subtitle={t('auth.signInSubtitle')}
        >
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => login.mutate(values))} noValidate>
            {lock ? (
              <AuthNotice tone="warning">
                <p className="font-semibold">{t('auth.lockedTitle')}</p>
                <p className="sr-only">{rootError}</p>
                <CountdownBar until={lock.until} total={lock.total} label={t('auth.lockedCountdown')} tone="warning" onDone={unlock} />
              </AuthNotice>
            ) : rootError ? (
              <AuthNotice tone="error">{rootError}</AuthNotice>
            ) : notice ? (
              <AuthNotice tone="info">{notice}</AuthNotice>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="phone">{t('auth.phone')}</Label>
              <IconInput
                id="phone"
                icon={Phone}
                type="tel"
                inputMode="tel"
                autoComplete="username"
                placeholder="20xx xxx xxx"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? 'phone-error' : undefined}
                {...form.register('phone')}
              />
              {errors.phone ? <FieldError id="phone-error">{errors.phone.message}</FieldError> : null}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Link to={ROUTES.forgotPassword} className="text-xs font-medium text-primary hover:underline">
                  {t('auth.forgotPassword')}
                </Link>
              </div>
              <PasswordInput
                id="password"
                icon={LockKeyhole}
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...form.register('password')}
              />
              {errors.password ? <FieldError id="password-error">{errors.password.message}</FieldError> : null}
            </div>

            <Button type="submit" className="h-11 w-full gap-2" disabled={login.isPending || Boolean(lock)}>
              {login.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t('auth.signingIn')}
                </>
              ) : (
                <>
                  {t('auth.signIn')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>

            <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>{t('auth.securityNote')}</span>
            </div>
          </form>
        </AuthCard>
      ) : null}

      {step.kind === 'verify' ? (
        <AuthCard
          icon={ShieldCheck}
          eyebrow={<AuthStepper steps={mfaSteps} current={mfaIndex} label={t('auth.flow.signInTitle')} />}
          title={t('twoFactor.title')}
          subtitle={t('twoFactor.verifySubtitle')}
        >
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!isOtpComplete(code, true)) return setCodeError(t('twoFactor.enterCode'));
              verify.mutate({ token: step.challenge.mfaToken, value: code });
            }}
          >
            <OtpInput id="mfa-code" value={code} onChange={(v) => { setCode(v); setCodeError(null); }} error={codeError} allowRecovery />
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('twoFactor.recoveryHint')}
            </p>
            <Button type="submit" className="h-11 w-full gap-2" disabled={verify.isPending}>
              {verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {verify.isPending ? t('common.loading') : t('twoFactor.verify')}
            </Button>
            {backLink}
          </form>
        </AuthCard>
      ) : null}

      {step.kind === 'setup' ? (
        <AuthCard
          icon={QrCode}
          eyebrow={<AuthStepper steps={mfaSteps} current={mfaIndex} label={t('auth.flow.setupTitle')} />}
          title={t('twoFactor.setupRequiredSubtitle')}
        >
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!isOtpComplete(code)) return setCodeError(t('twoFactor.enterCode'));
              activate.mutate({ token: step.challenge.mfaToken, value: code });
            }}
          >
            <AuthNotice tone="info">{t('twoFactor.requiredNotice')}</AuthNotice>
            {step.setup ? (
              <TotpQr setup={step.setup} />
            ) : (
              <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t('common.loading')}
              </div>
            )}
            <OtpInput id="mfa-setup-code" value={code} onChange={(v) => { setCode(v); setCodeError(null); }} error={codeError} autoFocus={false} />
            <Button type="submit" className="h-11 w-full gap-2" disabled={activate.isPending || !step.setup}>
              {activate.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {activate.isPending ? t('common.loading') : t('twoFactor.activate')}
            </Button>
            {backLink}
          </form>
        </AuthCard>
      ) : null}

      {step.kind === 'recovery' ? (
        <AuthCard
          icon={KeyRound}
          tone="success"
          eyebrow={<AuthStepper steps={mfaSteps} current={mfaIndex} label={t('auth.flow.setupTitle')} />}
          title={t('twoFactor.recoveryTitle')}
        >
          <div className="space-y-4">
            <RecoveryCodes codes={step.codes} />
            <Button className="h-11 w-full gap-2" onClick={() => finish(step.auth)}>
              {t('twoFactor.savedContinue')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </AuthCard>
      ) : null}
    </AuthShell>
  );
}
