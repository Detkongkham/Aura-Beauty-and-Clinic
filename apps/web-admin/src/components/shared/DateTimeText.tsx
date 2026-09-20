import { type DateInput, formatDate, formatDateTime, formatRelative, formatTime } from '@/lib/format';

interface DateTimeTextProps {
  value: DateInput;
  mode?: 'date' | 'time' | 'datetime' | 'relative';
  /** For relative mode, the absolute value goes into the title attr. */
  className?: string;
  locale?: 'lo' | 'en';
}

export function DateTimeText({ value, mode = 'date', className, locale = 'lo' }: DateTimeTextProps) {
  if (mode === 'relative') {
    return (
      <time className={className} title={formatDateTime(value)}>
        {formatRelative(value, locale)}
      </time>
    );
  }
  const text =
    mode === 'time' ? formatTime(value) : mode === 'datetime' ? formatDateTime(value) : formatDate(value);
  return (
    <time className={className} title={formatDateTime(value)}>
      {text}
    </time>
  );
}
