import type { AccountOverview, TwoFactorSetup } from '@abcp/shared-types';
import { KeyRound, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { OtpInput, RecoveryCodes, TotpQr } from '@/features/auth/components/TwoFactorParts';
import { isOtpComplete } from '@/features/auth/otp';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { formatDateTime } from '@/lib/format';
import type { NormalizedApiError } from '@/services/apiError';

import {
  useDisableTwoFactor,
  useEnableTwoFactor,
  useRegenerateRecoveryCodes,
  useStartTwoFactor,
} from '../account.api';

interface TwoFactorSectionProps {
  data: AccountOverview;
  index: number;
}

/** Authenticator-app 2FA: turn on (password → QR → first code → recovery codes), off, new codes. */
export function TwoFactorSection({ data, index }: TwoFactorSectionProps) {
  const { t } = useTranslation();
  const status = data.twoFactor ?? { enabled: false, enabledAt: null, recoveryCodesLeft: 0, required: false };
  const [dialog, setDialog] = useState<'enable' | 'disable' | 'codes' | null>(null);

  return (
    <SettingsSection
      id="acc-2fa"
      icon={Smartphone}
      index={index}
      title={t('twoFactor.title')}
      desc={t('twoFactor.desc')}
      actions={
        <Badge variant={status.enabled ? 'success' : status.required ? 'warning' : 'neutral'} className="whitespace-nowrap">
          {status.enabled ? t('twoFactor.on') : status.required ? t('twoFactor.requiredBadge') : t('twoFactor.off')}
        </Badge>
      }
    >
      <div className="flex flex-wrap items-center gap-3 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          {status.enabled ? (
            <ShieldCheck className="h-5 w-5 text-success" aria-hidden="true" />
          ) : (
            <ShieldOff className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {status.enabled ? t('twoFactor.enabledTitle') : t('twoFactor.disabledTitle')}
          </p>
          <p className="text-xs text-muted-foreground">
            {status.enabled && status.enabledAt
              ? t('twoFactor.enabledSince', { date: formatDateTime(status.enabledAt), left: status.recoveryCodesLeft })
              : status.required
                ? t('twoFactor.requiredHint')
                : t('twoFactor.disabledHint')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status.enabled ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setDialog('codes')}>
                <KeyRound aria-hidden="true" />
                {t('twoFactor.newCodes')}
              </Button>
              {!status.required ? (
                <Button variant="ghost" size="sm" onClick={() => setDialog('disable')}>
                  {t('twoFactor.turnOff')}
                </Button>
              ) : null}
            </>
          ) : (
            <Button size="sm" onClick={() => setDialog('enable')}>
              {t('twoFactor.turnOn')}
            </Button>
          )}
        </div>
      </div>
      {status.enabled && status.recoveryCodesLeft <= 3 ? (
        <p className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
          {t('twoFactor.lowCodes', { left: status.recoveryCodesLeft })}
        </p>
      ) : null}

      <EnableDialog open={dialog === 'enable'} onClose={() => setDialog(null)} />
      <CodeConfirmDialog mode="disable" open={dialog === 'disable'} onClose={() => setDialog(null)} />
      <CodeConfirmDialog mode="codes" open={dialog === 'codes'} onClose={() => setDialog(null)} />
    </SettingsSection>
  );
}

