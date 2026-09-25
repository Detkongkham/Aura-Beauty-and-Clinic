import type { ProductUomConversionView, PurchaseOrderItemView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FooterBar } from '../../../components/shared/FooterBar';
import { ErrorView, LoadingScreen } from '../../../components/shared/StateViews';
import { AnimatedEntrance } from '../../../components/ui/AnimatedEntrance';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Touchable } from '../../../components/ui/Touchable';
import {
  isForbidden,
  useInventoryAccess,
  useProductsByIds,
  usePurchaseOrder,
  useReceiveGoods,
} from '../../../features/inventory/inventory.api';
import {
  buildReceiptLines,
  formatQty,
  initialReceiveDraft,
  receiveFactor,
  validateReceiveLine,
  type ReceiveDraft,
  type ReceiveLineError,
} from '../../../features/inventory/inventory.logic';
import { haptics } from '../../../lib/haptics';
import { normalizeError } from '../../../services/apiError';
import { colors, shadow } from '../../../theme';
import type { StaffAppScreenProps } from '../../../navigation/types';
import { EmptyBlock, SectionHeading, SMALL, T } from '../staff-portal.parts';
import {
  ChoiceChips,
  ExpiryDateInput,
  LockedBlock,
  Notice,
  QtyInput,
  SmallField,
  StockHeader,
  useScrolled,
} from './stock.parts';

const ORDERED = '__ordered__';
const BASE = '__base__';

