# ວິເຄາະລະບົບເງິນເດືອນ / ຄ່າຄອມ (Payroll & Staff KPI) — ສິ່ງທີ່ຕ້ອງເພີ່ມ

> ວັນທີວິເຄາະ: 2026-09-20
> ຂອບເຂດທີ່ກວດ: `apps/backend/src/modules/payroll/*`, `apps/backend/prisma/schema/staff.prisma`,
> `apps/backend/prisma/schema/finance.prisma` (StaffCommission),
> `apps/backend/src/modules/appointments/appointments.service.ts` (ຈຸດສ້າງຄ່າຄອມ),
> `apps/backend/src/modules/staff-portal/*`, `packages/shared-types/src/payroll.schema.ts`,
> `apps/web-admin/src/features/payroll/*`, `apps/mobile/src/screens/staff/StaffEarningsScreen.tsx`.
> ມາດຕະຖານທີ່ໃຊ້ອ້າງອີງ: **ກົດໝາຍແຮງງານ ສປປ ລາວ (ສະບັບ 2013)**, **ປະກັນສັງຄົມ (LSSO)**,
> **ກົດໝາຍອາກອນລາຍໄດ້ (PIT ແບບຂັ້ນໄດ)**, **IAS 19 (Employee Benefits)**,
> **COSO internal control (segregation of duties, approval, audit trail)**,
> **ERP payroll practice (SAP HCM, Odoo Payroll, Gusto)**.

---

## ✅ ສະຖານະການແກ້ໄຂ (2026-09-26) — P1 + P2 + P3 + P4 SHIPPED

Migrations `20260926090000_payroll_integrity` + `20260926100000_payroll_runs_payslips` (apply ແລ້ວທັງ dev ແລະ test DB).

| ລາຍການ | ສະຖານະ | ບ່ອນ |
|---|---|---|
| C1 unique KPI goal | ✅ dedupe (dev ມີ 51 ກຸ່ມຊ້ຳ — ມາຈາກ `setMonth()` ລົ້ນໃນ seed-bulk, ແກ້ດ້ວຍ `skipDuplicates`) + `@@unique` + upsert | `payroll.service.ts` `recomputeGoals` |
| C2 ຄອມຈ່າຍເມື່ອເກັບເງິນຄົບ | ✅ accrue ຕອນປິດຄິວ, ຈ່າຍໄດ້ເມື່ອບິນ FULLY_PAID/REFUNDED ຫຼື ແພັກເກັດ/ຍອດ 0; `commissionHeld` ໃນ report; ປິດໄດ້ດ້ວຍ setting | `payroll/commission.ts` |
| C3 ຫຼັກຖານການຈ່າຍ | ✅ `paidAt/paidById`, `bonusPaidAt/bonusPaidById`, AuditLog ພ້ອມ old/new (middleware ກາງຂ້າມ /payroll), un-pay ຕ້ອງມີເຫດຜົນ | `auditPayroll` |
| C4 scope ສາຂາ | ✅ BRANCH_ADMIN ຖືກບັງຄັບເປັນສາຂາຕົນທຸກ endpoint (ອ່ານ/ຂຽນ/CSV/payslip) | `payroll.routes.ts` `actorOf/scopedQuery` |
| G4.1 travelFee | ✅ ຖານຄອມ = ຍອດ − ຄ່າເດີນທາງ (ໃຊ້ helper ດຽວ `accrueCommission` ທັງ 2 ຈຸດ); ແຖວທີ່ຈ່າຍແລ້ວບໍ່ຖືກແກ້ | `commission.ts` |
| G4.4 | ບໍ່ຕ້ອງແກ້ — `>=` ກັບ `>` ໃຫ້ໂບນັດ 0 ຄືກັນເມື່ອພໍດີເປົ້າ | — |
| G4.5 recompute N+1 | ✅ groupBy ດຽວ + transaction; ລາຍຮັບຈິງລວມທຸກສາຂາ; ໂບນັດທີ່ຈ່າຍແລ້ວບໍ່ປ່ຽນ | `recomputeGoals` |
| G2 PayrollRun + Payslip | ✅ ໜຶ່ງຮອບ/ສາຂາ/ເດືອນ (ພະນັກງານເຂົ້າຮອບສາຂາຫຼັກ), DRAFT→APPROVED→PAID, reopen ພ້ອມເຫດຜົນ, snapshot | `payroll-run.service.ts` |
| G3.1 ປິດງວດ | ✅ ໃບຮັບຄອມທີ່ຍັງບໍ່ຈ່າຍຂອງນັດກ່ອນທ້າຍເດືອນ (ທຸກເດືອນ) → ນັດປິດຍ້ອນຫຼັງໄຫຼເຂົ້າຮອບຖັດໄປ; ຮອບ APPROVED ລັອກລາຍການເພີ່ມ/ຫັກ + ປຸ່ມຈ່າຍແບບເກົ່າ | |
| G3.2 ອະນຸມັດ | ✅ ກຽມ = BRANCH_ADMIN/SUPER_ADMIN; ອະນຸມັດ/ຈ່າຍ/ເປີດຄືນ/ແກ້ເງິນເດືອນ/ຕັ້ງຄ່າ = SUPER_ADMIN | |
| G3.3 ລົງລາຍຈ່າຍ | ✅ ຕອນ PAID ລົງ Expense ໝວດ SALARY = ເງິນເດືອນ/OT/ເງິນເພີ່ມ + SSO ນາຍຈ້າງ (ຄອມ/ໂບນັດ ບໍ່ລົງ ເພາະ P&L ນັບແບບ accrual ແລ້ວ) | |
| G1.1–G1.5 | ✅ `salaryType` NONE/MONTHLY/DAILY/HOURLY + `baseSalary` + `ssoEnrolled`; OT ຈາກ attendance (ມື້ OVERTIME ເກີນຊົ່ວໂມງມາດຕະຖານ × 1.5); ຫັກມື້ຂາດ; `PayrollAdjustment` (ເງິນເພີ່ມ/ເບີກ/ປັບ/ອື່ນ); SSO 5.5%/6% ເພດານ 4.5M; PIT ຂັ້ນໄດ 0–25% | `payroll-calc.ts` (pure) |
| G5.1 ໃບຈ່າຍເງິນ PDF | ✅ ພິມ/ບັນທຶກ PDF ຈາກ browser (PayslipDialog) | web-admin `PayRunDialogs.tsx` |
| G5.2 payslip ໃນມືຖື | ✅ `GET /staff-portal/payslips` + card ໃນ StaffEarningsScreen | |
| G5.6 ແຈ້ງຕອນຈ່າຍ | ✅ `PAYSLIP_PAID` notification ຕໍ່ຄົນ | |

