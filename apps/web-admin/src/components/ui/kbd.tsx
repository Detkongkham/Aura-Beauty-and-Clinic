import * as React from 'react';

import { cn } from '@/lib/utils';

/** Detected once — ⌘ on Apple hardware, Ctrl everywhere else. */
export const IS_APPLE =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** Render a shortcut like `mod+K` with the platform-correct modifier glyph. */
export function shortcutLabel(combo: string): string {
  return combo
    .split('+')
    .map((part) => {
      const k = part.trim().toLowerCase();
      if (k === 'mod') return IS_APPLE ? '⌘' : 'Ctrl';
      if (k === 'shift') return IS_APPLE ? '⇧' : 'Shift';
      if (k === 'alt') return IS_APPLE ? '⌥' : 'Alt';
      if (k === 'enter') return '↵';
      if (k === 'esc') return 'Esc';
      return part.trim().toUpperCase();
    })
    .join(IS_APPLE ? '' : '+');
}

/**
 * Keyboard-shortcut chip. Used inside the search trigger, tooltips and menu
 * rows so every shortcut in the chrome is *shown*, not hidden in a `title`.
 */
export const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        'inline-flex h-5 min-w-5 select-none items-center justify-center rounded-[5px] border border-border',
        'bg-muted px-1.5 font-sans text-2xs font-semibold leading-none text-muted-foreground',
        className,
      )}
      {...props}
    />
  ),
);
Kbd.displayName = 'Kbd';
