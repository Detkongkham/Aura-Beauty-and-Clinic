import { Suspense, useCallback, useEffect, useRef, useState, type UIEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';

import { PageLoader } from '@/components/shared/PageLoader';
import { useAuth } from '@/features/auth/useAuth';
import { recordVisit } from '@/features/portal/portalModel';
import { CommandPalette } from '@/features/search/CommandPalette';
import { useApplySystemSettings } from '@/features/settings/useApplySystemSettings';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

import { RegisterStickyHeaderContext } from './MainPaddingContext';
import { PageToolbar } from './PageToolbar';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * Non-super-admins can only see their own branch (BranchSwitcher hides the rest),
 * but `activeBranchId` defaults to — and may be persisted as — 'all'. Pin it to the
 * user's branch so every branch-scoped query asks for what the server will allow.
 */
function usePinBranchScope() {
  const { user, role } = useAuth();
  const activeBranchId = useUiStore((s) => s.activeBranchId);
  const setActiveBranch = useUiStore((s) => s.setActiveBranch);
  const ownBranchId = role && role !== 'SUPER_ADMIN' ? user?.branchId : null;

  useEffect(() => {
    if (ownBranchId && activeBranchId !== ownBranchId) setActiveBranch(ownBranchId);
  }, [ownBranchId, activeBranchId, setActiveBranch]);
}

/** Feeds the portal's "continue where you left off" row. */
function useRecordVisits() {
  const { pathname } = useLocation();
  useEffect(() => recordVisit(pathname), [pathname]);
}

/** Authenticated layout — sidebar + topbar + scrollable content (design.md §8). */
export function AppShell() {
  const { t } = useTranslation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [stickyHeaderCount, setStickyHeaderCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  useApplySystemSettings();
  usePinBranchScope();
  useRecordVisits();

  // See MainPaddingContext.tsx: `<main>`'s top padding can't be cancelled with
  // a negative margin on a `position: sticky` child, so StickyPageHeader asks
  // for it to be removed directly while it's mounted.
  const registeredIds = useRef(new Set<symbol>());
  const registerStickyHeader = useCallback(() => {
    const id = Symbol('sticky-header');
    registeredIds.current.add(id);
    setStickyHeaderCount(registeredIds.current.size);
    return () => {
      registeredIds.current.delete(id);
      setStickyHeaderCount(registeredIds.current.size);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (key === 'b' && !e.shiftKey && !e.altKey) {
        // ⌘B / Ctrl+B — the collapse shortcut every console with a rail uses.
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  // Only the crossing of 0 matters (the Topbar just gains a shadow), so this
  // sets state at most once per direction instead of on every scroll frame.
  const onMainScroll = useCallback((e: UIEvent<HTMLElement>) => {
    const past = e.currentTarget.scrollTop > 2;
    setScrolled((prev) => (prev === past ? prev : past));
  }, []);

  return (
    // h-screen + overflow-hidden pins the shell to the viewport; only <main> scrolls,
    // so the sidebar and topbar never move with page content.
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Keyboard users land here first — the nav + topbar are ~30 tab stops. */}
      <a
        href="#main-content"
        className={cn(
          'sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60]',
          'focus:rounded-sm focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground',
        )}
      >
        {t('common.skipToContent')}
      </a>

      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onOpenSearch={() => setPaletteOpen(true)} />
        <PageToolbar scrolled={scrolled} />
        <main
          id="main-content"
          tabIndex={-1}
          onScroll={onMainScroll}
          className={cn(
            'flex-1 overflow-y-auto px-4 pb-6 sm:px-6',
            stickyHeaderCount > 0 ? 'pt-0' : 'pt-6',
          )}
        >
          <RegisterStickyHeaderContext.Provider value={registerStickyHeader}>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </RegisterStickyHeaderContext.Provider>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
