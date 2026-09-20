# `design-mobile-service-search.md` — ໜ້າ "ຄົ້ນຫາບໍລິການ" (Mobile App)

> Page-override spec for `apps/mobile` — extends `docs/design.md` (Sections 1–2, 6–7, 10, 12) and the
> mobile token mirror in `apps/mobile/tailwind.config.js` + `apps/mobile/src/theme/`.
> Screen today: `src/screens/catalog/ServiceListScreen.tsx` (route `ServiceList`).
> Theme is **unchanged** — "Neo-Luxury Wellness", amethyst `#7C3AED` + champagne `#DFBA98`,
> Plus Jakarta Sans + Noto Sans Lao. The reference HTML mockup (indigo/rose/gold) is **re-tokenised**
> to the Aura ramp below, not copied.
>
> Method: produced with `ui-ux-pro-max` (`--domain ux` search: *Search / No Results*, *Search /
> Autocomplete*, *Feedback / Empty States*, *Forms / Mobile Keyboards*). No `react-native` stack row
> matched "filter bottom sheet" — filter-sheet guidance below is Aura convention + `Sheet` primitive.

---

## 0. TL;DR — what this screen becomes

`ServiceListScreen` is a thin category-filtered list today. It becomes a real **discovery surface**:

| Zone | Today | New |
|------|-------|-----|
| Header | plain `ScreenHeader` + back | sticky **glass** header, back · centred title + Latin overline · **filter** button with active-dot |
| Search | pill `bg-muted`, clear `✕` | `rounded-2xl` card field, focus ring, clear `✕`, submit → history; typeahead suggestions |
| Category | horizontal `Chip` row (All + N) | same, + **icon slot**, + **active-filter chip bar** underneath (removable) |
| Result meta | — | row: "ຜົນການຄົ້ນຫາ" · **animated count pill** · **sort** trigger |
| Card | `ServiceCard` row (76px thumb, name·cat·min, price, chevron) | `ServiceResultCard` — 112px image, **save heart**, **rating**, category·duration pill, description, price block + **ຈอง CTA**, optional ribbon / `HOT` / featured border |
| Empty query | (auto-focuses input, blank list) | **landing**: recent searches · trending terms · category grid |
| Zero results | generic `EmptyState` "ຍັງບໍ່ມີບໍລິການ" | distinct "ບໍ່ພົບ …" + suggestions + **ລ້າງຕົວກັ່ນຕອງ** |
| Error | **none** (bug — no `isError` branch) | `ErrorView` + retry |
| Pagination | silent `fetchNextPage` | footer spinner + "ສະແດງໝົດແລ້ວ" end cap |
| Extra | — | pull-to-refresh · scroll-to-top FAB |

Renamed concept: route stays `ServiceList` (no nav churn) but the screen is a **search** screen —
keep the file or rename to `SearchScreen.tsx`; update the `AppStackParamList` comment only.

---

## 1. System analysis

### 1.1 What exists

- **Data** — `GET /catalog/services` (`catalog.service.ts::listServices`). Query
  (`serviceListQuerySchema`): `branchId`, `categoryId`, `q` (1–120, `name contains`, case-insensitive),
  `popular` (flag → `orderBy appointments._count desc`), `page`, `pageSize`. Default order `name asc`.
- **Item** — `ServiceListItem`: `id, name, description, categoryId, categoryName, branchId, price,
  durationMinutes, imageUrl, requireDeposit, depositAmount`. **No** rating / reviewCount / popularity /
  badge / favourite fields.
- **Categories** — `GET /catalog/categories` → `{ id, name, imageUrl, serviceCount }`.
- **Client** — `useServices(filters)` infinite query (`PAGE_SIZE 12`), `useCategories()`,
  `useDebounced(raw, 350)`. `ServiceListScreen` wires `q` + `categoryId` only; never sets `popular`.
- **Primitives available** — `Sheet`, `Segmented`, `Chip`, `Badge`, `Input`, `RatingStars`,
  `PressableCard` / `Card`, `Touchable` (haptic + scale, respects Reduce Motion),
  `AnimatedEntrance` (stagger fade+rise), `Gradient` (`brand|hero|wash|gold|imageScrim|shimmer`),
  `GlassView` (iOS blur, Android ~opaque), `Skeleton`, `EmptyState` / `ErrorView`, `PriceText`,
  `formatLAK`, `useReducedMotion`, `haptics`, `ui.store` (zustand + AsyncStorage persist pattern).

### 1.2 Gaps

