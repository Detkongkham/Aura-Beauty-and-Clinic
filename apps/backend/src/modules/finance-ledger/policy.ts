import {
  LEDGER_ACCOUNT_KEYS,
  type ChartOfAccounts,
  type FinancePolicy,
  type UpdateChartOfAccountsInput,
  type UpdateFinancePolicyInput,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';

/**
 * Wave 11 — ນະໂຍບາຍການເງິນ (AppSetting `finance.policy`) + ຜັງບັນຊີ (`finance.accounts`).
 * ເກັບເປັນ JSON blob ແລະ merge ກັບຄ່າ default ທຸກຄັ້ງທີ່ອ່ານ → ເພີ່ມ field ໃໝ່ໄດ້ໂດຍບໍ່ຕ້ອງ migrate.
 */

export const FINANCE_POLICY_KEY = 'finance.policy';
export const CHART_OF_ACCOUNTS_KEY = 'finance.accounts';

export const DEFAULT_FINANCE_POLICY: FinancePolicy = {
  serviceChargePercent: 0,
  noShowFeePercent: 100,
  lateCancelFeePercent: 50,
  pointsExpiryMonths: 12,
  pointsExpiryNoticeDays: 30,
  giftCardBreakage: true,
  fxAutoFeed: false,
  fxCurrencies: ['USD', 'THB', 'CNY'],
};

/** ຜັງບັນຊີ default — ລະຫັດແບບ 4 ຫຼັກທົ່ວໄປ; ເຈົ້າຂອງປ່ຽນໃຫ້ກົງກັບໂປຣແກຣມບັນຊີຂອງຕົນໄດ້. */
export const DEFAULT_CHART_OF_ACCOUNTS: ChartOfAccounts = {
  cash: { code: '1000', name: 'Cash on hand' },
  bank: { code: '1010', name: 'Bank & QR clearing' },
  inventory: { code: '1200', name: 'Inventory' },
  inventoryInTransit: { code: '1250', name: 'Inventory in transit (inter-branch)' },
  accountsPayable: { code: '2000', name: 'Accounts payable — suppliers' },
  openingEquity: { code: '3000', name: 'Opening balance equity' },
  customerDeposits: { code: '2100', name: 'Customer deposits (contract liability)' },
  giftCardLiability: { code: '2200', name: 'Gift card liability' },
  packageDeferred: { code: '2210', name: 'Deferred revenue — packages' },
  vatPayable: { code: '2300', name: 'VAT payable' },
  tipsPayable: { code: '2400', name: 'Tips payable to staff' },
  serviceRevenue: { code: '4000', name: 'Service revenue' },
  serviceChargeRevenue: { code: '4010', name: 'Service charge revenue' },
  loyaltyDiscount: { code: '4050', name: 'Loyalty redemptions (contra revenue)' },
  cancellationFeeIncome: { code: '4100', name: 'No-show & late-cancel fees' },
  breakageIncome: { code: '4200', name: 'Gift card breakage income' },
  salesReturns: { code: '4900', name: 'Sales returns & refunds' },
  cogs: { code: '5000', name: 'Cost of goods consumed' },
  shrinkage: { code: '5100', name: 'Inventory shrinkage' },
  operatingExpense: { code: '6000', name: 'Operating expenses' },
};

async function readSetting<T>(key: string): Promise<Partial<T>> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? (row.value as Partial<T>) : {};
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  const json = value as Prisma.InputJsonValue;
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: json }, update: { value: json } });
}

export async function getFinancePolicy(): Promise<FinancePolicy> {
  return { ...DEFAULT_FINANCE_POLICY, ...(await readSetting<FinancePolicy>(FINANCE_POLICY_KEY)) };
}

export async function updateFinancePolicy(input: UpdateFinancePolicyInput): Promise<FinancePolicy> {
  const next = { ...(await getFinancePolicy()), ...input };
  if (input.fxCurrencies) next.fxCurrencies = [...new Set(input.fxCurrencies.filter((c) => c !== 'LAK'))];
  await writeSetting(FINANCE_POLICY_KEY, next);
  return next;
}

export async function getChartOfAccounts(): Promise<ChartOfAccounts> {
  const stored = await readSetting<ChartOfAccounts>(CHART_OF_ACCOUNTS_KEY);
  const out = {} as ChartOfAccounts;
  for (const k of LEDGER_ACCOUNT_KEYS) out[k] = { ...DEFAULT_CHART_OF_ACCOUNTS[k], ...(stored[k] ?? {}) };
  return out;
}

export async function updateChartOfAccounts(input: UpdateChartOfAccountsInput): Promise<ChartOfAccounts> {
  const current = await getChartOfAccounts();
  for (const [k, v] of Object.entries(input)) {
    const key = k as keyof ChartOfAccounts;
    current[key] = { ...current[key], ...v };
  }
  await writeSetting(CHART_OF_ACCOUNTS_KEY, current);
  return current;
}
