# `design-mobile.md` — Aura Mobile (Customer App) Design System

> Scope: **`apps/mobile`** (Expo + React Native + NativeWind). This is the human source of truth
> for the customer-facing app's visual language. The web-admin system lives in
> [`../../../docs/design.md`](../../../docs/design.md); where the two differ, **this file wins for mobile**.
>
> Theme concept: **"Neo-Luxury Wellness & Clinic"** — ຫຼູ, ສະອາດ, ອ່ອນໂຍນ, ໜ້າເຊື່ອຖື.
> Brand tone (azure by default, ຕາມສີໂລໂກ້) + a single soft-gold accent, on a cool near-white
> canvas — or its dark counterpart. Tone ແລະ ໂໝດມືດ ເລືອກໄດ້ໃນ ໂປຣໄຟລ໌ ▸ ຮູບລັກສະນະ (§1.0).
>
> Reference artboard: the **Aura Beauty & Clinic** home mockup (Tailwind v3, `lang="lo"`).
> Every rule below is derived from that artboard and reconciled with the RN token layer.

---

## 0. How this system is enforced

- **Tokens only.** Never write a raw hex in a component. Use a NativeWind token class
  (`bg-primary`, `text-muted-foreground`, `border-border`) or, when a `style` prop needs a raw
  value (icon `color`, `shadow`, gradient stop), import from [`src/theme`](../src/theme/index.ts).
- **Two mirrors kept in sync by hand:**
  [`tailwind.config.js`](../tailwind.config.js) (class layer) ⇄ [`src/theme/index.ts`](../src/theme/index.ts)
  (JS layer). A change to one is a change to both, in the same commit.
- **Lao typography rule is absolute** — no `letter-spacing`, no `uppercase`, ever, on Lao or Thai
  script (see §2.3). The mockup's `uppercase tracking-wider` pill is **not** copied to RN.
- **Light mode only.** No dark palette, no partial toggle. When dark ships it redefines tokens
  only; component code stays unchanged.
- Before building a non-trivial component, run one focused `ui-ux-pro-max` query
  (`--domain ux` for the pattern, `--stack react-native` for the implementation) and verify it.
- The **Pre-Delivery Checklist** in `.claude/skills/ui-ux-pro-max/references/pro-rules.md` is a
  hard gate for every screen and shared component.

---

## 1. Color Tokens

Mobile now shares **the web-admin token system** (`apps/web-admin/src/index.css`, docs/design.md §1):
the same roles, the same 4-step brand ramp, the same status set — plus a light/dark mode.
Source of truth: [`src/theme/palette.ts`](../src/theme/palette.ts).

### 1.0 How theming works on RN

- Every colour is a **CSS variable** (`rgb(var(--color-x) / <alpha-value>)`) declared in
  `tailwind.config.js`; `global.css` holds only the fallback set (azure · light).
- [`src/theme/ThemeProvider.tsx`](../src/theme/ThemeProvider.tsx) resolves *tone × mode* from
  `ui.store` (`themeTone`, `colorMode`), feeds NativeWind through `vars()`, and publishes the raw
  palette to `src/theme/index.ts` so `colors.*`, `shadow.*` and the gradient presets follow along.
- Users pick tone and mode in **Profile ▸ ຮູບລັກສະນະ** (customer + staff portal), persisted per device.
- Changing the theme remounts the navigation tree once (nav state is preserved) so memoised screens
  pick up raw `colors.*` values too.

Rules: never hardcode a hex; never capture `colors.x` in a module-level const (it snapshots the
palette at import time — use a function or a getter, see `TINT` in `staff-portal.parts.tsx`).

### 1.1 Brand tones

| Tone | Primary (light) | Primary (dark) | Note |
|------|-----------------|----------------|------|
| **azure** (default) | `#0369A0` | `#29A6E0` | matches the Aura logo blue; web-admin default |
| teal | `#0F756D` | `#2E9E91` | |
| indigo | `#463ACB` | `#6163D1` | |
| cobalt | `#1D4FD7` | `#4383D0` | |
| amethyst | `#7C3AED` | `#9B76DB` | the previous mobile-only brand, kept as an option |

Only `primary*` / `ring` / `chart-1` / the `aura` ramp change with the tone — surfaces, neutrals and
status colours are identical across tones, so contrast holds everywhere.

### 1.2 Roles (azure · light → dark)