| # | Gap | Layer | Priority |
|---|-----|-------|----------|
| G1 | No result count shown | FE | P1 |
| G2 | No sort control (only `popular` flag wired nowhere) | FE (+ BE for price sort) | P1 |
| G3 | No error state (crash-silent on network fail) | FE | P1 |
| G4 | Single flat card — no rating, no image weight, no CTA, no deposit hint | FE + BE (rating/popularity) | P1 |
| G5 | No filter beyond category (price / duration / deposit / branch) | FE + BE (`priceMin/Max`, `durationMax`) | P2 |
| G6 | No recent-search history | FE (new store) | P2 |
| G7 | No trending / suggested terms, no typeahead | FE (+ BE optional `…/suggest`) | P2 |
| G8 | Empty-query state is a blank list | FE | P2 |
| G9 | No quick-book from result (must open detail) | FE (data already sufficient) | P2 |
| G10 | No favourite / save | FE local v1 (+ BE later) | P3 |
| G11 | No pull-to-refresh, no pagination feedback, no scroll-to-top | FE | P3 |
| G12 | Count / filter changes not announced to screen readers | FE (a11y) | P2 |
| G13 | `q` not trimmed to schema min (empty string still keyed) | FE | P3 |

---

## 2. Information architecture

```
SafeAreaView(edges=['top'])  bg-background
├─ Sticky header  (GlassView, hairline bottom border fades in when scrollY > 4)
│   ├─ Row 1: [back ⌀40 card btn]   [ຄົ້ນຫາ  /  AURA BEAUTY & CLINIC]   [filter ⌀40 btn ·dot]
│   ├─ Row 2: Search field  (rounded-2xl card, 52h)  — icon · TextInput · (clear ✕)
│   ├─ Row 3: Category chips  (horizontal, no scrollbar)  All + categories, icon slot
│   └─ Row 4: Active-filter bar  (only if filters set) — removable chips + "ລ້າງ"
│
├─ Body
│   ├─ if q == '' && no filters →  <SearchLanding>
│   │     · "ຄົ້ນຫາລ່າສຸດ"  removable chips + "ລ້າງທັງໝົດ"
│   │     · "ກຳລັງນິຍົມ"    trend chips
│   │     · "ຄົ້ນຫາຕາມໝວດ"  4-col category grid (Home tile pattern)
│   ├─ else →  results
│   │     ├─ Result-meta row:  "ຜົນການຄົ້ນຫາ"  <CountPill "ພົບ 18">      [ຈັດລຽງ: ຍອດນິຍົມ ⌄]
│   │     ├─ isLoading  →  5 × <ResultCardSkeleton>
│   │     ├─ isError    →  <ErrorView onRetry>
│   │     ├─ items == 0 →  <NoResults q={q} onClearFilters>
│   │     └─ FlatList<ServiceResultCard>  (stagger entrance)
│   │           footer: spinner while fetchingNextPage · "— ສະແດງໝົດແລ້ວ —" when !hasNextPage
│   └─ Scroll-to-top FAB  (glass ⌀44, appears after ~600px, sits above tab bar)
│
└─ (tab bar owned by TabsNavigator — this screen is pushed on AppStack, full-height)
```

Sticky behaviour: header rows 1–3 are **outside** the results `FlatList` (as today) so they never
scroll away; only the active-filter bar + body scroll region change height. The glass tint +
border-appear-on-scroll is the only new chrome behaviour.

---

## 3. Visual design — token map

Reference-mockup colour → Aura token (never ship the mockup hex):

| Mockup | Role | Aura token |
|--------|------|-----------|
| `#6366f1 / #4f46e5` indigo | primary / CTA / active chip | `primary` `#7C3AED` / gradient `brand` |
| `#f4f3ff / #ebe8ff` | tinted fills, count pill, category pill | `primary-subtle` `#F2EDFE` / `aura-100` |
| `#f59e0b` gold | rating star, "ຍອດນິຍົມ" ribbon | `accent` `#DFBA98` + gradient `gold` |
| `#f43f5e` rose | save-active heart, `HOT` pill | `destructive` `#E11D48` — **sparingly** |
| `#f8f9fc / #F7F8FC` | app canvas | `background` `#FAF9FC` |
| `#ffffff` | card | `card` `#FFFFFF` |
| slate-900 / slate-400 | text / muted | `foreground` `#1E293B` / `muted-foreground` `#64748B` |
| `border-slate-200/70` | hairline | `border` `#E7E3F1` |
| `shadow-card` | card elevation | `theme/index.ts` `shadow.card` (2E1065 tint, y4 blur12 α.07) |
| `rounded-3xl` (28) | card radius | `rounded-3xl` (28) |
| `rounded-2xl` (24) | search field, thumb, chip-icon | `rounded-2xl` (24) / thumb `rounded-2xl` |
| glass header `blur(20)` | sticky header | `GlassView intensity={40}` + `glassBorder.bottom` |

