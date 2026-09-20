import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { cn } from '@/lib/utils';

import { useRegisterStickyHeader } from './MainPaddingContext';

interface StickyPageHeaderProps {
  children: ReactNode;
  className?: string;
}

/**
 * Page-level header that sticks flush under PageToolbar while the page scrolls.
 * `-mx-4` cancels `<main>`'s horizontal `px-4 sm:px-6` (see AppShell) so the
 * bottom border and background bleed edge-to-edge. Vertically, `top-0` lands
 * directly beneath PageToolbar with no gap because this component asks
 * AppShell (via `useRegisterStickyHeader`) to drop `<main>`'s top padding
 * entirely while it's mounted — see MainPaddingContext.tsx for why that's
 * done at the source instead of with a `-mt-6` here: `position: sticky`
 * boxes don't use margin (their own or an ancestor's) when computing their
 * in-flow position, verified with an isolated, framework-free HTML/CSS
 * repro, so no margin-cancelling trick on this element can close that gap.
 *
 * `bg-background` is fully opaque, not translucent — a blurred/semi-transparent
 * background here let scrolled-under content (card borders, badges, preview
 * text) show through as ghosting behind the title and tab row.
 *
 * `[&_h1]:-mt-0.5` nudges past the last bit of visual air: `pt-0` removes
 * our own padding, but the title's `leading-tight` line-box still reserves
 * a couple px above the glyphs (normal typographic behaviour, not a layout
 * bug — roughly 3px at this size). Pulling the h1 itself up by slightly
 * less than that (rather than shrinking line-height to `none`, or
 * overshooting past our own top border) closes it without risking clipped
 * Lao vowel/tone marks, which sit above the letterform and need the
 * line-box height to stay intact.
 */
export function StickyPageHeader({ children, className }: StickyPageHeaderProps) {
  const registerStickyHeader = useRegisterStickyHeader();

  useEffect(() => registerStickyHeader(), [registerStickyHeader]);

  return (
    <div
      className={cn(
        'sticky top-0 z-20 -mx-4 border-b border-border bg-background px-4 pb-4 pt-0 sm:-mx-6 sm:px-6 [&_h1]:-mt-0.5',
        'animate-in fade-in slide-in-from-top-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        className,
      )}
    >
      {children}
    </div>
  );
}
