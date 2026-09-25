import { vientianeDateKey } from '../../utils/dateHelpers.js';

/** `YYYY-MM-DD` ຂອງວັນຕາມເວລາວຽງຈັນ. */
export function dateOnlyVientiane(at: Date): string {
  return vientianeDateKey(at).toISOString().slice(0, 10);
}
