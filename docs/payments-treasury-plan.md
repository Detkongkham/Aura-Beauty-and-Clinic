# ໂມດູນ 39 — ການຊຳລະເງິນ & ການເງິນອອກ (Payments & Treasury)

> ວັນທີຂຽນແຜນ: 2026-09-20 · ສະຖານະ: **✅ ສຳເລັດຄົບ W1–W7 (2026-09-20)** — ເບິ່ງ «ຜົນ W7» ລຸ່ມສຸດຂອງ §5 ສຳລັບລາຍການທີ່ຍັງຄ້າງກ່ອນ production
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

### W1 — Bank registry + Provider adapter (backend) — ✅ ສຳເລັດ 2026-09-20
- Schema `payments-treasury.prisma` (Bank/BankAccount/PaymentProvider/ProviderIntent/ProviderEvent/Refund)
  + migration `20260920000000_payments_treasury_w1_bank_provider` + seed 7 ທະນາຄານລາວ + 3 provider config
  + 1 default BankAccount ຕໍ່ສາຂາຫຼັກ (ນຳໃຊ້ໃນ dev/test DB ທັງສອງ)
- `interface BankProvider { createQrIntent, verifyWebhook, queryStatus, refund, payout }`
  (`apps/backend/src/modules/payments-treasury/providers/types.ts`)
- Implementation: `MockBcelProvider`, `MockLaoQrProvider`, `ManualTransferProvider` + registry
  (`providers/registry.ts`) — ລົງທະບຽນຕໍ່ `PaymentProvider.code`, ປ່ຽນເປັນ API ຈິງພາຍຫຼັງໂດຍບໍ່ແຕະ
  route/service ຊັ້ນເທິງ
- CRUD `BankAccount` ຕໍ່ສາຂາ (`GET/POST/PATCH/DELETE /api/v1/payments-treasury/bank-accounts`)
  + `GET /banks` + `POST /providers/:code/qr-intent` — RBAC `payments:manage` (ໃໝ່: `payments:manage`,
  `payments:review`, `expenses:view`, `expenses:approve` ໃນ `permission.schema.ts` + icon ໃນ
  `permissionGroups.ts`); BRANCH_ADMIN ຖືກຈຳກັດເຫັນ/ແກ້ສະເພາະສາຂາຕົນເອງ
- ບັນຊີທຳອິດຂອງສາຂາ = default ອັດຕະໂນມັດ; ຕັ້ງ default ໃໝ່ → ອັນເກົ່າຫຼຸດ default ໃນ transaction ດຽວ;
  ຫ້າມລຶບບັນຊີ default (400); ລຶບ = soft-disable (`isActive=false`)
- `PaymentMethod` +`BANK_TRANSFER`/+`BANK_QR` (backend enum + `packages/shared-types`)
- Test: `tests/unit/payments-treasury.registry.test.ts` (6, adapter registry/QR payload/webhook signature)
  + `tests/integration/payments-treasury.test.ts` (7, CRUD/RBAC/default-selection/qr-intent E2E) — ຜ່ານທັງໝົດ
  ພ້ອມ suite ເກົ່າ 199/199 ຢູ່ dev; typecheck+lint backend/web-admin/shared-types ຂຽວ

### W2 — Webhook + ຈຳລອງການຈ່າຍ — ✅ ສຳເລັດ 2026-09-20
- `POST /api/v1/payments/webhooks/:code` (ບໍ່ມີ authGuard; mount ກ່ອນ `/payments`) — ກວດ HMAC-SHA256
  (`X-Signature`, timing-safe) ຈາກ **raw body** (`app.ts` ເກັບ `req.rawBody`) ກ່ອນ parse; signature ຜິດ → 401
  ແລະ **ບໍ່ບັນທຶກ** event; ຖືກ → ບັນທຶກ `ProviderEvent` (unique `providerCode+eventId`) ແລ້ວຈຶ່ງ process
- State machine intent: `PENDING → SUCCESS | EXPIRED | FAILED` ດ້ວຍ claim ແບບ atomic
  (`updateMany where status=PENDING`) + Serializable tx → ສ້າງ `PaymentTransaction`
  (`BANK_QR`, ຜູກ `providerIntentId`/`bankAccountId`) → `recomputeAndSettle()` ເດີມ (export ແລ້ວ)
- ຜົນ process ເກັບໃນ `ProviderEvent.result`: SETTLED / SETTLED_REPLAY / FAILED / EXPIRED /
  IGNORED_NOT_PENDING / UNKNOWN_INTENT / PROVIDER_MISMATCH / AMOUNT_MISMATCH / OVERPAY (ສອງອັນສຸດທ້າຍ
  = ບໍ່ຕັດຍອດ, log ໃຫ້ຄົນກວດ). ທຸກກໍລະນີຕອບ 200 ເພື່ອບໍ່ໃຫ້ provider retry ຊ້ຳ; ລົ້ມກາງທາງ = 500 →
  event ຄ້າງ `processedAt=null` → replay ໄດ້
