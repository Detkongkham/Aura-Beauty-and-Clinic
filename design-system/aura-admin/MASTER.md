# Design System Master File — Aura Admin (Web Admin Portal)

> **LOGIC:** When building a specific page, first check `design-system/aura-admin/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. Otherwise, follow the rules below.
>
> **SOURCE OF TRUTH:** This file is reconciled from two inputs:
> 1. `ui-ux-pro-max --design-system` output (style direction, density/motion dials, anti-patterns, checklist).
> 2. `implementation_plan.md` §4 "design.md Guidelines" — **the brand palette + typography here WIN over any skill suggestion.**
> The skill's raw suggestion (pink `#EC4899` + Lora/Raleway + landing-page pattern) was **rejected** because
> this is an internal admin console for a Neo-Luxury clinic brand, not a marketing site.

---

**Project:** Aura Admin — Aura Beauty & Clinic Platform, back-office console
**Category:** Beauty / Spa / Wellness / Medical Aesthetic — internal operations
**Design Dials:** Motion 4/10 (Standard) | Density 8/10 (Dense / Dashboard)
**Style:** Soft UI Evolution (evolved soft UI, better contrast, subtle depth, accessibility-focused)
**Theme concept:** *"Neo-Luxury Wellness & Medical Aesthetic"* — ຄວາມລຽບຫຣູ, ສະອາດ, ໂປ່ງສະບາຍ, ໜ້າເຊື່ອຖື
**Modes:** Light only for Phase 2 (dark mode deliberately deferred — see Anti-Patterns).

---

## 1. Color Tokens

### Brand (Sky / Azure — user-directed recolor 2026-09-01, supersedes implementation_plan.md §4 plum)

| Role | Hex | CSS Variable | Notes |
|------|-----|--------------|-------|
| Primary Subtle | `#E0F2FE` | `--primary-subtle` | Tinted fills — active nav row, soft chips |
| Primary (Azure, sky-700) | `#0369A1` | `--color-primary` | Trust & calm; sidebar active, primary buttons, headings accent |
| Primary Hover (Sky, sky-600) | `#0284C7` | `--color-primary-hover` | Hover / focus of primary |
| Primary Strong (sky-800) | `#075985` | `--primary-strong` | Pressed state, heading accents |
| On Primary | `#FFFFFF` | `--color-on-primary` | Text/icon on primary fills |
| Accent (Soft Gold) | `#D4AF37` | `--color-accent` | Badges, review stars, highlight buttons, VIP markers |
| Accent Soft (Champagne) | `#E2C799` | `--color-accent-soft` | Accent backgrounds, subtle highlight fills |
| On Accent | `#3A2E00` | `--color-on-accent` | Text on gold (≥4.5:1) |
| Background Neutral | `#F6F9FC` | `--color-background` | App canvas — faint sky tint, ບໍ່ແມ່ນຂາວຈ້າ |
| Surface / Card | `#FFFFFF` | `--color-card` | Cards, tables, sheets, modals |
| Foreground | `#1B2732` | `--color-foreground` | Primary text (cool near-black) |
| Card Foreground | `#1B2732` | `--color-card-foreground` | Text on cards |
| Muted | `#EAF2FA` | `--color-muted` | Zebra rows, disabled fills, skeleton base |
| Muted Foreground | `#51606E` | `--color-muted-foreground` | Secondary text, captions, table headers (≥4.5:1 on card) |
| Border | `#DCE6F0` | `--color-border` | Hairlines, table grid, input borders |
| Input Border | `#C6D6E4` | `--color-input` | Resting input border (stronger than divider) |
| Ring (focus, sky-500) | `#0EA5E9` | `--color-ring` | 3px focus ring, 40% alpha halo |