function PasswordField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor="tf-password" className="mb-1.5 block text-[13px] font-medium text-foreground">
        {t('account.currentPassword')}
      </label>
      <Input
        id="tf-password"
        type="password"
        autoComplete="current-password"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'tf-password-err' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <p id="tf-password-err" role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function EnableDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const start = useStartTwoFactor();
  const enable = useEnableTwoFactor();
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  const close = () => {
    setPassword('');
    setPwError(null);
    setSetup(null);
    setCode('');
    setCodeError(null);
    setCodes(null);
    onClose();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!setup) {
      if (!password) return setPwError(t('account.password.errCurrentRequired'));
      start.mutate(password, {
        onSuccess: setSetup,
        onError: (err) => {
          const ae = err as NormalizedApiError;
          if (ae.code === 'INVALID_CREDENTIALS') setPwError(t('account.password.errCurrentWrong'));
          else toast.error(ae.message);
        },
      });
      return;
    }
    if (!isOtpComplete(code)) return setCodeError(t('twoFactor.enterCode'));
    enable.mutate(code, {
      onSuccess: (r) => {
        setCodes(r.recoveryCodes);
        toast.success(t('twoFactor.enabledToast'));
      },
      onError: () => setCodeError(t('twoFactor.wrongCode')),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md">
        {codes ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('twoFactor.recoveryTitle')}</DialogTitle>
              <DialogDescription>{t('twoFactor.recoveryDesc')}</DialogDescription>
            </DialogHeader>
            <div className="my-4">
              <RecoveryCodes codes={codes} />
            </div>
            <DialogFooter>
              <Button onClick={close}>{t('twoFactor.savedDone')}</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>{t('twoFactor.enableTitle')}</DialogTitle>
              <DialogDescription>{setup ? t('twoFactor.scanDesc') : t('twoFactor.confirmPasswordDesc')}</DialogDescription>
            </DialogHeader>
            <div className="my-4 space-y-4">
              {setup ? (
                <>
                  <TotpQr setup={setup} />
                  <OtpInput id="tf-enable-code" value={code} onChange={(v) => { setCode(v); setCodeError(null); }} error={codeError} autoFocus={false} />
                </>
              ) : (
                <PasswordField value={password} onChange={(v) => { setPassword(v); setPwError(null); }} error={pwError} />
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={start.isPending || enable.isPending}>
                {start.isPending || enable.isPending ? t('common.loading') : setup ? t('twoFactor.activate') : t('twoFactor.continue')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Turn off, or issue new recovery codes — both need password + a current authenticator code. */
function CodeConfirmDialog({ mode, open, onClose }: { mode: 'disable' | 'codes'; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const disable = useDisableTwoFactor();
  const regen = useRegenerateRecoveryCodes();
  const busy = disable.isPending || regen.isPending;
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  const close = () => {
    setPassword('');
    setPwError(null);
    setCode('');
    setCodeError(null);
    setCodes(null);
    onClose();
  };

  const onError = (err: unknown) => {
    const ae = err as NormalizedApiError;
    if (ae.code === 'INVALID_CREDENTIALS') setPwError(t('account.password.errCurrentWrong'));
    else if (ae.code === 'MFA_INVALID') setCodeError(t('twoFactor.wrongCode'));
    else toast.error(ae.message);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return setPwError(t('account.password.errCurrentRequired'));
    if (!isOtpComplete(code, mode === 'disable')) return setCodeError(t('twoFactor.enterCode'));
    const input = { currentPassword: password, code };
    if (mode === 'disable') {
      disable.mutate(input, {
        onSuccess: () => {
          toast.success(t('twoFactor.disabledToast'));
          close();
        },
        onError,
      });
    } else {
      regen.mutate(input, { onSuccess: (r) => setCodes(r.recoveryCodes), onError });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md">
        {codes ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('twoFactor.recoveryTitle')}</DialogTitle>
              <DialogDescription>{t('twoFactor.recoveryReplaced')}</DialogDescription>
            </DialogHeader>
            <div className="my-4">
              <RecoveryCodes codes={codes} />
            </div>
            <DialogFooter>
              <Button onClick={close}>{t('twoFactor.savedDone')}</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>{mode === 'disable' ? t('twoFactor.disableTitle') : t('twoFactor.newCodes')}</DialogTitle>
              <DialogDescription>
                {mode === 'disable' ? t('twoFactor.disableDesc') : t('twoFactor.newCodesDesc')}
              </DialogDescription>
            </DialogHeader>
            <div className="my-4 space-y-3">
              <PasswordField value={password} onChange={(v) => { setPassword(v); setPwError(null); }} error={pwError} />
              <OtpInput
                id={`tf-${mode}-code`}
                value={code}
                onChange={(v) => { setCode(v); setCodeError(null); }}
                error={codeError}
                allowRecovery={mode === 'disable'}
                autoFocus={false}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={close} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant={mode === 'disable' ? 'danger' : 'primary'} disabled={busy}>
                {busy ? t('common.loading') : mode === 'disable' ? t('twoFactor.turnOff') : t('twoFactor.generate')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