- `POST /api/v1/payments-treasury/intents/:id/simulate-paid` (`{status: SUCCESS|FAILED}`) — ຫ້າມໃນ prod
  (`env.isProd`), ສະເພາະ provider MOCK, ຕ້ອງ `payments:manage` + Idempotency-Key; ເຊັນ signature ດ້ວຍ secret
  ແລ້ວເອີ້ນ `handleWebhook` ຕົວດຽວກັນ. (ຍ້າຍ path ຈາກ `/payments/intents/...` ມາຢູ່ຮ່ວມ router treasury)
- Provider MOCK ຖືກປິດໃນ production ທັງ webhook ແລະ simulate (403); secret: env `PAYMENT_WEBHOOK_SECRET`
  (dev default) ຫຼື `process.env[PaymentProvider.webhookSecretRef]` ສຳລັບ LIVE
- Job `payment-expiry` (ທຸກ 10 ນາທີ) ເພີ່ມ: ປິດ `ProviderIntent` ທີ່ໝົດອາຍຸ + `replayStaleEvents()`
  (event ຄ້າງ >5 ນາທີ; ລົ້ມຊ້ຳ → `logger.error`). ຍັງບໍ່ມີ push/notification ຫາ admin — ເກັບໄວ້ເຮັດ W5
  (ໜ້າ inbox)
- Test: `tests/integration/payments-treasury-webhook.test.ts` (9): signature ຜິດ/ບໍ່ມີ → 401, event ຊ້ຳ →
  ຕັດເທື່ອດຽວ, intent ໝົດອາຍຸ, amount ບໍ່ກົງ/ເກີນຍອດບິນ, reference ບໍ່ຮູ້ຈັກ, simulate SUCCESS/FAILED,
  MANUAL_TRANSFER → 400, production ປິດ (403), replay event ຄ້າງ. Suite ລວມ 208/208, typecheck+lint ຂຽວ

### W3 — ສະລິບ + OCR (ຫົວໃຈ) — ✅ backend ສຳເລັດ 2026-09-20
- Schema `PaymentSlip` + enum `SlipOcrStatus`/`SlipVerdict` (`payments-treasury.prisma`) + migration
  `20260920100000_payments_treasury_w3_payment_slip`. ຄວາມແຕກຕ່າງຈາກແຜນ: ຫ້າມສະລິບຊ້ຳໃຊ້ `dedupeKey`
  (`${bank}:${txnRef}`) ທີ່ unique ແລະ **ລ້າງເປັນ null ເມື່ອຖືກປະຕິເສດ** (ແທນ `@@unique([bankCode, txnRef])`)
  ເພື່ອໃຫ້ຍື່ນສະລິບຖືກຕ້ອງອັນດຽວກັນໃໝ່ໄດ້ຫຼັງຖືກປະຕິເສດ; ໃຊ້ back-relation `PaymentTransaction.slip` ແທນ column `slipId`.
- Endpoint ຢູ່ໃຕ້ `/api/v1/payments-treasury` (ບໍ່ແມ່ນ `/payments` ຕາມແຜນເດີມ ເພື່ອຢູ່ໃນໂມດູນດຽວກັບ W1/W2):
  `POST /payments/:id/slips` (base64, `Idempotency-Key`), `GET /payments/:id/slips`, `GET /slips`
  (`?verdict=&branchId=&paymentId=`, ຕ້ອງ `payments:review`), `GET /slips/:id`, `POST /slips/:id/review`
  (`{action: APPROVE|REJECT, correctedFields?, note}`; REJECT ຕ້ອງມີ note).
- Pipeline (`modules/payments-treasury/slips/`): ກວດ magic-bytes + resize ≤2000px + ເກັບ JPEG →
  ຊັ້ນ 1 QR (`jsqr`, `ocr/qr.ts`; ຮອງຮັບ EMV TLV + URL ກວດສອບ) → ຊັ້ນ 2 `sharp` preprocess + `tesseract.js`
  (`ocr/tesseractProvider.ts`, language data ຈາກ `@tesseract.js-data/eng` ໃນ node_modules — ແລ່ນ offline)
  → `parser.ts` (ຈຳນວນເງິນ/ສະກຸນ/ເລກອ້າງອີງ/ວັນເວລາວຽງຈັນ/token ເລກບັນຊີ/ຊື່ທະນາຄານ) → `matcher.ts`
  (ຈຳນວນເງິນ 50 + ບັນຊີປາຍທາງ 30 + ເວລາ 20; AUTO_MATCHED ຕ້ອງຜ່ານທັງ 3 ເກນ ແລະ ອ່ານ txnRef ໄດ້).
  `interface OcrProvider` (`ocr/types.ts`) ສະຫຼັບເປັນ PaddleOCR/Vision ໄດ້ໂດຍປ່ຽນ `getOcrProvider()`.
