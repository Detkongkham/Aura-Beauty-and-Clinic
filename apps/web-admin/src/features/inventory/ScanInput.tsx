import { forwardRef, useState, type KeyboardEvent } from 'react';
import { Loader2, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { lookupProductByCode, type ProductLookupResult } from './inventory.api';

/**
 * M2 (inventory 9C) — ຊ່ອງສະແກນ/ພິມລະຫັດ. ເຄື່ອງສະແກນ USB ເຮັດວຽກຄືແປ້ນພິມທີ່ຈົບດ້ວຍ Enter → ຄົ້ນ
 * GET /products/lookup (GTIN → barcode → SKU) ແລ້ວສົ່ງສິນຄ້າໃຫ້ `onFound`. ລ້າງຊ່ອງຫຼັງພົບ ເພື່ອສະແກນຕໍ່ໄດ້ທັນທີ.
 * `accept` ກັ່ນຜົນ (ເຊັ່ນ ຕ້ອງເປັນສິນຄ້າໃນ PO/ໃບນັບ) — ຄືນ string = ຂໍ້ຄວາມແຈ້ງເຕືອນ.
 */
export const ScanInput = forwardRef<
  HTMLInputElement,
  {
    branchId?: string;
    onFound: (r: ProductLookupResult) => void;
    accept?: (r: ProductLookupResult) => true | string;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
  }
>(function ScanInput({ branchId, onFound, accept, placeholder, className, autoFocus }, ref) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const r = await lookupProductByCode(value, branchId);
      if (!r) {
        toast.error(t('inventory.scan.notFound', { code: value }));
        return;
      }
      const ok = accept ? accept(r) : true;
      if (ok !== true) {
        toast.error(ok);
        return;
      }
      setCode('');
      onFound(r);
    } catch (err) {
      toast.error(err instanceof NormalizedApiError ? err.message : t('inventory.scan.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('relative', className)}>
      {busy ? (
        <Loader2
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      ) : (
        <ScanLine
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      )}
      <Input
        ref={ref}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => void onKeyDown(e)}
        placeholder={placeholder ?? t('inventory.scan.placeholder')}
        aria-label={t('inventory.scan.label')}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        className="h-9 pl-8 font-mono text-sm tabular-nums"
      />
    </div>
  );
});
