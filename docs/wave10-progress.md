# Wave 10 (Finance & Marketing audit) — ຄວາມຄືບໜ້າ

ອ້າງອີງ `docs/finance-marketing-audit.md`. ຂອບເຂດທີ່ຢືນຢັນ: 10A + 10B + 10C + 10G (ຮັບເງິນສົດ, ຮ້ານຈົດ VAT 10%, ບັດຂອງຂວັນຊື້ເອງໄດ້).

| Wave | ສະຖານະ | ໝາຍເຫດ |
|---|---|---|
| 10A | ✅ 2026-09-16 | ອຸດຮູຮົ່ວ C1–C4, H1, H3, H5 |
| 10G | ✅ 2026-09-21 | consent (opt-in) + suppression + quiet hours + weekly cap; migration `…180000_marketing_consent_suppression` |
| 10B | ✅ 2026-09-21 | refund engine + clawback + void + ເລກ INV/CN gapless + VAT inclusive + ໃບຮັບເງິນ + ລາຍງານ VAT; migration `…190000_refund_invoice_vat` (backfill ເລກ INV ໃຫ້ບິນເກົ່າ) |
| 10C | ✅ 2026-09-21 | ເງິນສົດຕ້ອງມີກະ (policy) + Z-report (ເລກ Z gapless + snapshot) + over/short; migration `…200000_cash_drawer_zreport` |

## 10G — consent
- Opt-in ເທົ່ານັ້ນ: ບໍ່ມີແຖວ `MarketingConsent` = ຫ້າມສົ່ງ. **ລູກຄ້າເກົ່າທັງໝົດບໍ່ມີ consent → ແຄມເປນຈະບໍ່ຮອດໃຜຈົນກວ່າຈະ opt-in.**
- `runCampaign()` ກັ່ນຕອງຢູ່ຊັ້ນ service (`marketing/consent.service.ts`): consent → suppression → weekly cap → quiet hours (ວຽງຈັນ; ຊ່ວງງຽບ = ບໍ່ສົ່ງ ແລະ ບໍ່ບັນທຶກ recipient).
- ຖອນຕົວ: mobile ProfileScreen ▸ ການແຈ້ງເຕືອນ ແລະ ຄວາມເປັນສ່ວນຕົວ; `POST /consent/unsubscribe` (token HMAC ໃນ push data.unsubscribeToken). ຖອນ → ເຂົ້າ suppression ອັດຕະໂນມັດ.
- ຫຼັກຖານ: `MarketingConsentEvent` append-only. ຊ່ອງທາງທີ່ສົ່ງຈິງມີແຕ່ PUSH (SMS/EMAIL/LINE ມີໃນ model ແຕ່ຍັງບໍ່ມີຜູ້ໃຫ້ບໍລິການ).
- ຍັງບໍ່ໄດ້ເຮັດ: STOP-reply ຂອງ SMS (ບໍ່ມີ SMS provider).

## 10B — refund / VAT / ເລກເອກະສານ
- `Refund.amount` = ເງິນຈ່າຍອອກຈິງ, `storeCreditAmount` = ຄືນເຂົ້າບັດຂອງຂວັນ/ຄະແນນ (ບໍ່ນັບເປັນເງິນອອກໃນລິ້ນຊັກ/ກະທົບຍອດ). ແຈກຍອດຕາມ tender ເດີມ ໃໝ່ສຸດກ່ອນ.
- ຂໍ → ອະນຸມັດ (ຄົນລະຄົນ ເວັ້ນ SUPER_ADMIN) → ຈ່າຍ (ອອກ CN + ຄືນບັດ/ຄະແນນ + clawback ຄະແນນ EARN ແລະ ຄອມມິດຊັນທີ່ຍັງບໍ່ຈ່າຍ). ສິດໃໝ່ `payments:refund`.
- `VOIDED` = ບິນບໍ່ມີເງິນເຂົ້າທີ່ຖືກຍົກເລີກ. ບິນທີ່ຈ່າຍແລ້ວ void ບໍ່ໄດ້.
- ເລກ `INV|CN|Z-<ລະຫັດສາຂາ>-<ປີວຽງຈັນ>-<6 ຫຼັກ>` ຜ່ານ `DocumentSequence` ໃນ transaction ດຽວກັນ (rollback ເລກກໍ rollback).
- VAT: inclusive ເທົ່ານັ້ນ, ອັດຕາຖືກ "ຢຸດ" ໃນບິນຕອນອອກ (`AppSetting finance-vat`, ຄ່າເລີ່ມຕົ້ນ ປິດ / 10%).
- ~~ຂໍ້ຈຳກັດ~~ ແກ້ແລ້ວ 2026-09-23 — ເບິ່ງ "ແກ້ຂໍ້ຈຳກັດ" ຂ້າງລຸ່ມ.

