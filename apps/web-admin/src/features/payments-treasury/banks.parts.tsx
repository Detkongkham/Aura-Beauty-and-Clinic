import { Check, Copy, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TONE, type Tone } from '@/features/payroll/payroll.lib';
import { formatCompactNumber, formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { bankHue, groupAccountNumber } from './banks.lib';
import { maskAccount } from './treasury.lib';

/** Bank code as a tinted monogram tile — hue is stable per bank (see `bankHue`). */
export function BankMonogram({ code, size = 'md' }: { code: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg font-bold tracking-tight ring-1 ring-inset',
        size === 'sm' && 'h-8 w-8 text-[10px]',
        size === 'md' && 'h-10 w-10 text-2xs',
        size === 'lg' && 'h-12 w-12 text-xs',
      )}
      style={{ background: bankHue(code, 0.14), color: bankHue(code), ['--tw-ring-color' as string]: bankHue(code, 0.28) }}
    >
      {code.slice(0, 4)}
    </span>
  );
}

/** Dot + word pill. Status on this page is never colour alone. */
export function TonePill({
  tone,
  children,
  className,
  icon,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium',
        TONE[tone].chip,
        // the soft-accent token pair is ~1.3:1 in dark mode (--accent-foreground is meant for solid gold);
        // lift the text to the gold itself there
        tone === 'accent' && 'dark:bg-accent/15 dark:text-accent',
        className,
      )}
    >
      {icon ?? <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE[tone].bar)} aria-hidden="true" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Icon button that copies `value` and flips to a check for 1.5s. */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error(t('payTreasury.copyFailed'));
        }
      }}
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground',
        'transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {done ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}

/**
 * Account number, masked by default in lists (shoulder-surfing at a front desk is real); the eye
 * toggle reveals it grouped in 4s. Copy always copies the raw digits.
 */
export function AccountNumber({
  code,
  number,
  revealable = true,
  className,
}: {
  code: string;
  number: string;
  revealable?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-0.5', className)}>
      <span className="truncate text-xs tabular-nums text-muted-foreground">
        {code} · {shown ? groupAccountNumber(number) : maskAccount(number)}
      </span>
      {revealable ? (
        <button
          type="button"
          aria-label={t(shown ? 'payTreasury.banks.hideNumber' : 'payTreasury.banks.showNumber')}
          aria-pressed={shown}
          title={t(shown ? 'payTreasury.banks.hideNumber' : 'payTreasury.banks.showNumber')}
          onClick={(e) => {
            e.stopPropagation();
            setShown((s) => !s);
          }}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {shown ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      ) : null}
      <CopyButton value={number} label={t('payTreasury.banks.copyNumber')} />
    </span>
  );
}

/**
 * Daily inflow as bars — hand-rolled SVG like payroll's Sparkline, so the drawer doesn't pull in the
 * chart bundle. Each bar carries a <title> with the date and figure; a visually hidden summary gives
 * screen readers the total, best day and active-day count instead of 90 numbers.
 */
export function DailyBars({
  values,
  fromKey,
  currency = 'LAK',
  height = 96,
}: {
  values: number[];
  fromKey: string;
  currency?: string;
  height?: number;
}) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...values, 0);
  const n = values.length;
  const dayOf = (i: number) => {
    const d = new Date(`${fromKey}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  };
  const cur = (currency === 'THB' || currency === 'USD' ? currency : 'LAK') as 'LAK' | 'THB' | 'USD';
  const best = values.reduce((bi, v, i, arr) => (v > (arr[bi] ?? 0) ? i : bi), 0);
  const activeDays = values.filter((v) => v > 0).length;
  const gap = n > 45 ? 0.5 : 1.5;
  const w = 100 / n;
  const focus = hover ?? null;

  return (
    <div className="space-y-1.5">
      <div className="flex h-5 items-baseline justify-between text-2xs text-muted-foreground">
        {focus != null ? (
          <>
            <span>{formatDate(dayOf(focus))}</span>
            <span className="font-semibold tabular-nums text-foreground">{formatCurrency(values[focus] ?? 0, cur)}</span>
          </>
        ) : (
          <>
            <span>{t('payTreasury.banks.chart.peak')}</span>
            <span className="tabular-nums">{max > 0 ? formatCompactNumber(max) : '—'}</span>
          </>
        )}
      </div>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        aria-hidden="true"
        onMouseLeave={() => setHover(null)}
      >
        <line x1="0" x2="100" y1={height - 0.5} y2={height - 0.5} stroke="hsl(var(--border))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {values.map((v, i) => {
          const h = max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * (height - 4)) : 0;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={i * w} y={0} width={w} height={height} fill="transparent" />
              <rect
                x={i * w + gap / 2}
                y={height - h}
                width={Math.max(0.4, w - gap)}
                height={h}
                rx={0.6}
                fill={i === focus || (focus == null && i === n - 1) ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.45)'}
              >
                <title>{`${formatDate(dayOf(i))} · ${formatCurrency(v, cur)}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-2xs text-muted-foreground">
        <span>{formatDate(fromKey)}</span>
        <span>{t('payTreasury.banks.chart.today')}</span>
      </div>
      <p className="sr-only">
        {t('payTreasury.banks.chart.summary', {
          total: formatCurrency(values.reduce((s, v) => s + v, 0), cur),
          best: max > 0 ? `${formatDate(dayOf(best))} (${formatCurrency(max, cur)})` : '—',
          active: activeDays,
          days: n,
        })}
      </p>
    </div>
  );
}

/** Small labelled figure used in card bodies and the drawer grid. */
export function Figure({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 rounded-lg bg-muted/50 px-3 py-2', className)}>
      <p className="truncate text-2xs text-muted-foreground">{label}</p>
      <p className={cn('truncate text-sm font-semibold tabular-nums', tone && TONE[tone].text)}>{value}</p>
      {hint ? <p className="truncate text-2xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Password re-confirmation for payee changes (account number / name / currency / QR). The server
 * requires it (403 REAUTH_*) so a stolen session alone can't redirect customer money.
 */
export function ReauthField({
  id,
  value,
  onChange,
  hint,
  tone = 'info',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
  tone?: 'info' | 'warning';
}) {
  const { t } = useTranslation();
  return (
    <div className={cn('grid gap-1.5 rounded-md border p-3', tone === 'warning' ? 'border-warning/50 bg-warning-soft/40' : 'border-info/40 bg-info-soft/40')}>
      <Label htmlFor={id} className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {t('payTreasury.banks.change.password')}
      </Label>
      <Input
        id={id}
        type="password"
        autoComplete="current-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-2xs text-muted-foreground">{hint}</p>
    </div>
  );
}