**⚠️ ຕ້ອງໃຫ້ນັກບັນຊີກວດ:** ອັດຕາ PIT/SSO/ເພດານ ເປັນຄ່າເລີ່ມຕົ້ນຕາມຄວາມເຂົ້າໃຈ — ແກ້ໄດ້ໃນ Payroll ▸ ຮອບຈ່າຍເງິນ ▸ ຕັ້ງຄ່າ (`AppSetting payroll.settings`).

**ຮອບ 2 (2026-09-26, migrations `20260926110000_service_commission_rules` + `20260926120000_payroll_run_bank_account`):**
G1.8 ອັດຕາຄອມຕໍ່ບໍລິການ (`ServiceCommissionRule`, ຕັ້ງຄ່າ ▸ ອັດຕາຕໍ່ບໍລິການ) · G3.5 ເພດານຈ່າຍດ່ວນຂອງ BRANCH_ADMIN (`quickPayLimitLak`, ຄ່າເລີ່ມ 5M) ·
G4.3 ຮອບຈ່າຍ refresh ໂບນັດ KPI ຈາກລາຍຮັບລ່າສຸດກ່ອນສ້າງໃບ · G5.3 ສະຫຼຸບປີ (`GET /payroll/ytd`) · G5.5 ຕັ້ງເປົ້າເປັນຊຸດ (`POST /payroll/kpi/bulk-targets`) ·
ຈ່າຍຮອບຈາກບັນຊີທະນາຄານ (`bankAccountId` → `Expense.paidFromAccountId`). Test: `payroll-extras.test.ts` 4.

**ບໍ່ເຮັດ / ຍັງເປີດ:** G1.6 ທິບ — ຈ່າຍແຍກຜ່ານ finance-ledger `payoutGratuities` (ລິ້ນຊັກ) ແລ້ວ, ບໍ່ດຶງເຂົ້າໃບຈ່າຍເງິນເພື່ອບໍ່ໃຫ້ຈ່າຍຊ້ຳ ·
G1.7 ຄອມຂັ້ນໄດ — ໂບນັດ KPI (ສ່ວນເກີນເປົ້າ × ອັດຕາ) ເຮັດໜ້າທີ່ນີ້ຢູ່ແລ້ວ · G5.4 ເປົ້າລະດັບທີມ/ສາຂາ ·
ລາຍຈ່າຍທີ່ລົງຕອນ PAID ເປັນສະເພາະຕົ້ນທຶນເງິນເດືອນ ສະນັ້ນຍອດຈະບໍ່ເທົ່າກັບຍອດໂອນອອກຈາກທະນາຄານ (ເຊິ່ງລວມຄ່າຄອມ) ຕອນກະທົບຍອດ.

