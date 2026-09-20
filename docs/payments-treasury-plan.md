# ໂມດູນ 39 — ການຊຳລະເງິນ & ການເງິນອອກ (Payments & Treasury)

> ວັນທີຂຽນແຜນ: 2026-09-20 · ສະຖານະ: **ແຜນ (ຍັງບໍ່ທັນລົງມື)**
> ຂອບເຂດທີ່ກວດກ່ອນຂຽນແຜນ: `apps/backend/prisma/schema/finance.prisma`,
> `apps/backend/prisma/schema/inventory.prisma` (`Expense`), `apps/backend/src/modules/payments/*`,
> `apps/backend/src/services/paymentGateway.ts`, `apps/backend/src/storage/*`,
> `packages/shared-types/src/payment.schema.ts`, `apps/web-admin/src/features/finance/*`,
> `apps/mobile/src/features/payments/*`.

---

## 1. ສະຫຼຸບຜູ້ບໍລິຫານ

ລະບົບມີ **ຊັ້ນບິນ (billing) ທີ່ແຂງແຮງແລ້ວ** — `Payment` + `PaymentTransaction` ຮອງຮັບ split tender
6 ວິທີ, ມີ `IdempotencyKey` ກັນຈ່າຍຊ້ຳ, ມີ deposit intent ພ້ອມ `expiresAt`, ແລະ `settle-mock`
ຖືກປິດໃນ production ແລ້ວ (ຖືກຕ້ອງ).

ແຕ່ **ຊັ້ນ "ເງິນຈິງ" (treasury) ຍັງບໍ່ມີເລີຍ**:

| ແກນ | ສະຖານະປັດຈຸບັນ | ຜົນກະທົບ |
|---|---|---|
| **A. ຈ່າຍຜ່ານຫຼາຍທະນາຄານແບບ API** | ❌ ມີແຕ່ BCEL mock ດຽວ, merchant id ຄົງທີ່ 1 ຄ່າ | ເພີ່ມທະນາຄານໃໝ່ຕ້ອງແກ້ code, ບໍ່ມີທາງຂຶ້ນ production |
| **B. Webhook ຮັບຜົນຈາກທະນາຄານ** | ❌ ບໍ່ມີ endpoint, ບໍ່ມີ HMAC, ບໍ່ມີ event log | ຕັດຍອດຕ້ອງກົດເອງ = ເງິນຜິດໄດ້ງ່າຍ |
| **C. ສະລິບໂອນເງິນ + OCR** | ❌ ບໍ່ມີເລີຍ | ວິທີຈ່າຍທີ່ນິຍົມທີ່ສຸດໃນລາວ ລະບົບຍັງຮອງຮັບບໍ່ໄດ້ |
| **D. ບັນຊີທະນາຄານຂອງຮ້ານ** | ❌ ບໍ່ມີ field ໃນ `Branch` | ບໍ່ຮູ້ວ່າເງິນເຂົ້າບັນຊີໃດ, ກະທົບຍອດບໍ່ໄດ້ |
| **E. ລາຍຈ່າຍ (Expense)** | ⚠️ ມີຕາຕະລາງເປົ່າ — **ບໍ່ມີ API / ໜ້າຈໍ / ໝວດ / ການອະນຸມັດ** | ຄິດ P&L ແທ້ບໍ່ໄດ້; dashboard ອ່ານ aggregate ດຽວ |
| **F. ຄືນເງິນ / ຈ່າຍອອກ / ກະທົບຍອດ** | ❌ ບໍ່ມີ | ບໍ່ມີທາງແກ້ເມື່ອເກັບເງິນຜິດ |

**ສະຫຼຸບ:** ຄວນສ້າງເປັນ **ໝວດໃຫຍ່ໃໝ່ (ໂມດູນ 39)** ບໍ່ແມ່ນຕໍ່ຕິດໃສ່ `/finance` ເກົ່າ. `/finance`
ຍັງເປັນ "ໜ້າລາຍຮັບ/ບິນ" ຄືເກົ່າ; ໂມດູນໃໝ່ຮັບຜິດຊອບ **ຊ່ອງທາງເງິນ, ການຢືນຢັນ, ແລະ ເງິນອອກ**.

