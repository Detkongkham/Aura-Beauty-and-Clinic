import { env } from '../config/env.js';
import { LocalDiskStorage } from './localDisk.js';

export interface StorageAdapter {
  /** ບັນທຶກ buffer, ຄືນ public URL. */
  save(key: string, data: Buffer, contentType?: string): Promise<{ url: string; key: string }>;
  /** ອ່ານໄຟລ໌ທີ່ບັນທຶກໄວ້ກັບຄືນເປັນ buffer (ໃຊ້ໂດຍ background job, ເຊັ່ນ OCR ສະລິບ). */
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** ລາຍການໄຟລ໌ພາຍໃຕ້ prefix (ເຊັ່ນ 'services/') — ໃຊ້ໂດຍ job ເກັບກວາດໄຟລ໌ກຳພ້າ. */
  list(prefix: string): Promise<{ key: string; modifiedAt: Date }[]>;
  url(key: string): string;
}

function createStorage(): StorageAdapter {
  switch (env.STORAGE_DRIVER) {
    case 'local':
    default:
      return new LocalDiskStorage(env.STORAGE_LOCAL_DIR, env.STORAGE_PUBLIC_URL);
  }
}

export const storage: StorageAdapter = createStorage();