**Switchable accent tone** — `Settings ▸ Appearance` re-points the `--primary*` ramp + `--ring` + `--chart-1` to `azure` (default) / `teal` / `indigo` / `cobalt` via `<html data-theme>` (persisted `aura.ui`). Surfaces, neutrals and status colours are unchanged, so AA contrast holds for every preset (all `primary` ≥ 4.8:1 on white).

### Semantic status

| Role | Hex | CSS Variable | On-color |
|------|-----|--------------|----------|
| Success | `#15803D` | `--color-success` | `#FFFFFF` |
| Success Soft | `#DCFCE7` | `--color-success-soft` | `#14532D` |
| Warning | `#B45309` | `--color-warning` | `#FFFFFF` |
| Warning Soft | `#FEF3C7` | `--color-warning-soft` | `#78350F` |
| Danger / Destructive | `#B91C1C` | `--color-destructive` | `#FFFFFF` |
| Danger Soft | `#FEE2E2` | `--color-destructive-soft` | `#7F1D1D` |
| Info | `#1D4ED8` | `--color-info` | `#FFFFFF` |
| Info Soft | `#DBEAFE` | `--color-info-soft` | `#1E3A8A` |

### Appointment / queue status colours (calendar blocks, status pills)

| Status | Fill | Text |
|--------|------|------|
| `PENDING` | `--color-warning-soft` | `--color-warning` |
| `CONFIRMED` | `--color-info-soft` | `--color-info` |
| `IN_PROGRESS` | `#EDE9FE` (violet-100) | `#5B21B6` |
| `COMPLETED` | `--color-success-soft` | `--color-success` |
| `CANCELLED` | `--color-muted` | `--color-muted-foreground` |
| `NO_SHOW` | `--color-destructive-soft` | `--color-destructive` |

### Chart palette (Recharts — categorical, colour-blind checked, never colour-only)

`--chart-1 #0284C7` · `--chart-2 #D4AF37` · `--chart-3 #7C3AED` · `--chart-4 #0D9488` · `--chart-5 #DB2777` · `--chart-6 #B45309`
Always pair with a direct label or distinct pattern/marker.

---

## 2. Typography

- **Headings:** `"Playfair Display", "Noto Serif Lao", serif` — display/serif for page titles & section headers (weights 500/600/700).
- **UI & Body:** `"Plus Jakarta Sans", "Inter", "Noto Sans Lao", system-ui, sans-serif` (weights 400/500/600/700).
- **Numeric / tabular:** same sans with `font-variant-numeric: tabular-nums` for tables, money, times.
- **Lao note:** always ship `Noto Sans Lao` + `Noto Serif Lao`; Lao lines get `line-height` +0.1 vs Latin. Never bake text into images.
- Load via `@fontsource` packages (bundled, offline-safe) — not a CDN `@import`.

### Type scale (modular, rem @ 16px root)

| Token | Size | Line-height | Use |
|-------|------|-------------|-----|
| `text-2xs` | 11px / 0.6875rem | 1.4 | Micro labels, table meta (use sparingly) |
| `text-xs` | 12px / 0.75rem | 1.5 | Captions, helper text, badges |
| `text-sm` | 14px / 0.875rem | 1.5 | **Default table/body text in dense views** |
| `text-base` | 16px / 1rem | 1.5 | Body copy, form inputs (min for inputs → no iOS zoom) |
| `text-lg` | 18px / 1.125rem | 1.45 | Card titles, sub-section headers |
| `text-xl` | 20px / 1.25rem | 1.4 | Panel headers |
| `text-2xl` | 24px / 1.5rem | 1.35 | Page title (`h1`) in content area |
| `text-3xl` | 30px / 1.875rem | 1.3 | Dashboard hero numbers |
| `text-4xl` | 36px / 2.25rem | 1.2 | Stat-card primary figure / auth screen title |

Headings use sequential levels (`h1`→`h6`), never skipped for styling.

---

## 3. Spacing & Layout Grid

