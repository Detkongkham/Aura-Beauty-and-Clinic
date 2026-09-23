import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

/**
 * ຣັນ callback ໃນ Serializable transaction, ລອງໃໝ່ເມື່ອຊົນກັນ (write conflict / deadlock —
 * Prisma `P2034`, Postgres 40001/40P01). ທຸລະກຳພ້ອມກັນ = ຄວາມຈິງ production, ບໍ່ແມ່ນ error ຂອງຜູ້ໃຊ້;
 * ບໍ່ດັ່ງນັ້ນຜູ້ໃຊ້ໄດ້ 500. callback ຕ້ອງບໍ່ມີ side effect ນອກ transaction (ຖືກຣັນຊ້ຳໄດ້).
 */
export async function runSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, maxAttempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if ((code === 'P2034' || code === '40001' || code === '40P01') && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 15 * attempt + Math.floor(Math.random() * 20)));
        continue;
      }
      throw err;
    }
  }
}