- ແລ່ນເປັນ BullMQ job `slip-ocr` (`jobs/slip-ocr.job.ts`, concurrency 2); ຖ້າ enqueue ລົ້ມ (Redis) → ແລ່ນ inline.
  ຜົນ push ຜ່ານ socket event `payment-slip:updated` (ຫ້ອງ `user:<id>` ຂອງຜູ້ອັບ + `slip-review:<branch|all>`
  ທີ່ join ດ້ວຍ `join-slip-review`; event ບໍ່ມີຂໍ້ມູນສ່ວນຕົວ) + push notification `SLIP_APPROVED`/`SLIP_REJECTED`.
- APPROVE ສ້າງ `PaymentTransaction` (`BANK_TRANSFER`, ລັອກແຖວ payments FOR UPDATE + conditional-claim ຂອງສະລິບ →
  ອະນຸມັດ 2 ເທື່ອ/ພ້ອມກັນ = tx ດຽວ, ອີກອັນ 409) ແລ້ວ `recomputeAndSettle`; ທຸກ approve/reject ຂຽນ `AuditLog`.
- **Auto-approve ປິດເປັນຄ່າເລີ່ມຕົ້ນ** (`AppSetting` `payments.slip.autoApprove`): OCR ຢືນຢັນບໍ່ໄດ້ວ່າສະລິບແທ້
  ຫຼືປອມ (ຍັງບໍ່ມີ API ທະນາຄານ) ສະນັ້ນ AUTO_MATCHED = "ພ້ອມໃຫ້ພະນັກງານກົດຢືນຢັນ". ເປີດ = ລະບົບສ້າງ tx ເອງ.
  ຄ່າອື່ນ: `payments.slip.amountTolerance` (ກີບ, ເລີ່ມຕົ້ນ 0). ປັບໄດ້ໃນໜ້າ «ທະນາຄານ & ຊ່ອງທາງຈ່າຍ» (W5).
- ຂໍ້ຈຳກັດທີ່ຮູ້: parser ເປັນແບບທົ່ວໄປ (ບໍ່ crop region ຕໍ່ template ທະນາຄານ; `Bank.ocrTemplate` ຍັງບໍ່ໄດ້ໃຊ້) ແລະ
  ຮູບແບບ QR/ປ້າຍຂອງແຕ່ລະທະນາຄານຍັງບໍ່ໄດ້ທົດສອບກັບສະລິບຈິງ — ຕ້ອງເກັບສະລິບຕົວຢ່າງຈິງຂອງ BCEL/LDB/JDB ມາປັບ.
  OCR ອ່ານພາສາອັງກິດ/ຕົວເລກເທົ່ານັ້ນ (ຊື່ລາວອ່ານບໍ່ໄດ້, ບໍ່ໃຊ້ຕັດສິນ). ຮູບສະລິບຢູ່ໃຕ້ `/uploads` (ຊື່ໄຟລ໌ UUID,
  ຄືກັບ chat media) — ຄວນຍ້າຍໄປ signed URL ກ່ອນ production. ຍັງບໍ່ມີ job ລຶບສະລິບທີ່ຖືກປະຕິເສດເກີນ N ມື້.
- Test: `tests/unit/payments-treasury.slips.test.ts` (15: parser/matcher/QR) +
  `tests/integration/payments-treasury-slips.test.ts` (18: OCR ຈິງຜ່ານ tesseract, ຄົບ 3 ກໍລະນີຂອງແຜນ —
  ສະລິບຊ້ຳ, ຈຳນວນບໍ່ກົງ → NEEDS_REVIEW, approve ສອງເທື່ອ → tx ດຽວ — ບວກ RBAC/ຈ່າຍບາງສ່ວນ/auto-approve).
- Dependency ໃໝ່: `tesseract.js`, `jsqr`, `@tesseract.js-data/eng` (+ dev: `qrcode`); `pnpm-workspace.yaml`
  `allowBuilds.tesseract.js: false` (ບໍ່ມີ build script ທີ່ຈຳເປັນ).

### W4 — ໂມດູນລາຍຈ່າຍ (ເປັນເອກະລາດ, ເຮັດແຍກກ່ອນກໍໄດ້) — ✅ backend ສຳເລັດ 2026-09-20
- `ExpenseCategory` + seed ໝວດມາດຕະຖານ (ຄ່າເຊົ່າ, ເງິນເດືອນ, ວັດຖຸດິບ, ໄຟ/ນ້ຳ, ການຕະຫຼາດ,
  ຂົນສົ່ງ, ບຳລຸງຮັກສາ, ພາສີ, ອື່ນໆ)