---

## 2. ຫຼັກການອອກແບບ (ບໍ່ໃຫ້ລະເມີດ)

1. **ລູກຄ້າບໍ່ເຄີຍຕັດຍອດເອງ.** ກົດເດີມທີ່ block customer CASH/QR tender ຢູ່ server ຍັງຄົງຢູ່.
   ສະລິບທີ່ລູກຄ້າອັບ = *ຄຳຮ້ອງຂໍ*, ຈະກາຍເປັນ `PaymentTransaction` ກໍຕໍ່ເມື່ອ
   (ກ) auto-match ຜ່ານເກນທີ່ server ຄິດເອງ ຫຼື (ຂ) ພະນັກງານກົດອະນຸມັດ.
2. **ທຸກ provider ຜ່ານ adapter ດຽວກັນ.** Mock ແລະ ຂອງຈິງໃຊ້ interface ດຽວກັນ — ປ່ຽນເປັນ API
   ຈິງພາຍຫຼັງໂດຍບໍ່ແຕະ contract ຂອງ API (pattern ດຽວກັບ `skin-analysis/analyze.ts`).
3. **Webhook ເປັນເສັ້ນທາງຕັດຍອດດຽວ** ສຳລັບການຈ່າຍອອນລາຍ. ຕົວຈຳລອງ (simulator) ກໍຍິງເຂົ້າ
   ເສັ້ນທາງດຽວກັນ — ເພື່ອວ່າວັນທີ່ຕໍ່ API ຈິງ, ພຶດຕິກຳທີ່ test ໄວ້ແລ້ວບໍ່ປ່ຽນ.
4. **ເງິນເປັນ `Decimal(16,2)` ທຸກຈຸດ**, ທຸກ mutation ຕ້ອງມີ `Idempotency-Key`,
   raw SQL ໃຊ້ `tsParam()`, ວັນ/ເວລາໃຊ້ helper Asia/Vientiane.
5. **ທຸກການອະນຸມັດ/ປະຕິເສດ/ຄືນເງິນ ຂຽນ `AuditLog`** ພ້ອມ `oldValue`/`newValue`.

---

## 3. ການຕັດສິນໃຈເລື່ອງ OCR (ແນະນຳ)

ເປົ້າໝາຍ: **ຟຣີ 100%, ໄວ, ແລະ ແມ່ນຍຳທີ່ສຸດເທົ່າທີ່ຈະເປັນໄປໄດ້** ໂດຍບໍ່ສົ່ງຮູບອອກນອກລະບົບ.

### ວິທີທີ່ເລືອກ: pipeline 3 ຊັ້ນ (ບໍ່ແມ່ນ OCR ດຽວໆ)

ຄວາມແມ່ນຍຳມາຈາກ *ລຳດັບການລອງ* ບໍ່ແມ່ນມາຈາກ engine ດຽວ:

| ຊັ້ນ | ວິທີ | ຄວາມແມ່ນຍຳ | ເວລາ | ຄ່າໃຊ້ຈ່າຍ |
|---|---|---|---|---|
| **1. ອ່ານ QR/barcode ໃນສະລິບ** (`jsqr` ຫຼື `@zxing/library`) | ຖອດລະຫັດ QR ທີ່ທະນາຄານຝັງໄວ້ໃນສະລິບ | **~100% ເມື່ອມີ QR** (ອ່ານຂໍ້ມູນດິບ ບໍ່ແມ່ນເດົາຈາກຮູບ) | <50ms | ຟຣີ |
| **2. OCR ດ້ວຍ `tesseract.js`** + preprocess ດ້ວຍ `sharp` (ມີໃນ repo ແລ້ວ) | crop ເປັນ region ຕໍ່ template ຂອງແຕ່ລະທະນາຄານ → grayscale → threshold → OCR ແຍກ field | ສູງສຳລັບ **ຕົວເລກ/ລາຕິນ** (ຈຳນວນເງິນ, ເລກອ້າງອີງ, ວັນເວລາ, ເລກບັນຊີ) ເພາະໃຊ້ `tessedit_char_whitelist` ຕໍ່ field | ~0.5–2 ວິ/ສະລິບ | ຟຣີ, offline |
| **3. ໃຫ້ຄົນຢືນຢັນ** | ພະນັກງານກວດໃນ inbox, ແກ້ field ທີ່ OCR ຜິດ | 100% | — | ຟຣີ |