| Role | Class token | JS token | Light | Dark |
|------|-------------|----------|-------|------|
| Primary subtle (tinted fills, chips) | `bg-primary-subtle` | `colors.primarySubtle` | `#E1F3FE` | `#213845` |
| **Primary** | `bg-primary` / `text-primary` | `colors.primary` | `#0369A0` | `#29A6E0` |
| Primary hover / pressed | `*-primary-hover` | `colors.primaryHover` | `#0284C5` | `#3EB3EA` |
| Primary strong (price, heading accent) | `text-primary-strong` | `colors.primaryStrong` | `#075783` | `#1F7BAD` |
| On primary | `text-primary-foreground` | `colors.primaryForeground` | `#FFFFFF` | `#15181E` |
| **Accent** — soft gold | `bg-accent` / `text-champagne` | `colors.accent` / `colors.champagne` | `#D4AF35` / `#E2C798` | `#CBAE4D` / `#D8BC8A` |
| Accent soft | `bg-accent-soft` | `colors.accentSoft` | `#E2C798` | `#554730` |
| On accent | `text-accent-foreground` | `colors.accentForeground` | `#382A00` | `#F3E6C2` |
| Background (app canvas) | `bg-background` | `colors.background` | `#F8FAFC` | `#191C24` |
| Surface / card | `bg-card` | `colors.card` | `#FFFFFF` | `#20242C` |
| Foreground (text) | `text-foreground` | `colors.foreground` | `#1B242C` | `#D3D9DE` |
| Muted (neutral fills) | `bg-muted` | `colors.muted` | `#ECF2F9` | `#2A2E37` |
| Muted foreground (captions) | `text-muted-foreground` | `colors.mutedForeground` | `#505F6D` | `#95A1AC` |
| Border / divider | `border-border` | `colors.border` | `#DBE6F0` | `#363B45` |
| Input border | `border-input` | `colors.input` | `#C8D7E5` | `#3F4550` |
| Focus ring | — | `colors.ring` | `#0DA2E7` | `#29A6E0` |

Gold is the **only** warm accent — promo numerals, VIP / star markers, decorative sparkles. Never for
interactive affordances (those are the brand tone).

In dark mode `primary` becomes a *bright* fill, so `primaryForeground` flips to a dark ink: white
icons on `bg-primary` are wrong — use `colors.primaryForeground`.

### 1.3 Raw brand ramp `aura`

Exposed for tints, badges and gradient stops — `bg-aura-100`, `text-aura-600`, `colors.aura900`, …
It follows the selected tone; the dark-mode ramp is re-tinted (steps 50–300 become deep tints) so a
`bg-aura-100` chip never glares on a dark card. Azure · light:

| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 900 |
|----|-----|-----|-----|-----|-----|-----|-----|-----|
| `#F0F9FF` | `#E0F2FE` | `#BAE6FD` | `#7DD3FC` | `#38BDF8` | `#0EA5E9` | `#0284C7` | `#0369A1` | `#082F49` |

`900` is the deep brand ink — hero cards, scrims, avatar rings; it stays dark in both modes.

### 1.4 Semantic status

| Role | Class | Soft bg | Light | Dark |
|------|-------|---------|-------|------|
| Success | `text-success` | `bg-success-soft` | `#157E3C` / `#DFFBE9` | `#358D55` / `#1E3828` |
| Warning | `text-warning` | `bg-warning-soft` | `#B35609` / `#FEF3C8` | `#B16425` / `#3D2F1F` |
| Danger | `text-destructive` | `bg-destructive-soft` | `#BA1C1C` / `#FEE1E1` | `#B63535` / `#3F2222` |
| Info | `text-info` | `bg-info-soft` | `#088EAF` / `#DBF5FB` | `#27849B` / `#20363C` |

Appointment status pills always render **leading dot + label** — never colour alone.
Chart colours `chart-1…6` mirror the web (design.md §13) and are available as classes and `colors.chartN`.

### 1.5 Gradients — [`src/theme/gradients.ts`](../src/theme/gradients.ts)

Presets are **built from the active palette** (`buildGradients(palette)`), so they follow the tone and
the mode. Stops below are described by role, not by hex.

