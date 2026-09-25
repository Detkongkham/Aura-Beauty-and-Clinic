import type { StockMovementView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FooterBar } from '../../../components/shared/FooterBar';
import { ErrorView, LoadingScreen } from '../../../components/shared/StateViews';
import { AnimatedEntrance } from '../../../components/ui/AnimatedEntrance';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  isForbidden,
  useCreateAndStartCount,
  useInventoryAccess,
  useProduct,
  useProductMovements,
  useStockLots,
} from '../../../features/inventory/inventory.api';
import { formatQty } from '../../../features/inventory/inventory.logic';
import { cn } from '../../../lib/cn';
import { formatLAK, vientiane } from '../../../lib/format';
import { haptics } from '../../../lib/haptics';
import { normalizeError } from '../../../services/apiError';
import { colors, shadow } from '../../../theme';
import type { StaffAppScreenProps } from '../../../navigation/types';
import {
  EmptyBlock,
  HeroCard,
  IconTile,
  SectionHeading,
  SMALL,
  StatCell,
  StatRibbon,
  T,
  TINT,
} from '../staff-portal.parts';
import { ExpiryPill, LockedBlock, qtyWithUnit, StockHeader, useScrolled } from './stock.parts';

function MovementRow({ m, unit }: { m: StockMovementView; unit: string }): React.JSX.Element {
  const { t } = useTranslation();
  const inbound = m.qty > 0;
  return (
    <View className="flex-row items-center gap-2.5 px-3 py-2.5">
      <View
        className={cn(
          'h-7 w-7 items-center justify-center rounded-full',
          inbound ? 'bg-success-soft' : 'bg-destructive-soft',
        )}
      >
        <Ionicons
          name={inbound ? 'arrow-down' : 'arrow-up'}
          size={12}
          color={inbound ? colors.success : colors.destructive}
        />
      </View>
      <View className="min-w-0 flex-1">
        <T numberOfLines={1} className="font-lao-medium text-foreground">
          {t(`stock.movement.${m.type}`, { defaultValue: m.type })}
          {m.reasonCode ? ` · ${t(`stock.reason.${m.reasonCode}`)}` : ''}
        </T>
        <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
          {vientiane(m.createdAt).format('D MMM · HH:mm')}
          {m.lotNumber ? ` · ${m.lotNumber}` : ''}
          {m.createdByUserName ? ` · ${m.createdByUserName}` : ''}
        </T>
      </View>
      <View className="items-end">
        <T className={cn('font-sans-semibold', inbound ? 'text-success' : 'text-destructive')}>
          {inbound ? '+' : ''}
          {formatQty(m.qty)}
        </T>
        <T className="font-sans text-muted-foreground" style={SMALL}>
          = {qtyWithUnit(m.balanceAfter, unit)}
        </T>
      </View>
    </View>
  );
}

