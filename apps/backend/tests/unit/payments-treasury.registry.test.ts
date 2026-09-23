import { describe, expect, it } from 'vitest';
import { getBankProvider, listBankProviderCodes } from '../../src/modules/payments-treasury/providers/registry.js';

/**
 * Unit — Module 39 W1 provider adapter registry. ບໍ່ຕ້ອງການ DB.
 */
describe('payments-treasury provider registry', () => {
  it('ລົງທະບຽນ provider ທັງ 3 ຕົວ (mock BCEL, mock Lao QR, manual transfer)', () => {
    const codes = listBankProviderCodes();
    expect(codes).toEqual(expect.arrayContaining(['MOCK_BCEL', 'MOCK_LAO_QR', 'MANUAL_TRANSFER']));
  });

  it('ຄືນ undefined ສຳລັບ code ທີ່ບໍ່ຮູ້ຈັກ', () => {
    expect(getBankProvider('DOES_NOT_EXIST')).toBeUndefined();
  });

  it('MockBcelProvider ສ້າງ QR intent ພ້ອມ expiresAt ຖືກຕ້ອງ', async () => {
    const provider = getBankProvider('MOCK_BCEL')!;
    const result = await provider.createQrIntent({
      amount: 100000,
      currency: 'LAK',
      ttlMinutes: 15,
      reference: 'REF123',
    });
    expect(result.qrPayload).toContain('REF123');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('verifyWebhook ຂອງ MockBcelProvider ປະຕິເສດ signature ຜິດ', () => {
    const provider = getBankProvider('MOCK_BCEL')!;
    const body = JSON.stringify({ eventId: 'e1', reference: 'REF123', status: 'SUCCESS' });
    const result = provider.verifyWebhook(body, 'wrong-signature', 'secret');
    expect(result.ok).toBe(false);
  });

  it('ManualTransferProvider ບໍ່ມີ webhook ຈິງ — verifyWebhook ຄືນ false ສະເໝີ', () => {
    const provider = getBankProvider('MANUAL_TRANSFER')!;
    const result = provider.verifyWebhook('{}', undefined, 'secret');
    expect(result.ok).toBe(false);
  });

  it('ManualTransferProvider ຝັງເລກບັນຊີ/ຊື່ບັນຊີໃນ QR payload', async () => {
    const provider = getBankProvider('MANUAL_TRANSFER')!;
    const result = await provider.createQrIntent({
      amount: 50000,
      currency: 'LAK',
      ttlMinutes: 30,
      reference: 'REF456',
      bankAccountNumber: '010120001234567',
      bankAccountName: 'Aura Beauty and Clinic',
    });
    const parsed = JSON.parse(result.qrPayload);
    expect(parsed.accountNumber).toBe('010120001234567');
    expect(parsed.accountName).toBe('Aura Beauty and Clinic');
  });
});