| Preset | Stops | Use |
|--------|-------|-----|
| `hero` | `aura-900 → primary-strong` | promo / hero card background (dark in both modes) |
| `brand` | `aura-400 → primary → primary-strong` | primary CTA fills, active chips |
| `wash` | `aura-50 → background` | category tile / soft section backgrounds |
| `luxe` | `primary → aura-400 → accent-soft` | card top accent bar |
| `gold` | `champagne → accent` | gold badges |
| `imageScrim` | brand ink, `0 → .08 → .82` | bottom scrim on service images |
| `fadeDown` | transparent → `background` | photo backdrop melting into the canvas |
| `success` | `success-soft → success` | success rings |
| `shimmer` | card `0 → .6 → 0` | skeleton sweep |

RN cannot paint gradient **text** — the mockup's gradient headline becomes flat `text-champagne`.

---

## 2. Typography

Fonts loaded in [`src/hooks/useAppFonts.ts`](../src/hooks/useAppFonts.ts); families mapped in
`tailwind.config.js` and `colors`/`fonts` in `src/theme`.

| Role | Family | NativeWind class |
|------|--------|------------------|
| Display / brand / numerals (`Aura`, promo figure) | **Plus Jakarta Sans** 700 / 800 | `font-display`, `font-display-bold` |
| Latin UI & body | Plus Jakarta Sans 400–700 | `font-sans` … `font-sans-bold` |
| **Lao** UI & body (all `t(...)` content) | **Noto Sans Lao** 400–700 | `font-lao` … `font-lao-bold` |
| Lao serif (rare, decorative only) | Noto Serif Lao 600 | `font-lao-serif` |

Playfair Display was **removed** from mobile (2026-09-06). Display = Plus Jakarta, matching the
mockup's `font-display`. `@expo-google-fonts/playfair-display` is still in `package.json` but
unused — safe to drop on the next dependency pass.

### 2.1 Type ramp — [`src/components/ui/Text.tsx`](../src/components/ui/Text.tsx)

Use `<Text variant="…">`, never a raw RN `<Text>`. Leading is baked per step.

| `variant` | Size / leading | Weight | Use |
|-----------|----------------|--------|-----|
| `display` | 34 / 40 | lao-bold | rare hero numerals |
| `title` | 24 / 32 | lao-bold | screen title |
| `heading` | 18 / 24 | lao-semibold | section header |
| `subtitle` | 16 / 24 | lao | secondary line under a title |
| `body` | 16 / 24 | lao | body copy, min for reading |
| `label` | 15 / 20 | lao-medium | list item titles, buttons |
| `caption` | 13 / 18 | lao | captions, meta, overlines |

Micro text (`text-[9px]`–`text-[11px]`) from the mockup is allowed **only** for dense card
chrome (price overline, badge, count) — never for a sentence the user must read.

### 2.2 Numerals

Prices, durations, ratings, times → `font-display` / `font-lao-bold` on the numeric run.
`PriceText` and `formatLAK` already handle currency; do not hand-format `₭`.

### 2.3 Lao / Thai rule (non-negotiable)

- No `letter-spacing`, no `text-transform`, no `uppercase` — on any Lao or Thai string.
- The mockup's `uppercase tracking-wider` brand pill is rendered as plain Lao text in RN.
- After editing `src/i18n/locales/lo.json`, scan for look-alike Thai characters (U+0E01–U+0E7F);
  keep Lao in U+0E80–U+0EFF.

---

## 3. Spacing, Radius, Elevation, Motion

### 3.1 Spacing (Tailwind scale, px)

Screen gutter **20** (`px-5`). Card inner padding **12–16**. Gap between stacked cards **12**.
Section break (before a `SectionHeader`) **32** (`mt-8`). Content bottom padding **32** + safe area.
Grid gutters: category grid `rowGap 16` + `justify-between`; popular grid `rowGap 12` + `justify-between`.

### 3.2 Radius — `theme.radius` / `rounded-*`

| Token | px | Use |
|-------|----|-----|
| `rounded-lg` | 14 | small controls, chips |
| `rounded-xl` | 20 | buttons, search field inner icon |
| `rounded-2xl` | 24 | cards, category tiles, search field |
| `rounded-3xl` | 28 | hero / promo card |
| `rounded-full` | 999 | avatar, dots, pills, icon buttons |

### 3.3 Elevation — `theme.shadow` (plum-tinted `#2E1065`, low opacity)

| Token | Use |
|-------|-----|
| `shadow.xs` | icon buttons, search field, resting chips, category tile |
| `shadow.card` | default surface — service cards, promo, next-appointment |
| `shadow.lg` | sheets / bottom CTA bars |
| `shadow.primary` | brand-tinted glow under a primary CTA (`colors.primary`, use sparingly) |

No neumorphic insets. Borders do the light-separation work; shadow only lifts.

