import * as React from 'react';

import { cn } from '@/lib/utils';

/** Input — design.md §8: 40px min, 16px text, token border, focus halo via global :focus-visible. */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-sm border border-input bg-card px-3 py-2 text-base',
        'placeholder:text-muted-foreground',
        'transition-colors duration-150 ease-out',
        'aria-[invalid=true]:border-destructive',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
