import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isNotFound, useProductLookup } from '../../../features/inventory/inventory.api';
import { haptics } from '../../../lib/haptics';
import { normalizeError } from '../../../services/apiError';
import type { StaffAppScreenProps } from '../../../navigation/types';
import { StockScanner } from './StockScanner';

/** M14 — ສະແກນ → /products/lookup (GTIN → barcode → SKU) → ລາຍລະອຽດສິນຄ້າ. */
export function StockScanScreen({ navigation }: StaffAppScreenProps<'StockScan'>): React.JSX.Element {
  const { t } = useTranslation();
  const lookup = useProductLookup();
  const [error, setError] = useState<string | null>(null);

  const onCode = (code: string): void => {
    lookup.mutate(code, {
      onSuccess: (res) => {
        haptics.success();
        navigation.replace('StockProduct', { id: res.product.id });
      },
      onError: (err) => {
        haptics.error();
        setError(isNotFound(err) ? t('stock.scan.notFound', { code }) : normalizeError(err).message);
      },
    });
  };

  return (
    <StockScanner
      title={t('stock.scan.title')}
      onCode={onCode}
      onClose={() => navigation.goBack()}
      busy={lookup.isPending}
      error={error}
      onRetry={() => setError(null)}
    />
  );
}
