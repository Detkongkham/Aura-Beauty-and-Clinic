# ການວິເຄາະໝວດ **ການເງິນ & ການຕະຫຼາດ** (Finance & Marketing) — ທຽບມາດຕະຖານສາກົນ

> **ສະຖານະເອກະສານ:** ຂໍ້ສະເໜີ (proposal) — ຍັງ **ບໍ່ທັນລົງມືເຮັດ**. ຂຽນໄວ້ໃຫ້ເຈົ້າຂອງໂຄງການອ່ານ ແລະ ຕັດສິນໃຈເລືອກເອົາເປັນ wave.
> **ວັນທີວິເຄາະ:** 2026-09-16
> **ຂອບເຂດ:** Module 08 (Payments/Split Tender/Deposit), 09 (Commission/Payroll — ສະເພາະດ້ານບັນຊີ), 11 (Expense & P&L), 12 (Multi-Currency), 13 (Gift Cards), 18 (Packages), 19 (Loyalty), 24 (CRM Marketing), 28 (Dynamic Pricing — ດ້ານລາຄາ), 33 (Referral/Affiliate — ດ້ານຈ່າຍເງິນ)
> **ວິທີກວດ:** ອ່ານໂຄດຈິງທັງໝົດຂອງ `payments/`, `loyalty/`, `gift-cards/`, `marketing/`, `prisma/schema/finance.prisma`, `inventory.prisma`, `catalog.prisma`, `system.prisma`, ໜ້າ web-admin `features/finance|marketing|loyalty|giftcards`, ແລະ ທຽບກັບ `implementation_plan.md` ຕົ້ນສະບັບ.
> **ມາດຕະຖານອ້າງອີງ:** IFRS 15 (Revenue from Contracts with Customers), IAS 21 (FX), PCI-DSS v4.0 SAQ-A, ISO 20022 / ISO 4217, OWASP ASVS v4 (§ 4 Access Control, § 11 Business Logic), COSO Internal Control (Segregation of Duties), ກົດໝາຍວ່າດ້ວຍການປົກປ້ອງຂໍ້ມູນສ່ວນບຸກຄົນ (ລາວ) + GDPR Art. 6/7/21 + PDPA (ໄທ/ສິງກະໂປ) + CAN-SPAM / TCPA ສຳລັບການຕະຫຼາດ.

---

## 0. ບົດສະຫຼຸບຜູ້ບໍລິຫານ (TL;DR)

ໝວດການເງິນ & ການຕະຫຼາດ **ເຮັດວຽກໄດ້ໃນລະດັບ demo/MVP** — ເປີດບິນ, ມັດຈຳ, split tender, ຄະແນນສະສົມ, ບັດຂອງຂວັນ, ແຄມເປນ push — ແຕ່ **ຍັງບໍ່ພ້ອມໃຊ້ງານຈິງກັບເງິນຈິງ**. ມີ 3 ກຸ່ມບັນຫາ:

| # | ກຸ່ມ | ສະຫຼຸບ |
|---|------|--------|
| 1 | **ຮູຮົ່ວທາງການເງິນ (ວິກິດ)** | `POST /gift-cards` ອອກບັດມູນຄ່າສູງສຸດ **20,000,000 LAK ໄດ້ໂດຍບໍ່ຕ້ອງຈ່າຍເງິນ** ແລະ ລູກຄ້າທົ່ວໄປກໍຮຽກໄດ້ → ຜະລິດເງິນເອງແລ້ວເອົາມາຈ່າຍບິນ. ບວກກັບ race condition ໃນ split tender ແລະ ການບໍ່ມີ idempotency key. |
| 2 | **ຂາດຊັ້ນບັນຊີ (accounting layer) ທັງໝົດ** | ບໍ່ມີ refund/void, ບໍ່ມີເລກໃບບິນ/ໃບຮັບເງິນ, ບໍ່ມີ VAT, ບໍ່ມີປິດຮອບວັນ/ປິດລິ້ນຊັກ, ບໍ່ມີລາຍຈ່າຍ & P&L (Module 11 **ບໍ່ເຄີຍຖືກບັນຈຸໃສ່ phase ໃດເລີຍ**), ບໍ່ມີອັດຕາແລກປ່ຽນຝັ່ງ server (Module 12 ກໍ**ບໍ່ເຄີຍຖືກບັນຈຸ**), ບໍ່ມີການແຍກ "ເງິນທີ່ຮັບ" ກັບ "ລາຍຮັບທີ່ຮັບຮູ້" (deferred revenue) ຕາມ IFRS 15. |
| 3 | **ການຕະຫຼາດຍັງເປັນພຽງ "ສົ່ງ push ຫາທຸກຄົນ"** | ບໍ່ມີ consent/opt-out (**ຜິດກົດໝາຍ** ໃນເກືອບທຸກເຂດອຳນາດ), `discountCode` ເປັນພຽງ string ທີ່ພິມໃສ່ຂໍ້ຄວາມ — **ບໍ່ມີກົນໄກແລກຈິງ**, `convertedAt` ບໍ່ເຄີຍຖືກຂຽນ → ອັດຕາ conversion = 0 ຕະຫຼອດ, ບໍ່ມີການຈັດກຸ່ມລູກຄ້າ (segment), ບໍ່ມີການຕັ້ງເວລາສົ່ງ, ບໍ່ມີ SMS/email. |

**ຂໍ້ສະເໜີ:** ແບ່ງເປັນ 10 wave (10A–10J). **10A ເປັນ blocker ແທ້** (ຕ້ອງເຮັດກ່ອນເປີດໃຊ້ຈິງ), 10B/10C/10G ເປັນ "ຕ້ອງມີເພື່ອຖືກກົດໝາຍ/ກວດສອບໄດ້", ທີ່ເຫຼືອເລືອກຕາມຄວາມຕ້ອງການທຸລະກິດ.

---

## 1. ສິ່ງທີ່ມີແລ້ວໃນປັດຈຸບັນ (baseline)

### 1.1 Backend

| ໂມດູນ | ໄຟລ໌ | ມີຫຍັງແດ່ |
|-------|------|-----------|
| Payments (M08) | `apps/backend/src/modules/payments/payments.service.ts` (539 ແຖວ) | ເປີດບິນຈາກ appointment/bookingGroup, ອັດຕາມັດຈຳ 20–50% ຈາກ `AppSetting`, QR intent (mock BCEL), `settle-mock`, split tender 6 ວິທີ, ຄຳນວນສະຖານະ PENDING/DEPOSIT_PAID/FULLY_PAID, ສະຫຼຸບການເງິນ + ແຍກຕາມວິທີຈ່າຍ |
| Loyalty (M19) | `modules/loyalty/loyalty.service.ts` (281) | ບັນຊີຄະແນນ, ledger EARN/REDEEM/ADJUST, tier SILVER/GOLD/PLATINUM ຄຳນວນຈາກ lifetime points, ປັບຄະແນນດ້ວຍມື |
| Gift Cards (M13) | `modules/gift-cards/gift-cards.service.ts` (239) | ອອກບັດ + ledger `GiftCardTransaction`, ຄົ້ນຫາຕາມລະຫັດ, ຫັກຍອດຕອນຈ່າຍ, ອາຍຸ 12 ເດືອນ |
| Marketing (M24) | `modules/marketing/marketing.service.ts` (275) | CRUD ແຄມເປນ 4 ປະເພດ (BIRTHDAY / WIN_BACK / FESTIVAL_PROMO / CUSTOM), audience ງ່າຍໆ, ສົ່ງ push, ບັນທຶກ `CampaignRecipient`, job ກວາດປະຈຳວັນ |
| Commission (M09) | `modules/payroll/payroll.service.ts` | `StaffCommission` ສ້າງຕອນນັດ COMPLETED, ສະຫຼຸບຈ່າຍເງິນເດືອນ |
| Referral (M33) | `modules/referral/` | referral code + affiliate profile + payout |

### 1.2 Frontend

- `apps/web-admin/src/features/finance/` — KPI 4 ຕົວ (gross / deposits / outstanding / count), ແຍກຕາມວິທີຈ່າຍ, ຕາຕະລາງບິນ, CSV export, sheet ລາຍລະອຽດ tender
- `features/marketing/` — CRUD ແຄມເປນ + ປຸ່ມ run + sheet ຜູ້ຮັບ
- `features/loyalty/`, `features/giftcards/` — ຄົບ CRUD ພື້ນຖານ
- `features/fx/fx.api.ts` + `lib/fx.ts` — ດຶງອັດຕາແລກປ່ຽນ **ຈາກ browser ຢ່າງດຽວ** (open.er-api.com), ເກັບ localStorage, ໃຊ້ສະແດງຜົນເທົ່ານັ້ນ
- Mobile — `PaymentScreen` (QR ມັດຈຳ / ຈ່າຍເຕັມແບບ split), `LoyaltyScreen`, `GiftCardsScreen`

