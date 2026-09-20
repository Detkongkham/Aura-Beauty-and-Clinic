# `design.md` — Aura Beauty & Clinic Platform Design System

> Scope: **Web Admin Portal** (`apps/web-admin`, Phase 2) is the first consumer. The Mobile app
> (Phase 3+) reuses Sections 1–2, 6–7, 10, 12 with a NativeWind token mapping.
>
> Theme concept: **"Neo-Luxury Wellness & Medical Aesthetic"** — ຄວາມລຽບຫຣູ, ສະອາດ, ໂປ່ງສະບາຍ, ໜ້າເຊື່ອຖື.
>
> Machine-checkable mirror: [`design-system/aura-admin/MASTER.md`](../design-system/aura-admin/MASTER.md)
> (+ per-page overrides in `design-system/aura-admin/pages/`). Where this document and MASTER.md
> disagree, **MASTER.md is regenerated to match this file** — this file is the human source of truth for
> brand decisions; MASTER.md is the source of truth for build-time lookups.

---

## 0. Method — `ui-ux-pro-max` integration (how this system is produced & enforced)

This design system is **not** authored by hand alone. It is reconciled from two inputs and enforced at build time via the `ui-ux-pro-max` skill.

### 0.1 Generate + persist the master

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py \
  "beauty clinic wellness admin dashboard booking scheduling" \
  --design-system --persist --density 8 --motion 4 \
  -p "Aura Admin" --output-dir <repo-root>
```

Produces `design-system/aura-admin/MASTER.md` + `design-system/aura-admin/pages/`.

### 0.2 Reconcile against the brand

The raw skill output is a **starting point**, not gospel. For Aura we **rejected**:

| Skill suggested | We use instead | Why |
|-----------------|----------------|-----|
| Primary `#EC4899` (pink) + lavender | Deep Plum `#4A154B` / Amethyst `#6B21A8` + Soft Gold `#D4AF37` | Brand spec (`implementation_plan.md` §4); pink reads consumer-retail, not clinic |
| Lora / Raleway | Playfair Display + Plus Jakarta Sans / Inter + Noto Sans/Serif Lao | Brand spec + mandatory full Lao Unicode coverage |
| "Hero + Testimonials + CTA" page pattern | Admin console IA (sidebar + topbar + content) | This is an internal back-office tool, not a marketing site |

**Kept** from the skill: style direction *Soft UI Evolution*, density dial 8/10, motion dial 4/10 (Standard),
the anti-pattern list, and the Pre-Delivery Checklist.

### 0.3 Per-page overrides

Every non-trivial page gets `design-system/aura-admin/pages/<page>.md` via `--page <page>` before it is built.
Rules in a page file **override** MASTER.md for that page only. Pages that will get an override file in Phase 2:
`login`, `dashboard`, `calendar`, `services`, `staff`, `walk-in`, `appointments-list`, `customer-profile`, `queue-board`.

### 0.4 Build-time gate (per component)

Before writing any non-trivial component, run **one** focused query and verify the result before applying:

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<one concern>" --domain ux      # UX pattern / a11y outcome
python .claude/skills/ui-ux-pro-max/scripts/search.py "<component>"  --stack shadcn     # implementation detail
```

Examples used for Phase 2: `"error summary validation" --domain ux`, `"table handling responsive" --domain ux`,
`"bulk actions multi-select" --domain ux`, `"sidebar SidebarProvider" --stack shadcn`, `"skeleton loading" --stack shadcn`.

### 0.5 Definition of Done

The **Pre-Delivery Checklist** at the end of MASTER.md is a hard merge gate for every page and shared component.

---

## 1. Color Tokens

All colours are exposed as CSS custom properties on `:root` and mapped into `tailwind.config` as semantic names.
**Never** use a raw hex in a component — always the token.

### 1.1 Brand (Sky / Azure — user-directed recolor 2026-09-01, supersedes the plum in `implementation_plan.md` §4)

| Role | Token | Hex |
|------|-------|-----|
| Primary subtle (tinted fills) | `--primary-subtle` | `#E0F2FE` |
| Primary — Azure (sky-700) | `--color-primary` | `#0369A1` |
| Primary hover — Sky (sky-600) | `--color-primary-hover` | `#0284C7` |
| Primary strong (pressed / heading accent) | `--primary-strong` | `#075985` |
| On primary | `--color-on-primary` | `#FFFFFF` |
| Accent — Soft Gold | `--color-accent` | `#D4AF37` |
| Accent soft — Champagne | `--color-accent-soft` | `#E2C799` |
| On accent | `--color-on-accent` | `#3A2E00` |
| Background (app canvas) | `--color-background` | `#F6F9FC` |
| Surface / card | `--color-card` | `#FFFFFF` |
| Foreground (text) | `--color-foreground` | `#1B2732` |
| Muted (fills, zebra) | `--color-muted` | `#EAF2FA` |
| Muted foreground | `--color-muted-foreground` | `#51606E` |
| Border / divider | `--color-border` | `#DCE6F0` |
| Input border | `--color-input` | `#C6D6E4` |
| Focus ring — Sky (sky-500) | `--color-ring` | `#0EA5E9` |

