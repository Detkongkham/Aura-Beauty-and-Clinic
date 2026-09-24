/**
 * Typed, validated runtime config. ອ່ານຈາກ EXPO_PUBLIC_* env ກ່ອນ, ຕົກມາ app.json `extra`.
 * ຫ້າມອ່ານ process.env / Constants ດິບໆໃນ feature — import ຈາກທີ່ນີ້ເທົ່ານັ້ນ.
 */
import Constants from 'expo-constants';
import { z } from 'zod';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

const schema = z.object({
  apiBaseUrl: z.string().url(),
  mapTileUrl: z.string().includes('{z}'),
});

const parsed = schema.safeParse({
  apiBaseUrl:
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    extra.apiBaseUrl ??
    'http://localhost:4000/api/v1',
  // tile.openstreetmap.org ໃຊ້ໄດ້ສະເພາະ dev — production ຕ້ອງຊີ້ໄປ tile provider/self-host (OSM tile usage policy).
  mapTileUrl:
    process.env.EXPO_PUBLIC_MAP_TILE_URL ??
    extra.mapTileUrl ??
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
});

if (!parsed.success) {
  console.error('Invalid mobile env', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration for @abcp/mobile');
}

export const env = {
  apiBaseUrl: parsed.data.apiBaseUrl,
  mapTileUrl: parsed.data.mapTileUrl,
} as const;

/** ສາຂາ default (Phase 3 = 1 ສາຂາ, ຈາກ seed). BranchSwitcher = Phase 5. */
export const DEFAULT_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
/** ຊື່ + ທີ່ຢູ່ສາຂາ default — ຈາກ seed (`Aura ສາຂາ ນະຄອນຫຼວງວຽງຈັນ`). ໃຊ້ຈົນກວ່າຈະມີ branches API. */
export const DEFAULT_BRANCH_NAME = 'Aura ສາຂາ ນະຄອນຫຼວງວຽງຈັນ';
export const DEFAULT_BRANCH_ADDRESS = 'ຖະໜົນລ້ານຊ້າງ, ວຽງຈັນ';
/** ເບີໂທຄລີນິກ (concierge) — ໃຊ້ໃນ auth help / ລືມລະຫັດຜ່ານ / ໜ້ານັດໝາຍ. */
export const CLINIC_PHONE = '021 223 889';