**ເຫດຜົນທີ່ເລືອກ `tesseract.js`:**
- ຟຣີ, Apache-2.0, ແລ່ນໃນ Node ໄດ້ເລີຍ (WASM), ບໍ່ຕ້ອງຕິດ Python ຫຼື native binary
- ຂໍ້ມູນທີ່ **ຕ້ອງການຈາກສະລິບແມ່ນຕົວເລກເກືອບທັງໝົດ** — ຈຸດທີ່ Tesseract ເຮັດໄດ້ດີທີ່ສຸດ
  ເມື່ອ crop ແຄບ + whitelist ສະເພາະ `0123456789,.:/-`
- ຊື່ຜູ້ໂອນເປັນພາສາລາວ = ຈຸດອ່ອນຂອງ Tesseract, ແຕ່ **ບໍ່ແມ່ນ field ທີ່ໃຊ້ຕັດສິນ** (ໃຊ້ເປັນຂໍ້ມູນຊ່ວຍເທົ່ານັ້ນ)

**ທາງເລືອກທີ່ພິຈາລະນາແລ້ວແຕ່ບໍ່ເລືອກ:**
- *PaddleOCR / EasyOCR* — ແມ່ນຍຳກວ່າ ແຕ່ຕ້ອງ Python runtime + model ຫຼາຍຮ້ອຍ MB ໃນ container
  → ເກັບໄວ້ເປັນ **ທາງອັບເກຣດ** ຫຼັງ adapter ວາງແລ້ວ (ສະຫຼັບໄດ້ໂດຍບໍ່ແຕະ API)
- *Google Vision / AWS Textract* — ແມ່ນຍຳສຸດ ແຕ່ **ເສຍຄ່າ** ແລະ ສົ່ງສະລິບລູກຄ້າອອກນອກ

### ສິ່ງທີ່ເຮັດໃຫ້ "ແມ່ນຍຳ" ແທ້ຈິງ

OCR ອ່ານຜິດ 1 ຕົວເລກກໍຍັງບໍ່ເປັນຫຍັງ ເພາະ **ການຕັດສິນມາຈາກການປຽບທຽບ ບໍ່ແມ່ນຈາກຂໍ້ຄວາມ**:
ຈຳນວນເງິນທີ່ອ່ານໄດ້ຕ້ອງ **ກົງກັບຍອດຄ້າງຂອງບິນ** (±tolerance ທີ່ຕັ້ງໄດ້), ບັນຊີປາຍທາງຕ້ອງເປັນ
`BankAccount` ຂອງສາຂາ, ເວລາໂອນຕ້ອງຢູ່ໃນກອບເວລາທີ່ຍອມຮັບ. ຖ້າ 3 ຂໍ້ນີ້ຜ່ານໝົດ → `AUTO_MATCHED`;
ຜ່ານບາງສ່ວນ → `NEEDS_REVIEW` ພ້ອມຊີ້ວ່າ field ໃດບໍ່ກົງ.

---

## 4. Data model ໃໝ່ (`apps/backend/prisma/schema/payments.prisma`)

