import type {
  ExpenseStatus,
  PaymentSlipView,
  ReconciliationStatus,
  SlipMismatchField,
  SlipVerdict,
} from '@abcp/shared-types';

import type { BadgeProps } from '@/components/ui/badge';
import { dayjs } from '@/lib/format';
import { APP_TIMEZONE } from '@/lib/constants';

type Variant = NonNullable<BadgeProps['variant']>;

/** Max bytes we send as base64 — the API body parser caps at 2MB, base64 inflates by ~1.33x. */
const MAX_UPLOAD_BYTES = 1_400_000;

export class FileTooLargeError extends Error {}

/**
 * Reads an image as raw base64 (no `data:` prefix), downscaling to fit `maxDimension` and re-encoding
 * as JPEG so phone photos fit under the API body limit. PDFs are passed through untouched (size-checked).
 */
export function fileToBase64(
  file: File,
  opts: { maxDimension?: number; quality?: number } = {},
): Promise<{ contentType: 'image/jpeg' | 'application/pdf'; dataBase64: string }> {
  const { maxDimension = 1600, quality = 0.85 } = opts;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => {
      const url = String(reader.result);
      if (file.type === 'application/pdf') {
        const b64 = url.split(',')[1] ?? '';
        if (b64.length > MAX_UPLOAD_BYTES) return reject(new FileTooLargeError());
        return resolve({ contentType: 'application/pdf', dataBase64: b64 });
      }
      const img = new Image();
      img.onerror = () => reject(new Error('decode-failed'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas-unsupported'));
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
        if (b64.length > MAX_UPLOAD_BYTES) return reject(new FileTooLargeError());
        resolve({ contentType: 'image/jpeg', dataBase64: b64 });
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  });
}

/** YYYY-MM-DD of today in Vientiane. */
export function todayKey(): string {
  return dayjs().tz(APP_TIMEZONE).format('YYYY-MM-DD');
}

export function shiftDays(key: string, days: number): string {
  return dayjs(key, 'YYYY-MM-DD').add(days, 'day').format('YYYY-MM-DD');
}

export function monthStartKey(key = todayKey()): string {
  return `${key.slice(0, 7)}-01`;
}

/** Trailing digits only — account numbers are shown masked in dense lists. */
export function maskAccount(n: string): string {
  return n.length <= 4 ? n : `${'•'.repeat(Math.min(n.length - 4, 6))}${n.slice(-4)}`;
}

// ── Slips ────────────────────────────────────────────────────────────
export const SLIP_VERDICT_VARIANT: Record<SlipVerdict, Variant> = {
  PENDING: 'neutral',
  NEEDS_REVIEW: 'warning',
  AUTO_MATCHED: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  DUPLICATE: 'danger',
  REVERSED: 'danger',
};

/** Verdicts a reviewer can act on (mirrors the backend's REVIEWABLE_VERDICTS). */
export const REVIEWABLE: SlipVerdict[] = ['AUTO_MATCHED', 'NEEDS_REVIEW'];
export const OPEN_VERDICTS: SlipVerdict[] = ['PENDING', 'AUTO_MATCHED', 'NEEDS_REVIEW'];

export function isReviewable(s: Pick<PaymentSlipView, 'verdict'>): boolean {
  return REVIEWABLE.includes(s.verdict);
}

export const MISMATCH_FIELDS: SlipMismatchField[] = [
  'amount',
  'currency',
  'receiverAccount',
  'transferredAt',
  'txnRef',
];

/** Expected amount a slip should carry: what the customer declared, else the bill's open balance. */
export function expectedAmount(s: PaymentSlipView): number {
  return s.declaredAmount ?? s.payment.balanceAmount;
}

// ── Expenses ─────────────────────────────────────────────────────────
export const EXPENSE_STATUS_VARIANT: Record<ExpenseStatus, Variant> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  APPROVED: 'info',
  REJECTED: 'danger',
  PAID: 'success',
  VOIDED: 'neutral',
};

/** Chart hue per category index — cycles through the five chart tokens. */
export function chartColor(i: number): string {
  return `hsl(var(--chart-${(i % 6) + 1}))`;
}

// ── Reconciliation ───────────────────────────────────────────────────
export const RECON_STATUS_VARIANT: Record<ReconciliationStatus, Variant> = {
  MATCHED: 'success',
  VARIANCE: 'danger',
  RESOLVED: 'info',
  UNRECONCILED: 'warning',
};