/** M14 — ລາຍລະອຽດສິນຄ້າ: ຍອດ (ມີ/ຈອງ/ພ້ອມໃຊ້/ກຳລັງສັ່ງ), lot + ວັນໝົດອາຍຸ, ການເໜັງຕີງລ່າສຸດ. */
export function StockProductScreen({ navigation, route }: StaffAppScreenProps<'StockProduct'>): React.JSX.Element {
  const { t } = useTranslation();
  const { id } = route.params;
  const access = useInventoryAccess();
  const { scrolled, onScroll } = useScrolled();
  const product = useProduct(id);
  const p = product.data;
  const lots = useStockLots({ productId: id }, !!p?.trackLot);
  const moves = useProductMovements(id);
  const startCount = useCreateAndStartCount();

  if (product.isPending) return <LoadingScreen />;
  if (product.isError || !p) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <StockHeader title={t('stock.product.title')} onBack={() => navigation.goBack()} scrolled={false} />
        <ErrorView message={normalizeError(product.error).message} onRetry={() => void product.refetch()} />
      </SafeAreaView>
    );
  }

  const status = p.outOfStock
    ? { label: t('stock.status.out'), tone: 'destructive' as const }
    : p.lowStock
      ? { label: t('stock.status.low'), tone: 'warning' as const }
      : { label: t('stock.status.ok'), tone: 'success' as const };

  const onCount = (): void => {
    if (!access.canManage) {
      navigation.navigate('StockCounts');
      return;
    }
    startCount.mutate(
      { branchId: p.branchId, type: 'SPOT', productIds: [p.id] },
      {
        onSuccess: (c) => {
          haptics.success();
          navigation.navigate('StockCount', { id: c.id });
        },
        onError: (err) => {
          haptics.error();
          Alert.alert('', isForbidden(err) ? t('stock.locked.hint') : normalizeError(err).message);
        },
      },
    );
  };

  const refresh = (): void => {
    void product.refetch();
    void moves.refetch();
    if (p.trackLot) void lots.refetch();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StockHeader
        title={p.name}
        subtitle={`${p.sku} · ${p.branchName}`}
        onBack={() => navigation.goBack()}
        scrolled={scrolled}
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 14, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        refreshControl={
          <RefreshControl refreshing={product.isRefetching} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        <AnimatedEntrance index={0}>
          <HeroCard>
            <View className="gap-3">
              <View className="flex-row items-start gap-3">
                <IconTile icon="cube-outline" tint={TINT.time} size={40} />
                <View className="flex-1 gap-1">
                  <T className="font-lao-semibold text-foreground" style={{ fontSize: 14, lineHeight: 19 }}>
                    {qtyWithUnit(p.stockQty, p.unit)}
                  </T>
                  <View className="flex-row flex-wrap gap-1.5">
                    <Badge dot label={status.label} tone={status.tone} />
                    {p.trackLot ? <Badge label={t('stock.product.lotTracked')} tone="info" /> : null}
                    {p.abcClass ? <Badge label={`ABC ${p.abcClass}`} tone="neutral" /> : null}
                  </View>
                </View>
              </View>
              {p.gtin || p.barcode ? (
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="barcode-outline" size={12} color={colors.mutedForeground} />
                  <T className="font-sans text-muted-foreground" style={SMALL}>
                    {[p.gtin, p.barcode].filter(Boolean).join(' · ')}
                  </T>
                </View>
              ) : null}
              {p.shortForUpcoming ? (
                <View className="flex-row items-center gap-1.5 rounded-xl bg-warning-soft px-2.5 py-1.5">
                  <Ionicons name="warning-outline" size={12} color={colors.warning} />
                  <T className="flex-1 font-lao text-foreground" style={SMALL}>
                    {t('stock.product.shortForUpcoming')}
                  </T>
                </View>
              ) : null}
            </View>
          </HeroCard>
        </AnimatedEntrance>

        <AnimatedEntrance index={1}>
          <StatRibbon>
            <StatCell value={formatQty(p.stockQty)} label={t('stock.product.onHand')} />
            <StatCell value={formatQty(p.reservedQty)} label={t('stock.product.reserved')} tone="accent" border />
            <StatCell
              value={formatQty(p.availableQty)}
              label={t('stock.product.available')}
              tone={p.availableQty < 0 ? 'destructive' : 'success'}
            />
            <StatCell value={formatQty(p.onOrderQty)} label={t('stock.product.onOrder')} tone="primary" border />
          </StatRibbon>
        </AnimatedEntrance>

        <View className="flex-row gap-2 px-1">
          <T className="flex-1 font-lao text-muted-foreground" style={SMALL}>
            {t('stock.product.reorderAt', { qty: qtyWithUnit(p.reorderThreshold, p.unit) })}
          </T>
          {access.canManage ? (
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {t('stock.product.wac', { cost: formatLAK(p.costPrice), value: formatLAK(p.stockValue) })}
            </T>
          ) : null}
        </View>

        {p.conversions.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5 px-1">
            {p.conversions.map((c) => (
              <Badge
                key={c.uomId}
                label={`1 ${c.nameLo ?? c.name} = ${formatQty(c.factorToBase)} ${p.unit}`}
                tone="neutral"
              />
            ))}
          </View>
        ) : null}

        {p.trackLot ? (
          <View className="gap-2">
            <SectionHeading label={t('stock.product.lots')} hint={t('stock.product.lotsHint')} />
            {lots.isPending ? (
              <Skeleton className="h-[56px] rounded-2xl" />
            ) : lots.isError ? (
              isForbidden(lots.error) ? (
                <LockedBlock />
              ) : (
                <EmptyBlock
                  icon="cloud-offline-outline"
                  title={normalizeError(lots.error).message}
                  actionLabel={t('common.retry')}
                  onAction={() => void lots.refetch()}
                />
              )
            ) : (lots.data?.items.length ?? 0) === 0 ? (
              <EmptyBlock icon="layers-outline" title={t('stock.product.noLots')} />
            ) : (
              <View className="rounded-2xl border border-border bg-card" style={shadow.xs}>
                {lots.data!.items.map((l, i) => (
                  <View
                    key={l.id}
                    className={cn('flex-row items-center gap-2.5 px-3 py-2.5', i > 0 && 'border-t border-border')}
                  >
                    <View className="min-w-0 flex-1">
                      <T numberOfLines={1} className="font-sans-semibold text-foreground">
                        {l.lotNumber}
                      </T>
                      <T className="font-sans text-muted-foreground" style={SMALL}>
                        {l.expiryDate ?? '—'}
                      </T>
                    </View>
                    <T className="font-sans-medium text-foreground">{qtyWithUnit(l.qtyOnHand, l.unit)}</T>
                    <ExpiryPill daysLeft={l.daysLeft} />
                  </View>
                ))}
                {p.unlottedQty > 0 ? (
                  <View className="border-t border-border px-3 py-2">
                    <T className="font-lao text-muted-foreground" style={SMALL}>
                      {t('stock.product.unlotted', { qty: qtyWithUnit(p.unlottedQty, p.unit) })}
                    </T>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        ) : null}

        <View className="gap-2">
          <SectionHeading label={t('stock.product.movements')} />
          {moves.isPending ? (
            <Skeleton className="h-[120px] rounded-2xl" />
          ) : moves.isError ? (
            isForbidden(moves.error) ? (
              <LockedBlock />
            ) : (
              <EmptyBlock
                icon="cloud-offline-outline"
                title={normalizeError(moves.error).message}
                actionLabel={t('common.retry')}
                onAction={() => void moves.refetch()}
              />
            )
          ) : (moves.data?.items.length ?? 0) === 0 ? (
            <EmptyBlock icon="swap-vertical-outline" title={t('stock.product.noMovements')} />
          ) : (
            <View className="rounded-2xl border border-border bg-card" style={shadow.xs}>
              {moves.data!.items.map((m, i) => (
                <View key={m.id} className={i > 0 ? 'border-t border-border' : undefined}>
                  <MovementRow m={m} unit={p.unit} />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <FooterBar>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              label={t('stock.product.count')}
              icon="clipboard-outline"
              size="sm"
              variant={access.canManage ? 'secondary' : 'primary'}
              labelClassName="text-[12px]"
              loading={startCount.isPending}
              onPress={onCount}
            />
          </View>
          {access.canManage ? (
            <View className="flex-1">
              <Button
                label={t('stock.product.adjust')}
                icon="swap-vertical-outline"
                size="sm"
                labelClassName="text-[12px]"
                onPress={() => navigation.navigate('StockAdjust', { productId: p.id })}
              />
            </View>
          ) : null}
        </View>
      </FooterBar>
    </SafeAreaView>
  );
}