**Typography** — all body/labels via `<Text variant>` (`font-lao*`). Latin-only strings
(`AURA BEAUTY & CLINIC`, `HOT`, `NEW`) **may** use `uppercase` + `tracking-wider`. Any Lao string
(`ໃໝ່`, `ຍອດນິຍົມ`, headings, chips) — **never** uppercase / letter-spacing
(`lao-typography-no-tracking`). Ribbon/badge Lao text stays normal case, normal tracking.

**Spacing** — card padding `p-3.5` (14), gap `gap-3.5`; screen gutter `px-5` (20); chip gap `8`;
result list `contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 12 }}` (as today).

---

## 4. Component spec

### 4.1 `SearchHeader` (new, screen-local)

- Container: `GlassView` wrapper, `paddingTop: insets.top`, `pb-3`, `px-5`; bottom `glassBorder.bottom`
  with `opacity` animated 0→1 on `scrollY > 4` (Reduce Motion → show immediately).
- **Back**: `Touchable` `h-10 w-10 rounded-2xl bg-card border border-border` `shadow.xs`,
  `Ionicons chevron-back 22 colors.foreground`, `accessibilityLabel={t('common.back')}`, `pressScale 0.9`.
- **Title block** (centre): `Text variant="heading"` `ຄົ້ນຫາ`; under it `Text` `font-sans-medium
  text-[10px] text-primary` `AURA BEAUTY & CLINIC` — Latin, `className="uppercase tracking-[1.5px]"`.
- **Filter**: `Touchable` same shell as back; `Ionicons options-outline 20`; when
  `activeFilterCount > 0` show `absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary
  border border-card`. `accessibilityLabel={t('search.filters')}`,
  `accessibilityValue={{ text: activeFilterCount ? t('search.filtersApplied',{count}) : undefined }}`.

### 4.2 `SearchField` (new, screen-local — do not reuse `Input`, this is a search bar not a form field)

- `View` `h-[52px] flex-row items-center gap-2.5 rounded-2xl border bg-card px-3.5` `shadow.xs`;
  `borderColor` = `focused ? primary : border`; on focus also apply `shadow.primary` at ~0.12 opacity
  (or a 2px `primary-subtle` outer ring via wrapper). 150–200ms `ease-out`.
- Left `Ionicons search 18` (`focused ? primary : mutedForeground`).
- `TextInput` `flex-1 font-lao text-base text-foreground`, `placeholder={t('home.searchPlaceholder')}`,
  `placeholderTextColor mutedForeground`, `selectionColor primary`, `returnKeyType="search"`,
  `autoCapitalize="none"`, `autoCorrect={false}`, `clearButtonMode="never"` (custom clear),
  `onSubmitEditing` → commit to history + `Keyboard.dismiss()`.
- Right: when `raw.length > 0` → `Touchable` `Ionicons close-circle 18 mutedForeground`
  `accessibilityLabel={t('common.close')}` `hitSlop 8`; else nothing (no mic — not wired).
- `autoFocus` only when arriving with no `categoryId` param (as today).

### 4.3 `CategoryChips` (extend existing `Chip`)

- Add optional `icon?: keyof typeof Ionicons.glyphMap` + `leading?: ReactNode` to `ChipProps`.
  Idle chip gets `bg-card border border-border` (not `bg-muted`) to match card system;
  keep active = `Gradient brand` fill + `text-primary-foreground`. Icon 14, colour follows text.
- Data: `[{ id: undefined, name: t('category.all'), icon: 'grid-outline' }, ...categories]`.
  `FlatList horizontal`, `showsHorizontalScrollIndicator={false}`, `contentContainerStyle={{ gap: 8,
  paddingRight: 8 }}`. Selected → `AccessibilityInfo.announceForAccessibility` the new count after fetch.

### 4.4 `ActiveFilterBar` (new)

- Renders only when `chips.length > 0`. `View flex-row flex-wrap gap-2 px-5 pb-2`.
- Each chip: `Touchable` `flex-row items-center gap-1 rounded-full bg-primary-subtle px-3 py-1.5`,
  `Text variant="caption" font-lao-medium text-primary-strong`, trailing `Ionicons close 12
  colors.primaryStrong`. Tapping removes that one filter. `accessibilityLabel={t('search.removeFilter',
  { label })}`, min touch target 40 via `hitSlop`.