- Workflow `DRAFT → SUBMITTED → APPROVED → PAID` + ຈ່າຍອອກຈາກ `BankAccount` ໃດ
- ແນບບິນ → OCR ດຶງຈຳນວນເງິນ/ວັນທີອັດຕະໂນມັດ (pipeline ດຽວກັບ W3)
- ລາຍຈ່າຍຊ້ຳ (recurring) → job ສ້າງ draft ປະຈຳເດືອນ
- API: CRUD, summary ຕາມໝວດ/ສາຂາ/ຊ່ວງເວລາ, ແລະ **P&L ແທ້**:
  ລາຍຮັບ − ລາຍຈ່າຍ − ເງິນເດືອນ − ຕົ້ນທຶນສິນຄ້າ (ຕໍ່ກັບ payroll + inventory ທີ່ມີແລ້ວ)

**ສິ່ງທີ່ສ້າງແລ້ວ (backend + shared-types, ຍັງບໍ່ມີ UI — ຢູ່ W5):**
- Schema `expenses.prisma` (`ExpenseCategory` / `ExpenseAttachment` / `RecurringExpense` + enum
  `ExpenseStatus`, `ExpenseCategoryKind`) + `Expense` ໃນ `inventory.prisma` ຂະຫຍາຍ (categoryId, status,
  supplier/PO, paidFromAccount, createdBy/approvedBy, recurring). Migration
  `20260920110000_payments_treasury_w4_expenses` — backfill ແຖວເກົ່າ: ໝວດ `OTHER`, ສະຖານະ `PAID`
  (ຮັກສາຕົວເລກ dashboard ເດີມ), ຖິ້ມ column `category` ເກົ່າ. Seed 9 ໝວດມາດຕະຖານ.
- ໝວດມີ `kind`: `OPERATING` / `PAYROLL` (ເງິນເດືອນນອກລະບົບຄອມມິດຊັນ → ເຂົ້າ labour) / `INVENTORY`
  (ຊື້ວັດຖຸດິບ — **ບໍ່ນັບ** ໃນ P&L ເພາະ COGS ຄິດຈາກການຕັດສະຕັອກແລ້ວ, ສະແດງເປັນ memo).
- API `/api/v1/expenses`: `categories` (GET ທຸກ admin / POST,PATCH ສະເພາະ SUPER_ADMIN), CRUD, `submit|approve|reject|pay`,
  `attachments` (base64, sha256 ກັນໃບຮັບເງິນຊ້ຳທົ່ວລະບົບ), `summary`, `profit-loss`, `recurring` CRUD.
- Permission ໃໝ່ `expenses:manage` (ສ້າງ/ແກ້/ສົ່ງ/ແນບ) ຄຽງຄູ່ `expenses:view` / `expenses:approve`.
- ທຸກ transition ເປັນ atomic (`updateMany where status=from`) — ອະນຸມັດ/ຈ່າຍພ້ອມກັນ = ສຳເລັດເທື່ອດຽວ;
  ຜູ້ສ້າງອະນຸມັດຂອງຕົນເອງບໍ່ໄດ້ (ຍົກເວັ້ນ SUPER_ADMIN); ຈ່າຍອອກຈາກບັນຊີຂອງສາຂາ/ສະກຸນດຽວກັນເທົ່ານັ້ນ; AuditLog ທຸກຂັ້ນ.
- P&L ລາຍເດືອນ (ວຽງຈັນ): ລາຍຮັບເກັບໄດ້ຈິງ (tender SUCCESS) − ຄືນເງິນ − COGS (Σ SERVICE_CONSUMED × costPrice
  **ປັດຈຸບັນ**, ຍັງບໍ່ແມ່ນ WAC — ຕິດອຸດ C4 ຂອງ inventory audit) − ຄອມ+ໂບນັດ (`getPayrollReport.totals.payable`)
  − ເງິນເດືອນນອກລະບົບ − ລາຍຈ່າຍດຳເນີນງານ.
- ລາຍຈ່າຍຊ້ຳ: BullMQ `recurring-expense` ທຸກມື້ 06:00 ສ້າງ DRAFT ຂອງເດືອນນີ້ (idempotent ດ້ວຍ
  `@@unique([recurringExpenseId, recurringPeriod])`, catch-up ໄດ້ ແຕ່ບໍ່ຍ້ອນຫຼັງຂ້າມເດືອນ).
- Dashboard `period.expenses` ປ່ຽນໃຫ້ນັບສະເພາະ APPROVED/PAID ແລະ ບໍ່ນັບໝວດ INVENTORY.
- Test: `tests/integration/expenses.test.ts` (14).
- **ຍັງຄ້າງ:** OCR ດຶງຈຳນວນເງິນ/ວັນທີຈາກໃບຮັບເງິນ (`ExpenseAttachment.ocrStatus/ocrRaw` ຈອງໄວ້ແລ້ວ, ລໍ pipeline W3);
  body parser ຂອງ app ຈຳກັດ 2MB ຈຶ່ງແນບໄຟລ໌ໄດ້ຈິງ ≲1.5MB (ຄືກັບ chat media) — client ຕ້ອງ resize.