Gold is retained as the single warm accent (VIP markers, review stars, highlights) — blue + gold reads premium.
Primary `#0369A1` on white = 5.7:1 (AA for body + large); hover `#0284C7` = 4.5:1.

**Switchable accent tone (per device).** `Settings ▸ Appearance` lets a user re-point the 4-step
`--primary*` ramp (+ `--ring`, `--chart-1`) to one of four cool-family presets via `<html data-theme>`
(state in `ui.store.ts`, persisted `aura.ui`). Surfaces / neutrals / status colours never move, so
AA contrast holds for every preset. Presets — all `primary` ≥ 4.8:1 on white:

| `data-theme` | subtle | primary | hover | strong |
|--------------|--------|---------|-------|--------|
| _(default)_ Azure | `#E0F2FE` | `#0369A1` | `#0284C7` | `#075985` |
| `teal` | `#CCFBF1` | `#0F766E` | `#0D9488` | `#115E59` |
| `indigo` | `#E0E7FF` | `#4338CA` | `#4F46E5` | `#3730A3` |
| `cobalt` | `#DBEAFE` | `#1D4ED8` | `#2563EB` | `#1E40AF` |

Surfaces use `--shadow-sm` to `--shadow-md` (Section 4) — *Subdued Diffusion*, no neumorphic insets.

### 1.2 Semantic status

| Role | Token | Hex | Soft bg token | Soft bg |
|------|-------|-----|---------------|---------|
| Success | `--color-success` | `#15803D` | `--color-success-soft` | `#DCFCE7` |
| Warning | `--color-warning` | `#B45309` | `--color-warning-soft` | `#FEF3C7` |
| Danger | `--color-destructive` | `#B91C1C` | `--color-destructive-soft` | `#FEE2E2` |
| Info | `--color-info` | `#0891B2` | `--color-info-soft` | `#D6F4FB` |

### 1.3 Appointment / queue status

`PENDING` → warning · `CONFIRMED` → info · `IN_PROGRESS` → violet (`#EDE9FE` / `#5B21B6`) ·
`COMPLETED` → success · `CANCELLED` → muted · `NO_SHOW` → danger.
Rendered as a status pill with a **leading dot + label** (never colour alone — Section 10).

### 1.4 Chart palette

`--chart-1 #0284C7` · `--chart-2 #D4AF37` · `--chart-3 #7C3AED` · `--chart-4 #0D9488` · `--chart-5 #DB2777` · `--chart-6 #B45309`.
Always paired with a label or pattern.

### 1.5 Dark mode

**Deferred.** Phase 2 ships light only. Do not add a partial toggle. When added, redefine only the tokens
under `@media (prefers-color-scheme: dark)` + `[data-theme="dark"]`; component code stays unchanged.

---

## 2. Typography

| Role | Stack |
|------|-------|
| Headings / display | `"Playfair Display", "Noto Serif Lao", serif` — weights 500 / 600 / 700 |
| UI & body | `"Plus Jakarta Sans", "Inter", "Noto Sans Lao", system-ui, sans-serif` — 400 / 500 / 600 / 700 |
| Numeric / tabular | UI stack + `font-variant-numeric: tabular-nums` |

- Ship `Noto Sans Lao` + `Noto Serif Lao` always. Lao text gets `line-height` +0.1 vs Latin.
- Fonts loaded via bundled `@fontsource` packages (offline-safe), not a CDN `@import`.
- Never bake text into images.

### 2.1 Type scale (root 16px)

| Token | px / rem | Line-height | Use |
|-------|----------|-------------|-----|
| `text-2xs` | 11 / 0.6875 | 1.4 | micro labels (sparingly) |
| `text-xs` | 12 / 0.75 | 1.5 | captions, helper text, badges |
| `text-sm` | 14 / 0.875 | 1.5 | default dense table / body text |
| `text-base` | 16 / 1 | 1.5 | body copy, **form inputs (min)** |
| `text-lg` | 18 / 1.125 | 1.45 | card titles |
| `text-xl` | 20 / 1.25 | 1.4 | panel headers |
| `text-2xl` | 24 / 1.5 | 1.35 | page title `h1` |
| `text-3xl` | 30 / 1.875 | 1.3 | dashboard hero numbers |
| `text-4xl` | 36 / 2.25 | 1.2 | stat-card figure / auth title |

