# `design-mobile-service-detail.md` — ໜ້າ "ລາຍລະອຽດບໍລິການ" (Mobile App)

> Page-override spec for `apps/mobile` — extends `docs/design.md` + the token mirror in
> `apps/mobile/tailwind.config.js` + `apps/mobile/src/theme/`.
> Screen: `src/screens/catalog/ServiceDetailScreen.tsx` (route `ServiceDetail`, param `{ serviceId }`).
> Theme unchanged — "Neo-Luxury Wellness", amethyst `#7C3AED` + champagne `#DFBA98`,
> Plus Jakarta Sans + **Noto Serif Lao** for headings (`font-lao-serif`, the Playfair-equivalent) +
> Noto Sans Lao for body.
> Built to **match the reference HTML mockup section-for-section**, re-tokenised to the Aura ramp
> (mockup's indigo/rose/gold/Material-Symbols → amethyst/champagne/Ionicons). The mockup's fake
> metrics + in-page booking modal are the only things dropped (see §1.3).

---

## 0. Layout — 1:1 with the mockup

| Mockup section | Screen implementation |
|---|---|
| Hero `h-[360px]` + scrim + floating back/fav/share | `HERO_H = 340` **parallax** image (`Animated.ScrollView`, translate+scale on over-scroll); `RoundBtn` ×3 pinned at `insets.top`, **cross-fade** into a sticky `GlassView` header past the hero |
| Hero caption: verified pill + `★ 4.9 (128 ຣີວິວ)` | `bg-primary-subtle` pill `ຍອດນິຍົມ · ຊ່າງຊຳນານ` (only if `s.popular`) + star + rating + `(N ຣີວິວ)` on the scrim (only if `reviewCount>0`) |
| §1 Overview: rose-gold tag + duration + spa chips, `h1`, description, **3-tile metrics bento** | `ChipTag` row — accent chip = `categoryName`, muted chip = duration, muted chip per `s.highlights[]`. `h1` = `font-lao-serif text-[24px]`. Description `font-lao text-[14px]`. `MetricTile` ×3: `100% / ຮັບປະກັນພໍໃຈ` · `${duration} / ນາທີ` · `${rating} / ຄະແນນ (N)` (falls back to staff count when no reviews) |
| §2 Specialist: card, ring avatar, online dot, verified, rating, **chevron** | `SpecialistCard` per `s.staff[]` — 52px ring avatar, `bg-success` dot, `checkmark-circle` when `rating≥4.9 & reviews≥5`, star + rating + reviews, chevron. **Whole card tap → `onBook(staff)`** (seeds `staffProfileId`/`staffName` into the draft, jumps to `WizardService`) — the chevron now means something. Hint line below. |
| §3 Process: "ຂັ້ນຕອນການບໍລິການ", numbered `01…0N` step cards | `ProcessStep` per `s.steps[]` (new BE field). Number chip alternates `primary-subtle` / `accent-soft`. Section hidden when `steps` empty. |
| §4 Customer review highlight: avatar, name, "· ຜູ້ໃຊ້ບໍລິການຈິງ", 5 stars, quote | `ReviewCard` ×≤3 from `s.reviews[]` (new BE field — **real `Review` rows**). Trailing `${reviewCount} ຣີວິວ`. Hidden when none. |
| §5 Amenities micro-chips (WiFi / drink / parking) | `AmenityBar` from `s.amenities[]` (new BE field on `Branch`). Known keys → Ionicon + Lao label. Hidden when empty. |
| §6 Sticky CTA: price + `-20%` pill + strike-through + deposit + Book | `GlassView` + `glassBorder.top`: `formatLAK(price)` serif 20 + `-{pct}%` `destructive-soft` pill (from `compareAtPrice`) + strike-through compare price + `ມັດຈຳ …` + `Button` (gradient brand). |
| Booking confirmation modal | **Not built** — Aura uses the `Wizard*` flow; CTA seeds the draft and navigates. |

Type scale was deliberately **lightened** from the first pass: headings use `font-lao-serif`
(Noto Serif Lao 600) at 19–24px instead of `font-lao-bold` 24–26; metric values are serif 17;
body stays `font-lao` 400 @ 14. No `uppercase` / `letterSpacing` (`lao-typography-no-tracking`).

---

## 1. System analysis

### 1.1 What existed

- `GET /catalog/services/:id` → `ServiceDetailView` = `ServiceListItem` + `{ isActive, staff[] }`.
  `ServiceListItem` already carried `rating`, `reviewCount`, `popular` — **fetched but never rendered**.
- `Review` model (`clinical.prisma`): `rating`, `comment`, `createdAt`, `user{name,avatarUrl}`,
  joined to a service through `appointment.serviceId` — real reviews were queryable, just unused.
- Local `useSearchStore().favorites` + `toggleFavorite` (AsyncStorage) — reused for the save heart.
- Primitives: `GlassView`, `Gradient`, `Button`, `Text` (Lao ramp + `font-lao-serif`),
  `Touchable`, `AnimatedEntrance`, `useReducedMotion`, `haptics`.

### 1.2 Gaps → what was added

| Gap | Layer | Resolution |
|---|---|---|
| `rating`/`reviewCount`/`popular` never shown | FE | hero pills + `MetricTile` |
| No save / share on a sub-page | FE | heart → `search.store`; share → RN `Share` |
| Static hero, back-button lost on scroll | FE | parallax + float→glass-header cross-fade |
| Deposit shown as a bare number | FE | `depositNote` copy + CTA sub-line |
| **Process steps** (mockup §3) — no data | **BE** | `Service.steps Json?` → `ServiceStep[]` in the view; parsed defensively; section degrades to hidden |
| **Customer reviews** (mockup §4) — only an aggregate | **BE** | `ServiceDetailView.reviews: ServiceReviewItem[]` — top 6 `Review` rows with a non-empty comment, newest first; **no new table** |
| **Amenities** (mockup §5) — branch-level, none stored | **BE** | `Branch.amenities String[] @default([])` → surfaced on the detail view via the service's branch |
| **Discount pricing** (mockup §6) — no compare price | **BE** | `Service.compareAtPrice Decimal?` → `compareAtPrice` on `ServiceListItem`; client derives `%` |
| Tag chips ("ຜົມສຸຂະພາບດີ") — hard-coded in mockup | **BE** | `Service.highlights String[] @default([])` → `highlights` on `ServiceListItem` |
| Staff card implied a tap with no target | FE | tap = book-with-this-stylist (`startDraft` + `WizardService`) |

### 1.3 Dropped from the mockup (on purpose)

Fake metrics (`1.2k+ ຄົນຈອງແລ້ວ`), the in-page booking **modal** (wizard flow owns confirmation),
Material Symbols (Aura = Ionicons), the tracked/upper-cased Lao labels.

---

## 2. Backend changes

### 2.1 Prisma — one additive migration `20260906120000_service_detail_richness`

```sql
ALTER TABLE "branches" ADD COLUMN "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "services" ADD COLUMN "compareAtPrice" DECIMAL(16,2);
ALTER TABLE "services" ADD COLUMN "highlights" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "services" ADD COLUMN "steps" JSONB;
```

All nullable / defaulted → safe on existing rows. **Run `pnpm --filter backend db:migrate`
(or `db:reset`) then `pnpm --filter backend db:seed`** — the seed now populates the `haircut`
service (`compareAtPrice 150000`, `highlights`, 4 `steps`) and the Vientiane branch
(`amenities: wifi/parking/drink/lounge/card`).

### 2.2 `shared-types/src/catalog.schema.ts`

- `ServiceListItem` += `compareAtPrice: number | null`, `highlights: string[]`
- new `ServiceStep = { title; body }`, `ServiceReviewItem = { id; authorName; authorAvatarUrl;
  rating; comment; createdAt }`
- `ServiceDetailView` += `steps: ServiceStep[]`, `reviews: ServiceReviewItem[]`, `amenities: string[]`

### 2.3 `catalog.service.ts`

- `toServiceListItem` maps `compareAtPrice` + `highlights`.
- `getServiceById` includes `branch.amenities`, parses `service.steps` via `parseSteps()`
  (guards non-array / missing keys), and runs `recentReviewsForService(id)` in parallel with the
  rating aggregate. Reviews: `where: { appointment: { serviceId }, comment: { not: null } }`,
  `orderBy createdAt desc`, `take 6`, blank comments filtered in JS.

No new endpoint. `useService(id)` (mobile) is unchanged — the payload just grew.

---

## 3. Components (`src/features/catalog/service-detail.parts.tsx`)

| Component | Notes |
|---|---|
| `RoundBtn` | ⌀40 `Touchable`, `bg-card/90` (glass) or `bg-card` (plain header), `shadow.xs`, `pressScale 0.88`, `hitSlop 8`, a11y label + `selected` state; icon `destructive` when `active` |
| `SectionTitle` | `font-lao-serif text-[19px]` + optional muted trailing |
| `ChipTag` | `bg-accent-soft`/`bg-muted`, optional leading Ionicon, `font-lao-medium 12` |
| `MetricTile` | `AnimatedEntrance index`, icon + serif value + `text-[11px]` label, `flex:1`; entrance-only motion |
| `SpecialistCard` | pressable; ring avatar + `bg-success` dot + verified check + star cluster + chevron chip |
| `ProcessStep` | number chip (alternating tone) + serif-free title + muted body |
| `ReviewCard` | avatar/initial + name + `formatDate · ຜູ້ໃຊ້ບໍລິການຈິງ` + 5 Ionicon stars + italic quote |
| `AmenityBar` | `bg-muted` row, `w-px` dividers, known-key → `{icon,label}` map, caps at 4 |

Screen keeps the sticky `GlassView` header + CTA inline (they bind `Animated` opacity).

---

## 4. States

| State | Render |
|---|---|
| Loading / Error | `<LoadingScreen />` / `<ErrorView onRetry>` (unchanged) |
| No image | `bg-primary-subtle` + `cut-outline` (still parallaxes) |
| `reviewCount === 0` | hero rating line + rating `MetricTile` omitted (tile 3 → staff count); reviews section hidden |
| `steps` / `amenities` empty | that section not rendered |
| `!requireDeposit` | deposit note + CTA sub-line omitted |
| `!compareAtPrice` | `-%` pill + strike-through omitted |
| `staff.length === 0` | staff list → `staff.empty`; **CTA disabled** |
| Reduce Motion | no hero transform; header + float both `opacity 1`; `AnimatedEntrance` no-ops |

---

## 5. Motion

Parallax hero (`translateY [-160,0,H]→[-80,0,.32H]` + `scale [-160,0]→[1.3,1]`, native driver) ·
float↔glass-header inverse opacity crossfade over `scrollY [H-210, H-150]` ·
`AnimatedEntrance` section stagger (idx 2–5) · `Touchable` scale + `haptics.select()` on the
heart · `Button` built-in primary haptic. Transform/opacity only.

---

## 6. i18n — `service.*` keys added (lo + en, Thai-scanned U+0E01–0E7F)

`popular`, `popularBadge`, `guarantee`, `minutesUnit`, `staffCount`, `ratingLabel`, `peopleCount`,
`staffPickHint`, `depositNote`, `process`, `stepCount`, `reviewsTitle`, `realCustomer`,
`amenity.{wifi,parking,drink,lounge,kids,card}`. Reused: `service.staff|description|price|book|
depositAmount`, `staff.reviews|empty`, `common.back|minutesShort|seeAll`, `search.save|saved`,
`errors.generic`.

---

## 7. Files touched

```
apps/backend/prisma/schema/catalog.prisma                       ← Branch.amenities, Service.compareAtPrice/highlights/steps
apps/backend/prisma/migrations/20260906120000_service_detail_richness/migration.sql   ← NEW
apps/backend/prisma/seed.ts                                     ← seed the new fields
apps/backend/src/modules/catalog/catalog.service.ts            ← map + parse + reviews query
packages/shared-types/src/catalog.schema.ts                    ← ServiceStep, ServiceReviewItem, view fields
apps/mobile/src/screens/catalog/ServiceDetailScreen.tsx        ← rewritten to the mockup layout
apps/mobile/src/features/catalog/service-detail.parts.tsx      ← 8 components (rewritten)
apps/mobile/src/i18n/locales/{lo,en}.json                      ← service.* keys
```

---

## 8. Still open (future)

`Service.steps` has no web-admin editor yet (seed / manual only). `StaffSummary.nextAvailableAt`
would turn the decorative online dot into real availability. A dedicated `ServiceReviews` screen
for the "see all" affordance. Favourites sync endpoint (still local-only).

---

## Changelog

| Date | Change |
|------|--------|
| 2026-09-06 | Initial spec + FE-only pass. |
| 2026-09-06 | Reworked to match the reference mockup 1:1; added `Service.steps/compareAtPrice/highlights` + `Branch.amenities` (one migration) + real `reviews` on the detail view; lightened type to `font-lao-serif`. |