*Density 8/10 — Dense / Dashboard.*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-2xs` | 2px | Icon-to-text hairline gaps |
| `--space-xs` | 4px | Inline chip gaps |
| `--space-sm` | 8px | Control inner padding, tight stacks |
| `--space-md` | 12px | Default gap between form rows / cells |
| `--space-lg` | 16px | Card padding, section inner padding |
| `--space-xl` | 24px | Gap between cards / panels |
| `--space-2xl` | 32px | Page content padding (desktop), section breaks |
| `--space-3xl` | 48px | Empty-state vertical rhythm, auth screens |

- **Grid:** 12-column, 24px gutter, content `max-width: 1440px`, page padding 24–32px.
- **Sidebar:** 260px expanded / 64px collapsed (icon rail). Topbar height 56px, sticky, `z-40`.
- **Content offset:** main scroll container gets `padding-top` = topbar height; nothing hides behind fixed chrome.
- **Table row height:** 44px standard, 36px compact toggle. Header row 40px, `--color-muted` bg, `text-xs` uppercase `--color-muted-foreground`.

---

## 4. Elevation (Soft UI Evolution — softer than flat, clearer than neumorphism)

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-xs` | `0 1px 2px rgba(28,25,23,0.06)` | Inputs, resting buttons |
| `--shadow-sm` | `0 1px 3px rgba(28,25,23,0.08), 0 1px 2px rgba(28,25,23,0.04)` | Cards, stat cards |
| `--shadow-md` | `0 4px 12px rgba(28,25,23,0.10)` | Dropdowns, popovers, hover-raised cards |
| `--shadow-lg` | `0 12px 32px rgba(28,25,23,0.14)` | Dialogs, sheets, command palette |
| Focus halo | `0 0 0 3px color-mix(in srgb, var(--color-ring) 40%, transparent)` | All focus-visible |

No inset/neumorphic double shadows. Hover raises shadow one step + `translateY(-1px)` **only on non-table cards** (never table rows — no layout-shifting hovers on data).

---

## 5. Radius

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | 6px | Inputs, buttons, badges, table container inner |
| `--radius-md` | 10px | Cards, dropdowns, popovers |
| `--radius-lg` | 16px | Dialogs, sheets, auth card |
| `--radius-full` | 9999px | Avatars, status dots, pills, toggle |

---

## 6. Motion (Dial 4/10 — Standard)

- **Micro-interactions:** 150–200ms `ease-out` — hover, focus, background/colour, small translate.
- **Overlays** (dialog/sheet/popover): 180–240ms; enter `ease-out`, exit ~160ms (exit faster than enter).
- **List / grid reveal** (dashboard cards, first table paint): stagger 300–450ms, `ease: back.out(1.4)`, `each: 0.05`.
- ❌ Do **not** use `back.out` overshoot on dense data tables / rows — reads as sloppy on informational UI; use plain `ease-out` fade+2px rise.
- **Calendar drag / slot select:** spring, `stiffness ~300, damping ~30`.
- Respect `@media (prefers-reduced-motion: reduce)` → jump to final state, keep only opacity ≤120ms.
- Animate `opacity` / `transform` only — never `width` / `height` / `top` / `left`.

Optional GSAP snippet (dashboard card grid, gated on reduced-motion):
```js
gsap.from('.stat-grid > *', { opacity: 0, y: 12, duration: 0.4, stagger: 0.05, ease: 'back.out(1.4)' });
```

---

## 7. Iconography

- **Set:** Lucide (single set, no mixing). Sizes 16 / 20 / 24px; stroke 1.75.
- Icon-only buttons **must** carry `aria-label`; decorative icons `aria-hidden="true"`.
- ❌ No emoji as icons, anywhere.

---

## 8. Component Specs