### 1.3 Schema ທີ່ມີແຕ່ **ບໍ່ມີໂຄດໃຊ້ເລີຍ** (dead tables)

| Model | ໄຟລ໌ | ສະຖານະ |
|-------|------|--------|
| `Expense` | `prisma/schema/inventory.prisma:176` | ຕາຕະລາງມີ — **0 ການອ້າງອີງໃນ `src/`** |
| `ExchangeRate` | `prisma/schema/catalog.prisma:81` | ຕາຕະລາງມີ — **0 ການອ້າງອີງໃນ `src/`** |

ນີ້ຄືຫຼັກຖານວ່າ **Module 11 ແລະ Module 12 ຖືກຂ້າມໄປ**: ໃນ `implementation_plan.md` ພວກມັນຢູ່ໝວດທີ 2 (ການເງິນ) ແຕ່ Phase 5 map ພຽງ 08/10/13/19/20/23/24, Phase 6 = 14/32/37/34, Phase 7 = 28/33/29/30/31/35/36. **ບໍ່ມີ phase ໃດຮັບຜິດຊອບ M11 ແລະ M12.**

---

## 2. ຊ່ອງໂຫວ່ & ບັກ ໃນໂຄດປັດຈຸບັນ (ຈັດລະດັບຄວາມຮ້າຍແຮງ)

### 🔴 C1 — ອອກບັດຂອງຂວັນໄດ້ຟຣີ ໂດຍບໍ່ຕ້ອງຈ່າຍເງິນ (ຮູຮົ່ວທາງການເງິນໂດຍກົງ)

`gift-cards.routes.ts:17` ໃຊ້ພຽງ `authGuard` — **ບໍ່ມີ `roleGuard`**. `issueGiftCard()` ສ້າງບັດພ້ອມຍອດເງິນເຕັມທັນທີ ໂດຍ**ບໍ່ມີການເຊື່ອມກັບ `Payment` ໃດໆ**.

ຜົນ: ລູກຄ້າທົ່ວໄປ (role `CUSTOMER`) → `POST /gift-cards {amount: 20000000}` → ໄດ້ບັດ 20 ລ້ານກີບ → ໃຊ້ເປັນ tender `GIFT_CARD` ຈ່າຍບິນ → **ບໍລິການຟຣີບໍ່ຈຳກັດ**. ເຮັດຊ້ຳໄດ້ບໍ່ຈຳກັດຈຳນວນບັດ.

**ຕ້ອງແກ້:** ບັດຕ້ອງອອກໄດ້ 2 ທາງເທົ່ານັ້ນ — (ກ) admin ອອກດ້ວຍມື (ມີ audit log + ເຫດຜົນ), (ຂ) ລູກຄ້າ**ຊື້** ຜ່ານ `Payment` ທີ່ຢູ່ສະຖານະ FULLY_PAID ກ່ອນ ຈຶ່ງ activate ບັດ. ເພີ່ມ `GiftCard.status` (`PENDING_PAYMENT` → `ACTIVE` → `DEPLETED`/`EXPIRED`/`VOID`) + `purchasePaymentId`.

### 🔴 C2 — Race condition ໃນ split tender → ຈ່າຍເກີນ / ຫັກຊ້ຳ

`payments.service.ts:370–376` ອ່ານຍອດທີ່ຈ່າຍແລ້ວ **ນອກ** transaction, ແລ້ວຄ່ອຍເປີດ `$transaction` ທີ່ແຖວ 378.

ຜົນ: 2 request ພ້ອມກັນ (ຫຼື ກົດປຸ່ມຊ້ຳ 2 ເທື່ອ) ຕ່າງກໍອ່ານ `alreadyPaid` ຄ່າເກົ່າ → ຜ່ານດ່ານກວດ → ຫັກບັດຂອງຂວັນ/ຄະແນນ 2 ເທື່ອ, ບິນຈ່າຍເກີນ.

**ຕ້ອງແກ້:** ຍ້າຍການອ່ານ + ກວດ + ຂຽນ ເຂົ້າ transaction ດຽວ ພ້ອມ `SELECT … FOR UPDATE` ໃສ່ແຖວ `payments` (Prisma: `$queryRaw` lock ຫຼື `isolationLevel: 'Serializable'`).

### 🔴 C3 — ບໍ່ມີ Idempotency Key ໃນທຸກ endpoint ທີ່ແຕະເງິນ

`payments.routes.ts` ມີພຽງ comment ວ່າ "idempotent" ແຕ່**ບໍ່ມີການ implement**. `POST /:id/tenders`, `/:id/deposit-intent`, `/:id/settle-mock` ທັງໝົດຊ້ຳໄດ້.

ນີ້ຄືຂໍ້ກຳນົດພື້ນຖານຂອງທຸກ payment API ສາກົນ (Stripe `Idempotency-Key`, Adyen `idempotencyKey`, ISO 20022 `EndToEndId`). ມືຖືເນັດຂາດແລ້ວ retry = ຫັກ 2 ເທື່ອ.

**ຕ້ອງແກ້:** ຕາຕະລາງ `IdempotencyKey(key, userId, endpoint, requestHash, responseJson, createdAt)` + middleware; header `Idempotency-Key` ບັງຄັບໃນ route ການເງິນ.

### 🔴 C4 — ລູກຄ້າຢືນຢັນເອງວ່າ "ຂ້ອຍຈ່າຍແລ້ວ"

`settleMock()` (`payments.service.ts:247`) ເອີ້ນ `getPayment()` ເຊິ່ງ `assertCanAccess` **ອະນຸຍາດເຈົ້າຂອງບິນ**. ໝາຍຄວາມວ່າລູກຄ້າກົດ "ຂ້ອຍຈ່າຍແລ້ວ" ໃນແອັບ → ບິນເປັນຈ່າຍແລ້ວ → ນັດຖືກ CONFIRMED → ໄດ້ຄະແນນສະສົມ.

ໃນ demo ຮັບໄດ້, ແຕ່**ຫ້າມຫຼຸດຂຶ້ນ production**. ຕ້ອງມີ webhook ຈິງຈາກ BCEL/Stripe ພ້ອມ HMAC signature verification, replay-window, ແລະ `settle-mock` ຕ້ອງປິດດ້ວຍ `env.NODE_ENV !== 'production'`.

### 🟠 H1 — QR intent ໝົດອາຍຸແລ້ວຍັງ settle ໄດ້

`createDepositIntent` ຄືນ `expiresAt` ໃຫ້ client (ແຖວ 242) ແຕ່**ບໍ່ເກັບໃສ່ DB** ແລະ `settleMock` ບໍ່ກວດອາຍຸ. QR ເກົ່າ 3 ອາທິດຍັງເອົາມາຢືນຢັນໄດ້. ນອກນັ້ນທຸກຄັ້ງທີ່ເປີດໜ້າຈ່າຍເງິນ ຈະສ້າງ `PaymentTransaction` ສະຖານະ PENDING ໃໝ່ຄ້າງໄວ້ເລື້ອຍໆ (orphan rows, ບໍ່ມີ job ລ້າງ).

### 🟠 H2 — ມີ "ລາຍຮັບ" 2 ແຫຼ່ງທີ່ບໍ່ກົງກັນ

- `/finance` (`financeSummary`) = ຜົນລວມ `PaymentTransaction` ທີ່ SUCCESS → **ເງິນທີ່ຮັບຈິງ (cash basis)**
- `/dashboard` + `/reports` (`dashboard.service.ts:94–104`) = ຜົນລວມ `Appointment.totalAmount` ຂອງນັດ COMPLETED → **ຍອດຕາມລາຄາຈອງ (accrual-ish)**

ສອງໜ້ານີ້ຈະສະແດງຕົວເລກຕ່າງກັນຕະຫຼອດ (ນັດສຳເລັດແຕ່ຍັງບໍ່ຈ່າຍ, ຫຼື ຈ່າຍມັດຈຳລ່ວງໜ້າ) ໂດຍບໍ່ມີຄຳອະທິບາຍໃນ UI. ຕາມ IFRS ຕ້ອງນິຍາມໃຫ້ຊັດວ່າອັນໃດຄື revenue ແລະ ອັນໃດຄື cash collected, ແລ້ວຕັ້ງຊື່ຄໍລຳໃຫ້ຖືກ.

### 🟠 H3 — `financeSummary` ໂຫຼດທຸກບິນເຂົ້າ memory