- Trailing text button `ລ້າງ` (`Text variant="label" text-primary text-[13px]`) clears all.
- Chip labels: price → `formatLAK(min)}–${formatLAK(max)` (or `≤ ${formatLAK(max)}`),
  duration → `t('search.durationUnder',{count})`, deposit → `t('search.depositOnly')`,
  sort ≠ default → `t('search.sortLabel') + ': ' + sortLabel`.

### 4.5 `ResultMetaRow` (new)

- `View flex-row items-center justify-between px-5 pt-3 pb-1`.
- Left: `Text variant="label" font-lao-semibold text-[13px]` `ຜົນການຄົ້ນຫາ` + `<CountPill>`.
- Right: `Touchable flex-row items-center gap-1` → opens `SortSheet`;
  `Text variant="caption" font-lao-medium` `t('search.sortLabel') + ': ' + currentSortLabel`,
  `Ionicons chevron-down 13 mutedForeground`. `accessibilityRole="button"`.

### 4.6 `CountPill` (new — obeys `cardcount-animation-convention`)

- `Animated.View` `rounded-full bg-primary-subtle px-2 py-0.5`; `Text variant="caption"
  font-lao-semibold text-[11px] text-primary-strong` `t('search.found', { count })`.
- **Entrance**: fade+rise with the header (`AnimatedEntrance index={0}`).
- **Interaction / value change**: on `count` change, scale `1.08 → 1` + opacity `0.4 → 1` over 180ms
  `ease-out` (`useReducedMotion` → set final immediately). Also
  `AccessibilityInfo.announceForAccessibility(t('search.found',{count}))`.

### 4.7 `ServiceResultCard` (new — the centrepiece; DNA from `PopularServiceCard` + mockup)

```
PressableCard  rounded-3xl border border-border  p-3.5  shadow.card
  variant "featured" → borderWidth 2 borderColor primary  (or left bar: border-l-4 border-l-primary)
├─ Row  flex-row gap-3.5
│  ├─ Thumb  112×112  rounded-2xl overflow-hidden bg-muted
│  │   ├─ <Image cover>  |  fallback <Ionicons sparkles-outline 24 mutedForeground>
│  │   ├─ Save heart  (top-right, ⌀28, GlassView circle)  ♥  — outline mutedFg / filled destructive when saved
│  │   └─ Corner badge (optional, mutually exclusive):
│  │        · ribbon  gradient `gold`, rotate -45, "ຍອດນິຍົມ"  text-[10px] font-lao-bold text-accent-foreground
│  │        · pill    top-left  bg-destructive  "HOT"  text-[9px] font-sans-bold text-white  (Latin → tracking ok)
│  │        · pill    top-left  bg-primary      "ໃໝ່"  text-[9px] font-lao-bold  (Lao → no tracking)
│  └─ Body  flex-1 justify-between min-w-0
│     ├─ Top
│     │  ├─ Row  flex-row items-center justify-between gap-1
│     │  │  ├─ category·duration pill  bg-primary-subtle px-2 py-0.5 rounded-md
│     │  │  │     Text caption text-[11px] text-primary  `${categoryName} · ${t('common.minutesShort',{count:duration})}`
│     │  │  └─ rating cluster (if rating > 0)  flex-row items-center gap-0.5
│     │  │        <Ionicons star 12 colors.accent>  Text label text-[12px] text-foreground `{rating.toFixed(1)}`
│     │  │        Text caption text-[10px] `({reviewCount}{reviewCount>=100?'+':''})`
│     │  ├─ Title   Text font-lao-bold text-[15px] leading-5 text-foreground  numberOfLines={1}
│     │  └─ Desc    Text variant="caption" text-[12px] numberOfLines={1}   (skip if null)
│     └─ Footer  flex-row items-center justify-between border-t border-border pt-2 mt-2
│        ├─ Price block
│        │    Text caption text-[10px] leading-none  `t('common.from')` (only when requireDeposit or "from" semantics)
│        │    <PriceText amount={price} className="text-[14px]" />
│        │    if requireDeposit → Text caption text-[10px] text-accent-foreground  `t('service.deposit')`
│        └─ CTA  Touchable  flex-row items-center gap-1 rounded-xl bg-primary px-3.5 py-1.5  shadow.primary(sm)
│              Text font-lao-semibold text-[12px] text-primary-foreground  `t('service.bookShort')`
│              (featured variant → Gradient `brand` fill instead of flat)
```

- Whole card `onPress` → `navigation.navigate('ServiceDetail', { serviceId })`.
- CTA `onPress` (stopPropagation) → `startDraft({ mode:'create', branchId: DEFAULT_BRANCH_ID,
  serviceId, serviceName:name, price, durationMinutes })` then `navigation.navigate('WizardService')`
  — mirrors `ServiceDetailScreen.onBook`; **no backend needed**, all fields are on `ServiceListItem`.
