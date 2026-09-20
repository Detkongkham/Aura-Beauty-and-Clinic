import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { shortcutLabel } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

import { Breadcrumbs } from './Breadcrumbs';

/** Collapse/expand the desktop sidebar — the ⌘B binding lives in AppShell. */
function SidebarToggle() {
  const { t } = useTranslation();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const label = t(collapsed ? 'nav.expandSidebar' : 'nav.collapseSidebar');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hidden h-7 w-7 shrink-0 lg:inline-flex"
          onClick={toggle}
          aria-label={label}
          aria-keyshortcuts="Meta+B Control+B"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label} · {shortcutLabel('mod+B')}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Slim navigation row directly under the Topbar — sidebar collapse toggle +
 * breadcrumb trail. Kept as its own row (rather than folded into the Topbar's
 * left zone) so the trail has the full width of the content area to grow into:
 * inside the Topbar it had to compete with the search field and the state
 * cluster, and deep paths were truncated on anything narrower than a desktop.
 *
 * Lives outside `<main>` in AppShell — same non-scrolling chrome as Topbar,
 * no `sticky`/z-index needed.
 */
export function PageToolbar({ scrolled = false }: { scrolled?: boolean }) {
  return (
    <div
      className={cn(
        'flex h-10 shrink-0 items-center gap-1 border-b bg-background px-3 sm:px-4',
        // Lowest chrome row, so this is the edge that has to separate itself
        // from content once `<main>` scrolls under it.
        'transition-shadow duration-200 ease-out',
        scrolled ? 'border-border shadow-sm' : 'border-border/70',
      )}
    >
      <SidebarToggle />
      <Breadcrumbs />
    </div>
  );
}