### 3.4 Motion — `theme.motion`

Press: scale `0.97`, in `90ms` / out `160ms` spring. Entrance: fade + 10px rise, `320ms`,
stagger `30ms × index` capped `~250ms` (`<AnimatedEntrance index={i}>`). Every pressable is a
`<Touchable>` (transform-only feedback + light haptic + respects Reduce Motion).
Count/figure elements keep an entrance **and** an interaction motion.

---

## 4. Iconography

- **Ionicons** (`@expo/vector-icons`) only. No emoji as UI. No mixed icon sets.
- Sizes: 16 inline with text · 19–22 in icon buttons / tiles · 13 chevron affordance.
- Color via `colors.*` token, never a literal. Decorative icons get no `accessibilityLabel`;
  icon-only buttons **must** have one (e.g. the notification bell → `t('home.notifications')`).
- Home mapping: `search`, `options-outline` (filter), `notifications-outline`, `sparkles`
  (categories + promo badge, in champagne), `time` (next appointment), `chevron-forward`.

---

## 5. Components (from the reference artboard)

### 5.1 Home header  (`UserProfileAndHeader`)
Scrolls with content (no sticky glass bar). `paddingTop = insets.top + 8`.
- Left: greeting row = pulsing **success** dot (`h-2 w-2`) + `caption` greeting; then brand row =
  `Aura` in `font-display-bold text-2xl` + a pill `bg-aura-100 border-aura-200` with `t('home.brandTag')`.
- Right: bell icon-button (`h-10 w-10 rounded-full bg-card border-border`, `shadow.xs`) with a
  `bg-destructive` dot ringed by `border-card`; then avatar (`bg-primary-subtle`, initial in `text-primary`).

### 5.2 Search field  (`SearchBar`)
A **pressable** `<Touchable haptic="none">`, not a live `TextInput` — tapping routes to
`ServiceList`. `rounded-2xl bg-card border-border`, `shadow.xs`, `search` icon + `caption`
placeholder (`t('home.searchPlaceholder')`) + a `bg-muted` rounded square holding `options-outline`.

### 5.3 Hero / promo card  (`HeroPromoBanner`)
`rounded-3xl overflow-hidden`, `Gradient preset="hero"` as a `fill` layer, two translucent
`bg-white/10` blobs for depth, `shadow.card`. Content padding 20, gap 12:
1. Row: badge pill (`bg-white/10 border-white/10`, champagne `sparkles` + `t('home.promoBadge')`)
   ‖ 3 progress dots (active `w-4 bg-white`, rest `w-1.5 bg-white/40`).
2. `promoTitle` (`lao-semibold text-white`) → `promoDiscount` (`font-display-bold text-2xl text-champagne`)
   → `promoSubtitle` (`text-white/70 text-xs`).
3. Row: white CTA pill (`bg-white`, `promoCta` in `text-aura-900` + chevron) ‖ `promoValid` (`text-white/60`).

Whole card is one `<Touchable>` → `ServiceList`.

### 5.4 Next-appointment glance
Not in the mockup — kept because it is genuinely useful. `rounded-2xl bg-card border-border`
`shadow.card`, row: `bg-success-soft` icon tile (`time`, `colors.success`) + service name +
`D MMM · HH:mm` + trailing chevron. Only rendered when `nextAppt` exists.

### 5.5 `SectionHeader`
`mt-8 px-5`, row: `heading` title (optional trailing `bg-primary` pulse dot) ‖ optional action =
`<Touchable>` with `text-primary` label + small chevron. Used for Categories (`ທັງໝົດ (n)`) and
Popular (`common.seeAll`, `pulse`).