### W5 — web-admin: ໝວດ nav ໃໝ່ «ການຊຳລະເງິນ» — ✅ ສຳເລັດ 2026-09-20
| ໜ້າ | ເນື້ອໃນ |
|---|---|
| ທະນາຄານ & ຊ່ອງທາງຈ່າຍ | ບັນຊີຕໍ່ສາຂາ, ເປີດ/ປິດ provider, QR ຄົງທີ່, ສະຖານະ mock/live |
| ກວດສະລິບ | inbox 2-pane ແບບ `/notifications` — ຮູບສະລິບຊ້າຍ, field ທີ່ OCR ອ່ານໄດ້ຂວາ, ຊີ້ຈຸດບໍ່ກົງເປັນສີ, ປຸ່ມອະນຸມັດ/ປະຕິເສດ/ແກ້ຄ່າ |
| ລາຍຈ່າຍ | ຕາຕະລາງ + ໝວດ + ອະນຸມັດ + ກຣາຟຕາມໝວດ |
| ກະທົບຍອດ | ປຽບທຽບ tx ໃນລະບົບ ກັບ ລາຍການທະນາຄານຕໍ່ມື້ |
- ໃຊ້ template ຂອງ `/referrals` ຕາມ convention; `/finance` ເກົ່າຢູ່ບ່ອນເດີມ
- Permission ໃໝ່: `payments:manage`, `payments:review`, `expenses:view`, `expenses:approve`

**ສິ່ງທີ່ສ້າງແລ້ວ (W5):**
- Nav ກຸ່ມ `payments` + 4 ໜ້າ ໃນ `apps/web-admin/src/features/payments-treasury/`, route `/payments/banks|slips|expenses|reconciliation`
  (permission: `payments:manage` / `payments:review` / `expenses:view` / `payments:manage`), breadcrumb + i18n `lo`/`en` (`payTreasury.*`, 292 keys, ສະແກນຕົວ Thai ແລ້ວ).
- **ທະນາຄານ & ຊ່ອງທາງຈ່າຍ**: ບັນຊີຕໍ່ສາຂາ (ເພີ່ມ/ແກ້/ຕັ້ງຫຼັກ/ປິດ-ເປີດ, ເລກບັນຊີ mask), ອັບໂຫຼດ QR ຄົງທີ່, ບັດ provider (mode MOCK/LIVE, ເປີດ-ປິດ, ຄ່າທຳນຽມ,
  webhook path + ຄັດລອກ, ສະຖານະ secret, intent ຄ້າງ, event ຜິດປົກກະຕິ 7 ມື້), ບັດນະໂຍບາຍສະລິບ (auto-approve ຕ້ອງຢືນຢັນຄວາມສ່ຽງ, tolerance) — ແກ້ໄຂໄດ້ສະເພາະ SUPER_ADMIN.
- **ກວດສະລິບ**: inbox 2-pane (Sheet ເທິງໜ້າຈໍແຄບ), ຄິວລຽງ NEEDS_REVIEW → AUTO_MATCHED, ຕາຕະລາງ «ຄາດໝາຍ vs ອ່ານໄດ້» ຊີ້ field ບໍ່ກົງດ້ວຍໄອຄອນ+ຂໍ້ຄວາມ,
  ແກ້ຄ່າ OCR (ສົ່ງສະເພາະ field ທີ່ປ່ຽນ), ອະນຸມັດ (confirm) / ປະຕິເສດ (ຕ້ອງມີເຫດຜົນ), live ຜ່ານ socket `payment-slip:updated`, ລູກສອນ ↑↓ ເລື່ອນຄິວ, ເປີດສະລິບຜ່ານ `?s=`.
- **ລາຍຈ່າຍ**: stat + ກຣາຟແຍກໝວດ + P&L ຈິງ, ຕາຕະລາງ server-paginated + ຕົວກັ່ນຕອງ, sheet ລາຍລະອຽດ (submit/approve/reject/pay + ໃບຮັບເງິນແນບ, resize ຝັ່ງ client),
  ແຜງ «ລາຍຈ່າຍຊ້ຳ & ໝວດ» (ໝວດແກ້ໄດ້ສະເພາະ SUPER_ADMIN), export CSV.
