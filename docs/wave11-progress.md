# Wave 11 — ປິດຊ່ອງຫວ່າງ ຄ (ການເງິນ) + ງ (ຊ່ອງຫວ່າງຍ່ອຍ) — 2026-09-26

ອ້າງອີງ `docs/finance-marketing-audit.md` (F-09…F-20), `docs/expenses-audit.md` §4, `docs/branches` gaps ໃນ memory.

## ຄ — ຊັ້ນບັນຊີ (backend `modules/finance-ledger/`, web-admin `/finance/accounting`)

| ລາຍການ | ສິ່ງທີ່ເຮັດ |
|---|---|
| F-10 FX feed ຝັ່ງ server | `refreshFxRates()` ດຶງ open.er-api.com (ຫຼື `FX_FEED_URL`) ທຸກເຊົ້າ 05:30 ຖ້າ `fxAutoFeed` ເປີດ; `ExchangeRate.source/locked/fetchedAt`; ອັດຕາທີ່ `locked` ບໍ່ຖືກຂຽນທັບ; ປຸ່ມ "ດຶງດຽວນີ້" + ຕັ້ງ/ລັອກເອງ. `utils/fxRate.ts` ບໍ່ປ່ຽນ. |
| F-11 ໜີ້ສິນສັນຍາ (IFRS 15) | `GET /finance-ledger/liabilities` — ມັດຈຳ, ບັດຂອງຂວັນ, ແພັກເກັດທີ່ຍັງບໍ່ໃຊ້, ຄະແນນ (× ມູນຄ່າ/ຄະແນນ), ທິບຄ້າງຈ່າຍ + ລາຍຮັບທີ່ຮັບຮູ້ໃນຊ່ວງ. |
| F-12 breakage ບັດຂອງຂວັນ | job ປະຈຳວັນ: ບັດ ACTIVE ເລີຍວັນໝົດອາຍຸ → EXPIRED + `breakageAmount` + GiftCardTransaction `isBreakage`. |
| F-13 ຄະແນນໝົດອາຍຸ | FIFO (`pointsExpiryMonths`, default 12) → LoyaltyTransaction `EXPIRE`; ແຈ້ງລ່ວງໜ້າ `pointsExpiryNoticeDays`. |
| F-17 journal export | `GET /finance-ledger/journal?from&to&format=csv` — ບັນຊີຄູ່ທຸກລາຍການ (ຮັບເງິນ, tender, ລາຍຮັບຕອນອອກ INV, ຄ່າປັບ, ຄືນເງິນ, breakage, ທິບ, ໃຊ້ແພັກເກັດ, ລາຍຈ່າຍ, ສະຕັອກທຸກປະເພດ ລວມ SOLD/SALE_RETURN) + trial balance; ຜັງບັນຊີແກ້ໄດ້ (`finance.accounts`). |
| F-19 ທິບ + service charge | `Gratuity`/`GratuityShare` (ບໍ່ຢູ່ໃນ totalAmount — ບໍ່ກະທົບ VAT/ຄອມ/ຄືນເງິນ); ແບ່ງໃຫ້ຊ່າງຂອງບິນ; ເງິນສົດ → PAYIN ລິ້ນຊັກ; ຈ່າຍອອກ CASH/BANK/PAYROLL. `serviceChargePercent` ບວກຕອນສ້າງບິນ (ລັອກໃນ ledger trigger ຫຼັງອອກ INV). |
| F-20 ຄ່າປັບ no-show / ຍົກເລີກຊ້າ | admin ປ່ຽນເປັນ NO_SHOW / CANCELLED ຫຼັງເສັ້ນຕາຍ → `Payment.forfeitedAmount` (% ຂອງມັດຈຳ); ຫັກອອກຈາກຍອດທີ່ຄືນໄດ້; `waiveFee` + ກ່ອງຢືນຢັນໃນໜ້າລາຍລະອຽດນັດ. |