Tests: `payroll.test.ts` 13, `payroll-runs.test.ts` 8, `tests/unit/payroll-calc.test.ts` 7, web-admin `PayrollPage.test.tsx` 5.

---

## 1. ສະຫຼຸບຜູ້ບໍລິຫານ

ສິ່ງທີ່ເອີ້ນວ່າ "Payroll" ໃນລະບົບປັດຈຸບັນ **ຍັງບໍ່ແມ່ນ payroll** — ມັນແມ່ນ
**ເຄື່ອງຄິດໄລ່ຄ່າຄອມ + ໂບນັດ KPI** ທີ່ເຮັດໜ້າທີ່ຂອງມັນໄດ້ດີ, ແຕ່ຂາດ 3 ຊັ້ນທີ່ເຮັດໃຫ້ມັນເປັນລະບົບຈ່າຍເງິນແທ້:

| ຊັ້ນ | ສະຖານະ | ຜົນກະທົບ |
|---|---|---|
| **A. ໂຄງສ້າງຄ່າຕອບແທນ** (ເງິນເດືອນພື້ນຖານ, OT, ຫັກ, ປະກັນສັງຄົມ, ອາກອນ) | ❌ ບໍ່ມີເລີຍ | ຄິດ "ເງິນສຸດທິທີ່ຕ້ອງຈ່າຍ" ບໍ່ໄດ້ → ຍັງຕ້ອງເຮັດ Excel ຄຽງຂ້າງ |
| **B. ຫຼັກຖານການຈ່າຍ** (PayrollRun / Payslip, ໃຜຈ່າຍ, ເວລາໃດ, ຊ່ອງທາງໃດ) | ❌ ມີແຕ່ `isPaid: boolean` | ຕອບບໍ່ໄດ້ວ່າ "ຈ່າຍໃຫ້ລາວເມື່ອໃດ, ໃຜອະນຸມັດ" — ຄວາມສ່ຽງທຸດຈະລິດ |
| **C. ການເຊື່ອມກັບບັນຊີ** (ລົງເປັນລາຍຈ່າຍໃນ `/finance`) | ❌ ບໍ່ມີ | ຄ່າແຮງ = ລາຍຈ່າຍໃຫຍ່ສຸດຂອງທຸລະກິດນີ້ ແຕ່ບໍ່ປາກົດໃນງົບໃດເລີຍ |

**ຄະແນນຄວາມພ້ອມ (ກ່ອນ/ຫຼັງ ການແກ້ຮອບນີ້):**

| ດ້ານ | ກ່ອນ | ຫຼັງ | ໝາຍເຫດ |
|---|---|---|---|
| ຄວາມຖືກຕ້ອງຂອງການຄິດໄລ່ | 5/10 | **8/10** | ແກ້ຂອບເຂດເດືອນ + ຂອບເຂດສາຂາແລ້ວ (F1–F3) |
| ໂຄງສ້າງຄ່າຕອບແທນ | 2/10 | 2/10 | ຍັງມີແຕ່ % ຄ່າຄອມ ແລະ ໂບນັດ |
| ຫຼັກຖານ / Audit trail | 1/10 | 1/10 | ຍັງເປັນ boolean, ຍັງບໍ່ມີ AuditLog |
| ການຄວບຄຸມພາຍໃນ (ສິດ, ອະນຸມັດ, ປິດງວດ) | 2/10 | 3/10 | ມີ confirm dialog ແລ້ວ, ແຕ່ BRANCH_ADMIN ຍັງເຫັນທຸກສາຂາ |
| ການເຊື່ອມບັນຊີ | 0/10 | 0/10 | ຍັງບໍ່ລົງລາຍຈ່າຍ |
| ລາຍງານ & KPI | 4/10 | **9/10** | MoM, pace, ການກະຈາຍເປົ້າ, drill-down ລາຍຄິວ, 6 ເດືອນຍ້ອນຫຼັງ |
| UI/UX (web-admin) | 5/10 | **9/10** | 3 ມຸມມອງ, bulk, URL state, payslip drawer |
| Staff-facing (mobile) | 6/10 | 6/10 | `StaffEarningsScreen` ມີ ແຕ່ຍັງບໍ່ແມ່ນ payslip ເຕັມ |
| **ລວມ** | **≈ 3.1/10** | **≈ 4.8/10** | ພໍສຳລັບຮ້ານທີ່ຈ່າຍຄ່າຄອມຢ່າງດຽວ, ຍັງບໍ່ພໍສຳລັບລູກຈ້າງປະຈຳ |