- **ກະທົບຍອດ**: ລາຍວັນ × ບັນຊີ — ລະບົບ (tender BANK_TRANSFER/BANK_QR ທີ່ SUCCESS + ລາຍຈ່າຍ PAID ຈາກບັນຊີ) ທຽບ statement ທີ່ປ້ອນເອງ → MATCHED / VARIANCE / UNRECONCILED;
  ແຈ້ງສະລິບຄ້າງ + webhook ທີ່ບໍ່ໄດ້ຕັດຍອດ (ສາເຫດທີ່ພົບຫຼາຍ).
- Backend ທີ່ເພີ່ມສຳລັບ W5 (migration `20260920120000_payments_treasury_w5_bank_statement`, model `BankStatementEntry`): `GET/PATCH /payments-treasury/providers`,
  `GET/PUT /settings`, `POST /bank-accounts/:id/qr`, `GET /reconciliation`, `PUT/DELETE /reconciliation/statements`; BankAccountView +`qrImageUrl`; ຈຳກັດຊ່ວງກະທົບຍອດ ≤62 ມື້,
  BRANCH_ADMIN ຈຳກັດສາຂາຕົນ, ຂຽນ AuditLog ທຸກການແກ້.
- ແກ້ໜີ້ຈາກ W1: `PaymentMethod` +`BANK_TRANSFER`/`BANK_QR` ເຮັດໃຫ້ web-admin typecheck ແດງ (`finance.methods.ts`) — ເພີ່ມ icon/ສີ/ປ້າຍແລ້ວ.
- Test: backend `payments-treasury-w5.test.ts` (7); web-admin 18 (BanksPage 4, SlipReviewPage 3, ExpensesPage 4, ReconciliationPage 3, slipModel 4).
  ຜົນ: backend 264/264, web-admin 103/103, typecheck+lint ຂຽວທັງ backend/web-admin/shared-types, web-admin build ຜ່ານ.
- **ຂໍ້ຈຳກັດທີ່ຮູ້:** statement ຕ້ອງປ້ອນເອງ (ຍັງບໍ່ມີ API ດຶງຈາກທະນາຄານ); ຍັງບໍ່ໄດ້ທົດສອບດ້ວຍສາຍຕາໃນ browser ຈິງ (ມີແຕ່ jsdom test); Refund ຍັງບໍ່ມີ API/UI;
  ຟອມລາຍຈ່າຍຍັງບໍ່ມີຕົວເລືອກ supplier/PO (API ຮອງຮັບແລ້ວ); OCR ດຶງຈຳນວນເງິນຈາກໃບຮັບເງິນລາຍຈ່າຍ ຍັງຄ້າງຈາກ W4.

### W6 — mobile — ✅ ສຳເລັດ 2026-09-20
- ລູກຄ້າ (ທັງ 3 ໜ້າຈ່າຍເງິນ: ນັດ `PaymentScreen`, ບັດຂອງຂວັນ, ແພັກເກັດ) ໃຊ້ component ດຽວກັນ
  `features/payments/transfer.parts.tsx › BankTransferPanel`: ເລືອກທະນາຄານ (chip, ເມື່ອສາຂາມີ >1 ບັນຊີ) →
  ເຫັນຊື່/ເລກບັນຊີ + QR ຄົງທີ່ (ຖ້າຕັ້ງ `qrImageKey`) + ຈຳນວນທີ່ຕ້ອງໂອນ (ສຳເນົາໄດ້ແຕ່ລະແຖວ) → ຖ່າຍ/ເລືອກສະລິບ
  (`expo-image-picker`, quality 0.8 ເພື່ອໃຫ້ OCR ອ່ານຕົວເລກຄົມ) → ເບິ່ງຕົວຢ່າງ → ສົ່ງ → ລາຍການສະລິບທີ່ສົ່ງແລ້ວ
  ພ້ອມສະຖານະ (ກຳລັງກວດ / ລໍຢືນຢັນ / ຢືນຢັນແລ້ວ / ບໍ່ຜ່ານ + ເຫດຜົນ / ສະລິບຊ້ຳ). ບິນທີ່ມີມັດຈຳຄ້າງ ໃຫ້ເລືອກ
  ໂອນ «ມັດຈຳ» ຫຼື «ເຕັມ». ຜົນມາທາງ socket `payment-slip:updated` (ຫ້ອງ `user:<id>`) + poll ທຸກ 8 ວິ ຕາບໃດທີ່ມີສະລິບຄ້າງ.
- **ໜ້າ "ສຳເລັດ" = ບິນ FULLY_PAID ຝັ່ງ server** (ພະນັກງານອະນຸມັດແລ້ວ) — ລູກຄ້າບໍ່ໄດ້ຕັດຍອດເອງ (ກົດຂໍ້ 1). ໜ້າຊື້
  ບັດ/ແພັກເກັດອ່ານ `GET /payments/:id` ແທນ state ຝັ່ງ client.
