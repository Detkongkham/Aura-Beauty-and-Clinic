import {
  AlertTriangle,
  ArrowUp,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  Info,
  type LucideIcon,
  X,
} from 'lucide-react';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { formatClock, useNow } from '../authTime';
import { PASSWORD_RULES, scorePassword } from '../passwordStrength';

/* --------------------------------------------------------------- stepper */

/**
 * Segmented progress for multi-screen flows (reset, 2FA). Each segment fills as
 * its step completes; labels sit underneath so the state never relies on colour.
 */
export function AuthStepper({ steps, current, label }: { steps: string[]; current: number; label: string }) {
  const { t } = useTranslation();
  const done = current >= steps.length;
  return (
    <nav aria-label={label} className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {done ? t('auth.flow.complete') : t('auth.flow.stepOf', { n: current + 1, total: steps.length })}
        </span>
      </div>
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo';
          return (
            <li key={s} aria-current={state === 'current' ? 'step' : undefined} className="min-w-0 space-y-1.5">
              <span className="relative block h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn(
                    'absolute inset-0 origin-left rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none',
                    state === 'done' ? 'bg-success' : 'bg-primary',
                    state === 'todo' ? 'scale-x-0' : state === 'current' ? 'scale-x-50' : 'scale-x-100',
                  )}
                />
              </span>
              <span
                className={cn(
                  'flex items-center gap-1 truncate text-2xs',
                  state === 'todo' ? 'text-muted-foreground' : 'font-semibold text-foreground',
                )}
              >
                {state === 'done' ? (
                  <Check className="h-3 w-3 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      state === 'current' ? 'bg-primary' : 'bg-muted-foreground/40',
                    )}
                  />
                )}
                <span className="truncate">{s}</span>
                <span className="sr-only">
                  {' — '}
                  {t(`auth.flow.state.${state}`)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ---------------------------------------------------------------- notice */

const NOTICE: Record<'error' | 'info' | 'warning' | 'success', { icon: LucideIcon; cls: string }> = {
  error: { icon: AlertTriangle, cls: 'border-destructive/25 bg-destructive-soft text-destructive' },
  warning: { icon: AlertTriangle, cls: 'border-warning/25 bg-warning-soft text-warning' },
  info: { icon: Info, cls: 'border-info/25 bg-info-soft text-info' },
  success: { icon: CheckCircle2, cls: 'border-success/25 bg-success-soft text-success' },
};

export function AuthNotice({
  tone,
  children,
  className,
}: {
  tone: keyof typeof NOTICE;
  children: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, cls } = NOTICE[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex gap-2.5 rounded-md border px-3 py-2.5 text-sm animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none',
        cls,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------- countdown */

/** Draining bar + mm:ss. `total` is the full window so the bar starts where the wait started. */
export function CountdownBar({
  until,
  total,
  label,
  tone = 'primary',
  onDone,
}: {
  until: number;
  total: number;
  label: string;
  tone?: 'primary' | 'warning' | 'destructive';
  onDone?: () => void;
}) {
  const now = useNow(1000);
  const left = Math.max(0, until - now);
  const ratio = total > 0 ? Math.min(1, left / total) : 0;
  const fired = React.useRef(false);

  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      onDone?.();
    }
  }, [left, onDone]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span>{label}</span>
        <span className="font-mono font-semibold tabular-nums" aria-live="off">
          {formatClock(left)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuetext={formatClock(left)}
        className="h-1.5 overflow-hidden rounded-full bg-foreground/10"
      >
        <div
          className={cn(
            'h-full origin-left rounded-full transition-transform duration-1000 ease-linear motion-reduce:transition-none',
            tone === 'primary' ? 'bg-primary' : tone === 'warning' ? 'bg-warning' : 'bg-destructive',
          )}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- fields */

export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-center gap-1 text-xs text-destructive">
      <X className="h-3 w-3 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

/** Input with a leading icon. Keeps 16px text and the 40px+ hit area. */
export const IconInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'> & { icon: LucideIcon; trailing?: React.ReactNode }
>(({ icon: Icon, trailing, className, ...props }, ref) => (
  <div className="relative">
    <Icon
      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden="true"
    />
    <Input ref={ref} className={cn('h-11 pl-9', trailing ? 'pr-11' : null, className)} {...props} />
    {trailing ? <div className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</div> : null}
  </div>
));
IconInput.displayName = 'IconInput';

/** Password input with show/hide and a Caps Lock warning. */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'> & { icon: LucideIcon }
>(({ onKeyDown, onKeyUp, onBlur, id, ...props }, ref) => {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const readCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false);

  return (
    <div className="space-y-1.5">
      <IconInput
        ref={ref}
        id={id}
        type={shown ? 'text' : 'password'}
        onKeyDown={(e) => {
          readCaps(e);
          onKeyDown?.(e);
        }}
        onKeyUp={(e) => {
          readCaps(e);
          onKeyUp?.(e);
        }}
        onBlur={(e) => {
          setCaps(false);
          onBlur?.(e);
        }}
        trailing={
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-pressed={shown}
            aria-controls={id}
            aria-label={shown ? t('auth.hidePassword') : t('auth.showPassword')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        }
        {...props}
      />
      {caps ? (
        <p role="status" className="flex items-center gap-1 text-xs font-medium text-warning">
          <ArrowUp className="h-3 w-3" aria-hidden="true" />
          {t('auth.capsLockOn')}
        </p>
      ) : null}
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';

/* ------------------------------------------------------- strength meter */

const STRENGTH_BAR = ['bg-muted', 'bg-destructive', 'bg-warning', 'bg-chart-4', 'bg-success'];
const STRENGTH_TEXT = ['text-muted-foreground', 'text-destructive', 'text-warning', 'text-chart-4', 'text-success'];

export function PasswordStrengthMeter({ value }: { value: string }) {
  const { t } = useTranslation();
  const { score, rules } = scorePassword(value);
  const label = !value ? t('auth.strength.empty') : !rules.length ? t('auth.strength.short') : t(`auth.strength.${score}`);

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{t('auth.strength.title')}</span>
        <span className={cn('font-semibold', STRENGTH_TEXT[score])} aria-live="polite">
          {label}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                'block h-full origin-left rounded-full transition-transform duration-300 ease-out motion-reduce:transition-none',
                STRENGTH_BAR[score],
                score >= n ? 'scale-x-100' : 'scale-x-0',
              )}
            />
          </span>
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
        {PASSWORD_RULES.map((r) => (
          <li
            key={r}
            className={cn(
              'flex items-center gap-1.5 text-xs transition-colors',
              rules[r] ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {rules[r] ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>
              {t(`auth.rule.${r}`)}
              <span className="sr-only">
                {' — '}
                {rules[r] ? t('auth.rule.met') : t('auth.rule.notMet')}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-2xs text-muted-foreground">{t('auth.rule.onlyLength')}</p>
    </div>
  );
}

/* ---------------------------------------------------------- code dots */

/** Filled/empty dots for a numeric code — 6 for SMS/e-mail, 8 once it's an admin code. */
export function CodeProgress({ value }: { value: string }) {
  const { t } = useTranslation();
  const slots = value.length > 6 ? 8 : 6;
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: slots }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 w-4 rounded-full transition-colors duration-200',
              i < value.length ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>
      <span className="text-2xs tabular-nums text-muted-foreground">
        {t('auth.codeDigits', { n: value.length, total: slots })}
      </span>
    </div>
  );
}
