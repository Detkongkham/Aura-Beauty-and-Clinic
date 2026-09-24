import { useTranslation } from 'react-i18next';

import { DateField } from '@/components/shared/DateField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { LotDraft } from './lotDraft';

/** Lot number + expiry + manufacture date — shared by the product opening stock, stock adjust and PO receive flows. */
export function LotFields({
  value,
  onChange,
  idPrefix,
}: {
  value: LotDraft;
  onChange: (next: LotDraft) => void;
  idPrefix: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-lot`}>{t('inventory.lot.number')}</Label>
        <Input
          id={`${idPrefix}-lot`}
          className="h-9"
          value={value.lotNumber}
          onChange={(e) => onChange({ ...value, lotNumber: e.target.value })}
          placeholder={t('inventory.lot.numberHint')}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t('inventory.lot.expiry')}</Label>
        <DateField
          className="w-full"
          value={value.expiryDate}
          onChange={(v) => onChange({ ...value, expiryDate: v })}
          onClear={() => onChange({ ...value, expiryDate: '' })}
          clearLabel={t('inventory.lot.clear')}
          aria-label={t('inventory.lot.expiry')}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t('inventory.lot.mfg')}</Label>
        <DateField
          className="w-full"
          value={value.mfgDate}
          onChange={(v) => onChange({ ...value, mfgDate: v })}
          onClear={() => onChange({ ...value, mfgDate: '' })}
          clearLabel={t('inventory.lot.clear')}
          aria-label={t('inventory.lot.mfg')}
        />
      </div>
    </div>
  );
}