```
Bank                 ລາຍຊື່ທະນາຄານ (code, ຊື່ lo/en, logo, ຮອງຮັບ QR ບໍ, template OCR)
BankAccount          ບັນຊີຮັບເງິນຕໍ່ສາຂາ (bankId, branchId, ຊື່ບັນຊີ, ເລກບັນຊີ, currency,
                     qrImageKey ຄົງທີ່, isActive, isDefault)
PaymentProvider      config ຕໍ່ຊ່ອງທາງ (code, mode MOCK|LIVE, webhookSecret ref, feeRate)
ProviderIntent       intent ທີ່ສ້າງໄປຫາ provider (paymentId, providerCode, amount, ref,
                     status PENDING|SUCCESS|EXPIRED|FAILED, expiresAt, rawRequest/rawResponse)
ProviderEvent        webhook ດິບທຸກອັນ (providerCode, eventId unique, signature, payload,
                     processedAt, result) — idempotent, replay ໄດ້
PaymentSlip          ສະລິບໂອນເງິນ (paymentId?, expenseId?, imageKey, imageHash, uploadedById,
                     ocrStatus, ocrRaw, ocrEngine, ocrMs,
                     parsed: bankCode / amount / currency / txnRef / transferredAt /
                             senderName / receiverAccount,
                     matchScore, mismatchFields[], verdict, reviewedById, reviewedAt,
                     paymentTransactionId?)
Refund               (paymentId, amount, reason, method, status, approvedById, providerRef)
ExpenseCategory      ໝວດລາຍຈ່າຍ (code, ຊື່ lo/en, parentId, isActive)
ExpenseAttachment    ບິນ/ໃບຮັບເງິນແນບ (ໃຊ້ pipeline OCR ດຽວກັນ)
```

**ແກ້ຂອງເກົ່າ:**
- enum `PaymentMethod` +`BANK_TRANSFER` (ໂອນ+ສະລິບ), +`BANK_QR` (QR ກາງ) — ຮັກສາ
  `BCEL_ONE_QR` ເກົ່າໄວ້ເພື່ອ backward-compat ຂອງຂໍ້ມູນເກົ່າ
- `Expense` +`categoryId`, `status`, `vendorId?`, `purchaseOrderId?`, `paidFromAccountId?`,
  `createdById`, `approvedById`, `paidAt`, `recurringRule?`
- `PaymentTransaction` +`bankAccountId?`, +`providerIntentId?`, +`slipId?`

**Unique / index ສຳຄັນ:**
- `ProviderEvent.eventId` unique ຕໍ່ provider → webhook ຊ້ຳບໍ່ຕັດຍອດສອງເທື່ອ
- `PaymentSlip(bankCode, txnRef)` unique → ສະລິບອັນດຽວໃຊ້ສອງບິນບໍ່ໄດ້
- `PaymentSlip.imageHash` index → ກວດຮູບຊ້ຳ (ຖ່າຍຮູບໜ້າຈໍສົ່ງຕໍ່)

---

## 5. ແຜນເປັນ Wave

### W1 — Bank registry + Provider adapter (backend)
- Schema ໃໝ່ + migration + seed ທະນາຄານລາວ (BCEL, LDB, JDB, APB, ST Bank, Lao-Viet, BIC)
- `interface BankProvider { createQrIntent, verifyWebhook, queryStatus, refund, payout }`
- Implementation: `MockBcelProvider`, `MockLaoQrProvider` (ມາດຕະຖານກາງ), `ManualTransferProvider`
  (ບໍ່ມີ API — ໃຊ້ເລກບັນຊີ + ສະລິບ; ນີ້ຄືເສັ້ນທາງທີ່ **ໃຊ້ໄດ້ຈິງ** ມື້ນີ້)
- CRUD `BankAccount` ຕໍ່ສາຂາ + RBAC `payments:manage`
- Test: adapter registry, ການເລືອກບັນຊີ default ຕໍ່ສາຂາ

### W2 — Webhook + ຈຳລອງການຈ່າຍ
- `POST /payments/webhooks/:providerCode` — ກວດ HMAC ກ່ອນ parse, ບັນທຶກ `ProviderEvent`,
  ຫຼັງຈາກນັ້ນຈຶ່ງ process (ຖ້າ process ລົ້ມ = replay ໄດ້)
- State machine intent: `PENDING → SUCCESS | EXPIRED | FAILED` → ສ້າງ `PaymentTransaction`
  → `recomputeAndSettle()` ເດີມ
