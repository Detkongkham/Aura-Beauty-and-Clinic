# `design-mobile-booking-service.md` — ໜ້າ "ເລືອກບໍລິການ ແລະ ຊ່າງ" (Mobile App, Booking Step 1)

> Page-override spec for `apps/mobile` — extends `docs/design.md` + the token mirror in
> `apps/mobile/tailwind.config.js` + `apps/mobile/src/theme/`.
> Screen: `src/screens/booking/WizardServiceScreen.tsx` (route `WizardService`, no params —
> reads `useBookingDraft()`).
> Parts: `src/features/booking/wizard-service.parts.tsx`. Shared stepper: `WizardProgress.tsx`.
> Theme unchanged — "Neo-Luxury Wellness", amethyst `#7C3AED` + champagne `#DFBA98`,
> Plus Jakarta Sans + Noto Serif Lao headings + Noto Sans Lao body.
> Built to **match the reference HTML mockup section-for-section**, re-tokenised to the Aura ramp
> (mockup's indigo/emerald/amber/inline-SVG → amethyst/success/warning/Ionicons). The mockup's
> per-stylist "next available at 14:00" times are the only thing dropped — that data isn't known
> until Step 2 (`GET /booking/availability`).

---

## 0. Layout — 1:1 with the mockup

| Mockup section | Screen implementation |
|---|---|
| iOS status bar + `TopAppBar` (back / title / step "1 ຈາກ 3" / brand chip) | `SafeAreaView edges={['top']}` + `WizardProgress` → `ScreenHeader` (back chevron + centred serif title) with `wizard.step` = "ຂັ້ນຕອນ 1 ຈາກ 3" caption below |
| `MultiStepProgressIndicator` — 3 nodes + labels + gradient connector | `WizardProgress` rebuilt: node = 28px circle (`bg-primary` current/done, `checkmark` when done), **label under each node** (`wizard.tabService` / `tabDateTime` / `tabConfirm`), connector `h-0.5` fills `bg-primary` for completed legs. Shared by all three `Wizard*` screens. |
| `SelectedServiceSummaryCard` — badge, "ປ່ຽນບໍລິການ", 78px thumb, title + EN subtitle, duration chip, `-20% OFF`, strike price + promo price | `SelectedServiceCard` — `bg-primary-subtle` pill `ບໍລິການທີ່ທ່ານເລືອກ` + `swap-horizontal` "ປ່ຽນບໍລິການ" → `navigation.goBack()`; 76px `rounded-xl` image (`sparkles` fallback); `serviceName` serif-ish 15 + `serviceSubtitle` (= service `description`); `time-outline` duration chip + `-{pct}%` `success-soft` badge; border-top row → strike `compareAtPrice` + `ລາຄາໂປຣ` + `formatLAK(price)` 18 bold. `%` derived client-side. |
| `SpecialistSelectionSection` header — title, hint, "3 ຊ່າງວ່າງ" pill | serif `wizard.chooseStaffTitle` + `wizard.chooseStaffHint` + `bg-primary-subtle` pill `wizard.staffAvailable` (= `options.length`) |
| Option 1 — "ຊ່າງໃດກໍໄດ້ (ແນະນຳ)" + `⚡ ຄິວໄວທີ່ສຸດ` + desc + radio | `AnyStaffOption` — 48px `rounded-2xl` `people` icon tile, `flash` + `warning-soft` badge, `staff.anyDesc`, right `Radio`. Selected = `border-primary bg-primary-subtle`. Seeds `staffProfileId: null`. |
| Option 2 (selected) — ribbon "ກຳລັງເລືອກຊ່າງນີ້", ring avatar + `MASTER` badge, role, `★ 5.0 (128 ຣີວິວ)`, green "ວ່າງມື້ນີ້ 14:00" | `StaffOption` selected state — `border-2 border-primary` + `shadow.primary`, `bg-primary-strong` ribbon, 56px `rounded-2xl` avatar, `seniorityTier()` badge (`MASTER` ≥4.95★ & ≥100 rv · `PRO` ≥4.7★ & ≥20 rv), `title`, star + rating + `(N ຣີວິວ)`, and a `success-soft` chip `wizard.pickTimeNext` in place of the mockup's hard-coded time. |
| Options 3–4 — `PRO` badge, rating, specialty, "ວ່າງມື້ອື່ນ" | same `StaffOption`, unselected = `border-border bg-card` + `shadow.xs`, no chip. |
| `ServicePreferencesSection` — "Quiet Appointment" row + iOS toggle | `QuietToggle` — `volume-mute-outline` icon circle, `wizard.quietTitle` / `wizard.quietDesc`, RN `Switch` (`trackColor.true = primary`). Writes `draft.quietAppointment`. |
| `StickyBottomActionBar` — "ເລືອກ: ນາງ ດາລາ" + "ມັດຈຳ 30%: ₭ 36,000" + "ລວມທັງໝົດ ₭ 120,000" + gradient "ຕໍ່ໄປ" | `FooterBar` (`GlassView` + `glassBorder.top`): `wizard.selected` + resolved stylist name (`staff.any` when auto), `wizard.depositLine` (only when `draft.depositAmount != null`), `wizard.total` + `formatLAK(price)`, then `Button` (gradient brand, `size="md"`, centred `text-[14px]` label, no icon — keeps the label dead-centre) → `navigation.navigate('WizardDateTime')`. |

All entrances via `AnimatedEntrance` (fade + rise, staggered, respects Reduce Motion).
No `uppercase` / `letterSpacing` on Lao (`lao-typography-no-tracking`). Tier badges stay Latin
(`MASTER` / `PRO`) — brand marks, not prose.

---

## 1. System analysis

### 1.1 What existed

- `WizardServiceScreen` already: `useStaff({branchId, serviceId})` → `StaffListItem[]`, a flat
  `SelectRow` list (any-staff + one row per stylist), `WizardProgress` (numberless labels),
  `FooterBar` + `Button` → `WizardDateTime`.
- `useBookingDraft` (zustand) carried `serviceId/serviceName/price/durationMinutes/staffProfileId/
  staffName` — seeded by `ServiceDetailScreen.onBook()`.
- Primitives reused as-is: `Text` (Lao ramp), `Touchable`, `AnimatedEntrance`, `FooterBar`,
  `Button`, `ScreenHeader`, `useReducedMotion`, `haptics`, `formatLAK`.

### 1.2 Gaps → what was added

| Gap | Layer | Resolution |
|---|---|---|
| Summary card had no image / subtitle / compare price | **draft store (FE)** | `booking-draft.store.ts` +`serviceSubtitle` (= `description`), +`serviceImageUrl`, +`compareAtPrice`, +`depositAmount`; all seeded in `ServiceDetailScreen.onBook()` from the already-fetched `ServiceDetailView`. **No BE change** — every field already exists on `ServiceListItem` / `ServiceDetailView`. |
| Discount `%` + strike price (mockup) | FE | derived: `round((1 - price/compareAtPrice) * 100)`, shown only when `compareAtPrice > price`. |
| Stylist seniority badge (`MASTER` / `PRO`) | FE | `seniorityTier(staff)` from existing `rating` + `totalReviews`; returns `null` (no badge) for everyone else. Purely presentational — no BE tier field. |
| "Quiet appointment" preference | **draft store (FE)** | +`quietAppointment: boolean`. Carried in the draft; `WizardConfirm` / create-appointment payload can fold it into `customerNotes` (follow-up — not wired to the API yet). |
| Stepper had no step labels | FE | `WizardProgress` now renders a Lao label under each node (benefits all 3 wizard screens). |
| Per-stylist "next available" time (mockup) | — | **Dropped.** Slot data is fetched in Step 2. The selected card instead shows `wizard.pickTimeNext`. |

### 1.3 i18n

New keys under `wizard.*` (`tabService/tabDateTime/tabConfirm`, `selectedService`, `changeService`,
`promoPrice`, `chooseStaffTitle`, `chooseStaffHint`, `staffAvailable`, `pickTimeNext`, `quietTitle`,
`quietDesc`, `selected`, `depositLine`, `nextDateTime`) and `staff.*` (`anyTitle`, `anyFast`,
`anyDesc`, `selecting`); `staff.any` reworded "Any staff" → "Any specialist". Both `en.json` +
`lo.json`; Lao scanned for Thai look-alikes (`lo-json-thai-contamination`).

---

## 2. Files touched

- `src/screens/booking/WizardServiceScreen.tsx` — rebuilt.
- `src/features/booking/wizard-service.parts.tsx` — **new** (`SelectedServiceCard`, `AnyStaffOption`,
  `StaffOption`, `QuietToggle`, `seniorityTier`).
- `src/features/booking/WizardProgress.tsx` — labelled nodes.
- `src/store/booking-draft.store.ts` — +5 fields.
- `src/screens/catalog/ServiceDetailScreen.tsx` — `onBook()` seeds the new draft fields.
- `src/i18n/locales/{en,lo}.json` — keys above.