### Buttons
```css
.btn { font: 600 14px/1 var(--font-ui); border-radius: var(--radius-sm);
       padding: 8px 14px; min-height: 36px; cursor: pointer;
       transition: background 160ms ease-out, box-shadow 160ms ease-out, transform 120ms ease-out; }
.btn-primary   { background: var(--color-primary); color: var(--color-on-primary); }
.btn-primary:hover  { background: var(--color-primary-hover); }
.btn-primary:active { transform: translateY(1px); }
.btn-secondary { background: var(--color-card); color: var(--color-primary);
                 border: 1px solid var(--color-input); }
.btn-ghost     { background: transparent; color: var(--color-foreground); }
.btn-danger    { background: var(--color-destructive); color: #fff; }
.btn:focus-visible { outline: none; box-shadow: var(--focus-halo); }
.btn[disabled] { opacity: .5; cursor: not-allowed; }
```
Sizes: `sm` 32px / `md` 36px (default) / `lg` 40px. Primary action right-most in a button row.

### Inputs
```css
.input { min-height: 40px; padding: 8px 12px; font-size: 16px;
         background: var(--color-card); border: 1px solid var(--color-input);
         border-radius: var(--radius-sm); transition: border-color 160ms ease-out, box-shadow 160ms ease-out; }
.input:focus-visible { outline: none; border-color: var(--color-ring); box-shadow: var(--focus-halo); }
.input[aria-invalid="true"] { border-color: var(--color-destructive); }
```
Always a visible `<label>` above the field (never placeholder-as-label). Helper text `text-xs --color-muted-foreground` below; error text `text-xs --color-destructive` replacing helper, `role="alert"`, tied via `aria-describedby`.

### Cards / Stat cards
```css
.card { background: var(--color-card); border: 1px solid var(--color-border);
        border-radius: var(--radius-md); padding: var(--space-lg); box-shadow: var(--shadow-sm); }
.stat-card .figure { font: 600 30px/1.2 var(--font-ui); font-variant-numeric: tabular-nums; }
.stat-card .delta.up   { color: var(--color-success); }
.stat-card .delta.down { color: var(--color-destructive); }
```
Stat card = label (`text-xs` muted, uppercase) · figure (`text-3xl`) · delta chip with ▲/▼ glyph **and** colour (never colour alone) · optional sparkline.

### Data Table
- Wrapper `overflow-x: auto`; sticky header; sticky first column on ≥3-column horizontal scroll.
- Checkbox column → selection → **bulk action bar** slides in above the table (count + actions), not per-row repetition.
- Row hover: `--color-muted` background only (no shadow, no move). Row click → detail drawer/route; explicit kebab menu for row actions.
- Sort indicators in header; current sort column header text `--color-foreground`, others `--color-muted-foreground`.
- Right-align numeric & currency columns, `tabular-nums`.
- Pagination bar: page size select (25/50/100), range text ("1–50 of 320"), prev/next; keep footer visible.
- **Loading:** skeleton rows matching column layout (not a spinner). **Empty:** `EmptyState` with icon, one-line reason, primary CTA. **Error:** inline retry panel.

### Dialog vs Sheet
- **Dialog** (centered, `max-width: 480–560px`): confirmations, short forms (≤6 fields).
- **Sheet** (right, `width: 420–560px`, or `640px` for record detail): entity create/edit, detail view, filters on mobile.
- Both: overlay `rgba(28,25,23,0.45)` + `backdrop-filter: blur(2px)`, trap focus, `Esc` closes, return focus to trigger, `aria-labelledby` + `aria-describedby`.
- **Destructive confirm** always a Dialog: name the object, red primary, cancel is default-focused.

### Status Pill / Badge
`inline-flex`, `--radius-full`, `text-xs`, 2px/8px padding, soft bg + solid text token pair from §1. Include a leading 6px dot for colour-blind support.

### Toast (Sonner)
Single `<Toaster />` mounted once in root layout, top-right, 4s default (errors: manual dismiss). Success = confirmation of a completed action (never silent success). Include undo action where the operation is reversible.