- Save heart `onPress` (stopPropagation) → `favorites.store` toggle + `haptics.select()`.
  `accessibilityLabel={saved ? t('search.saved') : t('search.save')}`,
  `accessibilityState={{ selected: saved }}`.
- `accessibilityLabel` for the card = `name` (rating/price are child nodes, still reachable).
- Entrance via `AnimatedEntrance index={index}` (already the list pattern).
- `rating` / `reviewCount` / `badge` come from **backend additions §7**; until then render card
  without the rating cluster + ribbon (graceful — all optional).

### 4.8 `ResultCardSkeleton` (new)

`View flex-row gap-3.5 p-3.5 rounded-3xl border border-border bg-card`:
`Skeleton h-28 w-28 rounded-2xl` + right column `Skeleton h-3 w-24` / `h-4 w-40` / `h-3 w-full` /
footer `h-4 w-20` + `h-7 w-16 rounded-xl`. Render 5 while `isLoading`.

### 4.9 `SearchFilterSheet` (new — wraps `Sheet`)

`Sheet open title={t('search.filters')}` with scrollable body + sticky footer actions:

| Group | Control | Data source |
|-------|---------|-------------|
| ໝວດໝູ່ | wrap of `Chip` (single-select, incl. "ທັງໝົດ") | `useCategories()` |
| ຊ່ວງລາຄາ `t('search.priceRange')` | 2-thumb slider **or** preset `Chip`s (`≤150k`, `150–300k`, `300–500k`, `500k+`) | BE `priceMin/priceMax` (§7) |
| ໄລຍະເວລາ `t('search.duration')` | `Segmented` / `Chip`s: ໃດກໍ່ໄດ້ · ≤30 · ≤60 · ≤90 ນາທີ | BE `durationMax` (§7) |
| ມັດຈຳ | `Segmented` on/off — `t('search.depositOnly')` | client filter on `requireDeposit` (works today) |
| ຈັດລຽງ | `Segmented`: ຍອດນິຍົມ · ຕາມຊື່ · ລາຄາ ↑ · ລາຄາ ↓ | `popular` today; price sort → BE `sort` (§7) |

- Footer: `Button variant="outline"` `t('search.clearAll')` (left) + `Button` primary
  `t('common.confirm')` (right, applies + closes). Live count preview optional:
  "`t('search.found',{count: previewTotal})`" above the footer (needs a `keepPreviousData` probe query).
- `activeFilterCount` = number of groups not at default → drives header dot + `ActiveFilterBar`.
- All groups have visible Lao `<label>` (design.md §10 — never placeholder-as-label).

### 4.10 `SortSheet` (new — lightweight)

`Sheet` with a single-select list (`ListSection` + `ListRow` with a trailing check) of the four sort
options. Or fold sort entirely into `SearchFilterSheet` and make `ResultMetaRow`'s right side open
that sheet scrolled to the sort group. Prefer the fold — one sheet, less surface.

### 4.11 `SearchLanding` (new — empty query, no filters)

`ScrollView` `px-5 pt-4 gap-7`:
1. **ຄົ້ນຫາລ່າສຸດ** `t('search.recent')` — only if history non-empty. Row of removable `Chip`s
   (tap = re-run search; long-press or trailing ✕ = remove one) + `ລ້າງທັງໝົດ` text button.
2. **ກຳລັງນິຍົມ** `t('search.trending')` — `Chip`s from BE `…/trending` **or** a static seed
   (`ນວດອະໂຣມາ`, `ຍ້ອມສີຜົມ`, `ເລັບເຈວ`, `ບຳລຸງຜິວໜ້າ`). Leading `Ionicons trending-up 12`.
3. **ຄົ້ນຫາຕາມໝວດ** `t('search.byCategory')` — 4-col grid reusing Home's category tile
   (`aspectRatio 1`, `Gradient wash`, `Ionicons sparkles 22 primary`, name + `servicesCount`).
   Tapping sets `categoryId` and exits the landing into results.

### 4.12 `NoResults` (new — query returned 0)

Centre stack (`items-center gap-4 px-10 py-14`):
`IconBubble search-outline` · `Text variant="body" text-center` `t('search.noResultsTitle',{ q })`
(quote the term) · `Text variant="caption" text-center` `t('search.noResultsHint')` ·
`Button fullWidth={false}` `t('search.clearFilters')` (only if filters set) ·
trending `Chip`s row. Never a bare "0".

