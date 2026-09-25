import { STOCK_ADJUST_REASONS, type StockAdjustInput, type StockAdjustReasonValue } from '@abcp/shared-types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FooterBar } from '../../../components/shared/FooterBar';
import { ErrorView, LoadingScreen } from '../../../components/shared/StateViews';
import { Button } from '../../../components/ui/Button';
import { Segmented } from '../../../components/ui/Segmented';
import {
  isForbidden,
  useAdjustStock,
  useInventoryAccess,
  useProduct,
} from '../../../features/inventory/inventory.api';
import {
  adjustNeedsNotes,
  formatQty,
  parseQty,
  validateAdjust,
  type AdjustFormError,
} from '../../../features/inventory/inventory.logic';
import { cn } from '../../../lib/cn';
import { haptics } from '../../../lib/haptics';
import { normalizeError } from '../../../services/apiError';
import type { StaffAppScreenProps } from '../../../navigation/types';
import { SectionHeading, SMALL, T } from '../staff-portal.parts';
import {
  ChoiceChips,
  ExpiryDateInput,
  LockedBlock,
  Notice,
  QtyInput,
  SmallField,
  StockHeader,
  qtyWithUnit,
  useScrolled,
} from './stock.parts';

/** ເຫດຜົນທີ່ໃຊ້ໄດ້ຕາມທິດທາງ (ເພີ່ມ: ຍອດເປີດ/ນັບເກີນ/ອື່ນ; ຫຼຸດ: ທີ່ເຫຼືອ). */
const ADD_REASONS: readonly StockAdjustReasonValue[] = ['COUNT_VARIANCE', 'OPENING_BALANCE', 'OTHER'];

