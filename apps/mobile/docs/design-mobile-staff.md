# `design-mobile-staff.md` — Aura **Staff Portal** (mobile) design system

ຂອບເຂດ: `src/screens/staff/**` (10 ໄຟລ໌) — Today / Attendance / Earnings / Messages (inbox + thread) /
Profile / Appointment detail / Treatment record / Home-service trip.
ພື້ນຖານສີ, gradient, ເງົາ, motion ອີງ [`design-mobile.md`](./design-mobile.md); ໜ້ານີ້ບອກສະເພາະ
ສິ່ງທີ່ portal ຂອງພະນັກງານເພີ່ມເຂົ້າມາ.

---

## 1. Type scale — ຄົງທີ່ 12px

ຕາມ [`typography-appointments.md`](./typography-appointments.md): ທຸກຂໍ້ຄວາມຜ່ານ `T` (12/17).
ມີພຽງ **2 ຂັ້ນຂ້າງຄຽງ**:

| token | ຂະໜາດ | ໃຊ້ກັບ |
|---|---|---|
| `T` | 12 / 17 | ທຸກຢ່າງ — ຫົວຂໍ້ພາກ, ຊື່ບໍລິການ, ປຸ່ມ, ຄ່າສະຖິຕິ |
| `SMALL` | 10 / 14 | caption, pill, meta, eyebrow, ຕົວເລກໃນ chip |
| `EMPH` | 14 / 19 | ຊື່ໜ້າ (StaffScreenTitle) ເທົ່ານັ້ນ |

ຂໍ້ຍົກເວັ້ນດຽວ: ຕົວເລກຍອດເງິນໃນ hero ຂອງໜ້າ **ລາຍໄດ້** (22/28, `font-display`) — ເປັນ
"ຕົວເລກຫຼັກ" ອັນດຽວຂອງ portal.

ຂະໜາດ UI ຜູກກັບ type scale: icon 11–16, icon tile 32–34, ແຖວແຕະໄດ້ ≥ 44pt (min-h-[52px] ໃນ
grouped list), radius 12 (ພາຍໃນ) / 16–24 (ບັດ), ຊ່ອງໄຟ 8 · 10 · 14.

## 2. ຊິ້ນສ່ວນຮ່ວມ — [`staff-portal.parts.tsx`](../src/screens/staff/staff-portal.parts.tsx)

| ຊິ້ນສ່ວນ | ໜ້າທີ່ |
|---|---|
| `StaffHeader` | ກອບຫົວໜ້າ tab: ພື້ນທຶບ + hairline ລຸ່ມ (ເນື້ອຫາເລື່ອນຜ່ານໄດ້ສະອາດ) |
| `StaffScreenTitle` | eyebrow ຊຳແປນ + title (EMPH) + subtitle meta + actions ຂວາ |
| `SectionHeading` | ແຖບ accent + label + hint + trailing |
| `HeaderIconButton` | ປຸ່ມໄອຄອນ 36pt (soft / solid / plain) + badge |
| `IconTile` · `TINT` | ກ່ອງໄອຄອນສີ (time · service · client · place · money · note · neutral) — `TINT` ອ່ານ token ປັດຈຸບັນ ຈຶ່ງປ່ຽນຕາມໂທນ/ໂໝດມືດ |
| `InfoRow` · `ActionTile` | ແຖວຂໍ້ມູນ / ບັດ action ຂະໜານ |
| `StatCell` · `StatRibbon` | ແຖບສະຖິຕິ 2–4 ຊ່ອງ |
| `MiniBar` · `Ring` | ຄວາມຄືບໜ້າ (ແຖບ / ວົງແຫວນ `react-native-svg`) |
| `HeroCard` | ບັດ hero ພື້ນ wash gradient |
| `PeriodStepper` | ເລື່ອນເດືອນ/ມື້ + ປຸ່ມກັບມາປັດຈຸບັນ |
| `FilterChipRow` | chip ກອງກະຈາຍເຕັມແຖວ + ຕົວເລກນັບ |
| `EmptyBlock` | ສະຖານະວ່າງແບບຫຍໍ້ (12px) + ປຸ່ມ action |
| `StaffStatusPill` · `ScheduleCard` | ສະຖານະຄິວ / ບັດຄິວ timeline (ຮາງເວລາຊ້າຍ) |