### 4.13 `ScrollTopFab` (new)

`Animated` `GlassView` circle ⌀44, `absolute right-5`, `bottom: insets.bottom + 20`, `shadow.card`,
`Ionicons chevron-up 20 primary`. Opacity/scale in when `scrollY > 600`, out otherwise
(Reduce Motion → hard toggle). `onPress` → `flatListRef.scrollToOffset({ offset:0, animated:true })`.
`accessibilityLabel` = "ກັບຂຶ້ນເທິງ".

---

## 5. States

| State | Trigger | Render |
|-------|---------|--------|
| Landing | `q.trim()==='' && activeFilterCount===0` | `<SearchLanding>` |
| Loading (first) | `services.isLoading` | `ResultMetaRow` with skeleton count pill + 5 × `ResultCardSkeleton` |
| Loading (next page) | `services.isFetchingNextPage` | list + footer `ActivityIndicator color=primary` |
| Error | `services.isError` | `<ErrorView message={t('errors.generic')} onRetry={services.refetch} />` **(new branch)** |
| Empty result | `!isLoading && items.length===0` | `<NoResults q onClearFilters>` |
| Data | else | `FlatList<ServiceResultCard>` + end cap `Text variant="caption" text-center py-6` `t('search.endOfList')` when `!hasNextPage && items.length > PAGE_SIZE` |
| Refreshing | pull-to-refresh | `RefreshControl tintColor={colors.primary}` (mirror HomeScreen) |

---

## 6. Motion (design.md §6 — dial 4/10)

| Element | Motion |
|---------|--------|
| Header border | opacity 0→1, 150ms `ease-out`, at `scrollY > 4` |
| Search field focus | border-colour + ring 180ms `ease-out` |
| Category chip select | `Touchable` scale 0.95 (existing) + `haptics.select()` |
| Result cards first paint | `AnimatedEntrance` stagger 30ms/item, cap 250ms (existing) |
| `CountPill` value change | scale 1.08→1 + opacity 0.4→1, 180ms `ease-out` (`cardcount-animation-convention`) |
| Filter sheet | `Sheet` slide 200ms + scrim (existing) |
| Filter apply | `haptics.tapPrimary()` on confirm |
| Scroll-top FAB | opacity+scale 160ms |
| Reduce Motion | every item above → final state immediately, keep ≤120ms opacity only |

Animate `opacity` / `transform` only — never width/height (design.md §14).

---

## 7. Backend additions required

`packages/shared-types/src/catalog.schema.ts` + `apps/backend/src/modules/catalog/catalog.service.ts`:

1. **`serviceListQuerySchema`** — add:
   - `priceMin?: number >= 0`, `priceMax?: number > priceMin`
   - `durationMax?: number` (minutes)
   - `requireDeposit?: booleanFlag`
   - `sort?: 'popular' | 'name' | 'priceAsc' | 'priceDesc'` (default `'name'`; keep `popular` flag as
     alias for back-compat, or migrate callers)
2. **`ServiceListItem`** — add:
   - `rating: number` (0 when no reviews), `reviewCount: number`
   - `popular: boolean` (top-N by trailing-90-day `appointments._count`) **or** `bookingCount: number`
   - `badge: 'popular' | 'new' | 'hot' | null` (derive: `new` = `createdAt` < 30d, `hot` = high
     recent booking velocity, `popular` = top-N) — optional, card works without it
3. **`listServices`** — implement `priceMin/priceMax` (`price: { gte, lte }`), `durationMax`
   (`durationMinutes: { lte }`), `requireDeposit`, and `orderBy` for `priceAsc|priceDesc`; join review
   aggregate (`_avg.rating`, `_count`) — prefer a denormalised `Service.ratingAvg` / `ratingCount`
   updated on review write over a per-request aggregate (see `appointments-page-money` — avoid
   client/opportunistic aggregation debt).
4. **Favourites** (P3, or ship client-only v1):
   - `POST /catalog/services/:id/favorite`, `DELETE …`, `GET /me/favorites`
   - `favorited: boolean` on `ServiceListItem` when authed
   - v1 fallback: `favorites.store.ts` (zustand + AsyncStorage, `Set<string>` of ids) — offline-safe,
     migratable later. Mark clearly as local-only.
5. **Suggest** (P2, optional) — `GET /catalog/services/suggest?q=` → `{ services: {id,name}[],
   categories: {id,name}[] }`, capped 8, `name startsWith` then `contains`.
6. **Trending** (P2, optional) — `GET /catalog/trending` → `string[]` (top search terms or top
   category names); static config acceptable for v1.

