import type { BankProvider } from './types.js';
import { MockBcelProvider } from './mockBcelProvider.js';
import { MockLaoQrProvider } from './mockLaoQrProvider.js';
import { ManualTransferProvider } from './manualTransferProvider.js';

/**
 * Registry ຂອງ adapter ຕໍ່ `PaymentProvider.code` — ຕໍ່ provider ຂອງຈິງພາຍຫຼັງໂດຍພຽງແຕ່
 * ເພີ່ມ class ໃໝ່ ແລ້ວລົງທະບຽນທີ່ນີ້, ບໍ່ຕ້ອງແຕະ route/service ຊັ້ນເທິງ.
 */
const registry = new Map<string, BankProvider>([
  ['MOCK_BCEL', new MockBcelProvider()],
  ['MOCK_LAO_QR', new MockLaoQrProvider()],
  ['MANUAL_TRANSFER', new ManualTransferProvider()],
]);

export function getBankProvider(code: string): BankProvider | undefined {
  return registry.get(code);
}

export function listBankProviderCodes(): string[] {
  return [...registry.keys()];
}