## 3. ໂຄງໜ້າມາດຕະຖານ

```
SafeAreaView
└ StaffHeader            ← eyebrow + title + meta + action, ຕົວກອງ/ຕົວເລືອກຊ່ວງເວລາ
└ ScrollView / FlatList  ← padding 16, gap 14, pull-to-refresh
   ├ HeroCard            ← "ອັນດຽວທີ່ຕ້ອງເບິ່ງຕອນນີ້" (focus / ກະວຽກ / ຍອດເງິນ)
   ├ StatRibbon          ← 3–4 ຕົວເລກ
   ├ SectionHeading + ເນື້ອຫາ
   └ EmptyBlock          ← ເມື່ອບໍ່ມີຂໍ້ມູນ
└ FooterBar (ແກ້ວ)       ← ໜ້າທີ່ມີ action ຫຼັກ (trip / treatment / detail)
```

## 4. ສິ່ງທີ່ປ່ຽນໃນຮອບນີ້ (2026-09-18)

- **Today** — ແຖບເລືອກມື້ແບບເລື່ອນຂວາງ (14 ມື້) ແທນລູກສອນ, hero ມີວົງແຫວນ done/total +
  ຊົ່ວໂມງງານລວມ, ບັດ focus ກົດເຂົ້າລາຍລະອຽດໄດ້ + ໂທ/ສົ່ງຂໍ້ຄວາມ, ຕາຕະລາງເປັນ timeline
  (ຮາງເວລາ + ເສັ້ນຕໍ່), chip ກອງມີຕົວເລກ, ແຖວ availability ມີໄອຄອນສະຖານະ.
- **Attendance** — ວົງແຫວນກະວຽກທຽບເປົ້າ 8 ຊມ, ໂມງເດີນ (ອັບເດດທຸກນາທີ) ຕອນຍັງບໍ່ອອກວຽກ,
  ຮູບແທ່ງ 7 ບັນທຶກລ່າສຸດ, ສະຫຼຸບເພີ່ມ "ສະເລ່ຍ/ມື້", ປະຫວັດມີປ້າຍ "ຍັງບໍ່ອອກວຽກ".
- **Earnings** — hero plum gradient + ແນວໂນ້ມທຽບເດືອນກ່ອນ, ວົງແຫວນ KPI %, ລາຍການຕາມ
  ບໍລິການຈັດອັນດັບ (1,2,3) + ສ່ວນແບ່ງ %, footnote ອະທິບາຍທີ່ມາຂອງຕົວເລກ.
- **Appointment detail** — hero ມີ avatar + ຂັ້ນຕອນ 3 ຈຸດ, ບັດ action (ໂທ / ຂໍ້ຄວາມ),
  ທີ່ຢູ່ HOME_SERVICE ເປີດແຜນທີ່ ຫຼື ເຂົ້າໜ້າ trip ໄດ້.
- **Treatment record** — ຈັດກຸ່ມຮູບ ກ່ອນ/ຄວາມຄືບໜ້າ/ຫຼັງ, ເປີດຮູບເຕັມຈໍ, ເລືອກ **ກ້ອງ** ຫຼື
  ຄັງຮູບ, ນັບຕົວອັກສອນ + ສະຖານະ "ຍັງບໍ່ໄດ້ບັນທຶກ" (ປຸ່ມບັນທຶກປິດເມື່ອບໍ່ມີການປ່ຽນແປງ).