Client `useServices` filter type + `qk.services` key extend accordingly; add `useServiceSuggest(q)`
(enabled when `q.length >= 2`, `keepPreviousData`).

---

## 8. Accessibility & i18n

- Every icon-only control (`back`, `filter`, `sort`, `save`, `clear`, `FAB`) → `accessibilityLabel`
  from an i18n key; `accessibilityRole="button"`.
- `CountPill` + category change → `AccessibilityInfo.announceForAccessibility` (the RN equivalent of
  `aria-live`, design.md §10).
- Save heart → `accessibilityState={{ selected }}`; sort/filter selected options →
  `accessibilityState={{ selected }}`.
- Touch targets ≥ 44×44 (chips already `min-h-[40]` + `hitSlop`; heart ⌀28 needs `hitSlop 10`).
- Keyboard: `returnKeyType="search"`, `keyboardDismissMode="on-drag"` on the list,
  numeric filter inputs `keyboardType="number-pad"`.
- Lao text: no `uppercase` / `letterSpacing` anywhere (`lao-typography-no-tracking`). Only the Latin
  overline + `HOT` / `NEW` badges may track.
- Contrast: `primary #7C3AED` on `#FFF` = 5.9:1; `primary-strong #5B21B6` on `primary-subtle
  #F2EDFE` ≈ 7:1; `muted-foreground #64748B` on card = 4.6:1 — all AA. Do not put caption text on
  `imageScrim` without the scrim.
- After editing `lo.json` run the Thai-lookalike scan (U+0E01–0E7F) — `lo-json-thai-contamination`.

### 8.1 New i18n keys (`search` namespace) — values need the U+0E01–0E7F scan before commit

| Key | `lo` | `en` |
|-----|------|------|
| `search.resultsHeader` | ຜົນການຄົ້ນຫາ | Results |
| `search.found` | ພົບ {{count}} ບໍລິການ | {{count}} services found |
| `search.sortLabel` | ຈັດລຽງ | Sort |
| `search.sort.popular` | ຍອດນິຍົມ | Popular |
| `search.sort.nameAsc` | ຕາມຊື່ | By name |
| `search.sort.priceAsc` | ລາຄາ ໜ້ອຍ→ຫຼາຍ | Price low→high |
| `search.sort.priceDesc` | ລາຄາ ຫຼາຍ→ໜ້ອຍ | Price high→low |
| `search.filters` | ຕົວກັ່ນຕອງ | Filters |
| `search.filtersApplied` | {{count}} ຕົວກັ່ນຕອງ | {{count}} filters |
| `search.clearAll` | ລ້າງທັງໝົດ | Clear all |
| `search.clearFilters` | ລ້າງຕົວກັ່ນຕອງ | Clear filters |
| `search.removeFilter` | ລຶບ {{label}} | Remove {{label}} |
| `search.priceRange` | ຊ່ວງລາຄາ | Price range |
| `search.duration` | ໄລຍະເວລາ | Duration |
| `search.durationAny` | ໃດກໍ່ໄດ້ | Any |
| `search.durationUnder` | ບໍ່ເກີນ {{count}} ນາທີ | Under {{count}} min |
| `search.depositOnly` | ສະເພາະທີ່ຕ້ອງວາງມັດຈຳ | Deposit required only |
| `search.recent` | ຄົ້ນຫາລ່າສຸດ | Recent searches |
| `search.trending` | ກຳລັງນິຍົມ | Trending |
| `search.byCategory` | ຄົ້ນຫາຕາມໝວດ | Browse by category |
| `search.noResultsTitle` | ບໍ່ພົບ “{{q}}” | No results for “{{q}}” |
| `search.noResultsHint` | ລອງໃຊ້ຄຳອື່ນ ຫຼື ລ້າງຕົວກັ່ນຕອງ | Try another term or clear filters |
| `search.endOfList` | ສະແດງໝົດແລ້ວ | End of list |
| `search.save` | ບັນທຶກ | Save |
| `search.saved` | ບັນທຶກແລ້ວ | Saved |
| `search.scrollTop` | ກັບຂຶ້ນເທິງ | Back to top |

Reuse existing: `common.search`, `common.back`, `common.close`, `common.confirm`, `common.from`,
`common.minutesShort`, `home.searchPlaceholder`, `category.all`, `category.servicesCount`,
`service.bookShort`, `service.deposit`, `service.empty`, `errors.generic`.

---

## 9. New client files

