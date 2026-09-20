import { Eye, EyeOff } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const MAX_LEN = 6;

export type PinFieldStatus = 'idle' | 'success' | 'warning' | 'error';

interface PinFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  toggleLabel: { show: string; hide: string };
  autoFocus?: boolean;
  status?: PinFieldStatus;
  message?: string;
}

/** A polished PIN entry field: masked-by-default digits, a progress-dot readout, and a show/hide toggle. */
export function PinField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggleVisible,
  toggleLabel,
  autoFocus,
  status = 'idle',
  message,
}: PinFieldProps) {
  const messageId = `${id}-message`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          inputMode="numeric"
          autoComplete="off"
          maxLength={MAX_LEN}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, MAX_LEN))}
          aria-describedby={messageId}
          aria-invalid={status === 'error'}
          className={cn(
            'h-12 pr-11 text-center font-mono text-xl tracking-[0.35em]',
            status === 'error' && 'border-destructive',
            status === 'success' && 'border-success',
          )}
        />
        <button
          type="button"
          onClick={onToggleVisible}
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={visible ? toggleLabel.hide : toggleLabel.show}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: MAX_LEN }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 w-4 rounded-full transition-colors',
                i < value.length ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>
        <p
          id={messageId}
          className={cn(
            'text-right text-[11px] leading-tight',
            status === 'error' && 'text-destructive',
            status === 'success' && 'text-success',
            status === 'warning' && 'text-warning',
            status === 'idle' && 'text-muted-foreground',
          )}
        >
          {message}
        </p>
      </div>
    </div>
  );
}