- `POST /payments/intents/:id/simulate-paid` — **dev/staging ເທົ່ານັ້ນ** (ກວດຄືກັບ `settle-mock`),
  ຍິງ webhook ເຂົ້າຕົວເອງພ້ອມ signature ຖືກຕ້ອງ → ທົດສອບເສັ້ນທາງຈິງທັງເສັ້ນ
- Job: ປິດ intent ໝົດອາຍຸ, ແຈ້ງເຕືອນ event ທີ່ process ບໍ່ສຳເລັດ
- Test: signature ຜິດ → 401, event ຊ້ຳ → ຕັດຍອດເທື່ອດຽວ, intent ໝົດອາຍຸ → ຕັດບໍ່ໄດ້

### W3 — ສະລິບ + OCR (ຫົວໃຈ)
- `POST /payments/:id/slips` (base64 — pattern ດຽວກັບ `chat.service.ts` media),
  ເກັບຜ່ານ `storage` adapter, ຈຳກັດຂະໜາດ/ຊະນິດ, ຄິດ `imageHash`
- Pipeline: QR decode → sharp preprocess → `tesseract.js` ຕໍ່ region → parser ຕໍ່ template
  ທະນາຄານ → ໃຫ້ຄະແນນ match → verdict
- ແລ່ນເປັນ background job (BullMQ ມີໃນ repo ແລ້ວ) ແລ້ວ push ຜົນຜ່ານ socket
- `GET /payments/slips?verdict=&branchId=` — ກ່ອງກວດ
- `POST /payments/slips/:id/review` — `{ action: APPROVE|REJECT, correctedFields?, note }`
  → APPROVE ສ້າງ `PaymentTransaction` (ມີ `Idempotency-Key`) + audit + ແຈ້ງລູກຄ້າ
- `interface OcrProvider` ເພື່ອສະຫຼັບໄປ PaddleOCR/Vision ພາຍຫຼັງໄດ້
- Test: ສະລິບຊ້ຳ → ປະຕິເສດ, ຈຳນວນເງິນບໍ່ກົງ → `NEEDS_REVIEW`, approve ສອງເທື່ອ → tx ດຽວ

### W4 — ໂມດູນລາຍຈ່າຍ (ເປັນເອກະລາດ, ເຮັດແຍກກ່ອນກໍໄດ້)
- `ExpenseCategory` + seed ໝວດມາດຕະຖານ (ຄ່າເຊົ່າ, ເງິນເດືອນ, ວັດຖຸດິບ, ໄຟ/ນ້ຳ, ການຕະຫຼາດ,
  ຂົນສົ່ງ, ບຳລຸງຮັກສາ, ພາສີ, ອື່ນໆ)
- Workflow `DRAFT → SUBMITTED → APPROVED → PAID` + ຈ່າຍອອກຈາກ `BankAccount` ໃດ
- ແນບບິນ → OCR ດຶງຈຳນວນເງິນ/ວັນທີອັດຕະໂນມັດ (pipeline ດຽວກັບ W3)
- ລາຍຈ່າຍຊ້ຳ (recurring) → job ສ້າງ draft ປະຈຳເດືອນ
- API: CRUD, summary ຕາມໝວດ/ສາຂາ/ຊ່ວງເວລາ, ແລະ **P&L ແທ້**:
  ລາຍຮັບ − ລາຍຈ່າຍ − ເງິນເດືອນ − ຕົ້ນທຶນສິນຄ້າ (ຕໍ່ກັບ payroll + inventory ທີ່ມີແລ້ວ)

### W5 — web-admin: ໝວດ nav ໃໝ່ «ການຊຳລະເງິນ»
| ໜ້າ | ເນື້ອໃນ |
|---|---|
| ທະນາຄານ & ຊ່ອງທາງຈ່າຍ | ບັນຊີຕໍ່ສາຂາ, ເປີດ/ປິດ provider, QR ຄົງທີ່, ສະຖານະ mock/live |
| ກວດສະລິບ | inbox 2-pane ແບບ `/notifications` — ຮູບສະລິບຊ້າຍ, field ທີ່ OCR ອ່ານໄດ້ຂວາ, ຊີ້ຈຸດບໍ່ກົງເປັນສີ, ປຸ່ມອະນຸມັດ/ປະຕິເສດ/ແກ້ຄ່າ |
| ລາຍຈ່າຍ | ຕາຕະລາງ + ໝວດ + ອະນຸມັດ + ກຣາຟຕາມໝວດ |
| ກະທົບຍອດ | ປຽບທຽບ tx ໃນລະບົບ ກັບ ລາຍການທະນາຄານຕໍ່ມື້ |
- ໃຊ້ template ຂອງ `/referrals` ຕາມ convention; `/finance` ເກົ່າຢູ່ບ່ອນເດີມ
- Permission ໃໝ່: `payments:manage`, `payments:review`, `expenses:view`, `expenses:approve`