Sequential heading levels only (`h1`→`h6`); never skip a level for visual size.

---

## 3. Spacing & Layout Grid  *(density 8/10)*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-2xs` | 2px | icon-to-text hairline |
| `--space-xs` | 4px | inline chip gaps |
| `--space-sm` | 8px | control inner padding |
| `--space-md` | 12px | form row / cell gap |
| `--space-lg` | 16px | card / section padding |
| `--space-xl` | 24px | gap between cards / panels |
| `--space-2xl` | 32px | desktop page padding, section breaks |
| `--space-3xl` | 48px | empty-state rhythm, auth screens |

- 12-column grid, 24px gutter, content `max-width: 1440px`, page padding 24–32px.
- Sidebar 260px / 64px collapsed. Topbar 56px, sticky, `z-40` (command palette · live state · account), with a 40px `PageToolbar` row under it (sidebar toggle · breadcrumbs); main content offset by both. See MASTER.md §8 "Layout chrome" for the band order.
- Table rows 44px (36px compact toggle); header row 40px on `--color-muted`.

---

## 4. Elevation

| Token | Value | Use |
|-------|-------|-----|
| `--shadow-xs` | `0 1px 2px rgba(28,25,23,.06)` | inputs, resting buttons |
| `--shadow-sm` | `0 1px 3px rgba(28,25,23,.08), 0 1px 2px rgba(28,25,23,.04)` | cards, stat cards |
| `--shadow-md` | `0 4px 12px rgba(28,25,23,.10)` | dropdowns, popovers, raised cards |
| `--shadow-lg` | `0 12px 32px rgba(28,25,23,.14)` | dialogs, sheets, command palette |
| focus halo | `0 0 0 3px color-mix(in srgb, var(--color-ring) 40%, transparent)` | all `:focus-visible` |

Hover raises one shadow step + `translateY(-1px)` on **cards only** — never table rows.

---

## 5. Radius

`--radius-sm` 6px (inputs, buttons, badges) · `--radius-md` 10px (cards, popovers) ·
`--radius-lg` 16px (dialogs, sheets, auth card) · `--radius-full` (avatars, dots, pills, toggle).

---

## 6. Motion  *(dial 4/10 — Standard)*

| Context | Duration / easing |
|---------|-------------------|
| Micro (hover, focus, colour, small translate) | 150–200ms `ease-out` |
| Overlays (dialog / sheet / popover) | enter 180–240ms `ease-out`, exit ~160ms |
| List / grid first paint (dashboard cards) | stagger 300–450ms, `ease: back.out(1.4)`, `each 0.05` |
| Data table rows | plain `ease-out` fade + 2px rise — **no overshoot** |
| Calendar drag / slot select | spring `stiffness 300, damping 30` |

- Honour `prefers-reduced-motion: reduce` → final state immediately, keep only ≤120ms opacity.
- Animate `opacity` / `transform` only.

---

## 7. Iconography & Micro-interactions

- **Lucide** only, one set. Sizes 16 / 20 / 24, stroke 1.75.
- Icon-only buttons require `aria-label`; decorative icons `aria-hidden`.
- No emoji as icons.
- Hover transitions 150–200ms `ease-out`; active slot selection uses the spring above; **haptic feedback** on slot pick is Mobile-only (Phase 3).

---

## 8. Component Patterns

Full CSS specs live in [`MASTER.md` §8](../design-system/aura-admin/MASTER.md). Summary of the contract:

