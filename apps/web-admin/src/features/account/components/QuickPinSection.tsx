import type { AccountOverview } from '@abcp/shared-types';
import { Grid3x3, KeySquare, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
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
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { formatDateTime } from '@/lib/format';
import type { NormalizedApiError } from '@/services/apiError';

import { useDisableQuickLoginPin, useSetQuickLoginPin } from '../account.api';

const PIN_RE = /^\d{4,6}$/;
/** Sequences and repeats a shoulder-surfer guesses first. */
const WEAK_PINS =
  /^(\d)\1+$|^(0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|3210)/;

interface QuickPinSectionProps {
  data: AccountOverview;
  index: number;
}

/** Self-service quick-login PIN for shared front-desk terminals (staff / admins only). */
export function QuickPinSection({ data, index }: QuickPinSectionProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const disable = useDisableQuickLoginPin();
  const { enabled, updatedAt } = data.quickLogin;

  return (
    <SettingsSection
      id="acc-pin"
      icon={Grid3x3}
      index={index}
      title={t('account.pin.title')}
      desc={t('account.pin.desc')}
      actions={
        <Badge variant={enabled ? 'success' : 'neutral'} className="whitespace-nowrap">
          {enabled ? t('account.pin.on') : t('account.pin.off')}
        </Badge>
      }
    >
      <div className="flex flex-wrap items-center gap-3 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          {enabled ? (
            <ShieldCheck className="h-5 w-5 text-success" aria-hidden="true" />
          ) : (
            <KeySquare className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {enabled ? t('account.pin.enabledTitle') : t('account.pin.disabledTitle')}
          </p>
          <p className="text-xs text-muted-foreground">
            {enabled && updatedAt
              ? t('account.pin.updated', { date: formatDateTime(updatedAt) })
              : t('account.pin.disabledHint')}
          </p>
        </div>
        <div className="flex gap-2">
          {enabled ? (
            <Button variant="ghost" size="sm" onClick={() => setConfirmOff(true)}>
              {t('account.pin.remove')}
            </Button>
          ) : null}
          <Button
            variant={enabled ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => setOpen(true)}
          >
            {enabled ? t('account.pin.change') : t('account.pin.set')}
          </Button>
        </div>
      </div>

      <PinDialog open={open} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={confirmOff}
        destructive
        busy={disable.isPending}
        title={t('account.pin.confirmRemoveTitle')}
        description={t('account.pin.confirmRemoveDesc')}
        confirmLabel={t('account.pin.remove')}
        onCancel={() => setConfirmOff(false)}
        onConfirm={() =>
          disable.mutate(undefined, {
            onSuccess: () => {
              setConfirmOff(false);
              toast.success(t('account.pin.removed'));
            },
            onError: (e) => toast.error((e as Error).message),
          })
        }
      />
    </SettingsSection>
  );
}

function PinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const setPin = useSetQuickLoginPin();
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const reset = () => {
    setPinValue('');
    setConfirm('');
    setPassword('');
    setSubmitted(false);
    setPwError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const pinError = !PIN_RE.test(pin)
    ? t('account.pin.errFormat')
    : WEAK_PINS.test(pin)
      ? t('account.pin.errWeak')
      : null;
  const confirmError = confirm !== pin ? t('account.pin.errMismatch') : null;
  const passwordError = pwError ?? (password ? null : t('account.password.errCurrentRequired'));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (pinError || confirmError || !password) return;
    setPin.mutate(
      { pin, currentPassword: password },
      {
        onSuccess: () => {
          toast.success(t('account.pin.saved'));
          close();
        },
        onError: (err) => {
          const ae = err as NormalizedApiError;
          if (ae.code === 'INVALID_CREDENTIALS') setPwError(t('account.password.errCurrentWrong'));
          else toast.error(ae.message);
        },
      },
    );
  };

  const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, 6);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-sm">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{t('account.pin.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('account.pin.dialogDesc')}</DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-3">
            <PinInput
              id="pin-new"
              label={t('account.pin.newPin')}
              value={pin}
              error={submitted ? pinError : null}
              onChange={(v) => setPinValue(digitsOnly(v))}
            />
            <PinInput
              id="pin-confirm"
              label={t('account.pin.confirmPin')}
              value={confirm}
              error={submitted ? confirmError : null}
              onChange={(v) => setConfirm(digitsOnly(v))}
            />
            <div>
              <label
                htmlFor="pin-password"
                className="mb-1.5 block text-[13px] font-medium text-foreground"
              >
                {t('account.currentPassword')}
              </label>
              <Input
                id="pin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                aria-invalid={submitted && passwordError ? true : undefined}
                aria-describedby={submitted && passwordError ? 'pin-password-err' : undefined}
                onChange={(e) => {
                  setPwError(null);
                  setPassword(e.target.value);
                }}
              />
              {submitted && passwordError ? (
                <p id="pin-password-err" role="alert" className="mt-1 text-xs text-destructive">
                  {passwordError}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close} disabled={setPin.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={setPin.isPending}>
              {setPin.isPending ? t('common.saving') : t('account.pin.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PinInput({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={value}
        className="text-center font-mono text-lg tracking-[0.5em]"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