`payments.service.ts:492` `findMany` **ບໍ່ມີ `take`** ພ້ອມ `include: transactions` ທັງໝົດ ແລ້ວວົນ loop ໃນ JS. ຊ່ວງ default = 30 ວັນ ແຕ່ຜູ້ໃຊ້ເລືອກ 1 ປີໄດ້. ຮ້ານທີ່ມີ 50,000 ບິນ → ດຶງ 50,000 ແຖວ + ຫຼາຍແສນ transaction ເຂົ້າ Node. (ບັນຫາແບບດຽວກັນກັບ `appointments-page-money` ທີ່ເຄີຍບັນທຶກໄວ້.) ຄວນຍ້າຍໄປ `groupBy` / raw SQL aggregate.

### 🟠 H4 — `REFUNDED` ມີແຕ່ຊື່ — ບໍ່ມີກົນໄກຄືນເງິນ

`PaymentStatus.REFUNDED` ຖືກອ່ານທີ່ `payments.service.ts:514` ເພື່ອລວມຍອດ ແຕ່**ບໍ່ມີ endpoint, ບໍ່ມີ service, ບໍ່ມີ UI ໃດໆ ທີ່ຕັ້ງຄ່ານີ້ໄດ້** → ຄ່າ `refunded` ໃນ dashboard = 0 ຕະຫຼອດໄປ. ນອກນັ້ນສູດຄຳນວນໃຊ້ `totalAmount` ເຕັມ (ບໍ່ຮອງຮັບຄືນບາງສ່ວນ).

### 🟠 H5 — ຄະແນນສະສົມບໍ່ມີວັນໝົດອາຍຸ ແລະ ບໍ່ມີການປັບຄືນເມື່ອຍົກເລີກ

- `LoyaltyTxType.EXPIRE` ມີໃນ enum ແຕ່**ບໍ່ມີ job ໃດສ້າງມັນ** → ໜີ້ສິນຄະແນນ (points liability) ເພີ່ມຂຶ້ນຕະຫຼອດການ, ບໍ່ມີວັນຫຼຸດ
- ຖ້າຍົກເລີກນັດ/ຄືນເງິນຫຼັງໄດ້ຄະແນນແລ້ວ → ຄະແນນບໍ່ຖືກດຶງຄືນ (ບໍ່ມີ clawback)
- `earnPoints` ຖືກເອີ້ນ **2 ບ່ອນ** (ຕອນບິນ FULLY_PAID ທີ່ `payments.service.ts:427` ແລະ ຕອນນັດ COMPLETED ໃນ `appointments`/`staff-portal`) — ກັນຊ້ຳດ້ວຍ `refId` ແຕ່ໃຊ້ຄ່າ refId ຄົນລະແບບ (`appt:<id>`) ຈຶ່ງຕ້ອງກວດຄືນໃຫ້ແນ່ໃຈວ່າບໍ່ໃຫ້ຄະແນນ 2 ເທື່ອ
- ບໍ່ມີ tier **downgrade** ແລະ ບໍ່ມີອາຍຸ tier (ໃຊ້ lifetime points ຢ່າງດຽວ → ຂຶ້ນແລ້ວຂຶ້ນຕະຫຼອດ) — ຕ່າງຈາກມາດຕະຖານອຸດສາຫະກຳທີ່ໃຊ້ rolling 12 ເດືອນ

### 🟠 H6 — ການຕະຫຼາດ: ບໍ່ມີ consent / opt-out ເລີຍ (ຄວາມສ່ຽງທາງກົດໝາຍ)

ໃນ `model User` (`auth.prisma:18–63`) **ບໍ່ມີ field ໃດກ່ຽວກັບຄວາມຍິນຍອມທາງການຕະຫຼາດ**. ຄົ້ນຫາ `marketingOptIn|unsubscribe|NotificationPreference` ໃນທັງ repo → **0 ຜົນ**. `runCampaign()` ສົ່ງຫາທຸກຄົນທີ່ຕົງເງື່ອນໄຂ ໂດຍບໍ່ກວດຫຍັງເລີຍ.

ນີ້ຂັດກັບ GDPR Art. 6(1)(a)/7/21, PDPA, CAN-SPAM §5 (ຕ້ອງມີກົນໄກຖອນຕົວ ແລະ ຕ້ອງເຄົາລົບພາຍໃນ 10 ວັນ), TCPA (SMS ຕ້ອງມີ express written consent) ແລະ ກົດໝາຍປົກປ້ອງຂໍ້ມູນສ່ວນບຸກຄົນຂອງ ສປປ ລາວ.

### 🟠 H7 — `discountCode` ບໍ່ມີກົນໄກແລກຈິງ

`marketing.service.ts:236` ພຽງແຕ່**ຕໍ່ຂໍ້ຄວາມ** `(ໂຄ້ດ: XXX)` ໃສ່ທ້າຍ push. ບໍ່ມີ:
- ຕາຕະລາງ promotion/coupon
- ການກວດຄວາມຖືກຕ້ອງຕອນຈອງ/ຈ່າຍ (booking, payments ບໍ່ຮູ້ຈັກ `discountCode` ເລີຍ)
- ຈຳກັດຈຳນວນຄັ້ງ, ຈຳກັດຕໍ່ຄົນ, ຍອດຊື້ຂັ້ນຕ່ຳ, ບໍລິການທີ່ຍົກເວັ້ນ, ວັນໝົດອາຍຸ, ຈຳກັດສາຂາ
- ການຫ້າມໃຊ້ຊ້ອນ (stacking rules) ກັບ dynamic pricing (M28) ແລະ referral (M33)

ຜົນ: ພະນັກງານຕ້ອງລົດລາຄາດ້ວຍມື → ບໍ່ມີຮ່ອງຮອຍ, ໂກງໄດ້ງ່າຍ, ວັດຜົນແຄມເປນບໍ່ໄດ້.

### 🟠 H8 — `convertedAt` ບໍ່ເຄີຍຖືກຂຽນ → ROI ແຄມເປນ = 0 ຕະຫຼອດ

`convertedAt` ຖືກ**ອ່ານ** 4 ບ່ອນ (ນັບ `convertedCount`) ແຕ່**ບໍ່ມີບ່ອນຂຽນເລີຍ**. ໜ້າ CampaignsPage ຈຶ່ງສະແດງ conversion 0% ສະເໝີ — ຕົວເລກຫຼອກ.

### 🟡 M1 — `runCampaign` ສົ່ງແບບ sequential ໃນ HTTP request

ວົນ loop `for … await` ສູງສຸດ 5,000 ຜູ້ໃຊ້ (`marketing.service.ts:225`) ຢູ່ໃນ request ຂອງ admin → timeout, ສົ່ງເຄິ່ງທາງ, ກົດຊ້ຳໄດ້. ຄວນ enqueue ເຂົ້າ BullMQ (ມີ infra ຢູ່ແລ້ວ) ພ້ອມ batch + rate limit + progress.

### 🟡 M2 — ບໍ່ມີເລກໃບບິນ/ໃບຮັບເງິນ

`Payment.id` ເປັນ UUID. ບໍ່ມີ `invoiceNo` / `receiptNo` ທີ່ຮຽງຕໍ່ເນື່ອງ, ບໍ່ຂາດຕອນ, ແລະ ບໍ່ຊ້ຳ (gapless sequential numbering) ເຊິ່ງເປັນຂໍ້ກຳນົດຂອງກົມສ່ວຍສາອາກອນເກືອບທຸກປະເທດ ແລະ ຂອງມາດຕະຖານ e-invoice (EN 16931, PEPPOL BIS 3.0).

### 🟡 M3 — ບໍ່ມີ VAT / ພາສີ

`settings.service.ts` ມີພຽງ `taxId: ''` ເປັນຂໍ້ຄວາມ. ບໍ່ມີ tax rate, ບໍ່ມີ tax-inclusive/exclusive, ບໍ່ມີການແຍກ VAT ໃນບິນ, ບໍ່ມີລາຍງານພາສີ. ອັດຕາ VAT ຂອງ ສປປ ລາວ = 10%.

### 🟡 M4 — ບໍ່ມີ ລິ້ນຊັກເງິນສົດ / ຮອບເຮັດວຽກ / ປິດຮອບວັນ

ບໍ່ມີ `CashDrawer`, `Shift`, `CashCount`, `PayInOut`. ເງິນສົດຮັບເຂົ້າໂດຍບໍ່ມີໃຜຮັບຜິດຊອບ, ບໍ່ມີການນັບເງິນທ້າຍວັນ, ບໍ່ມີ over/short report. ນີ້ຄື control ພື້ນຖານທີ່ສຸດຂອງທຸກ POS ສາກົນ (Square, Toast, Zenoti, Mindbody ມີໝົດ).