- **Buttons** — `sm 32 / md 36 / lg 40`px; primary = azure, hover = sky; primary action right-most; focus halo; disabled 50% + `not-allowed`.
- **Inputs** — 40px min, 16px text; visible `<label>` above (never placeholder-as-label); helper `text-xs` muted; error `text-xs` danger + `role="alert"` + `aria-describedby`.
- **Cards / Stat cards** — label (xs muted uppercase) · figure (`text-3xl`, tabular) · delta chip with ▲/▼ glyph **and** colour · optional sparkline.
- **Data Table** — `overflow-x` wrapper, sticky header; checkbox column → **bulk action bar** (no per-row repetition); row hover = muted bg only; numeric columns right-aligned tabular; page-size 25/50/100 + range text; skeleton rows for loading, `EmptyState` for empty, inline retry for error.
- **Dialog vs Sheet** — Dialog (centered ≤560px) for confirms + short forms; Sheet (right 420–640px) for entity create/edit + detail + mobile filters; both trap focus, `Esc` closes, return focus to trigger.
- **Destructive confirm** — always a Dialog naming the object; red primary; cancel default-focused.
- **Status Pill** — `--radius-full`, xs, soft bg + solid text pair, leading 6px dot.
- **Toast** — one `<Toaster />` in root layout, top-right, 4s (errors manual); success confirms completion; undo where reversible.
- **Command Palette** (⌘K) — groups Navigate / Customers / Appointments / Services / Actions; full keyboard nav.
- **Layout chrome** — grouped sidebar (Overview · Scheduling · Catalog · People · Settings), active = azure left-border + muted fill; topbar = breadcrumbs · search · branch switcher · language toggle · notifications bell · user menu.

---

## 9. Data-Density & Formatting

- **Currency:** LAK, `₭ 250,000` (prefix, thousands sep, no decimals) via `CurrencyText`.
- **Date** `DD/MM/YYYY` · **time** 24h `HH:mm` · **datetime** `DD/MM/YYYY HH:mm`. Relative time only in feeds, absolute in `title`.
- **Timezone** `Asia/Vientiane` (fixed, Phase 2); transport ISO-8601 UTC.
- Tables use `tabular-nums`; stat figures may abbreviate (`1.2K`) with full value in `title`.
- Empty value = en-dash `–` in muted; never a blank cell. Names/emails truncate with `title`, never wrap.

---

## 10. Accessibility (WCAG 2.2 AA — hard gate)

- Contrast ≥ 4.5:1 text (≥ 3:1 large / bold); UI & focus indicators ≥ 3:1.
- Full keyboard operability; visible `:focus-visible` ring never removed; tab order = visual order; no traps.
- Icon-only controls `aria-label`; every field a `<label>`; errors `role="alert"` + `aria-describedby` + top-of-form **error summary** linking to fields on long forms.
- Hit target ≥ 44×44px (dense row actions ≥ 32px only if spaced ≥ 8px and the row itself is a larger target).
- Never colour-only meaning — pair with icon / text / pattern.
- `aria-live="polite"` for toasts and the queue "now serving" updates.
- `<html lang>` follows the active locale.

---

## 11. Responsive

Test at **375 / 768 / 1024 / 1440**.

| Range | Behaviour |
|-------|-----------|
| ≥1280 | sidebar expanded, multi-column dashboard, full tables |
| 1024–1279 | sidebar default-collapsed, 2-col dashboard |
| 768–1023 | sidebar → off-canvas drawer, tables horizontal-scroll |
| <768 | off-canvas nav, single column, tables → stacked card rows, filters in a Sheet |

No horizontal body scroll, no fixed px container widths, no `user-scalable=no`. Wide content scrolls in its own `overflow-x:auto` box.

---

## 12. Internationalisation

- `lo` (default) + `en` via `i18next` + `react-i18next`; keys namespaced per feature module.
- ICU plurals & interpolation — no string concatenation; locale-aware number/date/currency formatters.
- Layout tolerates ~30% text expansion without clipping; controls size to content.
- Language toggle in topbar; choice persisted in `localStorage` + `Accept-Language` header.

---

## 13. Charts (Recharts)

| Need | Chart | Token |
|------|-------|-------|
| Revenue over time | area / stacked area | `--chart-1`, gradient 12%→0 |
| Bookings per day / channel | bar / grouped bar | `--chart-2` |
| Service mix / status split | donut (≤6 slices, else "Other") | palette |
| Staff utilisation | horizontal bar, sorted desc | `--chart-4` |
| Queue wait trend | line + SLA annotation | `--chart-3` |

Every chart: visible axis labels, keyboard-focusable tooltip points (≥24px), legend with values,
`aria-label` container summary, and a "view as table" affordance on key dashboards.

---

## 14. Anti-Patterns

Dark mode (deferred) · neon / pink `#EC4899` · bouncy motion on tables · one-duration-for-everything ·
emoji icons · mixed icon sets · placeholder-as-label · errors only at page top · missing `cursor:pointer` ·
invisible / removed focus · layout-shifting hover · animating `width`/`height` · grey-on-grey text ·
raw hex in components · spinner where a skeleton fits · silent success · delete without confirm ·
horizontal body scroll · disabling zoom.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-09-01 | Initial system. Generated via `ui-ux-pro-max --design-system` (density 8 / motion 4), reconciled against `implementation_plan.md` §4. Persisted to `design-system/aura-admin/MASTER.md`. |
