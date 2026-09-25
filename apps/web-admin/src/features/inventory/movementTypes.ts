import {
  ArrowDownToLine,
  ArrowUpFromLine,
  type LucideIcon,
  MinusCircle,
  PackagePlus,
  PlusCircle,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Undo2,
} from 'lucide-react';
import type { StockMovementTypeValue, StockMovementView } from '@abcp/shared-types';

import type { BadgeProps } from '@/components/ui/badge';

import type { InventoryStatTone } from './inventoryStatTone';

export const MOVEMENT_TYPES: StockMovementTypeValue[] = [
  'PURCHASE_IN',
  'SERVICE_CONSUMED',
  'ADJUSTMENT_ADD',
  'ADJUSTMENT_DEDUCT',
  'RETURN_TO_SUPPLIER',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'SOLD',
  'SALE_RETURN',
];

export const MOVEMENT_TYPE_VARIANT: Record<StockMovementTypeValue, NonNullable<BadgeProps['variant']>> = {
  PURCHASE_IN: 'success',
  SERVICE_CONSUMED: 'neutral',
  ADJUSTMENT_ADD: 'primary',
  ADJUSTMENT_DEDUCT: 'warning',
  RETURN_TO_SUPPLIER: 'warning',
  TRANSFER_IN: 'success',
  TRANSFER_OUT: 'warning',
  SOLD: 'info',
  SALE_RETURN: 'primary',
};

export const MOVEMENT_TYPE_TONE: Record<StockMovementTypeValue, InventoryStatTone> = {
  PURCHASE_IN: 'success',
  SERVICE_CONSUMED: 'neutral',
  ADJUSTMENT_ADD: 'primary',
  ADJUSTMENT_DEDUCT: 'warning',
  RETURN_TO_SUPPLIER: 'warning',
  TRANSFER_IN: 'success',
  TRANSFER_OUT: 'warning',
  SOLD: 'neutral',
  SALE_RETURN: 'primary',
};

export const MOVEMENT_TYPE_ICON: Record<StockMovementTypeValue, LucideIcon> = {
  PURCHASE_IN: PackagePlus,
  SERVICE_CONSUMED: Sparkles,
  ADJUSTMENT_ADD: PlusCircle,
  ADJUSTMENT_DEDUCT: MinusCircle,
  RETURN_TO_SUPPLIER: Undo2,
  TRANSFER_IN: ArrowDownToLine,
  TRANSFER_OUT: ArrowUpFromLine,
  SOLD: ShoppingBag,
  SALE_RETURN: RotateCcw,
};

/** Movements that decrease the branch's stock — negative sign + warning/destructive tone. */
const OUTBOUND_MOVEMENT_TYPES = new Set<StockMovementTypeValue>([
  'SERVICE_CONSUMED',
  'ADJUSTMENT_DEDUCT',
  'RETURN_TO_SUPPLIER',
  'TRANSFER_OUT',
  'SOLD',
]);

export function isOutboundMovement(type: StockMovementTypeValue): boolean {
  return OUTBOUND_MOVEMENT_TYPES.has(type);
}

/**
 * `qty` is persisted as a positive magnitude — direction is implied by `type`.
 * `Math.abs` guards against any legacy/seed rows that stored a signed value.
 */
export function signedQty(m: Pick<StockMovementView, 'type' | 'qty'>): number {
  return isOutboundMovement(m.type) ? -Math.abs(m.qty) : Math.abs(m.qty);
}

/** `refId` encodes `<kind>:<id>` — decode it into a short localized label + the raw id. */
export function decodeRefId(
  refId: string | null,
): { kind: 'appt' | 'po' | 'grn' | 'rts' | 'transfer' | 'count' | 'sale' | 'saleret' | 'other'; id: string } | null {
  if (!refId) return null;
  const [prefix, ...rest] = refId.split(':');
  const id = rest.join(':');
  if (!id) return { kind: 'other', id: refId };
  if (prefix === 'appt') return { kind: 'appt', id };
  if (prefix === 'po') return { kind: 'po', id };
  if (prefix === 'grn') return { kind: 'grn', id };
  if (prefix === 'rts') return { kind: 'rts', id };
  if (prefix === 'transfer') return { kind: 'transfer', id };
  if (prefix === 'count') return { kind: 'count', id };
  if (prefix === 'sale') return { kind: 'sale', id };
  if (prefix === 'saleret') return { kind: 'saleret', id };
  return { kind: 'other', id: refId };
}