### W6 — mobile
- ລູກຄ້າ: ເລືອກທະນາຄານ → ເຫັນ QR/ເລກບັນຊີ (copy ໄດ້) → ໂອນ → **ຖ່າຍ/ເລືອກສະລິບ**
  (`expo-image-picker` / `expo-camera` ມີຢູ່ແລ້ວ) → ສະຖານະ «ລໍຖ້າກວດ» → push ເມື່ອຜົນອອກ
- ພະນັກງານ: ກວດສະລິບໄວໃນ staff portal (ຖ້າມີສິດ)

### W7 — ປິດງານ
tests ຄົບ 3 ຊັ້ນ · migration · i18n `lo`/`en` (ສະແກນຕົວ Thai ໃນ `lo.json`) ·
ອັບເດດ `implementation_plan.md` + doc ນີ້ · `pnpm -r typecheck/lint/test/build` ຂຽວທັງ repo

---

## 6. ລຳດັບ ແລະ ຄວາມເພິ່ງພາ

```
W1 ──► W2 ──► W3 ──► W5 ──► W6 ──► W7
                ▲
W4 ─────────────┘   (W4 ເຮັດຂະໜານໄດ້; ຕ້ອງການ W1 ພຽງ BankAccount ສຳລັບ "ຈ່າຍອອກຈາກບັນຊີໃດ")
```

- W4 ໃຫ້ຜົນໄວທີ່ສຸດຕໍ່ຜູ້ໃຊ້ (ມີຕາຕະລາງຢູ່ແລ້ວ, ຂາດແຕ່ API/UI)
- W3 ໜັກທີ່ສຸດ ແລະ ເປັນສ່ວນທີ່ໃຫ້ຄຸນຄ່າແທ້ໃນບໍລິບົດລາວ
- Migration ໃໝ່ 3 ກ້ອນ: W1 (bank/provider), W3 (slip), W4 (expense)

## 7. ຄວາມສ່ຽງ & ວິທີກັນ

| ຄວາມສ່ຽງ | ວິທີກັນ |
|---|---|
| ສະລິບປອມ / ແກ້ດ້ວຍ Photoshop | `imageHash` ຊ້ຳ + `txnRef` unique + ຕ້ອງກົງຍອດ + ຖ້າສົງໄສ → `NEEDS_REVIEW` ສະເໝີ; ຂັ້ນຕໍ່ໄປຄື query status ກັບທະນາຄານເມື່ອມີ API |
| OCR ອ່ານຜິດແລ້ວຕັດຍອດຜິດ | auto-match ຕ້ອງຜ່ານ 3 ເກນພ້ອມກັນ; tolerance ຕັ້ງຄ່າໄດ້; ນອກນັ້ນໃຫ້ຄົນກົດ |
| Webhook ປອມ | ກວດ HMAC ກ່ອນ parse; ເກັບ raw ທຸກອັນ; IP allowlist ເມື່ອຕໍ່ຂອງຈິງ |
| Simulator ຫຼຸດໄປ production | ກວດ `env.isProd` ຄືກັບ `settle-mock` ແລະ ຂຽນ test ຢືນຢັນ |
| ຂະໜາດຮູບ/ພື້ນທີ່ເກັບ | ຈຳກັດຂະໜາດ, resize ກ່ອນເກັບ, job ລຶບສະລິບທີ່ປະຕິເສດເກີນ N ມື້ |