### 5.6 Category grid tile  (`ServiceCategories`)
4-up: container `flex-row flex-wrap justify-between`, `rowGap 16`; each cell `width: '22%'`.
Cell = `<Touchable>` column: square tile (`aspectRatio 1`, `rounded-2xl border-border`,
`Gradient preset="wash"` fill, centered `sparkles` in `colors.primary`, `shadow.xs`) → `label`
name (`text-[11px]`, 1 line) → `caption` count (`text-[9px]`). Tap → `ServiceList({ categoryId })`.
Icon is uniform by design — do not tint per category (data-driven categories won't map cleanly).

### 5.7 Popular service card  ([`PopularServiceCard.tsx`](../src/features/catalog/PopularServiceCard.tsx))
2-up: container `flex-row flex-wrap justify-between`, `rowGap 12`; each `width: '48%'`.
Card = `<Touchable>` (`rounded-2xl bg-card border-border overflow-hidden`, `shadow.card`):
- Image `aspectRatio 4/3` (fallback `sparkles-outline` on `bg-muted`), `imageScrim` bottom 72px,
  `bg-primary` "ຍອດນິຍົມ" badge top-left (`text-[9px]`).
- Body p-12: overline `categoryName · {mins}` (`caption text-[10px]`) → name (`font-lao-bold
  text-[13px]`, 1 line) → description (`caption text-[10px]`, 2 lines).
- Footer: `border-t border-border pt-2`, price block (`caption` "ລາຄາ" + `PriceText text-[13px]`) ‖
  `bg-primary-subtle` "ຈອງ" pill (`text-primary` + chevron).

Rating / review count are **omitted** — `ServiceListItem` carries no rating data. Add only when
the API provides it.

> The vertical row card [`ServiceCard.tsx`](../src/features/catalog/ServiceCard.tsx) is unchanged
> and still used by `ServiceList`. `PopularServiceCard` is the 2-column variant for Home only.

### 5.8 Bottom navigation
The mockup's `FloatingBottomNavBar` is provided by React Navigation's bottom-tab bar
(`src/navigation`), not re-implemented on the screen. Match its visual language there: `bg-card/90`
blur, `border-border` hairline top, active item `text-primary` with a `bg-primary` dot, inactive
`text-muted-foreground`, labels in `font-lao` `text-[11px]`, respect `insets.bottom`.

---

## 6. Home screen anatomy (build order)

`ScrollView` (`paddingTop insets.top + 8`, `paddingBottom 32`, hidden indicator, `RefreshControl`
tinted `colors.primary`, `progressViewOffset insets.top`). Children, each in `<AnimatedEntrance
index={n}>`:

0. Header (§5.1) · 1. Search (§5.2) · 2. Hero promo (§5.3) · 3. Next-appointment (§5.4, conditional)
· Categories `SectionHeader` + grid (§5.5–5.6) · Popular `SectionHeader pulse` + grid (§5.7).

Loading: category grid → four `h-[96px] w-[22%] rounded-2xl` skeletons; popular grid → four
`h-[212px] w-[48%] rounded-2xl` skeletons. Empty popular → `<EmptyState title={t('service.empty')} />`.

---

## 7. Accessibility & touch

- Every interactive target ≥ 44×44 (icon buttons are `h-10 w-10` + `hitSlop`).
- Icon-only controls carry `accessibilityRole` + `accessibilityLabel`.
- Text contrast ≥ 4.5:1 (see §1.1); never rely on colour alone for status.
- Safe areas: top via `insets.top`; bottom handled by the tab bar. No content under the notch.
- All feedback animated (no 0ms state flips); honour Reduce Motion (handled by `Touchable` /
  `AnimatedEntrance` / `Skeleton`).
- Never disable pinch-zoom; never bake text into an image.

---

## 8. i18n keys added for Home

`home.brandTag`, `home.notifications`, `home.searchPlaceholder` (updated), `home.promoBadge`,
`home.promoTitle`, `home.promoDiscount`, `home.promoSubtitle`, `home.promoCta`, `home.promoValid`,
`service.bookShort`. Keep `lo.json` and `en.json` in lockstep; run the Thai-character scan on `lo.json`.

---

## 9. Deviations from the mockup (intentional)

| Mockup | Mobile | Why |
|--------|--------|-----|
| Sticky iOS status bar + Dynamic Island frame | native status bar, `insets.top` | it's a device chrome mock, not UI |
| `uppercase tracking-wider` brand pill | plain Lao text | §2.3 Lao rule |
| Gradient-filled headline text | flat `text-champagne` | RN can't gradient text |
| Rating pill `★ 4.9 (140+)` on cards | omitted | no rating field in `ServiceListItem` |
| Per-category pastel tints | one `wash` gradient + primary icon | categories are data-driven |
| Standalone promo carousel below hero | folded into the single hero card | mockup has one promo surface |
| In-page bottom nav bar | React Navigation tab bar | platform navigation |

---

## 10. Change log

- **2026-09-06** — Rebrand azure→amethyst. New `aura` ramp + `champagne`. Display font
  Playfair→Plus Jakarta (added 800). Plum-tinted shadows. `HomeScreen` rebuilt to the Aura
  artboard; new `PopularServiceCard`. This document created.