---

## 2. ສິ່ງທີ່ແກ້ໄປແລ້ວໃນຮອບນີ້ (F1–F4)

### F1. ຂອບເຂດເດືອນເປັນ UTC — ລາຍຮັບຮົ່ວຂ້າມເດືອນ 🔴 ແກ້ແລ້ວ

`monthRange()` ເດີມສ້າງຂອບເຂດດ້ວຍ `Date.UTC(y, m, 1)` ຊື່ໆ. ວຽງຈັນ = UTC+7, ສະນັ້ນ
**ທຸກຄິວທີ່ເກີດລະຫວ່າງ 00:00–07:00 ຂອງວັນທີ 1 (ເວລາວຽງຈັນ) ຈະຖືກນັບເຂົ້າເດືອນກ່ອນ**
ແລະ 00:00–07:00 ຂອງວັນທີ 1 ເດືອນຖັດໄປຈະຖືກນັບເຂົ້າເດືອນນີ້. ເດືອນໜຶ່ງ ≈ 7 ຊົ່ວໂມງຂອງລາຍຮັບຢູ່ຜິດຊ່ອງ.
ດຽວນີ້ໃຊ້ `vientianeDayStart()` ຈາກ `dateHelpers.ts` ຄືກັບໂມດູນອື່ນ (ເບິ່ງ `vientiane-time-convention`).

### F2. `payCommissions` ບໍ່ສົນໃຈ `branchId` 🔴 ແກ້ແລ້ວ

ເມື່ອກັ່ນຕອງໜ້າເປັນສາຂາໜຶ່ງ ແລ້ວກົດ "ຈ່າຍຄ່າຄອມ", `updateMany` ຈະໄປ**ໝາຍຄ່າຄອມຂອງຄິວສາຂາອື່ນ
ຂອງຄົນດຽວກັນວ່າຈ່າຍແລ້ວນຳ** — ເງິນທີ່ຍັງບໍ່ໄດ້ຈ່າຍຫາຍໄປຈາກລາຍງານ. ດຽວນີ້ສົ່ງ `branchId` ລົງ where.

### F3. `recomputeKpi` ຄິດ actualRevenue ຂ້າມສາຂາ 🟠 ແກ້ແລ້ວ

`recomputeGoal` ລວມລາຍຮັບທຸກສາຂາ ເຖິງວ່າຜູ້ໃຊ້ຈະກົດ recompute ສະເພາະສາຂາໜຶ່ງ —
ຄ່າ `actualRevenue`/`bonusAmount` ທີ່ເກັບໄວ້ຈຶ່ງບໍ່ກົງກັບແຖວໃນລາຍງານ. ດຽວນີ້ສົ່ງ `branchId` ຜ່ານລົງໄປ.

### F4. ບໍ່ມີການຈ່າຍເປັນຊຸດ 🟡 ເພີ່ມແລ້ວ

`POST /payroll/commissions/pay-bulk` + `PATCH /payroll/kpi/bonus-paid-bulk` —
ປິດຮອບຈ່າຍ 20 ຄົນເປັນ 1 request ແທນ 20 request.

---

## 3. ບັນຫາລະດັບ CRITICAL ທີ່ **ຍັງເປີດຢູ່**

### C1. `StaffKpiGoal` ບໍ່ມີ `@@unique([staffProfileId, monthYear])` 🔴

