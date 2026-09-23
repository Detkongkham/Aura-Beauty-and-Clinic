import { Calendar, X } from 'lucide-react';
import { forwardRef } from 'react';

import { DATE_FORMAT } from '@/lib/constants';
import { dayjs } from '@/lib/format';
import { cn } from '@/lib/utils';

interface DateFieldProps {
  /** ISO date string `YYYY-MM-DD`, or '' when unset. */
  value: string;
  onChange: (value: string) => void;
  /** Shown when no date is picked. Defaults to the format hint (`dd/mm/yyyy`). */
  placeholder?: string;
  'aria-label': string;
  className?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  /** When set, a clear (×) button appears while a value is present. */
  onClear?: () => void;
  clearLabel?: string;
}

/**
 * Native `<input type="date">` with its browser-locale text hidden and our own
 * `DD/MM/YYYY` label drawn on top — so the field reads identically in every
 * browser regardless of the OS locale (no more `วว/ดด/ปปปป`). The native control
 * still owns the calendar popover and keyboard handling; its picker indicator is
 * stretched invisibly across the whole field so a click anywhere opens it.
 */
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField(
  { value, onChange, placeholder, className, min, max, disabled, onClear, clearLabel, ...rest },
  ref,
) {
  const label = value ? dayjs(value, 'YYYY-MM-DD').format(DATE_FORMAT) : '';
  const showClear = Boolean(value && onClear && !disabled);

  return (
    <div
      className={cn(
        'relative inline-flex h-9 items-center rounded-sm border border-input bg-card text-sm',
        'transition-colors focus-within:ring-2 focus-within:ring-ring/40',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <Calendar
        className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
        aria-hidden="true"
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none truncate pl-9',
          showClear ? 'pr-8' : 'pr-3',
          label ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label || placeholder || DATE_FORMAT.toLowerCase()}
      </span>
      <input
        ref={ref}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'absolute inset-0 h-full w-full cursor-pointer rounded-sm bg-transparent text-transparent outline-none',
          'disabled:cursor-not-allowed',
          '[&::-webkit-datetime-edit]:text-transparent',
          // Chromium locks (and paints grey) the month/year fields when min and max share them,
          // which bypasses the wrapper colour above — hide the individual fields too.
          '[&::-webkit-datetime-edit-day-field]:text-transparent [&::-webkit-datetime-edit-month-field]:text-transparent',
          '[&::-webkit-datetime-edit-year-field]:text-transparent [&::-webkit-datetime-edit-text]:text-transparent',
          '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0',
          '[&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full',
          '[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0',
        )}
        {...rest}
      />
      {showClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel ?? 'Clear date'}
          className="absolute right-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
});