### 🟡 M5 — ບໍ່ມີ ລາຍຈ່າຍ & ງົບກຳໄລຂາດທຶນ (Module 11)

ຕາຕະລາງ `Expense` ມີ ແຕ່ບໍ່ມີ API, ບໍ່ມີ UI, ບໍ່ມີໝວດລາຍຈ່າຍມາດຕະຖານ, ບໍ່ມີ recurring expense, ບໍ່ມີໃບຮັບເງິນແນບ, ບໍ່ມີການອະນຸມັດ, ແລະ **ບໍ່ມີງົບ P&L**. ໂດຍບໍ່ມີອັນນີ້ ລະບົບບອກໄດ້ແຕ່ "ຂາຍໄດ້ເທົ່າໃດ" ບອກບໍ່ໄດ້ວ່າ "ກຳໄລເທົ່າໃດ".

### 🟡 M6 — Multi-currency ຍັງເປັນພຽງການສະແດງຜົນຝັ່ງ browser (Module 12)

`lib/fx.ts` ດຶງອັດຕາຈາກ browser, cache ໃສ່ localStorage, ມີ fallback ຄົງທີ່ (USD 1 / THB 33 / LAK 21600). ຕາຕະລາງ `ExchangeRate` ຝັ່ງ server ບໍ່ຖືກໃຊ້.

ຜົນຕາມ IAS 21: ບໍ່ມີການ **ລັອກອັດຕາໃນເວລາເຮັດທຸລະກຳ** → ບິນເກົ່າຈະປ່ຽນມູນຄ່າໄປເລື້ອຍໆຕາມອັດຕາມື້ນີ້; ບໍ່ສາມາດ audit ໄດ້; ຜູ້ໃຊ້ແຕ່ລະຄົນເຫັນຕົວເລກຕ່າງກັນ; ບໍ່ມີ FX gain/loss.

### 🟡 M7 — ບໍ່ມີ deferred revenue / ໜີ້ສິນ (IFRS 15)

ມັດຈຳ, ບັດຂອງຂວັນທີ່ຍັງບໍ່ໃຊ້, ຄອສ (package) ທີ່ຍັງບໍ່ຕັດຮອບ, ຄະແນນສະສົມ — ທັງໝົດນີ້ຕາມ IFRS 15 ຄື **ໜີ້ສິນ (contract liability)** ບໍ່ແມ່ນລາຍຮັບ. ຈະຮັບຮູ້ເປັນລາຍຮັບກໍຕໍ່ເມື່ອໃຫ້ບໍລິການແລ້ວ. ລະບົບປັດຈຸບັນນັບເງິນທີ່ຮັບເປັນ "gross revenue" ໝົດ → ຕົວເລກລາຍຮັບເກີນຄວາມຈິງ.

ຍັງບໍ່ມີ:
- ລາຍງານຍອດຄ້າງບັດຂອງຂວັນ (outstanding gift card liability) + breakage (ບັດໝົດອາຍຸທີ່ບໍ່ໃຊ້ → ຮັບຮູ້ເປັນລາຍຮັບ)
- ລາຍງານໜີ້ສິນຄະແນນ (points liability) ຕີມູນຄ່າ
- ລາຍງານຍອດຄອສຄົງເຫຼືອ (unredeemed package units)

### 🟡 M8 — ບໍ່ມີການແຍກໜ້າທີ່ (Segregation of Duties)

ສິດ `finance:manage` ອະນຸຍາດໃຫ້ຄົນດຽວເຮັດໄດ້ທັງ ປັບຄະແນນດ້ວຍມື, ອອກບັດຂອງຂວັນ, ແກ້ບິນ. ຕາມ COSO ຕ້ອງແຍກ "ຜູ້ບັນທຶກ" ກັບ "ຜູ້ອະນຸມັດ", ແລະ ລາຍການທີ່ເກີນເພດານຕ້ອງມີຜູ້ອະນຸມັດຄົນທີ 2 (maker-checker). ໂດຍສະເພາະ `POST /loyalty/accounts/:userId/adjust` ແລະ refund ໃນອະນາຄົດ.

### 🟢 L1–L6 — ຈຸດນ້ອຍ

| # | ລາຍລະອຽດ |
|---|-----------|
| L1 | `round2()` ໃຊ້ float ກາງທາງ (`money.ts`) — LAK ບໍ່ມີທົດສະນິຍົມ (ISO 4217 minor unit = 0). ຄວນປັດເປັນຈຳນວນເຕັມສຳລັບ LAK ແລະ ຄິດໄລ່ດ້ວຍ `Prisma.Decimal` ໂດຍບໍ່ຜ່ານ `number` |
| L2 | `getDepositRate()` clamp ຂັ້ນຕ່ຳ 0.2 → ຕັ້ງ "ບໍ່ເກັບມັດຈຳ" (0%) ບໍ່ໄດ້ ເຖິງວ່າຈະຕັ້ງ AppSetting ເປັນ 0 |
| L3 | `GET /gift-cards/lookup` ເປີດໃຫ້ຜູ້ໃຊ້ທຸກຄົນ ແລະ ຄືນຍອດ + ປະຫວັດ 20 ລາຍການ — ບໍ່ມີ rate limit ສະເພາະ → ສ່ຽງ code enumeration |
| L4 | `depositsCollected` ໃນ summary ນັບຍອດຈ່າຍທັງໝົດຂອງບິນທີ່ສະຖານະ DEPOSIT_PAID (ບໍ່ແມ່ນຍອດມັດຈຳຕົວຈິງ) — ຊື່ກັບຄວາມໝາຍບໍ່ກົງ |
| L5 | `outstandingBalance` ນັບລວມບິນຂອງນັດທີ່ຍົກເລີກ/no-show ນຳ → ຕົວເລກ "ຄ້າງຮັບ" ເກີນຄວາມຈິງ |
| L6 | ບໍ່ມີ `CampaignRecipient.channel` / `deliveredAt` / `openedAt` / `clickedAt` / `failureReason` → ວັດ deliverability ບໍ່ໄດ້ |

---

## 3. ຊ່ອງຫວ່າງທຽບມາດຕະຖານສາກົນ (ສິ່ງທີ່ "ຍັງບໍ່ມີ" ທັງໝົດ)

### 3.1 ດ້ານການເງິນ

| # | ຄວາມສາມາດ | ມາດຕະຖານ/ອ້າງອີງ | ສະຖານະ |
|---|-----------|------------------|--------|
| F-01 | Refund ເຕັມ/ບາງສ່ວນ + Void + ເຫດຜົນ + ຜູ້ອະນຸມັດ | ທຸກ PSP; PCI-DSS | ❌ ບໍ່ມີ |
| F-02 | Idempotency key ທຸກ mutation ການເງິນ | Stripe/Adyen API standard | ❌ ບໍ່ມີ |
| F-03 | Webhook ຈິງ + signature verification + replay protection | PSP integration standard | ❌ mock ເທົ່ານັ້ນ |
| F-04 | ເລກໃບບິນ/ໃບຮັບເງິນ ຮຽງຕໍ່ເນື່ອງບໍ່ຂາດຕອນ | ກົດໝາຍພາສີ; EN 16931 | ❌ ບໍ່ມີ |
| F-05 | VAT / ພາສີ (rate, inclusive/exclusive, ແຍກໃນບິນ, ລາຍງານ) | VAT ລາວ 10% | ❌ ບໍ່ມີ |
| F-06 | ລິ້ນຊັກເງິນສົດ / ຮອບເຮັດວຽກ / ນັບເງິນ / over-short | POS standard (Square, Toast) | ❌ ບໍ່ມີ |
| F-07 | ປິດຮອບວັນ (Z-report) ທີ່ລັອກຂໍ້ມູນ ແກ້ຍ້ອນຫຼັງບໍ່ໄດ້ | Fiscal/audit standard | ⚠️ ໜ້າ EndOfDay ເປັນລາຍງານເທົ່ານັ້ນ, ບໍ່ລັອກ |
| F-08 | ລາຍຈ່າຍ + ໝວດລາຍຈ່າຍ + ອະນຸມັດ + ໃບຮັບເງິນແນບ | Module 11 | ❌ ຕາຕະລາງຫວ່າງ |
| F-09 | ງົບກຳໄລຂາດທຶນ (P&L) ພ້ອມ COGS ຈາກ inventory | IAS 1 | ❌ ບໍ່ມີ |
| F-10 | Multi-currency ຝັ່ງ server + ລັອກອັດຕາໃນເວລາທຸລະກຳ + FX gain/loss | IAS 21; ISO 4217 | ❌ browser-only |
| F-11 | Deferred revenue / contract liability (ມັດຈຳ, ບັດ, ຄອສ, ຄະແນນ) | IFRS 15 | ❌ ບໍ່ມີ |
| F-12 | Gift card breakage + ລາຍງານໜີ້ສິນຄົງເຫຼືອ | IFRS 15 ¶B46 | ❌ ບໍ່ມີ |
| F-13 | Points expiry + points liability valuation | IFRS 15 material right | ❌ ບໍ່ມີ |
| F-14 | ກະທົບຍອດ (reconciliation) ກັບ statement ຂອງທະນາຄານ/PSP | Financial control | ❌ ບໍ່ມີ |
| F-15 | Maker-checker ສຳລັບລາຍການທີ່ເກີນເພດານ | COSO / SoD | ❌ ບໍ່ມີ |
| F-16 | Audit trail ຝັງແໜ້ນສຳລັບທຸກການປ່ຽນແປງຍອດເງິນ (immutable) | ISO 27001 A.12.4 | ⚠️ ມີ `AuditLog` ທົ່ວໄປ, ບໍ່ຄອບຄຸມ finance ຢ່າງເປັນລະບົບ |
| F-17 | ການສົ່ງອອກສູ່ໂປຣແກຼມບັນຊີ (journal entry export / CSV, XBRL) | ການປະຕິບັດທົ່ວໄປ | ❌ ບໍ່ມີ |
| F-18 | ຄ່າທຳນຽມ PSP (merchant fee) ແລະ net settlement | ການປະຕິບັດທົ່ວໄປ | ❌ ບໍ່ມີ |
| F-19 | Tip / ຄ່າບໍລິການ (service charge) + ການແບ່ງໃຫ້ພະນັກງານ | ອຸດສາຫະກຳຄວາມງາມ | ❌ ບໍ່ມີ |
| F-20 | ການຄິດຄ່າປັບ no-show / ຍົກເລີກຊ້າ ຈາກມັດຈຳ | ນະໂຍບາຍມາດຕະຖານຂອງ salon/spa | ❌ ບໍ່ມີ (ມີແຕ່ຢຶດມັດຈຳໂດຍປະລິຍາຍ) |