## 10C — ລິ້ນຊັກ / Z-report
- ກະລິ້ນຊັກ (G10) ມີຢູ່ແລ້ວຈາກ Phase 9. ເພີ່ມ: policy `finance-cash.requireOpenDrawer` (default ຈາກ env `CASH_REQUIRE_OPEN_DRAWER`, production = true; `.env.test` = false) — ຮັບເງິນສົດ ແລະ ຈ່າຍຄືນເງິນສົດ ຕ້ອງມີກະເປີດ (409 `CASH_DRAWER_REQUIRED`).
- Z-report: ປິດກະ → ອອກເລກ Z + snapshot `zReport` (ຍອດແຍກວິທີຈ່າຍ, ຊ່ວງເລກ INV/CN, void, ການນັບເງິນສົດ). ບໍ່ໄດ້ເພີ່ມຕາຕະລາງ `CashSession` ໃໝ່ ເພາະ 1 ກະເປີດ/ສາຂາ ເຮັດໃຫ້ "ເງິນສົດ ↔ ກະ" ກົງກັນດ້ວຍຊ່ວງເວລາຢູ່ແລ້ວ.
- "ລັອກ": ບິນທີ່ອອກແລ້ວບໍ່ມີ API ແກ້ໄຂ; ຫຼັງປິດກະ ການແກ້ = ໃບຄືນເງິນ CN ໃນກະໃໝ່, snapshot ຂອງກະເກົ່າບໍ່ປ່ຽນ.
- over/short ຕາມຜູ້ປິດກະ + ສາຂາ (`/cash-drawer/variance-report`).

## Tests (ແລ່ນຈິງ 2026-09-21 ກັບ `abcp_test`)
`marketing-consent` 10 · `payments-refund-vat` 9 · `payments-cash-zreport` 6 — ຜ່ານໝົດ. ທັງ backend 330+ ຜ່ານ; ລົ້ມສະເພາະ 3 ໄຟລ໌ເດີມທີ່ບໍ່ກ່ຽວ: `chat`/`chat-lock.job` (ວັນທີ +6 ຕົກວັນອາທິດ = ບໍ່ມີ slot), `audit-log`/`bank-changes` (ແຂ່ງ DB ຕອນແລ່ນຂະໜານ, ຜ່ານເມື່ອແລ່ນດ່ຽວ).
ຍັງບໍ່ໄດ້ທົດສອບດ້ວຍສາຍຕາໃນ browser/ເຄື່ອງຈິງ (web-admin: ConsentSheet, RefundPanel, ReceiptDialog, VatReportSheet, ZReportDialog, CashVarianceCard; mobile: NotificationPreferencesScreen + ຕິກ opt-in ໃນ Register).

## ແກ້ຂໍ້ຈຳກັດ (2026-09-23) — migration `20260923100000_limitations_vat_clawback_channels_ledger_lock` + `20260923100100_ledger_lock_allow_fk_set_null`