- **ຖອດ QR mock ອອກຈາກ mobile ທັງໝົດ**: ລຶບ `QrCard`/`DepositIntro`/`useCountdown`/`useDepositIntent`/`useSettleMock`
  (settle-mock ໃຊ້ໄດ້ສະເພາະ dev ຢູ່ແລ້ວ ຈຶ່ງເຮັດໃຫ້ການຈ່າຍ deposit ໃນ production ບໍ່ເຄີຍໃຊ້ໄດ້). backend endpoint
  `deposit-intent`/`settle-mock` ຍັງຢູ່ (web-admin/test ອາດໃຊ້).
- ພະນັກງານ (ຕ້ອງມີສິດ `payments:review` ໃນ session — ອ່ານຈາກ `authUser.permissions`): ໄອຄອນໃບບິນ + badge ເທິງຫົວໜ້າ
  `TodayTab` → `StaffSlipInboxScreen` (ແຖບ ລໍກວດ/ກວດແລ້ວ, pull-to-refresh) → `StaffSlipReviewScreen` (ຮູບ + ຂະຫຍາຍເຕັມຈໍ,
  ຄ່າ OCR ທຽບຄ່າຄາດໝາຍ ໄຮໄລ້ຈຸດບໍ່ກົງ, ແກ້ຈຳນວນ/ເລກອ້າງອີງ, ອະນຸມັດ (confirm) ຫຼື ປະຕິເສດ (ເຫດຜົນ quick-pick + ພິມເອງ)).
  ຕິດ socket ຫ້ອງ `join-slip-review` ຢູ່ Today tab (ຄ້າງຢູ່ຕະຫຼອດ) ເພື່ອໃຫ້ badge ສົດ.
- Backend ທີ່ເພີ່ມເພື່ອ W6: `GET /payments-treasury/payments/:id/bank-accounts` (ລູກຄ້າເຈົ້າຂອງບິນ/ພະນັກງານ — endpoint
  `/bank-accounts` ເກົ່າເປີດສະເພາະ admin; ຄືນສະເພາະບັນຊີ ACTIVE ຂອງສາຂາ, ບໍ່ມີ field ພາຍໃນ) + shared type
  `PaymentBankAccountView`; push `SLIP_APPROVED/REJECTED` ແນບ `appointmentId` ແລະ ຖືກຈັດເຂົ້າໝວດ `payments`
  (ກ່ອນນີ້ຕົກໄປ `system`, `SLIP_REJECTED` = warning); mobile Notifications ກົດແລ້ວເປີດໜ້າຈ່າຍເງິນຂອງນັດນັ້ນ.
- ບໍ່ມີ native module ໃໝ່ (image-picker ຖືກໃຊ້ໃນແຊັດຢູ່ແລ້ວ) → ບໍ່ຕ້ອງ rebuild dev-client.
- Test: `payments-treasury-slips.test.ts` +1 (bank-accounts: ສະເພາະ ACTIVE, default ກ່ອນ, QR url, ລູກຄ້າອື່ນ 403). mobile: tsc + eslint ຂຽວ.
  **ຍັງບໍ່ໄດ້ທົດສອບເທິງເຄື່ອງ/simulator** (ບໍ່ມີ UI test ໃນ repo mobile) — ຕ້ອງລອງ flow ຈິງ: ອັບສະລິບຈາກກ້ອງ, ຮູບໃຫຍ່ (base64 body
  limit ສະເພາະ route ສະລິບ), staff ອະນຸມັດ → ໜ້າລູກຄ້າປ່ຽນສະຖານະ.
- ຂໍ້ຈຳກັດ: ການກົດ push ບໍ່ deep-link (`lib/push.ts` ບໍ່ມີ handler — ເປັນພຶດຕິກຳເດີມຂອງທຸກ notification; ເປີດຈາກ
  ໜ້າ Notifications ໄດ້). ບໍ່ມີ UI ໃຫ້ staff ແກ້ `receiverAccount`/`transferredAt` ໃນ mobile (ແກ້ໄດ້ສະເພາະຈຳນວນ+ເລກອ້າງອີງ;
  ສ່ວນທີ່ເຫຼືອຢູ່ web-admin W5). W5 ຍັງບໍ່ໄດ້ເຮັດ ຈຶ່ງຍັງບໍ່ມີ UI ຕັ້ງບັນຊີ/QR ຂອງສາຂາ — ຕ້ອງ seed/API ໄປກ່ອນ.

### W7 — ປິດງານ — ✅ ສຳເລັດ 2026-09-20
tests ຄົບ 3 ຊັ້ນ · migration · i18n `lo`/`en` (ສະແກນຕົວ Thai ໃນ `lo.json`) ·
ອັບເດດ `implementation_plan.md` + doc ນີ້ · `pnpm -r typecheck/lint/test/build` ຂຽວທັງ repo

**ຜົນ W7 (ແລ່ນຈິງ 2026-09-20):**