### 3.2 ດ້ານການຕະຫຼາດ

| # | ຄວາມສາມາດ | ມາດຕະຖານ/ອ້າງອີງ | ສະຖານະ |
|---|-----------|------------------|--------|
| M-01 | Consent ແຍກຕາມຊ່ອງທາງ + ວັນທີ + ຫຼັກຖານ + ຖອນຕົວ | GDPR Art.7; PDPA; TCPA | ❌ ບໍ່ມີ |
| M-02 | ໜ້າ "ຕັ້ງຄ່າການແຈ້ງເຕືອນ" ໃຫ້ລູກຄ້າເອງ (preference center) | CAN-SPAM §5 | ❌ ບໍ່ມີ |
| M-03 | ລິ້ງ/ຄຳສັ່ງຖອນຕົວ ໃນທຸກຂໍ້ຄວາມການຕະຫຼາດ | CAN-SPAM; PDPA | ❌ ບໍ່ມີ |
| M-04 | Quiet hours / ຈຳກັດຄວາມຖີ່ (frequency cap) | TCPA 8am–9pm; best practice | ❌ ບໍ່ມີ |
| M-05 | ກົນໄກ coupon/promotion ຈິງ (ກວດ, ຈຳກັດ, ໝົດອາຍຸ, stacking) | ທຸກ commerce platform | ❌ string ເປົ່າ |
| M-06 | ການຈັດກຸ່ມລູກຄ້າ (segment builder) ແບບເງື່ອນໄຂປະສົມ | CRM standard | ⚠️ ມີ 3 audience hard-coded |
| M-07 | ຕັ້ງເວລາສົ່ງ / ສົ່ງເປັນຊຸດ (drip / journey) | Marketing automation standard | ❌ ບໍ່ມີ |
| M-08 | ຫຼາຍຊ່ອງທາງ: SMS, email, LINE, WhatsApp, Telegram | Omnichannel | ⚠️ push ຢ່າງດຽວ (Telegram ມີແຕ່ໃຊ້ chatbot) |
| M-09 | A/B test + holdout group ເພື່ອວັດ incremental lift | Growth standard | ❌ ບໍ່ມີ |
| M-10 | Attribution: ຮັບຂໍ້ຄວາມ → ຈອງ → ຈ່າຍ (`convertedAt`, revenue attributed) | Marketing analytics | ❌ ບໍ່ຂຽນຄ່າ |
| M-11 | ວັດ deliverability: delivered / opened / clicked / bounced / failed | Email/SMS standard | ❌ ບໍ່ມີ field |
| M-12 | RFM segmentation, CLV, cohort retention, churn risk | CRM analytics standard | ❌ ບໍ່ມີ |
| M-13 | Template ພ້ອມຕົວແປ + preview + test-send + 2 ພາສາ | ESP standard | ⚠️ ມີ `NotificationTemplate` ແຕ່ແຄມເປນບໍ່ໃຊ້ |
| M-14 | ງົບປະມານແຄມເປນ + ຄ່າໃຊ້ຈ່າຍຕໍ່ຂໍ້ຄວາມ + ROI/ROAS | Marketing finance | ❌ ບໍ່ມີ |
| M-15 | ການທົບທວນ/ອະນຸມັດແຄມເປນກ່ອນສົ່ງ (ປ້ອງກັນສົ່ງຜິດ) | Governance | ❌ ກົດ run ໄດ້ທັນທີ |
| M-16 | Suppression list (ຄົນທີ່ຫ້າມສົ່ງ: ຖອນຕົວ, bounce, ຮ້ອງທຸກ) | ESP standard | ❌ ບໍ່ມີ |
| M-17 | Referral/affiliate ເຊື່ອມກັບແຄມເປນ ແລະ ຄິດຄ່າຄອມແບບອັດຕະໂນມັດ | — | ⚠️ ມີແຍກຕ່າງຫາກ, ບໍ່ເຊື່ອມ |
| M-18 | ລາຍງານ "ບໍລິການໃດຂາຍດີ / ຊ່ອງທາງໃດໄດ້ຜົນ" ລະດັບແຄມເປນ | — | ❌ ບໍ່ມີ |
| M-19 | Review request ອັດຕະໂນມັດຫຼັງໃຊ້ບໍລິການ + NPS | Reputation mgmt | ❌ ບໍ່ມີ (ມີ `Review` model ແຕ່ບໍ່ມີ trigger) |
| M-20 | ເກັບຮັກສາຫຼັກຖານການຍິນຍອມ ແລະ ລຶບຂໍ້ມູນຕາມຄຳຂໍ (DSAR) | GDPR Art.15/17 | ❌ ບໍ່ມີ |

---

## 4. ແຜນການປັບປຸງ — ແບ່ງເປັນ Wave

> ຕົວເລກ wave ສືບຕໍ່ຈາກ 9A (inventory) ທີ່ຫາກໍຈົບ. ຄ່າປະມານແຮງງານ = ວັນເຮັດວຽກ (ລວມ backend + web-admin + mobile + test).

### Wave 10A — ອຸດຮູຮົ່ວ & ຄວາມຖືກຕ້ອງ (🔴 BLOCKER, ~4–5 ວັນ)

**ຫ້າມເປີດໃຊ້ກັບເງິນຈິງກ່ອນເຮັດ wave ນີ້.**

1. **ອຸດ C1 ບັດຂອງຂວັນ**
   - `GiftCard` += `status` (`PENDING_PAYMENT|ACTIVE|DEPLETED|EXPIRED|VOID`), `purchasePaymentId`, `issuedByUserId`, `issueReason`
   - `POST /gift-cards` ແຍກເປັນ 2 ເສັ້ນທາງ: `/gift-cards/purchase` (ລູກຄ້າ → ສ້າງ `Payment` ກ່ອນ, activate ເມື່ອ FULLY_PAID) ແລະ `/gift-cards/issue` (`roleGuard('SUPER_ADMIN','BRANCH_ADMIN')` + ບັງຄັບ `issueReason` + AuditLog)
   - `redeemGiftCard()` ກວດ `status === 'ACTIVE'`
   - migration + backfill ບັດເກົ່າເປັນ ACTIVE
