# Page override — Global Search (⌘K palette + `/search`)

> Overrides `../MASTER.md` for cross-entity search.

- **Palette:** opened by ⌘K / Ctrl+K (global listener in `AppShell`) or the topbar search button. A `Dialog` (`max-width: 32rem`, `--shadow-lg`, `p-0`) with a borderless 48px search input at top and a `max-h-80` scroll area of grouped results.
- **Groups, in order:** Navigate (static nav targets, filtered by query) · Customers · Appointments · Services. Each result: leading Lucide icon, primary label (truncate), muted secondary (`sub`) right-aligned.
- **Keyboard:** ↑/↓ move a single highlight across the flattened list (wraps within bounds, not around); Enter navigates + closes; Esc closes (Radix default). Mouse hover also sets the highlight.
- **Fetching:** `useGlobalSearch` runs 3 list queries in parallel, `enabled` only when the trimmed query ≥ 2 chars, `staleTime` 10s. Below 2 chars show the "type at least 2 characters" hint; with a query and no hits show "no results".
- **`/search` page:** same data via `?q=`, rendered as titled sections of bordered lists; used as the "see all" destination and for shareable/deep-linked searches.
- **A11y:** the dialog has an `sr-only` title ("Search"); the input is the initial focus; results are `<button>`s (real focus targets), not divs.
