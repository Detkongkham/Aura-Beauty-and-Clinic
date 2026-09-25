-- Payroll P2/P3/P4 (docs/payroll-audit.md): salary structure, adjustments, pay runs, payslips.
-- CreateEnum
CREATE TYPE "SalaryType" AS ENUM ('NONE', 'MONTHLY', 'DAILY', 'HOURLY');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "PayrollAdjustmentType" AS ENUM ('ALLOWANCE', 'ADVANCE', 'PENALTY', 'OTHER_DEDUCTION');

-- AlterTable
ALTER TABLE "staff_profiles" ADD COLUMN     "baseSalary" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
ADD COLUMN     "salaryType" "SalaryType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "ssoEnrolled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "monthYear" TEXT NOT NULL,
    "type" "PayrollAdjustmentType" NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "label" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "monthYear" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "preparedById" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "lastReopenReason" TEXT,
    "totalGross" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "totalDeductions" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "totalNet" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "totalCommission" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "totalBonus" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "totalEmployerSso" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "totalIncomeTax" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "salaryType" "SalaryType" NOT NULL,
    "baseRate" DECIMAL(16,2) NOT NULL,
    "daysPresent" INTEGER NOT NULL DEFAULT 0,
    "daysAbsent" INTEGER NOT NULL DEFAULT 0,
    "hoursWorked" DECIMAL(8,2) NOT NULL DEFAULT 0.0,
    "overtimeHours" DECIMAL(8,2) NOT NULL DEFAULT 0.0,
    "basePay" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "absenceDeduction" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "overtimePay" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "commission" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "bonus" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "allowances" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "grossPay" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "ssoBase" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "ssoEmployee" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "ssoEmployer" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "taxableIncome" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "incomeTax" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "advances" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "otherDeductions" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "clawback" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "netPay" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
    "commissionIds" JSONB NOT NULL DEFAULT '[]',
    "clawbackIds" JSONB NOT NULL DEFAULT '[]',
    "bonusGoalId" TEXT,
    "adjustments" JSONB NOT NULL DEFAULT '[]',
    "taxBreakdown" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_adjustments_staffProfileId_monthYear_idx" ON "payroll_adjustments"("staffProfileId", "monthYear");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_expenseId_key" ON "payroll_runs"("expenseId");

-- CreateIndex
CREATE INDEX "payroll_runs_monthYear_idx" ON "payroll_runs"("monthYear");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_branchId_monthYear_key" ON "payroll_runs"("branchId", "monthYear");

-- CreateIndex
CREATE INDEX "payslips_staffProfileId_idx" ON "payslips"("staffProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payrollRunId_staffProfileId_key" ON "payslips"("payrollRunId", "staffProfileId");

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