[staff.prisma:106](apps/backend/prisma/schema/staff.prisma#L106) — ບໍ່ມີ unique constraint ເລີຍ,
ແລະ `recomputeGoal` ໃຊ້ຮູບແບບ `findFirst` → `create` ທີ່ **ບໍ່ atomic**.
ສອງ request recompute ພ້ອມກັນ (ຫຼື recompute + ຕັ້ງເປົ້າພ້ອມກັນ) = **ສອງແຖວເປົ້າຂອງເດືອນດຽວ**,
ແລ້ວ `goalBy` map ຈະເລືອກແຖວໃດແຖວໜຶ່ງແບບສຸ່ມ → ເປົ້າ/ໂບນັດປ່ຽນໄປມາເອງ.

**ວິທີແກ້:** migration ເພີ່ມ `@@unique([staffProfileId, monthYear])` (ລ້າງແຖວຊ້ຳກ່ອນ) + ປ່ຽນເປັນ `upsert`.

### C2. ຄ່າຄອມເກີດຈາກ **ຍອດຈອງ** ບໍ່ແມ່ນ **ຍອດເກັບໄດ້** 🔴

[appointments.service.ts:691](apps/backend/src/modules/appointments/appointments.service.ts#L691) —
ຄ່າຄອມຖືກສ້າງຕອນ `status → COMPLETED` ໂດຍອີງ `totalAmount`, ບໍ່ສົນວ່າລູກຄ້າຈ່າຍແລ້ວຫຼືບໍ່.
`/finance` ມີ "collection health / aging" ຢູ່ແລ້ວ ໝາຍຄວາມວ່າ **ມີໜີ້ຄ້າງຮັບຈິງ** →
ຮ້ານຈ່າຍຄ່າຄອມອອກໄປກ່ອນທີ່ຈະໄດ້ເງິນເຂົ້າ. ຖ້າລູກຄ້າບໍ່ຈ່າຍ/ຂໍຄືນເງິນ, ຄ່າຄອມ**ບໍ່ຖືກຖອນຄືນ** —
ບໍ່ມີ logic ໃດລຶບ/ກັບ `StaffCommission` ເມື່ອມີ refund ຫຼື cancel ຫຼັງ COMPLETED.

**ວິທີແກ້:** ເລືອກນະໂຍບາຍໜຶ່ງ ແລ້ວບັງຄັບໃນລະບົບ —
(ກ) ຄ່າຄອມ "accrued" ຕອນປິດຄິວ ແຕ່ **ຈ່າຍໄດ້ສະເພາະເມື່ອ Payment ເກັບຄົບ** (ແນະນຳ), ຫຼື
(ຂ) ສ້າງຄ່າຄອມຕອນ Payment `PAID` ແທນ. ພ້ອມກັນນັ້ນຕ້ອງມີ **ລາຍການກັບລາຍການ (clawback)** ຕອນ refund.

### C3. ບໍ່ມີ audit trail ຂອງການຈ່າຍ 🔴

`payCommissions`/`setBonusPaid` ພຽງແຕ່ flip boolean. ບໍ່ມີ `paidAt`, `paidByUserId`, `method`, `reference`,
ແລະ **ບໍ່ໄດ້ຂຽນເຂົ້າ AuditLog** ເລີຍ (grep: ບໍ່ມີການເອີ້ນ audit ໃນໂມດູນນີ້) —
ເຖິງວ່າ Phase 6 ຈະມີໂມດູນ Audit ຢູ່ແລ້ວ. ກົດຜິດເທື່ອດຽວ = ຫຼັກຖານຫາຍໝົດ, ແລະ un-pay ກໍ່ເງີຍບໍ່ມີຮ່ອງຮອຍ.

### C4. BRANCH_ADMIN ອ່ານ ແລະ ຈ່າຍໄດ້ທຸກສາຂາ 🔴

[payroll.routes.ts:23](apps/backend/src/modules/payroll/payroll.routes.ts#L23) —
`payrollRouter.use(authGuard, roleGuard('SUPER_ADMIN','BRANCH_ADMIN'))` ແລ້ວຈົບ.
`branchId` ເປັນພຽງ **ຕົວກັ່ນຕອງທີ່ຜູ້ໃຊ້ເລືອກເອງ**, ບໍ່ແມ່ນຂອບເຂດທີ່ບັງຄັບ.
ຜູ້ຈັດການສາຂາໜຶ່ງເຫັນເງິນເດືອນ/ຜົນງານຂອງທຸກສາຂາ ແລະ ກົດຈ່າຍໃຫ້ຄົນສາຂາອື່ນໄດ້.
`/dashboard` ບັງຄັບ scope ນີ້ແລ້ວ (ເບິ່ງ `dashboard-page-redesign`) — payroll ຍັງບໍ່ທັນ.

**ວິທີແກ້:** middleware ບັງຄັບ `branchId = req.user.branchId` ເມື່ອ role ≠ SUPER_ADMIN.

---

## 4. ຊ່ອງຫວ່າງລະດັບໂຄງສ້າງ (ສິ່ງທີ່ "ຕ້ອງເພີ່ມ")

### 4.1 ໂຄງສ້າງຄ່າຕອບແທນ — ກຸ່ມ G1

| # | ສິ່ງທີ່ຂາດ | ເຫດຜົນ |
|---|---|---|
| G1.1 | **ເງິນເດືອນພື້ນຖານ** (`baseSalary`, `salaryType: MONTHLY \| DAILY \| HOURLY`) | `StaffProfile` ມີແຕ່ `commissionRate`. ລູກຈ້າງປະຈຳຕ້ອງມີເງິນເດືອນ |
| G1.2 | **ຄ່າລ່ວງເວລາ (OT)** | `StaffAttendance` ເກັບ `checkIn`/`checkOut` ແລະ ມີສະຖານະ `OVERTIME` ຢູ່ແລ້ວ — ຊົ່ວໂມງຖືກບັນທຶກ ແຕ່**ບໍ່ເຄີຍຖືກຕີລາຄາ** |
| G1.3 | **ລາຍການຫັກ** (ເບິກລ່ວງໜ້າ, ຄ່າປັບ, ຊື້ສິນຄ້າ, ຫັກຂາດວຽກ) | ໃນຮ້ານລາວເປັນເລື່ອງປົກກະຕິ; ດຽວນີ້ຕ້ອງໄປຫັກເອງນອກລະບົບ |
| G1.4 | **ປະກັນສັງຄົມ (LSSO)** — ສ່ວນລູກຈ້າງ + ສ່ວນນາຍຈ້າງ, ມີເພດານ | ບັງຄັບຕາມກົດໝາຍ; ຂາດອັນນີ້ຄິດ "ເງິນສຸດທິ" ບໍ່ໄດ້ |
| G1.5 | **ອາກອນລາຍໄດ້ (PIT) ແບບຂັ້ນໄດ** | ດຽວກັນ |
| G1.6 | **ທິບ / ຄ່າບໍລິການ (service charge) ແລະ ການແບ່ງປັນ** | ທຸລະກິດຄວາມງາມມີທິບຈິງ, ດຽວນີ້ບໍ່ມີບ່ອນເກັບ |
| G1.7 | **ຄ່າຄອມແບບຂັ້ນໄດ (tiered)** — ເຊັ່ນ 10% ຮອດ 10 ລ້ານ, 15% ສ່ວນເກີນ | ດຽວນີ້ເປັນ % ດຽວຕໍ່ຄົນ, ຈູງໃຈໄດ້ໜ້ອຍກວ່າ |
| G1.8 | **ອັດຕາຄ່າຄອມຕ່າງກັນຕາມບໍລິການ** | ບໍລິການກຳໄລສູງ/ຕ່ຳ ຄວນໃຫ້ % ຕ່າງກັນ |

### 4.2 ຫຼັກຖານການຈ່າຍ — ກຸ່ມ G2 (ສຳຄັນສຸດ)

**ຕ້ອງເພີ່ມ 2 ຕາຕະລາງ:**

```prisma
model PayrollRun {           // ໜຶ່ງຮອບຈ່າຍ ຕໍ່ ໜຶ່ງເດືອນ ຕໍ່ ໜຶ່ງສາຂາ
  id, branchId, monthYear
  status        PayrollRunStatus  // DRAFT → REVIEWED → APPROVED → PAID → CLOSED
  preparedById, approvedById, paidById
  preparedAt, approvedAt, paidAt
  totalGross, totalCommission, totalBonus, totalDeduction, totalNet
  note
  @@unique([branchId, monthYear])
}

model Payslip {              // ໜຶ່ງໃບ ຕໍ່ ໜຶ່ງຄົນ ຕໍ່ ໜຶ່ງຮອບ — snapshot ທີ່ບໍ່ປ່ຽນອີກ
  id, payrollRunId, staffProfileId
  baseSalary, overtimePay, commission, bonus, tips
  deductions Json           // [{ type, label, amount }]
  socialSecurity, incomeTax
  netPay
  paymentMethod PaymentMethod?  // CASH | TRANSFER
  reference String?             // ເລກທີໂອນ / ເລກໃບຮັບ
  paidAt DateTime?
  @@unique([payrollRunId, staffProfileId])
}
```

ມີແລ້ວຈະຕອບໄດ້ທັງໝົດ: ໃຜອະນຸມັດ · ຈ່າຍເມື່ອໃດ · ຊ່ອງທາງໃດ · ພິມໃບຈ່າຍເງິນໄດ້ ·
ແລະ **ງວດທີ່ປິດແລ້ວຈະບໍ່ປ່ຽນເອງ** ເມື່ອມີຄິວຍ້ອນຫຼັງເຂົ້າມາ (ບັນຫາ G3.1 ຂ້າງລຸ່ມ).

### 4.3 ການຄວບຄຸມ & ບັນຊີ — ກຸ່ມ G3

| # | ສິ່ງທີ່ຂາດ | ຜົນກະທົບ |
|---|---|---|
| G3.1 | **ການປິດງວດ (period lock)** | ຄິວທີ່ຖືກປິດຍ້ອນຫຼັງເຂົ້າເດືອນທີ່ຈ່າຍໄປແລ້ວ ຈະເຮັດໃຫ້ຕົວເລກເດືອນນັ້ນປ່ຽນແບບງຽບໆ |
| G3.2 | **ຂັ້ນຕອນອະນຸມັດ** (ກຽມ → ກວດ → ອະນຸມັດ → ຈ່າຍ) | ຄົນດຽວກຽມ ແລະ ຈ່າຍໄດ້ເອງ — ຜິດຫຼັກ segregation of duties |
| G3.3 | **ລົງລາຍຈ່າຍເຂົ້າ `/finance`** | ຄ່າແຮງເປັນລາຍຈ່າຍໃຫຍ່ສຸດ ແຕ່ບໍ່ປາກົດໃນລາຍງານການເງິນ. ເຊື່ອມກັບ Module 39 ທີ່ວາງແຜນໄວ້ (ເບິ່ງ `docs/payments-treasury-plan.md` — ຍັງບໍ່ມີໂມດູນລາຍຈ່າຍ) |
| G3.4 | **Clawback ເມື່ອ refund/cancel** | ຄ່າຄອມທີ່ຈ່າຍແລ້ວຂອງຄິວທີ່ຖືກຄືນເງິນ ຍັງຄ້າງຢູ່ຕະຫຼອດ |
| G3.5 | **ເພດານ/ການອະນຸມັດຍອດໃຫຍ່** | ຈ່າຍ 200 ລ້ານ ກັບ 200 ພັນ ໃຊ້ການກົດປຸ່ມອັນດຽວກັນ |

### 4.4 ຄວາມຖືກຕ້ອງຂອງການຄິດໄລ່ — ກຸ່ມ G4

| # | ບັນຫາ | ລາຍລະອຽດ |
|---|---|---|
| G4.1 | **ຄ່າຄອມກິນຄ່າເດີນທາງ** | `payoutAmount = totalAmount × rate` ແລະ `totalAmount` ລວມ `travelFee` ຂອງ Home Service → ຊ່າງໄດ້ % ຈາກຄ່ານ້ຳມັນ. ຄວນໃຊ້ `totalAmount − travelFee` |
| G4.2 | **`grossRevenue` ກັບ `serviceAmount` ບໍ່ກົງກັນ** | ລາຍງານໃຊ້ `Appointment.totalAmount`, ຄ່າຄອມໃຊ້ `StaffCommission.serviceAmount` — ສອງແຫຼ່ງທີ່ອາດເໜັງອອກຈາກກັນໄດ້ |
| G4.3 | **ໂບນັດເປັນ snapshot ທີ່ຄ້າງ** | `bonusAmount` ປ່ຽນສະເພາະຕອນກົດ Recompute. ຄິວໃໝ່ເຂົ້າມາ ໂບນັດບໍ່ຂຶ້ນເອງ → ຖ້າລືມກົດ, ຕົວເລກຜິດ. ຄວນຄິດສົດຕອນອ່ານ ຫຼື ມີ job ປະຈຳມື້ |
| G4.4 | **ເງື່ອນໄຂບັນລຸເປົ້າບໍ່ສົມມາດ** | `targetMet` ໃຊ້ `>=` ແຕ່ໂບນັດໃຊ້ `>` — ໄດ້ພໍດີເປົ້າ = "ບັນລຸ" ແຕ່ໂບນັດ 0 |
| G4.5 | **`recomputeKpi` ເປັນ N+1** | loop ຕໍ່ຄົນ, ໜຶ່ງ aggregate ຕໍ່ຮອບ, ແລະ **ບໍ່ໄດ້ຢູ່ໃນ transaction** — 200 ຄົນ = 400 round trip, ແລະ ລົ້ມກາງຄັນໄດ້ |
| G4.6 | **ບໍ່ມີການຈັດການຊ່າງທີ່ຖືກລຶບ** | `deletedAt: null` ກັ່ນຊ່າງທີ່ລຶບອອກ — ລວມທັງຍອດຄ້າງຈ່າຍຂອງລາວ. ລາຍງານເດືອນເກົ່າຈະປ່ຽນຍ້ອນຫຼັງ |

### 4.5 ໜ້າຈໍ & ປະສົບການທີ່ຍັງຂາດ — ກຸ່ມ G5

| # | ສິ່ງທີ່ຂາດ | ບ່ອນທີ່ຄວນຢູ່ |
|---|---|---|
| G5.1 | **ໃບຈ່າຍເງິນ PDF / ພິມໄດ້** | ປຸ່ມໃນ payslip drawer |
| G5.2 | **ຊ່າງເບິ່ງໃບຈ່າຍເງິນຕົນເອງ** | `StaffEarningsScreen` ມີແລ້ວແຕ່ສະແດງແຕ່ສະຫຼຸບຄ່າຄອມ — ຄວນເປັນ payslip ເຕັມ (ຫັກ, ສຸດທິ, ສະຖານະຈ່າຍ) |
| G5.3 | **ມຸມມອງຫຼາຍເດືອນ / YTD** | ດຽວນີ້ອ່ານໄດ້ເທື່ອລະເດືອນເທົ່ານັ້ນ (drawer ມີ 6 ເດືອນແລ້ວ, ແຕ່ລະດັບຮ້ານຍັງບໍ່ມີ) |
| G5.4 | **ເປົ້າລະດັບທີມ / ສາຂາ** | ດຽວນີ້ເປົ້າເປັນລາຍບຸກຄົນຢ່າງດຽວ |
| G5.5 | **ຕັ້ງເປົ້າເປັນຊຸດ** (ເຊັ່ນ "ເປົ້າ = 110% ຂອງເດືອນກ່ອນ ໃຫ້ທຸກຄົນ") | ດຽວນີ້ຕ້ອງຕັ້ງເທື່ອລະຄົນ — ບັນຫາທີ່ແທ້ຈິງເມື່ອມີ 30 ຄົນ |
| G5.6 | **ແຈ້ງເຕືອນຕອນຈ່າຍ** | Module 38 (Messaging) ມີແລ້ວ — ຄວນສົ່ງຂໍ້ຄວາມໃຫ້ຊ່າງເມື່ອຈ່າຍ |

---

## 5. ແຜນທີ່ແນະນຳ (ຈັດລຳດັບຕາມ ຜົນຕອບແທນ ÷ ຄວາມສ່ຽງ)

| ຄື້ນ | ຂອບເຂດ | ເຫດຜົນ |
|---|---|---|
| **P1 — ປິດຮູຄວາມຖືກຕ້ອງ** (1–2 ມື້) | C1 (unique + upsert) · C4 (ບັງຄັບ scope ສາຂາ) · C3 (AuditLog + `paidAt`/`paidById`) · G4.1 (ຕັດ travelFee) · G4.4 · G4.5 | ບັນຫາຂໍ້ມູນຜິດ ແລະ ສິດເຂົ້າເຖິງ — ແກ້ກ່ອນສະເໝີ |
| **P2 — ເຮັດໃຫ້ເປັນ payroll ແທ້** (1 ອາທິດ) | `PayrollRun` + `Payslip` (§4.2) · ປິດງວດ · ຂັ້ນຕອນອະນຸມັດ · ໃບຈ່າຍເງິນ PDF | ໄດ້ຫຼັກຖານ, ໄດ້ການຄວບຄຸມ, ງວດເກົ່າບໍ່ປ່ຽນເອງ |
| **P3 — ໂຄງສ້າງຄ່າຕອບແທນ** (1 ອາທິດ) | `baseSalary`/`salaryType` · OT ຈາກ attendance · ລາຍການຫັກ · LSSO + PIT · ເງິນສຸດທິ | ເລີກໃຊ້ Excel ໄດ້ແທ້ |
| **P4 — ເຊື່ອມບັນຊີ** (2–3 ມື້) | ລົງລາຍຈ່າຍເຂົ້າ `/finance` ຕອນ run ເປັນ PAID · clawback ຕອນ refund | ຄ່າແຮງປາກົດໃນງົບ, ກຳໄລທີ່ເຫັນຈຶ່ງຈິງ |
| **P5 — ຂະຫຍາຍຜົນ** | ຄ່າຄອມຂັ້ນໄດ · % ຕາມບໍລິການ · ເປົ້າທີມ · ຕັ້ງເປົ້າເປັນຊຸດ · payslip ໃນມືຖື · ແຈ້ງເຕືອນ | ຈູງໃຈ ແລະ ຫຼຸດວຽກມື |

> **ໝາຍເຫດ:** P2 ກັບ P4 ຄວນເຮັດພ້ອມ Module 39 (Payments & Treasury) ທີ່ວາງແຜນໄວ້ແລ້ວ —
> ທັງສອງຕ້ອງການໂມດູນ "ລາຍຈ່າຍ" ອັນດຽວກັນ. ເບິ່ງ `docs/payments-treasury-plan.md`.