2. **ອຸດ C2 race** — ຍ້າຍການກວດຍອດເຂົ້າ transaction ດຽວ + row lock; ເພີ່ມ integration test ຍິງ 2 request ພ້ອມກັນ
3. **ອຸດ C3 idempotency** — ຕາຕະລາງ `IdempotencyKey` + middleware `requireIdempotencyKey` ໃສ່ທຸກ POST ການເງິນ; client (web + mobile) ສົ່ງ UUID ຕໍ່ການກົດ 1 ຄັ້ງ
4. **ອຸດ C4 + H1** — `settle-mock` ປິດເມື່ອ `NODE_ENV==='production'`; ເກັບ `expiresAt` ໃສ່ `PaymentTransaction`; ກວດອາຍຸກ່ອນ settle; job ລ້າງ PENDING ທີ່ໝົດອາຍຸ (ໝາຍເປັນ `EXPIRED`)
5. **ອຸດ H3** — `financeSummary` ຂຽນໃໝ່ເປັນ SQL aggregate (`groupBy` + `_sum`)
6. **ອຸດ H5** — ກວດເສັ້ນທາງ `earnPoints` 2 ບ່ອນ, ລວມ `refId` ໃຫ້ເປັນຮູບແບບດຽວ, ເພີ່ມ test ກັນຄະແນນຊ້ຳ
7. **ອຸດ L1** — `money.ts` ຮອງຮັບ minor-unit ຕໍ່ສະກຸນ (LAK = 0 ທົດສະນິຍົມ)

**ຜົນທີ່ໄດ້:** ເງິນບໍ່ຮົ່ວ, ກົດຊ້ຳບໍ່ຫັກຊ້ຳ, ຕົວເລກສະຫຼຸບບໍ່ລົ້ມຕອນຂໍ້ມູນຫຼາຍ.

---

### Wave 10B — Refund, ໃບບິນ & ພາສີ (🟠 ຕ້ອງມີ, ~5–6 ວັນ)

1. **Refund engine** — `PaymentRefund(id, paymentId, amount, reason, method, refundedById, approvedById, status, createdAt)`; ຮອງຮັບຄືນບາງສ່ວນ; ຄືນເຂົ້າ tender ເດີມຕາມລຳດັບ (ບັດຂອງຂວັນ→ຄືນຍອດບັດ, ຄະແນນ→ຄືນຄະແນນ, QR/ບັດ→PSP, ເງິນສົດ→ລິ້ນຊັກ)
2. **Clawback** — refund → ດຶງຄະແນນ EARN ຄືນ (`LoyaltyTxType.ADJUST` ຫຼື type ໃໝ່ `CLAWBACK`), ດຶງຄ່າຄອມມິດຊັນຄືນ, ຄືນຮອບຄອສ
3. **Void** — ຍົກເລີກບິນທີ່ຍັງບໍ່ຈ່າຍ (ຕ່າງຈາກ refund)
4. **ເລກເອກະສານ** — `DocumentSequence(branchId, docType, year, lastNo)` ພາຍໃນ transaction; `Payment.invoiceNo`, `PaymentRefund.creditNoteNo`; ຮູບແບບ `INV-<ສາຂາ>-<ປີ>-<ລຳດັບ>`
5. **VAT** — `AppSetting finance.vat` (`{ enabled, rate: 0.10, inclusive: true }`); ຄຳນວນ ແລະ ເກັບ `taxAmount`/`netAmount` ໃສ່ `Payment`; ສະແດງແຍກໃນໃບຮັບເງິນ; ລາຍງານ VAT ຕໍ່ເດືອນ
6. **ໃບຮັບເງິນພິມ/PDF** — ຊື່ຮ້ານ, ເລກພາສີ, ເລກໃບບິນ, ລາຍການ, VAT, ວິທີຈ່າຍ, QR ກວດສອບ
7. **UI** — ປຸ່ມ Refund/Void ໃນ `PaymentDetailSheet` (ກຳກັບດ້ວຍສິດ `finance:refund` ໃໝ່), ໜ້າລາຍງານ VAT

---

### Wave 10C — ລິ້ນຊັກເງິນສົດ, ຮອບເຮັດວຽກ & ປິດຮອບວັນ (🟠 ຕ້ອງມີ, ~4 ວັນ)

1. `CashDrawer(branchId, name)`, `CashSession(drawerId, openedById, openingFloat, closedById, closingCount, expectedAmount, variance, status, openedAt, closedAt)`, `CashMovement(sessionId, type: PAY_IN|PAY_OUT|DROP, amount, reason)`
2. Tender `CASH` ຕ້ອງຜູກ `cashSessionId` (ບັງຄັບ)
3. ໜ້າ "ເປີດ/ປິດຮອບ" ໃນ web-admin + staff portal: ນັບເງິນເປັນໃບ (denomination count), ຄຳນວນ over/short ອັດຕະໂນມັດ
4. **Z-report** — ປິດວັນແລ້ວ **ລັອກ**: ບິນຂອງວັນນັ້ນແກ້ບໍ່ໄດ້, refund ຕ້ອງເປັນ credit note ໃນວັນໃໝ່
5. ລາຍງານ over/short ຕາມພະນັກງານ/ສາຂາ (ຫາການທຸຈະລິດ)

---

### Wave 10D — ລາຍຈ່າຍ & ງົບກຳໄລຂາດທຶນ — Module 11 (🟡 ແນະນຳສູງ, ~5 ວັນ)

1. `ExpenseCategory` (ມີຊຸດເລີ່ມຕົ້ນ: ຄ່າເຊົ່າ, ຄ່ານ້ຳ-ໄຟ, ເງິນເດືອນ, ວັດຖຸສິ້ນເປືອງ, ການຕະຫຼາດ, ອຸປະກອນ, ຂົນສົ່ງ, ພາສີ-ຄ່າທຳນຽມ, ອື່ນໆ) + ຜູກ `isCogs`
2. ຂະຫຍາຍ `Expense`: `categoryId`, `vendorId?` (ເຊື່ອມ `Supplier` ຈາກ M32), `paymentMethod`, `attachmentUrl`, `status` (DRAFT/APPROVED/PAID), `approvedById`, `recurringRuleId?`
3. `RecurringExpense` — ຄ່າເຊົ່າ/ອິນເຕີເນັດ ສ້າງອັດຕະໂນມັດທຸກເດືອນ (BullMQ repeatable)
4. **P&L Statement** — ລາຍຮັບ (ແຍກ: ບໍລິການ / ສິນຄ້າ / ບັດຂອງຂວັນທີ່ຮັບຮູ້) − COGS (ດຶງຈາກ `StockMovement` ຂອງ M14, ໃຊ້ WAC ເມື່ອ C4 ຂອງ inventory-audit ແກ້ແລ້ວ) = ກຳໄລຂັ້ນຕົ້ນ − ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ (ລວມເງິນເດືອນ+ຄອມ ຈາກ M09) = ກຳໄລສຸດທິ
5. ທຽບເດືອນຕໍ່ເດືອນ / ປີຕໍ່ປີ, ທຽບຕໍ່ສາຂາ, export CSV/Excel
6. ໜ້າ `/finance/expenses` + `/finance/pnl` ໃນ web-admin

> **ໝາຍເຫດ:** P&L ຈະຖືກຕ້ອງກໍຕໍ່ເມື່ອ COGS ຖືກຕ້ອງ — ຂຶ້ນກັບ C4 (WAC costing) ໃນ `docs/inventory-audit.md` ທີ່ຍັງເປີດຢູ່.

---

### Wave 10E — Multi-Currency ຈິງ — Module 12 (🟡 ເລືອກ, ~3–4 ວັນ)

1. `Branch.baseCurrency` (ໃນແຜນເດີມມີ ແຕ່ schema ຈິງບໍ່ມີ) — ເພີ່ມ
2. Job ດຶງອັດຕາເຂົ້າ `ExchangeRate` ຝັ່ງ server ທຸກ 6 ຊົ່ວໂມງ + ປະຫວັດ `ExchangeRateHistory`
3. **ລັອກອັດຕາໃນເວລາທຸລະກຳ**: `PaymentTransaction` += `fxRate`, `baseAmount` — ບິນເກົ່າຕົວເລກຈະບໍ່ປ່ຽນອີກ (IAS 21)
4. ຮັບເງິນເປັນ THB/USD ໄດ້ ແລ້ວທອນເປັນ LAK; ລາຍງານ FX gain/loss
5. web-admin: `lib/fx.ts` ປ່ຽນມາອ່ານຈາກ API ຂອງເຮົາ (ບໍ່ດຶງຈາກ browser ໂດຍກົງ), ຍັງມີ fallback ແຕ່ຕິດປ້າຍຊັດເຈນຄືເກົ່າ
6. ໜ້າ Settings ▸ Exchange rates: ແກ້ອັດຕາດ້ວຍມືໄດ້ (ຮ້ານມັກໃຊ້ອັດຕາຂອງຕົນເອງ) + ບັນທຶກຜູ້ແກ້

