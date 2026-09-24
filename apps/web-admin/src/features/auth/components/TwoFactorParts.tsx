import type { TwoFactorSetup } from '@abcp/shared-types';
import { Check, Copy, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';

/** 6-digit authenticator code, or a recovery code when `allowRecovery`. */
export function OtpInput({
  id,
  value,
  onChange,
  error,
  allowRecovery = false,
  autoFocus = true,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  allowRecovery?: boolean;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-foreground">
        {allowRecovery ? t('twoFactor.codeOrRecovery') : t('twoFactor.code')}
      </label>
      <Input
        id={id}
        value={value}
        autoFocus={autoFocus}
        autoComplete="one-time-code"
        inputMode={allowRecovery ? 'text' : 'numeric'}
        maxLength={allowRecovery ? 9 : 6}
        placeholder={allowRecovery ? '123456 / ABCD-EFGH' : '123456'}
        className="text-center font-mono text-lg"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) =>
          onChange(
            allowRecovery
              ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')
              : e.target.value.replace(/\D/g, '').slice(0, 6),
          )
        }
      />
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** QR + manual key for enrolling an authenticator app. */
export function TotpQr({ setup }: { setup: TwoFactorSetup }) {
  const { t } = useTranslation();
  const grouped = setup.secret.match(/.{1,4}/g)?.join(' ') ?? setup.secret;
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <div className="shrink-0 rounded-xl border border-border bg-white p-2.5">
        <QRCodeSVG value={setup.otpauthUrl} size={148} level="M" aria-label={t('twoFactor.qrAlt')} />
      </div>
      <div className="min-w-0 space-y-2 text-sm">
        <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
          <li>{t('twoFactor.step1')}</li>
          <li>{t('twoFactor.step2')}</li>
          <li>{t('twoFactor.step3')}</li>
        </ol>
        <div>
          <p className="text-xs text-muted-foreground">{t('twoFactor.manualKey')}</p>
          <CopyText value={setup.secret} display={grouped} />
        </div>
      </div>
    </div>
  );
}

function CopyText({ value, display }: { value: string; display?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="mt-0.5 inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={t('twoFactor.copyKey')}
    >
      <span className="break-all">{display ?? value}</span>
      {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-success" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}

/** One-time recovery codes — shown once, with copy + download. */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  const { t } = useTranslation();
  const text = codes.join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Aura — ${t('twoFactor.recoveryTitle')}\n\n${text}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aura-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">{t('twoFactor.recoveryWarn')}</p>
      <ul className="grid grid-cols-2 gap-1.5 rounded-lg border border-border bg-muted/40 p-3 font-mono text-sm">
        {codes.map((c) => (
          <li key={c} className="text-center">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void navigator.clipboard?.writeText(text).then(() => toast.success(t('twoFactor.copied')))}
        >
          <Copy aria-hidden="true" />
          {t('twoFactor.copyAll')}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={download}>
          <Download aria-hidden="true" />
          {t('twoFactor.download')}
        </Button>
      </div>
    </div>
  );
}