| ລາຍການ | ຜົນ |
|---|---|
| `pnpm -r typecheck` | ຂຽວ — shared-types, backend, web-admin, mobile |
| `pnpm -r lint` | ຂຽວ — ທັງ 4 ໂປຼເຈັກ |
| `pnpm -r build` | ຂຽວ — shared-types, backend (`tsc`), web-admin (vite). `apps/mobile` ບໍ່ມີ build script (Expo/EAS) |
| Test — backend | **264/264** (42 ໄຟລ໌) ແລ່ນກັບ DB ແຍກ `abcp_test` (`.env.test`), ບໍ່ແຕະ dev DB |
| Test — web-admin | 103/103 (30 ໄຟລ໌) |
| Test — shared-types / mobile | 12/12 · 11/11 |
| Migration | `prisma migrate status` = "up to date" ທັງ `abcp` (dev) ແລະ `abcp_test` (30 migrations; Phase 9 = 4 ກ້ອນ) |
| i18n | `lo.json` (web-admin + mobile) ບໍ່ມີຕົວ Thai (U+0E01–0E7F) ປົນ; `payTreasury.*` ຄົບທັງ `lo`/`en` |

Test 3 ຊັ້ນຂອງ Module 39: **unit** (`payments-treasury.registry`, `payments-treasury.slips` — parser/matcher/QR),
**integration** (`payments-treasury`, `-webhook`, `-slips` ດ້ວຍ OCR ຈິງ, `-w5`, `expenses`), **UI** (web-admin: BanksPage,
SlipReviewPage, ExpensesPage, ReconciliationPage, slipModel). mobile ບໍ່ມີ UI test ໃນ repo — ກວດໄດ້ສະເພາະ tsc + eslint.

**ຍັງຄ້າງກ່ອນ production (ບໍ່ blocked ການປິດ Module):**
1. ເຊື່ອມ API ທະນາຄານຈິງ (ທຸກ provider ຍັງ MOCK; ປ່ຽນຜ່ານ `providers/registry.ts` ໂດຍບໍ່ແຕະ route) + IP allowlist ຂອງ webhook.
2. ເກັບສະລິບຈິງ BCEL/LDB/JDB ມາປັບ parser/QR (ຍັງບໍ່ໄດ້ທົດສອບກັບຂອງຈິງ; `Bank.ocrTemplate` ຍັງບໍ່ໄດ້ໃຊ້).
3. Refund API/UI (model `Refund` ມີແລ້ວ, ຍັງບໍ່ມີ endpoint).
4. OCR ດຶງຈຳນວນເງິນ/ວັນທີຈາກໃບຮັບເງິນລາຍຈ່າຍ (ຄໍລຳ `ExpenseAttachment.ocrStatus/ocrRaw` ຈອງໄວ້ແລ້ວ); ຕົວເລືອກ supplier/PO ໃນຟອມລາຍຈ່າຍ.
5. ຍ້າຍຮູບສະລິບ/ໃບຮັບເງິນຈາກ `/uploads` ສາທາລະນະ ໄປ signed URL + job ລຶບສະລິບທີ່ຖືກປະຕິເສດເກີນ N ມື້.
6. ທົດສອບດ້ວຍສາຍຕາ: web-admin ໃນ browser ຈິງ, mobile ເທິງເຄື່ອງ/simulator (ອັບສະລິບຈາກກ້ອງ → staff ອະນຸມັດ → ໜ້າລູກຄ້າປ່ຽນສະຖານະ).
7. Push ທີ່ກົດແລ້ວ deep-link ໄປໜ້າຈ່າຍ (`lib/push.ts` ຍັງບໍ່ມີ handler — ເປັນພຶດຕິກຳເດີມຂອງທຸກ notification).
8. ຄ່າ COGS ໃນ P&L ໃຊ້ `costPrice` ປັດຈຸບັນ (ບໍ່ແມ່ນ WAC) ຈົນກວ່າຈະແກ້ C4 ຂອງ `docs/inventory-audit.md`.

**ໝາຍເຫດ:** backend test ຕ້ອງແລ່ນກັບ `.env.test` ສະເໝີ (wipe() ຂອງບາງໄຟລ໌ລຶບແບບ blanket). ຖ້າແລ່ນຂະໜານແລ້ວມີ test
ລົ້ມແບບສຸ່ມ 1–4 ອັນ (ຄືກັບ audit-log / inventory) ໃຫ້ແລ່ນຊ້ຳ — ເປັນການແຍ່ງ DB ລະຫວ່າງໄຟລ໌ ບໍ່ແມ່ນ regression;
ຮອບຢືນຢັນ W7 ນີ້ຜ່ານໝົດໃນຮອບດຽວ. `apps/backend/uploads-test/*` ຖືກເພີ່ມເຂົ້າ `.gitignore` ແລ້ວ.

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
