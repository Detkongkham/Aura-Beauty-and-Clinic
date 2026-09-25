import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { cn } from '@/lib/utils';

import { HeaderFrame } from './HeaderFrame';
import { useRegisterStickyHeader } from './MainPaddingContext';

interface StickyPageHeaderProps {
  children: ReactNode;
  /** Applied to the content inside the frame (e.g. `space-y-4`). */
  className?: string;
}

/**
 * Page-level header that sticks flush under PageToolbar while the page scrolls.
 * The title block renders inside a framed card (`HeaderFrame`, same look as the
 * Dashboard header); the sticky strip around it bleeds edge-to-edge.
 *
 * `-mx-4` cancels `<main>`'s horizontal `px-4 sm:px-6` (see AppShell) so the
 * background bleeds edge-to-edge. Vertically, `top-0` lands directly beneath
 * PageToolbar with no gap because this component asks AppShell (via
 * `useRegisterStickyHeader`) to drop `<main>`'s top padding entirely while
 * it's mounted — see MainPaddingContext.tsx for why that's done at the source
 * instead of with a `-mt-6` here: `position: sticky` boxes don't use margin
 * (their own or an ancestor's) when computing their in-flow position.
 *
 * `bg-background` is fully opaque, not translucent — a blurred/semi-transparent
 * background here let scrolled-under content (card borders, badges, preview
 * text) show through as ghosting behind the title and tab row.
 */
export function StickyPageHeader({ children, className }: StickyPageHeaderProps) {
  const registerStickyHeader = useRegisterStickyHeader();

  useEffect(() => registerStickyHeader(), [registerStickyHeader]);

  return (
    <div
      className={cn(
        'sticky top-0 z-20 -mx-4 bg-background px-4 pb-3 pt-4 sm:-mx-6 sm:px-6',
        'animate-in fade-in slide-in-from-top-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
      )}
    >
      <HeaderFrame className={className}>{children}</HeaderFrame>
    </div>
  );
}
