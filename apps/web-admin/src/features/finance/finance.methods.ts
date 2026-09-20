import {
  CreditCard,
  Gift,
  Landmark,
  PiggyBank,
  QrCode,
  Star,
  type LucideIcon,
} from 'lucide-react';
import type { PaymentMethod } from '@abcp/shared-types';

export const METHOD_ICON: Record<PaymentMethod, LucideIcon> = {
  CASH: Landmark,
  BCEL_ONE_QR: QrCode,
  CREDIT_CARD: CreditCard,
  GIFT_CARD: Gift,
  LOYALTY_POINTS: Star,
  PACKAGE_CREDIT: PiggyBank,
};

/** Fixed method → chart-token color so a method keeps the same hue everywhere. */
export const METHOD_COLOR: Record<PaymentMethod, { bar: string; to: string; text: string; hsl: string }> = {
  CASH: {
    bar: 'bg-[hsl(var(--chart-1))]',
    to: 'to-[hsl(var(--chart-1))]',
    text: 'text-[hsl(var(--chart-1))]',
    hsl: 'hsl(var(--chart-1))',
  },
  BCEL_ONE_QR: {
    bar: 'bg-[hsl(var(--chart-2))]',
    to: 'to-[hsl(var(--chart-2))]',
    text: 'text-[hsl(var(--chart-2))]',
    hsl: 'hsl(var(--chart-2))',
  },
  CREDIT_CARD: {
    bar: 'bg-[hsl(var(--chart-3))]',
    to: 'to-[hsl(var(--chart-3))]',
    text: 'text-[hsl(var(--chart-3))]',
    hsl: 'hsl(var(--chart-3))',
  },
  GIFT_CARD: {
    bar: 'bg-[hsl(var(--chart-4))]',
    to: 'to-[hsl(var(--chart-4))]',
    text: 'text-[hsl(var(--chart-4))]',
    hsl: 'hsl(var(--chart-4))',
  },
  LOYALTY_POINTS: {
    bar: 'bg-[hsl(var(--chart-5))]',
    to: 'to-[hsl(var(--chart-5))]',
    text: 'text-[hsl(var(--chart-5))]',
    hsl: 'hsl(var(--chart-5))',
  },
  PACKAGE_CREDIT: {
    bar: 'bg-[hsl(var(--chart-6))]',
    to: 'to-[hsl(var(--chart-6))]',
    text: 'text-[hsl(var(--chart-6))]',
    hsl: 'hsl(var(--chart-6))',
  },
};