---

### Wave 10F — ໜີ້ສິນ & ການຮັບຮູ້ລາຍຮັບ IFRS 15 (🟡 ແນະນຳ, ~4 ວັນ)

1. ແຍກ "ເງິນສົດທີ່ຮັບ" ກັບ "ລາຍຮັບທີ່ຮັບຮູ້" ໃນທຸກລາຍງານ + ອະທິບາຍໃນ UI (ອຸດ H2)
2. `RevenueRecognition(sourceType, sourceId, amount, recognizedAt, branchId)` — ບັນທຶກເມື່ອໃຫ້ບໍລິການແລ້ວ
3. ລາຍງານໜີ້ສິນ 4 ປະເພດ: ມັດຈຳຄ້າງ / ບັດຂອງຂວັນຄົງເຫຼືອ / ຄອສຄົງເຫຼືອ / ຄະແນນສະສົມ (ຕີມູນຄ່າ LAK)
4. **Breakage** — ບັດ/ຄອສໝົດອາຍຸ → job ຍ້າຍເປັນລາຍຮັບ ພ້ອມບັນທຶກເຫດຜົນ
5. **Points expiry** — ນະໂຍບາຍ (ແນະນຳ 24 ເດືອນຫຼັງໄດ້ຮັບ), job ສ້າງ `EXPIRE` tx, ແຈ້ງເຕືອນລ່ວງໜ້າ 30 ວັນ
6. **Tier downgrade** — ປ່ຽນ tier ໄປໃຊ້ຄະແນນ rolling 12 ເດືອນ + job ທົບທວນລາຍເດືອນ

---

### Wave 10G — ຄວາມຍິນຍອມ & ສູນຕັ້ງຄ່າການສື່ສານ (🟠 ຕ້ອງມີຕາມກົດໝາຍ, ~3 ວັນ)

1. `MarketingConsent(userId, channel: PUSH|SMS|EMAIL|LINE, granted, grantedAt, revokedAt, source, ipAddress, evidence)` — ຫຼັກຖານຄົບຕາມ GDPR Art.7(1)
2. `SuppressionList(identifier, channel, reason, createdAt)` — ຖອນຕົວ / bounce / ຮ້ອງທຸກ
3. `runCampaign()` ກັ່ນຕອງດ້ວຍ consent + suppression + frequency cap + quiet hours **ກ່ອນ**ສົ່ງ (ບັງຄັບຢູ່ຊັ້ນ service, ບໍ່ແມ່ນຊັ້ນ UI)
4. ໜ້າ "ການແຈ້ງເຕືອນ & ຄວາມເປັນສ່ວນຕົວ" ໃນ mobile ProfileScreen: ເປີດ/ປິດແຕ່ລະຊ່ອງທາງ ແລະ ແຕ່ລະປະເພດ (ນັດໝາຍ / ໃບຮັບເງິນ = transactional ປິດບໍ່ໄດ້; ໂປຣໂມຊັນ = ປິດໄດ້)
5. ຄຳສັ່ງຖອນຕົວໃນຂໍ້ຄວາມ (ລິ້ງ deep-link ຫຼື "ຕອບ STOP" ສຳລັບ SMS)
6. ຂໍຄວາມຍິນຍອມຕອນສະໝັກ (RegisterScreen) ແບບ opt-in ຊັດເຈນ — **ບໍ່ຕິກໄວ້ລ່ວງໜ້າ**
7. ບັນທຶກ `AuditLog` ທຸກການປ່ຽນ consent

---

### Wave 10H — Promotion Engine & Attribution (🟡 ແນະນຳສູງ, ~5–6 ວັນ)

1. `Promotion(code, name, type: PERCENT|FIXED|FREE_SERVICE|BOGO, value, startAt, endAt, maxRedemptions, maxPerCustomer, minSpend, appliesTo: services[]/categories[], excludes[], branchIds[], stackable, isActive, campaignId?)`
2. `PromotionRedemption(promotionId, userId, paymentId, appointmentId, discountAmount, redeemedAt)` — ນີ້ຄືບ່ອນທີ່ **ຂຽນ `convertedAt`** ກັບຄືນໃສ່ `CampaignRecipient` (ອຸດ H8)
3. `POST /promotions/validate` — ກວດກ່ອນຈອງ/ກ່ອນຈ່າຍ; ໃຊ້ໃນ booking wizard ແລະ PaymentScreen
4. ຜູກເຂົ້າ `Payment`: `discountAmount` ເປັນ field ຈິງໃນບິນ (ບໍ່ແມ່ນລົດລາຄາດ້ວຍມື)
5. ກົດ stacking ກັບ Dynamic Pricing (M28) ແລະ Referral (M33) — ນິຍາມລຳດັບຄວາມສຳຄັນໃຫ້ຊັດ (ແນະນຳ: dynamic price ກ່ອນ → promotion → referral → loyalty/gift card ເປັນ tender)
6. Attribution: ບັນທຶກ `Appointment.attributedCampaignId` ເມື່ອຈອງພາຍໃນ N ວັນຫຼັງຮັບຂໍ້ຄວາມ (attribution window ຕັ້ງໄດ້, default 14 ວັນ) → ຄຳນວນ revenue ຕໍ່ແຄມເປນ, ROI
7. ໜ້າ `/marketing/promotions` ໃນ web-admin

---

### Wave 10I — ໂຄງສ້າງການສົ່ງແຄມເປນ (🟡 ແນະນຳ, ~5 ວັນ)

1. ຍ້າຍ `runCampaign` ໄປ BullMQ: `campaignSendQueue` ແບບ batch 100 + rate limit + progress + ຍົກເລີກກາງທາງໄດ້ (ອຸດ M1)
2. `CampaignRecipient` += `channel`, `deliveredAt`, `openedAt`, `clickedAt`, `failedAt`, `failureReason` (ອຸດ L6)
3. **ຕັ້ງເວລາສົ່ງ** — `Campaign.scheduledAt`, `Campaign.status` (DRAFT/SCHEDULED/SENDING/SENT/PAUSED/CANCELLED) + ຂັ້ນຕອນອະນຸມັດ (M-15)
4. **ຫຼາຍຊ່ອງທາງ** — adapter interface `MessageChannel`; ເພີ່ມ SMS (ຜູ້ໃຫ້ບໍລິການທ້ອງຖິ່ນ), email (SMTP/Resend), Telegram (ໃຊ້ `TelegramLink` ທີ່ມີຢູ່ແລ້ວຈາກ M35); ເລືອກຊ່ອງທາງສຳຮອງເມື່ອຊ່ອງທາງຫຼັກລົ້ມ
5. **Template** ໃຊ້ `NotificationTemplate` ທີ່ມີຢູ່: ຕົວແປ `{{name}} {{service}} {{code}}`, preview, test-send, 2 ພາສາ (lo/en)
6. **Segment builder** — ເງື່ອນໄຂປະສົມ (ຄັ້ງທີ່ມາ, ຍອດໃຊ້ຈ່າຍ, ບໍລິການທີ່ເຄີຍໃຊ້, tier, ວັນທີມາຄັ້ງສຸດທ້າຍ, ສາຂາ, ອາຍຸ, ເພດ) + ສະແດງຈຳນວນຄົນກ່ອນສົ່ງ + ບັນທຶກ segment ໄວ້ໃຊ້ຊ້ຳ
7. **A/B test** — ແບ່ງ 2 ຂໍ້ຄວາມ + holdout group 10% ເພື່ອວັດ incremental lift

---

### Wave 10J — ການວິເຄາະລູກຄ້າ (🟢 ເລືອກ, ~4 ວັນ)

1. **RFM** (Recency / Frequency / Monetary) ຄຳນວນທຸກຄືນ → 8–11 segment ມາດຕະຖານ (Champions, Loyal, At Risk, Hibernating, Lost …)
2. **CLV** ປະມານການ (ຍອດສະເລ່ຍ × ຄວາມຖີ່ × ອາຍຸລູກຄ້າ) + margin
3. **Cohort retention** ຕາມເດືອນທີ່ມາຄັ້ງທຳອິດ
4. **Churn risk** — ຄາດຄະເນຈາກຊ່ອງຫ່າງລະຫວ່າງນັດ ທຽບກັບຄ່າສະເລ່ຍສ່ວນຕົວ → auto-trigger win-back
5. **Review request** ອັດຕະໂນມັດ 24 ຊົ່ວໂມງຫຼັງໃຊ້ບໍລິການ + NPS (ອຸດ M-19; ໃຊ້ `Review` model ທີ່ມີຢູ່)
6. Dashboard ການຕະຫຼາດ: ລູກຄ້າໃໝ່ vs ກັບມາ, ຕົ້ນທຶນຕໍ່ການໄດ້ລູກຄ້າ, ROI ຕໍ່ແຄມເປນ, ຊ່ອງທາງທີ່ດີທີ່ສຸດ