function ReceiveLineCard({
  item,
  draft,
  conversions,
  error,
  onChange,
}: {
  item: PurchaseOrderItemView;
  draft: ReceiveDraft;
  conversions: readonly ProductUomConversionView[];
  error: ReceiveLineError;
  onChange: (patch: Partial<ReceiveDraft>) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [showReject, setShowReject] = useState(!!draft.rejected);
  const factor = receiveFactor(item, draft.uomId, conversions);
  const unitLabel =
    draft.uomId === undefined
      ? (item.uomCode ?? item.unit)
      : draft.uomId === null
        ? item.unit
        : (conversions.find((c) => c.uomId === draft.uomId)?.code ?? item.unit);

  // ໜ່ວຍ: ໜ່ວຍທີ່ສັ່ງ (ຄ່າເລີ່ມຕົ້ນ) / ໜ່ວຍພື້ນຖານ / ອັດຕາແປງອື່ນຂອງສິນຄ້າ
  const uomChoices = [
    { key: ORDERED, label: `${item.uomCode ?? item.unit} · ${t('stock.receive.orderedUnit')}` },
    ...(item.uomId ? [{ key: BASE, label: item.unit }] : []),
    ...conversions
      .filter((c) => c.uomId !== item.uomId)
      .map((c) => ({ key: c.uomId, label: `${c.nameLo ?? c.name} (×${formatQty(c.factorToBase)})` })),
  ];
  const uomKey = draft.uomId === undefined ? ORDERED : draft.uomId === null ? BASE : draft.uomId;

  return (
    <View className="gap-2.5 rounded-2xl border border-border bg-card p-3" style={shadow.xs}>
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1">
          <T numberOfLines={2} className="font-lao-semibold text-foreground">
            {item.productName}
          </T>
          <T className="font-sans text-muted-foreground" style={SMALL}>
            {item.sku}
          </T>
        </View>
        {item.trackLot ? <Badge label={t('stock.product.lotTracked')} tone="info" /> : null}
      </View>
      <T className="font-lao text-muted-foreground" style={SMALL}>
        {t('stock.receive.outstanding', {
          qty: `${formatQty(item.qtyOutstanding / (item.factorToBase || 1))} ${item.uomCode ?? item.unit}`,
          received: `${formatQty(item.qtyReceived)} ${item.unit}`,
        })}
      </T>

      {uomChoices.length > 1 ? (
        <ChoiceChips
          items={uomChoices}
          value={uomKey}
          onChange={(k) => onChange({ uomId: k === ORDERED ? undefined : k === BASE ? null : k })}
        />
      ) : null}

      <View className="gap-1">
        <T className="font-lao-medium text-muted-foreground" style={SMALL}>
          {t('stock.receive.received')}
        </T>
        <QtyInput
          value={draft.received}
          onChange={(v) => onChange({ received: v })}
          unit={unitLabel}
          invalid={error === 'qty'}
          accessibilityLabel={t('stock.receive.receivedFor', { name: item.productName })}
        />
        {factor !== 1 ? (
          <T className="font-lao text-muted-foreground" style={SMALL}>
            {t('stock.receive.inBase', {
              qty: `${formatQty((Number(draft.received.replace(',', '.')) || 0) * factor)} ${item.unit}`,
            })}
          </T>
        ) : null}
      </View>

      {item.trackLot ? (
        <View className="flex-row gap-2">
          <SmallField
            label={t('stock.receive.lotNumber')}
            value={draft.lotNumber}
            onChangeText={(v) => onChange({ lotNumber: v })}
            autoCapitalize="characters"
            error={error === 'lot' ? t('stock.receive.lotRequired') : null}
          />
          <ExpiryDateInput
            label={t('stock.receive.expiry')}
            value={draft.expiryDate}
            onChange={(v) => onChange({ expiryDate: v })}
          />
        </View>
      ) : null}

      {showReject ? (
        <View className="gap-2 rounded-xl bg-muted/60 p-2">
          <T className="font-lao-medium text-muted-foreground" style={SMALL}>
            {t('stock.receive.rejected')}
          </T>
          <QtyInput
            value={draft.rejected}
            onChange={(v) => onChange({ rejected: v })}
            unit={unitLabel}
            accessibilityLabel={t('stock.receive.rejected')}
          />
          <SmallField
            label={t('stock.receive.rejectReason')}
            value={draft.rejectReason}
            onChangeText={(v) => onChange({ rejectReason: v })}
            error={error === 'rejectReason' ? t('stock.receive.rejectReasonRequired') : null}
          />
        </View>
      ) : (
        <Touchable
          onPress={() => setShowReject(true)}
          accessibilityRole="button"
          accessibilityLabel={t('stock.receive.addRejected')}
          className="flex-row items-center gap-1.5 self-start py-1"
        >
          <Ionicons name="alert-circle-outline" size={13} color={colors.destructive} />
          <T className="font-lao text-destructive" style={SMALL}>
            {t('stock.receive.addRejected')}
          </T>
        </Touchable>
      )}
      {error === 'qty' || error === 'expiry' ? (
        <T className="font-lao text-destructive" style={SMALL}>
          {error === 'qty' ? t('stock.qty.invalid') : t('stock.date.invalid')}
        </T>
      ) : null}
    </View>
  );
}

/** M14 — ຮັບສິນຄ້າເຂົ້າສາງຈາກ PO (GRN): ຈຳນວນຮັບ/ປະຕິເສດ, ໜ່ວຍ, lot + ວັນໝົດອາຍຸ. */
export function StockReceiveScreen({ navigation, route }: StaffAppScreenProps<'StockReceive'>): React.JSX.Element {
  const { t } = useTranslation();
  const { poId } = route.params;
  const access = useInventoryAccess();
  const { scrolled, onScroll } = useScrolled();
  const po = usePurchaseOrder(poId);
  const receive = useReceiveGoods(poId);
  const items = useMemo(
    () => (po.data?.items ?? []).filter((i) => i.qtyOutstanding > 0),
    [po.data],
  );
  const products = useProductsByIds(items.map((i) => i.productId));
  const [drafts, setDrafts] = useState<Record<string, ReceiveDraft>>({});
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, ReceiveLineError>>({});

  useEffect(() => {
    setDrafts((cur) => {
      const next = { ...cur };
      for (const i of items) if (!next[i.id]) next[i.id] = initialReceiveDraft(i);
      return next;
    });
  }, [items]);

  if (po.isPending) return <LoadingScreen />;
  if (po.isError || !po.data) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <StockHeader title={t('stock.receive.title')} onBack={() => navigation.goBack()} scrolled={false} />
        {isForbidden(po.error) ? (
          <View className="p-4">
            <LockedBlock />
          </View>
        ) : (
          <ErrorView message={normalizeError(po.error).message} onRetry={() => void po.refetch()} />
        )}
      </SafeAreaView>
    );
  }
  const order = po.data;

  const conversionsFor = (productId: string): ProductUomConversionView[] =>
    products.find((q) => q.data?.id === productId)?.data?.conversions ?? [];

  const submit = (): void => {
    const nextErrors: Record<string, ReceiveLineError> = {};
    for (const i of items) {
      const d = drafts[i.id];
      if (!d) continue;
      const e = validateReceiveLine(i, d);
      if (e) nextErrors[i.id] = e;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      haptics.error();
      return;
    }
    const lines = buildReceiptLines(items, drafts);
    if (lines.length === 0) {
      Alert.alert('', t('stock.receive.nothing'));
      return;
    }
    receive.mutate(
      { lines, supplierDeliveryNote: note.trim() || null },
      {
        onSuccess: (res) => {
          haptics.success();
          Alert.alert(t('stock.receive.doneTitle'), t('stock.receive.doneBody', { grn: res.receipt.grnNumber }), [
            { text: t('common.close'), onPress: () => navigation.goBack() },
          ]);
        },
        onError: (err) => {
          haptics.error();
          Alert.alert('', isForbidden(err) ? t('stock.receive.lockedHint') : normalizeError(err).message);
        },
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StockHeader
        title={order.poNumber}
        subtitle={`${order.supplierName} · ${order.branchName}`}
        onBack={() => navigation.goBack()}
        scrolled={scrolled}
      />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 12, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={onScroll}
          refreshControl={
            <RefreshControl refreshing={po.isRefetching} onRefresh={() => void po.refetch()} tintColor={colors.primary} />
          }
        >
          {!access.canManage ? <Notice tone="warning">{t('stock.receive.lockedHint')}</Notice> : null}
          <SmallField
            label={t('stock.receive.deliveryNote')}
            value={note}
            onChangeText={setNote}
            placeholder={t('common.optional')}
          />
          <SectionHeading
            label={t('stock.receive.lines')}
            hint={t('stock.receive.linesHint')}
          />
          {items.length === 0 ? (
            <EmptyBlock icon="checkmark-done-outline" title={t('stock.receive.allReceived')} />
          ) : (
            items.map((item, i) => {
              const d = drafts[item.id];
              if (!d) return null;
              return (
                <AnimatedEntrance key={item.id} index={Math.min(i, 6)}>
                  <ReceiveLineCard
                    item={item}
                    draft={d}
                    conversions={conversionsFor(item.productId)}
                    error={errors[item.id] ?? null}
                    onChange={(patch) => {
                      setErrors((cur) => ({ ...cur, [item.id]: null }));
                      setDrafts((cur) => ({ ...cur, [item.id]: { ...cur[item.id]!, ...patch } }));
                    }}
                  />
                </AnimatedEntrance>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {items.length > 0 ? (
        <FooterBar>
          <Button
            label={t('stock.receive.submit')}
            icon="checkmark-done-outline"
            size="sm"
            labelClassName="text-[12px]"
            loading={receive.isPending}
            onPress={submit}
          />
        </FooterBar>
      ) : null}
    </SafeAreaView>
  );
}
