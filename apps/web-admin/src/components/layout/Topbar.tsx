import { cn } from '@/lib/utils';

import { BranchSwitcher } from './BranchSwitcher';
import { ConnectionStatus } from './ConnectionStatus';
import { FxTicker } from './FxTicker';
import { LanguageToggle } from './LanguageToggle';
import { MobileNav } from './MobileNav';
import { NotificationBell } from './NotificationBell';
import { QueuePulse } from './QueuePulse';
import { SearchTrigger } from './SearchTrigger';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

/** Hairline used to group the right-hand cluster into legible bands. */
function Divider() {
  return <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px shrink-0 bg-border lg:block" />;
}

interface TopbarProps {
  onOpenSearch?: () => void;
}

/**
 * Utility bar — the command palette in the middle, live state and account
 * controls on the right. The sidebar toggle and breadcrumb trail live in
 * `PageToolbar`, the slim row directly underneath (see AppShell), so the trail
 * gets the full width of the content area instead of competing with this row.
 *
 * What used to be an empty `flex-1` spacer in the middle is now the search
 * field: the palette is the fastest route through this console, and an icon
 * alone never read as an invitation to type.
 *
 * Right-hand order is deliberate, cheapest attention first: ambient state
 * (queue pressure → FX → branch scope), then the inbox, then preferences,
 * then the account. Each band is separated by a hairline rather than spacing
 * alone, so ten controls still read as four groups.
 */
export function Topbar({ onOpenSearch }: TopbarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1 border-b border-border bg-card px-2 sm:gap-2 sm:px-4',
      )}
    >
      {/* Context — where am I (the breadcrumb trail lives in PageToolbar, below) */}
      <div className="flex shrink-0 items-center gap-0.5">
        <MobileNav />
      </div>

      {/* Command — the fastest way anywhere */}
      <div className="mx-auto flex min-w-0 max-w-md flex-1 items-center justify-center px-1">
        <SearchTrigger onOpen={onOpenSearch} />
      </div>

      {/* State & account */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <ConnectionStatus />
        <QueuePulse />
        <FxTicker />
        <BranchSwitcher />
        <Divider />
        <NotificationBell />
        <Divider />
        <ThemeToggle />
        <LanguageToggle />
        <Divider />
        <UserMenu />
      </div>
    </header>
  );
}