---

## 5. ຕາຕະລາງຕັດສິນໃຈ

| Wave | ຊື່ | ຄວາມຮ້າຍແຮງຖ້າບໍ່ເຮັດ | ແຮງງານ | ພຶ່ງພາ | ຂ້ອຍແນະນຳ |
|------|-----|----------------------|--------|--------|-----------|
| **10A** | ອຸດຮູຮົ່ວ & ຄວາມຖືກຕ້ອງ | **ເສຍເງິນຈິງ** — ລູກຄ້າອອກບັດຟຣີໄດ້ | 4–5 ວັນ | — | ✅ **ຕ້ອງເຮັດ, ເຮັດກ່ອນສຸດ** |
| **10B** | Refund / ໃບບິນ / VAT | ຄືນເງິນລູກຄ້າບໍ່ໄດ້; ຜິດກົດໝາຍພາສີ | 5–6 ວັນ | 10A | ✅ ຕ້ອງເຮັດ |
| **10C** | ລິ້ນຊັກເງິນສົດ & ປິດຮອບ | ເງິນສົດຫາຍໂດຍບໍ່ຮູ້ຜູ້ຮັບຜິດຊອບ | 4 ວັນ | 10A | ✅ ຕ້ອງເຮັດ ຖ້າຮັບເງິນສົດ |
| **10G** | Consent & preference center | **ຄວາມສ່ຽງທາງກົດໝາຍ** + ລູກຄ້າລຳຄານ | 3 ວັນ | — | ✅ ຕ້ອງເຮັດ |
| **10D** | ລາຍຈ່າຍ & P&L (M11) | ບໍ່ຮູ້ກຳໄລ — ຕັດສິນໃຈທຸລະກິດບໍ່ໄດ້ | 5 ວັນ | 10B; inventory C4 | 🔶 ແນະນຳສູງ |
| **10H** | Promotion engine & attribution | ແຄມເປນວັດຜົນບໍ່ໄດ້; ສ່ວນຫຼຸດໂກງງ່າຍ | 5–6 ວັນ | 10G | 🔶 ແນະນຳສູງ |
| **10F** | IFRS 15 / ໜີ້ສິນ | ຕົວເລກລາຍຮັບເກີນຈິງ | 4 ວັນ | 10B | 🔶 ແນະນຳ |
| **10I** | ໂຄງສ້າງສົ່ງແຄມເປນ | ສົ່ງຫຼາຍຄົນບໍ່ໄດ້; ມີແຕ່ push | 5 ວັນ | 10G | 🔶 ແນະນຳ |
| **10E** | Multi-currency (M12) | ຮັບ THB/USD ບໍ່ໄດ້ຈິງ | 3–4 ວັນ | 10B | 🔹 ຖ້າມີລູກຄ້າຕ່າງປະເທດ |
| **10J** | ວິເຄາະລູກຄ້າ (RFM/CLV) | ເສຍໂອກາດ, ບໍ່ແມ່ນຄວາມສ່ຽງ | 4 ວັນ | 10H, 10I | 🔹 ເລືອກ |

**ລວມທັງໝົດ:** ~42–48 ວັນເຮັດວຽກ · **ສະເພາະ "ຕ້ອງເຮັດ" (10A+10B+10C+10G):** ~16–18 ວັນ

### ລຳດັບທີ່ຂ້ອຍແນະນຳ

```
10A ──▶ 10B ──▶ 10C ──┐
                       ├──▶ 10D ──▶ 10F
10G ──▶ 10H ──▶ 10I ───┘            └──▶ 10J
                10E (ຂະໜານ, ເມື່ອໃດກໍໄດ້ຫຼັງ 10B)
```

ເຫດຜົນ: 10A ອຸດເລືອດກ່ອນ → 10B ໃຫ້ຄືນເງິນໄດ້ & ອອກໃບບິນຖືກກົດໝາຍ → 10C ຄຸມເງິນສົດ. ຝັ່ງການຕະຫຼາດເລີ່ມທີ່ 10G ເພາະເປັນຄວາມສ່ຽງທາງກົດໝາຍ ແລະ ເປັນຮາກຖານຂອງ 10H/10I ທັງໝົດ.

---

## 6. ສິ່ງທີ່ **ບໍ່** ແນະນຳໃຫ້ເຮັດ (ຂອບເຂດທີ່ຄວນຕັດ)

| ລາຍການ | ເຫດຜົນ |
|--------|--------|
| ລະບົບບັນຊີຄູ່ (double-entry GL) ເຕັມຮູບແບບ | ເກີນຄວາມຈຳເປັນຂອງຮ້ານຄວາມງາມ; ໃຊ້ **export journal entry** ອອກໄປໂປຣແກຼມບັນຊີແທນ (F-17) ຖືກກວ່າ ແລະ ນັກບັນຊີມັກກວ່າ |
| ຖືເລກບັດເຄຣດິດເອງ | ຈະຕົກຢູ່ PCI-DSS SAQ-D (ແພງ, ຫຼາຍຂໍ້ກຳນົດ). ໃຊ້ tokenization ຂອງ PSP ໃຫ້ຢູ່ SAQ-A |
| ຜູກ PSP ຈິງ (BCEL/Stripe) ໃນ wave ນີ້ | ຕ້ອງໃຊ້ສັນຍາ merchant, ບັນຊີທຸລະກິດ, ເອກະສານ KYC ຂອງເຈົ້າຂອງ — ບໍ່ແມ່ນວຽກໂຄດ. ແຕ່ **10A ຕ້ອງເຮັດ interface ໃຫ້ພ້ອມຮັບ webhook ຈິງ** |
| ສ້າງ ESP ເອງ (email server) | ໃຊ້ Resend/SES; ຄ່າ deliverability ແລະ SPF/DKIM/DMARC ບໍ່ຄຸ້ມທີ່ຈະເຮັດເອງ |
| AI predictive marketing | ຂໍ້ມູນຍັງບໍ່ພຽງພໍ; ເຮັດ RFM (10J) ກ່ອນ ໄດ້ຜົນ 80% ດ້ວຍແຮງງານ 10% |

---

## 7. ຄຳຖາມທີ່ຕ້ອງການຄຳຕອບຈາກເຈົ້າຂອງກ່ອນລົງມື

1. **ຈະຮັບເງິນສົດບໍ?** — ຖ້າແມ່ນ, 10C ຂຶ້ນເປັນ "ຕ້ອງເຮັດ"
2. **ຮ້ານຈົດ VAT ບໍ?** — ກຳນົດວ່າ 10B ຕ້ອງເຮັດສ່ວນ VAT ຄົບຫຼືບໍ່
3. **ຈະຂາຍບັດຂອງຂວັນໃຫ້ລູກຄ້າຊື້ເອງໃນແອັບບໍ?** — ຖ້າບໍ່, C1 ອຸດງ່າຍກວ່າ (ປິດໃຫ້ admin ອອກຢ່າງດຽວ)
4. **ນະໂຍບາຍວັນໝົດອາຍຸຄະແນນ?** — ແນະນຳ 24 ເດືອນ; ຕ້ອງເປັນການຕັດສິນໃຈທາງທຸລະກິດ
5. **ຈະສົ່ງ SMS ບໍ?** — ຖ້າແມ່ນ ຕ້ອງເລືອກຜູ້ໃຫ້ບໍລິການທ້ອງຖິ່ນ + ງົບຕໍ່ຂໍ້ຄວາມ (ກະທົບ 10I)
6. **ຮັບເງິນ THB/USD ບໍ?** — ກຳນົດວ່າຕ້ອງ 10E ຫຼືບໍ່
7. **ມີນັກບັນຊີ/ໂປຣແກຼມບັນຊີຢູ່ແລ້ວບໍ?** — ກຳນົດຮູບແບບ export ໃນ F-17

---

## 8. ເອກະສານກ່ຽວຂ້ອງ

- `implementation_plan.md` §Phase 5 (ແຖວ ~1456), ໝວດທີ 2 (ແຖວ 59–73)
- `docs/phase5-progress.md` — ສະຖານະ Phase 5 ທີ່ສົ່ງມອບແລ້ວ
- `docs/inventory-audit.md` — C4 (WAC costing) ເປັນເງື່ອນໄຂຂອງ P&L ໃນ 10D
- `docs/phase6-progress.md` — Module 09 (payroll/commission) ທີ່ຈະເຂົ້າ P&L