| ຂໍ້ຈຳກັດເດີມ | ແກ້ແນວໃດ |
|---|---|
| ຄືນເງິນບິນຊື້ບັດຂອງຂວັນ/ແພັກເກັດ ບໍ່ໄດ້ | `RefundView.billKind`. ບັດຂອງຂວັນ: ຄືນໄດ້ ≤ ຍອດເຫຼືອໃນບັດ (ລົບຄຳຂໍທີ່ຄ້າງ), ຕອນຈ່າຍຫັກອອກຈາກບັດ (`deductGiftCardForRefund`; ເຫຼືອ 0 → VOID; ບັດຖືກໃຊ້ລະຫວ່າງທາງ → 409). ແພັກເກັດ: ≤ ລາຄາ × ຄັ້ງທີ່ເຫຼືອ/ຄັ້ງທັງໝົດ, ຄຳຂໍດຽວ, ຈ່າຍ → UserPackage VOID + ສິດ 0 |
| ຄືນ PACKAGE_CREDIT ບໍ່ໄດ້ | `returnPackageUnit: true` (amount = 0 ໄດ້) → allocation kind `PACKAGE`; ຈ່າຍ → ຄືນສິດ 1 ຄັ້ງ (ນັດທີ່ໃຊ້ສິດ ຫຼື ລາຍການບໍລິການດຽວກັນໃນແພັກເກັດຂອງ tender); ບໍ່ນັບເປັນເງິນ/VAT; ຄອມຖືກດຶງເຕັມ |
| ຄອມທີ່ຈ່າຍແລ້ວບໍ່ຖືກດຶງ | ຕາຕະລາງ `CommissionClawback` (1 ແຖວ/refund, monthYear = ເດືອນວຽງຈັນທີ່ຈ່າຍຄືນ). payroll: `clawbackTotal/clawbackUnsettled`, payable = ຄອມ + ໂບນັດ − clawback; ກົດຈ່າຍຄອມເດືອນນັ້ນ → `isSettled` |
| ດຶງຄະແນນບໍ່ຫຼຸດ tier | lifetime = ບວກ (ບໍ່ນັບ `refund:*` ທີ່ເປັນການຄືນຄະແນນແລກ) + `clawback:*`; `clawbackEarnedPoints` ຄິດ tier ໃໝ່ |
| VAT inclusive ເທົ່ານັ້ນ | `VatSettings.mode` INCLUSIVE/EXCLUSIVE + `Payment.vatMode`. EXCLUSIVE: ບວກພາສີເທິງລາຄາຕອນສ້າງບິນ (ນັດ/ກຸ່ມ/ແພັກເກັດ) ແລະ ຢຸດທັນທີ; ມັດຈຳຄິດຈາກຍອດລວມພາສີ. ບິນຊື້ບັດຂອງຂວັນບໍ່ຄິດ VAT (voucher — ເມື່ອກ່ອນຖືກແຍກ VAT ຊ້ຳ) |
| SMS/ອີເມວ/LINE ສົ່ງບໍ່ໄດ້ | `services/channels.ts` (fetch, ບໍ່ມີ SDK): SMS gateway HTTP, ອີເມວ resend/sendgrid, LINE Messaging API. ແຄມເປນມີ `channels[]`; ລູກຄ້າໄດ້ສະເພາະຊ່ອງທີ່ opt-in + ມີຂໍ້ມູນຕິດຕໍ່; ຊ່ອງທີ່ບໍ່ຕັ້ງ env → `byChannel.noProvider` (ບໍ່ທຳທ່າວ່າສົ່ງ). STOP: `POST /consent/sms/inbound` (header secret), LINE webhook (ລາຍເຊັນ) STOP/unfollow, `GET /consent/unsubscribe` (HTML). ຜູກ LINE: ລະຫັດຈາກແອັບ → ສົ່ງໃຫ້ OA. env ໃໝ່ເບິ່ງ `.env.example` |
| "ລັອກ" Z-report ບໍ່ບັງຄັບໂດຍ DB | trigger BEFORE UPDATE: ບິນທີ່ມີ INV, ລາຍການຮັບເງິນຂອງບິນ INV ຫຼື ໃນກະທີ່ປິດ (+ ຫ້າມ INSERT ຍ້ອນຫຼັງເຂົ້າກະປິດ), CN ທີ່ອອກແລ້ວ, ກະທີ່ປິດ/ມີ Z, movement ຂອງກະປິດ → `LEDGER_LOCKED` (API 409). ອະນຸຍາດ: refundedAmount ເພີ່ມ, status → REFUNDED, ຜູກ bankAccountId, FK SET NULL. **ບໍ່ລັອກ DELETE** (test cleanup + cascade) |

ອື່ນໆ: `utils/serializable.ts` `runSerializable` (retry P2034) ໃຊ້ໃນ addTenders/refund/void/booking — ເມື່ອກ່ອນທຸລະກຳພ້ອມກັນໄດ້ 500.
UI: web-admin RefundPanel (ຄືນສິດແພັກເກັດ), VAT mode, ເລືອກຊ່ອງທາງແຄມເປນ + ສະຖານະຕັ້ງຄ່າ, payslip ແຖວ clawback; mobile NotificationPreferences 4 ຊ່ອງ + ຜູກ LINE.
Tests: `wave10-limitations` 7 ✓; ທັງ backend 353/353 ✓ (2 ຮອບ); web-admin 157 ✓. ຍັງບໍ່ໄດ້ທົດສອບກັບ SMS gateway/LINE/ອີເມວ ຈິງ (mock fetch) ແລະ ຍັງບໍ່ໄດ້ເບິ່ງ UI ໃນ browser/ເຄື່ອງ.