/** M14 — ປັບສະຕັອກ (admin / ຜູ້ມີ inventory:manage): ± ຈຳນວນ + ເຫດຜົນ; 202 = ລໍອະນຸມັດ. */
export function StockAdjustScreen({ navigation, route }: StaffAppScreenProps<'StockAdjust'>): React.JSX.Element {
  const { t } = useTranslation();
  const { productId } = route.params;
  const access = useInventoryAccess();
  const { scrolled, onScroll } = useScrolled();
  const product = useProduct(productId);
  const adjust = useAdjustStock();

  const [direction, setDirection] = useState<'add' | 'deduct'>('deduct');
  const [qtyText, setQtyText] = useState('');
  const [reason, setReason] = useState<StockAdjustReasonValue | null>(null);
  const [notes, setNotes] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState<AdjustFormError>(null);

  if (product.isPending) return <LoadingScreen />;
  if (product.isError || !product.data) {
    return <ErrorView message={normalizeError(product.error).message} onRetry={() => void product.refetch()} />;
  }
  const p = product.data;

  const reasons = STOCK_ADJUST_REASONS.filter((r) =>
    direction === 'add' ? ADD_REASONS.includes(r) : r !== 'OPENING_BALANCE',
  );
  const qty = parseQty(qtyText);
  const after =
    qty != null && !Number.isNaN(qty) ? p.stockQty + (direction === 'add' ? qty : -qty) : null;

  const submit = (): void => {
    const e = validateAdjust({ direction, qtyText, reason, notes, trackLot: p.trackLot, lotNumber, expiry });
    setError(e);
    if (e) {
      haptics.error();
      return;
    }
    const n = qty as number;
    const body: StockAdjustInput = {
      productId: p.id,
      delta: direction === 'add' ? n : -n,
      reason: reason!,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(direction === 'add' && p.trackLot
        ? { lot: { lotNumber: lotNumber.trim(), expiryDate: expiry || null } }
        : {}),
    };
    adjust.mutate(body, {
      onSuccess: (res) => {
        haptics.success();
        const msg =
          res.outcome === 'PENDING_APPROVAL'
            ? t('stock.adjust.pendingBody')
            : t('stock.adjust.postedBody', { qty: qtyWithUnit(res.movement.balanceAfter, p.unit) });
        Alert.alert(
          res.outcome === 'PENDING_APPROVAL' ? t('stock.adjust.pendingTitle') : t('stock.adjust.postedTitle'),
          msg,
          [{ text: t('common.close'), onPress: () => navigation.goBack() }],
        );
      },
      onError: (err) => {
        haptics.error();
        Alert.alert('', isForbidden(err) ? t('stock.locked.hint') : normalizeError(err).message);
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StockHeader
        title={t('stock.adjust.title')}
        subtitle={`${p.name} · ${qtyWithUnit(p.stockQty, p.unit)}`}
        onBack={() => navigation.goBack()}
        scrolled={scrolled}
      />
      {!access.canManage ? (
        <View className="p-4">
          <LockedBlock />
        </View>
      ) : (
        <>
          <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 14, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={onScroll}
            >
              <Segmented
                value={direction}
                onChange={(v) => {
                  setDirection(v);
                  setReason(null);
                  setError(null);
                }}
                options={[
                  { value: 'deduct', label: t('stock.adjust.deduct') },
                  { value: 'add', label: t('stock.adjust.add') },
                ]}
              />

              <View className="gap-1.5">
                <SectionHeading label={t('stock.adjust.qty')} />
                <QtyInput
                  value={qtyText}
                  onChange={(v) => {
                    setQtyText(v);
                    if (error === 'qty') setError(null);
                  }}
                  unit={p.unit}
                  invalid={error === 'qty'}
                  accessibilityLabel={t('stock.adjust.qty')}
                />
                <T
                  className={cn('px-1 font-lao', after != null && after < 0 ? 'text-destructive' : 'text-muted-foreground')}
                  style={SMALL}
                >
                  {after != null
                    ? t('stock.adjust.after', { qty: `${formatQty(after)} ${p.unit}` })
                    : t('stock.adjust.qtyHint')}
                </T>
              </View>

              <View className="gap-1.5">
                <SectionHeading label={t('stock.adjust.reason')} />
                <ChoiceChips
                  items={reasons.map((r) => ({ key: r, label: t(`stock.reason.${r}`) }))}
                  value={reason}
                  onChange={(r) => {
                    setReason(r);
                    if (error === 'reason') setError(null);
                  }}
                />
                {error === 'reason' ? (
                  <T className="px-1 font-lao text-destructive" style={SMALL}>
                    {t('stock.adjust.reasonRequired')}
                  </T>
                ) : null}
              </View>

              {direction === 'add' && p.trackLot ? (
                <View className="flex-row gap-2">
                  <SmallField
                    label={t('stock.receive.lotNumber')}
                    value={lotNumber}
                    onChangeText={setLotNumber}
                    autoCapitalize="characters"
                    error={error === 'lot' ? t('stock.receive.lotRequired') : null}
                  />
                  <ExpiryDateInput label={t('stock.receive.expiry')} value={expiry} onChange={setExpiry} />
                </View>
              ) : null}
              {direction === 'deduct' && p.trackLot ? (
                <Notice tone="info">{t('stock.adjust.fefo')}</Notice>
              ) : null}

              <SmallField
                label={
                  adjustNeedsNotes(reason)
                    ? `${t('stock.adjust.notes')} (${t('common.required')})`
                    : `${t('stock.adjust.notes')} (${t('common.optional')})`
                }
                value={notes}
                onChangeText={(v) => {
                  setNotes(v);
                  if (error === 'notes') setError(null);
                }}
                multiline
                error={error === 'notes' ? t('stock.adjust.notesRequired') : null}
              />
              <Notice tone="warning" icon="shield-checkmark-outline">
                {t('stock.adjust.approvalNote')}
              </Notice>
            </ScrollView>
          </KeyboardAvoidingView>
          <FooterBar>
            <Button
              label={direction === 'add' ? t('stock.adjust.submitAdd') : t('stock.adjust.submitDeduct')}
              variant={direction === 'deduct' ? 'destructive' : 'primary'}
              size="sm"
              labelClassName="text-[12px]"
              loading={adjust.isPending}
              onPress={submit}
            />
          </FooterBar>
        </>
      )}
    </SafeAreaView>
  );
}