### Command Palette (⌘K / Ctrl+K)
`Sheet`-less overlay dialog, `--shadow-lg`, groups: Navigate · Customers · Appointments · Services · Actions. Arrow-key nav, `Enter` to run, `Esc` to close, recent items when query empty.

### Layout chrome
- **Sidebar:** grouped nav (Overview · Scheduling · Catalog · People · Settings), active item = azure left-border + `--color-muted` fill + `--color-primary` text. Collapsible to icon rail; state in Zustand + `localStorage`.
- **Topbar (utility bar, 56px, sticky `z-40`):** rebuilt 2026-09-20.
  - **Left:** mobile nav ☰ (<`lg`) only.
  - **Centre (command):** search rendered as a *field*, not an icon — rounded-full, placeholder, visible ⌘K chip; degrades to an icon button below `md`. This replaced an empty `flex-1` spacer.
  - **Right (state → account), separated into bands by hairline dividers:** offline chip (only when offline) · queue pulse (only when someone is waiting) · FX ticker · branch scope chip · │ · notifications bell + preview popover · │ · theme toggle + language segmented control · │ · user menu.
  - Pill-shaped ambient indicators (`h-8`, `--radius-full`) vs square icon buttons (`h-9 w-9`, `--radius-sm`) — shape alone separates *state* from *action*.
- **PageToolbar (40px, directly under the Topbar):** sidebar collapse toggle (⌘B, with tooltip) + breadcrumb trail. Kept as its own row so the trail owns the full content width. It is the lowest chrome edge, so it — not the Topbar — gains `--shadow-sm` once `<main>` scrolls.
- **Breadcrumbs** shown on every page ≥2 levels deep, inside PageToolbar. Crumbs are padded hit targets; record ids collapse to "Detail"; intermediate crumbs drop below `sm`.
- **PageHeader:** `h1` + optional description + primary action(s) right-aligned + optional tabs row.

---

## 9. Data-Density & Formatting Rules

- **Currency:** LAK, `₭` prefix, thousands separators, no decimals — `₭ 250,000`. Helper `CurrencyText`.
- **Date:** `DD/MM/YYYY`; **time:** 24h `HH:mm`; **datetime:** `DD/MM/YYYY HH:mm`. Relative time ("5 ນາທີກ່ອນ") only in feeds/notifications, with absolute on hover/title.
- **Timezone:** `Asia/Vientiane` fixed for Phase 2; format via `dayjs` + tz plugin. Store/transport ISO-8601 UTC.
- **Numbers:** `tabular-nums` in tables; abbreviate only in stat figures (`1.2K`, `3.4M`) with full value in `title`.
- **Empty values:** en-dash `–` in `--color-muted-foreground`, never blank cell.
- **Truncation:** single-line ellipsis with `title` full text; names/emails never wrap in table cells.

---

## 10. Accessibility (WCAG 2.2 AA — hard gate)

- Text contrast ≥ 4.5:1 (≥ 3:1 for ≥24px or ≥19px bold); UI component & focus indicators ≥ 3:1.
- Every interactive element keyboard-reachable; visible `:focus-visible` ring (never removed); tab order = visual order; no keyboard traps.
- Icon-only controls have `aria-label`; form fields have associated `<label>`; errors use `role="alert"` + `aria-describedby` + an **error summary** at top of long forms linking to fields.
- Hit target ≥ 44×44px (dense table row actions may be 32px if spaced ≥8px and a larger row-click target exists).
- Respect `prefers-reduced-motion`; never convey meaning by colour alone (pair with icon/text/pattern).
- Live regions: toast container `aria-live="polite"`; queue "now serving" updates `aria-live="polite"`.
- `<html lang="lo">` / `"en"` switches with the locale.

---

## 11. Responsive

Breakpoints (test all): **375 / 768 / 1024 / 1440**.