Migration: `20260926150000_finance_wave11`. Test: `tests/integration/finance-ledger.test.ts` (12).

**ຂໍ້ຈຳກັດ:** ລາຍຮັບຮັບຮູ້ຕອນອອກໃບຮັບເງິນ (paidAt) ບໍ່ແມ່ນຕອນໃຫ້ບໍລິການ; ຄະແນນສະສົມບໍ່ຖືກລົງ journal ຕອນໄດ້ຮັບ (ລົງຕອນແລກເປັນ contra revenue) — ມູນຄ່າໜີ້ສິນຄະແນນສະແດງໃນລາຍງານໜີ້ສິນເທົ່ານັ້ນ.

## ງ — ຊ່ອງຫວ່າງຍ່ອຍ

| ລາຍການ | ສະຖານະ |
|---|---|
| OCR ໃບຮັບເງິນ PDF | ✅ ອ່ານ text layer ດ້ວຍ `unpdf`; PDF ທີ່ເປັນຮູບສະແກນ → 400 ໃຫ້ອັບເປັນຮູບ (ບໍ່ render ເພາະຕ້ອງໃຊ້ native canvas) |
| ເຕີມ petty cash ຈາກທະນາຄານ | ✅ `CashFundEntry.bankAccountId` (TOPUP ເທົ່ານັ້ນ) → DEBIT ໃນການກະທົບຍອດ + ຈັບຄູ່ statement ອັດຕະໂນມັດ/ດ້ວຍມື (`matchedCashFundEntryId`, kind `CASH_FUND`) |
| template ແບ່ງຄ່າໃຊ້ຈ່າຍ recurring | ✅ `RecurringExpense.allocations` → ExpenseAllocation ທຸກລາຍຈ່າຍທີ່ສ້າງ; UI ໃນ ExpenseAdminSheet (SUPER_ADMIN) |
| ໜ້າ packages ໃນ web-admin | ✅ `/services/packages` (ລາຍການ + ສ້າງ/ແກ້/ເປີດ-ປິດຂາຍ); backend ບັງຄັບ scope ສາຂາຂອງ BRANCH_ADMIN |
| Service.steps editor | ✅ ໃນຟອມບໍລິການ (ສູງສຸດ 12, ຍ້າຍລຳດັບໄດ້) |
| Branches | ✅ ເວລາແຍກມື້ (`weeklyHours`), ຜູ້ຈັດການ, ຮູບໜ້າປົກ + ຄັງຮູບ (ອັບໂຫລດຜ່ານ `/services/images`, GC ຮູ້ຈັກ), ເປົ້າເດືອນ + ຄວາມຄືບໜ້າໃນ insights, ປະຫວັດ (`/branches/:id/history`), archive/restore |
| Mobile reset ລະຫັດຜ່ານ | ✅ ມີຢູ່ແລ້ວແຕ່ 2026-09-24 (ບັນທຶກເກົ່າ) |
| seed: ບໍລິການຢູ່ສຳນັກງານໃຫຍ່ໝົດ | ✅ `seed.ts` ເມນູຫຼັກ = global; `scripts/spread-seed-services.ts` ແກ້ DB ທີ່ມີຢູ່ (ແລ່ນກັບ dev ແລ້ວ: 156 global, 14 add-on ກະຈາຍ 29 ສາຂາ) |
| openapi.yaml | ✅ `pnpm --filter @abcp/backend openapi:sync` (`--check` ສຳລັບ CI) — 481 operations; ແກ້ YAML ເດີມທີ່ parse ບໍ່ໄດ້ |

ແບ່ງວຽກກັບ session ອື່ນ: DM/staff push, resource picker, thread lock toggle, push deep-link → abcp-49/f1; inventory export, PO history, M13/M14 → abcp-65.

Migrations: `20260926160000_expenses_cashfund_bank_recurring_alloc`, `20260926170000_branch_hours_manager_photos_targets`.
Tests: `expenses-wave11` (4), `branches-wave11` (1), `service-steps` (1).