- **Messages** — inbox ມີຄົ້ນຫາ, chip ກອງ (ທັງໝົດ/ຍັງບໍ່ອ່ານ/ຖືກປິດ), ຈັດກຸ່ມຕາມເວລາ;
  ຫ້ອງແຊັດໃຊ້ `buildChatRows` ຄືກັບຫ້ອງ DIRECT (ຕົວຄັ່ນວັນ, ເສັ້ນຂໍ້ຄວາມໃໝ່, ✓✓ live,
  ປຸ່ມໄປລ່າສຸດ, ກົດຄ້າງສຳເນົາ, sheet ສະມາຊິກ).
- **Home-service trip** — timeline 5 ຂັ້ນ, ສະຖິຕິ ETA/ໄລຍະ/ເວລານັດ, ບັດສາຂາ (ໂທໄດ້),
  action ຫຼັກຄ້າງຢູ່ FooterBar ແກ້ວ.
- **Profile** — ໃຊ້ຊິ້ນສ່ວນຮ່ວມ (ບໍ່ຊ້ຳກັບ kit), ແຖວສະຖານະກະວຽກມື້ນີ້, ທາງລັດ 3 ປຸ່ມ,
  ຊື່ໜ້າ 14px (ແຕ່ກ່ອນເປັນ `variant="title"` 24px — ຜິດ flat scale).

## 5. ບັນຫາລະບົບທີ່ພົບ (ຍັງບໍ່ໄດ້ແກ້ — ຕ້ອງການ backend)

| # | ຊ່ອງຫວ່າງ | ຜົນກະທົບ |
|---|---|---|
| S1 | `GET /staff-portal/schedule` ດຶງໄດ້ເທື່ອລະມື້ | ແຖບເລືອກມື້ບອກບໍ່ໄດ້ວ່າມື້ໃດມີຄິວ (ຕ້ອງການ `?from=&to=` ຫຼື endpoint count) |
| S2 | ບໍ່ມີ endpoint ໃຫ້ຊ່າງ "ຢືນຢັນ/ປະຕິເສດ" ຄິວ | PENDING ຕ້ອງລໍ admin, ຊ່າງເຫັນແຕ່ບໍ່ດຳເນີນການໄດ້ |
| S3 | ບໍ່ມີ NO_SHOW / ເລື່ອນເວລາ ຈາກ portal | ຊ່າງຕ້ອງໂທຫາ admin |
| S4 | commission ບໍ່ມີ time-series | ບອກແນວໂນ້ມໄດ້ພຽງ "ທຽບເດືອນກ່ອນ" (ຕ້ອງດຶງ 2 ເດືອນ) |
| S5 | attendance ບໍ່ສົ່ງ `scheduledStart` / ເປົ້າຊົ່ວໂມງ | ວົງແຫວນກະວຽກໃຊ້ຄ່າຄົງທີ່ 8 ຊມ |
| S6 | treatment photo ບໍ່ມີ delete / caption API | ຖ່າຍຜິດແລ້ວລຶບບໍ່ໄດ້ |
| S7 | STAFF_INTERNAL ບໍ່ມີ group ຫຼາຍຄົນ / ຊື່ຫ້ອງ | inbox ສະແດງໄດ້ແຕ່ຫ້ອງ 1:1 |
| S8 | trip ບໍ່ມີ ETA ຄິດຈາກເສັ້ນທາງຈິງ | ETA ເປັນຄ່າຈາກ backend ຕອນຈັບຄູ່ເທົ່ານັ້ນ |
| S9 | ບໍ່ມີ push ເມື່ອມີຄິວໃໝ່/ຖືກຈັບຄູ່ trip | ຊ່າງຕ້ອງ pull refresh ເອງ |
| S10 | Face ID ໃນໂປຣໄຟລ໌ຍັງເປັນ state ໃນໜ້າ | ບໍ່ໄດ້ຜູກກັບ `expo-local-authentication` |