| Range | Behaviour |
|-------|-----------|
| ≥1280 | Sidebar expanded, multi-column dashboards, tables full |
| 1024–1279 | Sidebar collapsible default-collapsed, 2-col dashboard |
| 768–1023 | Sidebar becomes off-canvas drawer, 1–2 col, tables horizontal-scroll |
| <768 | Off-canvas nav, single column, dense tables → stacked card rows, filters move into a Sheet |

Never: horizontal page scroll, fixed px container widths, `user-scalable=no`. Wide content (tables, calendar, charts) scrolls inside its own `overflow-x:auto` box.

---

## 12. i18n

- `lo` (default) + `en`, `i18next` + `react-i18next`; keys namespaced per feature module.
- ICU plurals & interpolation; no string concatenation. Dates/numbers/currency via locale-aware formatters, not hardcoded.
- Layout must tolerate ~30% text expansion (Lao ↔ English) without clipping; buttons size to content.
- Language toggle in topbar; persist choice in `localStorage` + send `Accept-Language`.

---

## 13. Charts (Recharts)

| Need | Chart | Notes |
|------|-------|-------|
| Revenue over time | Area (single) / stacked area (by branch) | `--chart-1`; gradient fill 12%→0; x = date, y = ₭ abbreviated |
| Bookings per day / channel | Bar / grouped bar | direct value labels on hover + axis |
| Service mix / status split | Donut | ≤6 slices, else "Other"; legend with values, not colour-only |
| Staff utilisation | Horizontal bar | sorted desc; target line |
| Queue wait trend | Line | `--chart-3`; annotate SLA threshold |

All charts: visible axis labels, accessible tooltip (keyboard-focusable points), legend, `aria-label` summary on the container, and a "view as table" affordance for key dashboards. Min touch target for interactive points 24px.

---

## 14. Anti-Patterns (Do NOT use)

- ❌ **Dark mode** — deferred; Phase 2 ships light only. Don't add a half-done toggle.
- ❌ Bright neon / high-chroma colours; the pink `#EC4899` from the raw skill output.
- ❌ Harsh / bouncy animation on data tables; one-duration-fits-all transitions.
- ❌ Emoji as icons; mixed icon sets.
- ❌ Placeholder-as-label; errors shown only at page top with no field-level message.
- ❌ Missing `cursor: pointer`; invisible focus states; removed outlines.
- ❌ Layout-shifting hover (scale that reflows); animating `width`/`height`.
- ❌ Low-contrast grey-on-grey text; raw hex in components (use tokens).
- ❌ Spinner where a skeleton fits; silent success; delete without confirm.
- ❌ Horizontal scroll on the page body; disabling zoom.

---

## Pre-Delivery Checklist (Definition of Done — every page)

- [ ] Page checked against `design-system/aura-admin/pages/<page>.md` (if present) then this file
- [ ] Ran a `ui-ux-pro-max` `--domain` / `--stack shadcn` query for each non-trivial component before coding it
- [ ] No emoji icons; all icons Lucide; icon-only buttons have `aria-label`
- [ ] `cursor-pointer` on all clickable elements; hover transitions 150–300ms
- [ ] Text contrast ≥ 4.5:1; focus-visible ring on every control; tab order = visual order
- [ ] `prefers-reduced-motion` respected; only opacity/transform animated
- [ ] Responsive verified at 375 / 768 / 1024 / 1440; no horizontal body scroll; tables in `overflow-x` wrapper
- [ ] Nothing hidden behind the sticky topbar
- [ ] Forms: visible labels, inline errors + `role="alert"`, error summary on long forms
- [ ] Loading = skeleton; empty = `EmptyState` w/ CTA; error = inline retry
- [ ] Currency/date/time via shared formatters; numeric columns `tabular-nums`, right-aligned
- [ ] All copy via i18n keys (lo + en); layout survives +30% text expansion
- [ ] Destructive actions behind a named confirm dialog; success toasts confirm completion