```
src/screens/catalog/ServiceListScreen.tsx      ← refactor into the layout above (or → SearchScreen.tsx)
src/features/catalog/ServiceResultCard.tsx      ← new rich row card
src/features/catalog/SearchFilterSheet.tsx      ← new (wraps Sheet)
src/features/catalog/SearchLanding.tsx          ← new (recent + trending + category grid)
src/features/catalog/search.parts.tsx           ← SearchHeader, SearchField, ActiveFilterBar,
                                                   ResultMetaRow, CountPill, NoResults, ScrollTopFab,
                                                   ResultCardSkeleton  (co-located small parts)
src/features/catalog/useRecentSearches.ts       ← hook over…
src/store/search.store.ts                       ← zustand + AsyncStorage: recent[] (cap 8), favorites Set
src/features/catalog/catalog.api.ts             ← extend useServices filters + add useServiceSuggest,
                                                   useTrending (optional)
src/components/ui/Chip.tsx                       ← add optional icon/leading slot
src/i18n/locales/{lo,en}.json                   ← search.* namespace
```

---

## 10. Build order

1. **P1 / no-backend** — refactor screen to new IA; `ServiceResultCard` (no rating/badge yet);
   `ResultMetaRow` + `CountPill`; `isError` branch + `ResultCardSkeleton`; sort toggle
   (ຍອດນິຍົມ ⇄ ຕາມຊື່ via `popular` flag); pull-to-refresh + pagination footer; scroll-top FAB;
   quick-book CTA. i18n keys.
2. **P2 / frontend** — `SearchLanding` + `search.store` recent searches + trending seed;
   `NoResults`; `ActiveFilterBar`; `SearchFilterSheet` with deposit filter (client) + category;
   a11y announcements; `Chip` icon slot.
3. **P2 / backend** — `priceMin/Max`, `durationMax`, `sort` enum, `rating`/`reviewCount`/`popular`
   on `ServiceListItem`; wire price/duration groups + rating cluster + ribbon into the card;
   `useServiceSuggest` typeahead.
4. **P3** — favourites (local store → later endpoint); `HOT`/`ໃໝ່` badges from `badge` field;
   trending endpoint.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-09-06 | Initial spec. `ui-ux-pro-max --domain ux` (Search / Empty-state guidance) + Aura mobile tokens; reference HTML mockup re-tokenised to the amethyst/champagne ramp. |
| 2026-09-06 | **Implemented.** Backend: `serviceListQuerySchema` gained `sort`/`priceMin`/`priceMax`/`durationMax`/`requireDeposit`; `ServiceListItem` gained `rating`/`reviewCount`/`popular` (bounded aggregate, no migration). Frontend: new `ServiceResultCard`, `SearchFilterSheet`, `SearchLanding`, `search.parts.tsx` (SearchField/CountPill/ResultMetaRow/ActiveFilterBar/NoResults/ScrollTopFab/ResultCardSkeleton), `search.store.ts` (recent + local favourites), `Chip` icon slot, `search.*` i18n, `ServiceListScreen` rewritten to the IA above. Not done (documented future): favourites/suggest/trending endpoints, typeahead, denormalised `Service.ratingAvg`. All lint/typecheck/tests green (backend 19, incl. 3 new catalog cases). |
| 2026-09-06 | **Type-scale calibration to match the reference mockup.** Search input 16→14, header title `heading`→17 bold-ish, `Chip` gained `size="sm"` (12px) used for every filter/category/trending chip, meta-row + group + section labels 13→12, card: category pill / rating / description / price-label all pinned to 11–12 `font-lao-medium`, title 15 bold, price 15 bold; featured card = diagonal gold "ຍອດນິຍົມ" ribbon via a 2-layer shadow-safe wrapper. Nothing on the screen is bold above 17px now. |
| 2026-09-06 | **1:1 pass on the mockup.** Header now `GlassView` (frosted) + persistent hairline; title 18 `font-lao-bold` (`text-lg`), overline tracking 0.8. Category row is a screen-local `CategoryPill` (rounded-**xl**, gradient-amethyst active w/ colored shadow, white-card idle, grid icon on "ທັງໝົດ", 14px category image when present) — not the pill `Chip`. Card: title + price → `text-base` (16) bold like the mockup; CTA label → `search.bookNow` ("ຈອງເລີຍ"); featured border → `border-aura-200`, ribbon gradient → new `gradients.ribbon` (amber→rose) with white 10px bold text; star 12. Meta-row label → `search.recommended` ("ລາຍການບໍລິການແນະນຳ"). **Not matched:** the mockup's 5-tab bottom nav (Search/Promo tabs don't exist in `TabsNavigator`; this screen is pushed over the 3-tab bar) and the per-card `HOT` badge + left rose bar (no `badge` field on `ServiceListItem`, only `popular`). |
