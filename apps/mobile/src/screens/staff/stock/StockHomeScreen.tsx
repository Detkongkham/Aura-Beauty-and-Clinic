import type { ProductView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedEntrance } from '../../../components/ui/AnimatedEntrance';
import { Gradient } from '../../../components/ui/Gradient';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Touchable } from '../../../components/ui/Touchable';
import {
  isForbidden,
  useInventoryStats,
  usePosToReceive,
  useProducts,
  useStockCounts,
  useStockLots,
} from '../../../features/inventory/inventory.api';
import { useDebounced } from '../../../hooks/useDebounced';
import { cn } from '../../../lib/cn';
import { normalizeError } from '../../../services/apiError';
import { colors, shadow } from '../../../theme';
import type { StaffAppScreenProps } from '../../../navigation/types';
import {
  ActionTile,
  EmptyBlock,
  IconTile,
  SectionHeading,
  SMALL,
  T,
  TINT,
  type IconName,
  type Tint,
} from '../staff-portal.parts';
import { qtyWithUnit, StockHeader, useScrolled } from './stock.parts';

/** ຊ່ອງສະຖິຕິ 2×2 — ແຕະໄປໜ້າທີ່ກ່ຽວຂ້ອງ; 403 = ໄອຄອນກະແຈ. */
function StatTile({
  icon,
  tint,
  label,
  value,
  locked,
  loading,
  onPress,
}: {
  icon: IconName;
  tint: Tint;
  label: string;
  value: number | undefined;
  locked?: boolean;
  loading?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      disabled={!onPress}
      pressScale={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${locked ? t('stock.locked.title') : (value ?? '')}`}
      className="min-h-[64px] flex-1 flex-row items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5"
      style={shadow.xs}
    >
      <IconTile icon={icon} tint={tint} size={32} />
      <View className="flex-1">
        {loading ? (
          <Skeleton className="h-4 w-8 rounded" />
        ) : locked ? (
          <Ionicons name="lock-closed-outline" size={14} color={colors.mutedForeground} />
        ) : (
          <T className="font-sans-semibold text-foreground" style={{ fontSize: 14, lineHeight: 19 }}>
            {value ?? '—'}
          </T>
        )}
        <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
          {label}
        </T>
      </View>
    </Touchable>
  );
}

export function ProductRow({ p, onPress }: { p: ProductView; onPress: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const tone = p.outOfStock ? 'text-destructive' : p.lowStock ? 'text-warning' : 'text-foreground';
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, ${qtyWithUnit(p.stockQty, p.unit)}`}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3"
      style={shadow.xs}
    >
      <IconTile icon="cube-outline" tint={p.outOfStock ? TINT.note : p.lowStock ? TINT.service : TINT.neutral} />
      <View className="min-w-0 flex-1 gap-0.5">
        <T numberOfLines={1} className="font-lao-semibold text-foreground">
          {p.name}
        </T>
        <T numberOfLines={1} className="font-sans text-muted-foreground" style={SMALL}>
          {p.sku}
          {p.categoryName ? ` · ${p.categoryName}` : ''}
        </T>
      </View>
      <View className="items-end">
        <T className={cn('font-sans-semibold', tone)}>{qtyWithUnit(p.stockQty, p.unit)}</T>
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {p.outOfStock ? t('stock.status.out') : p.lowStock ? t('stock.status.low') : t('stock.status.onHand')}
        </T>
      </View>
    </Touchable>
  );
}

/** M14 — ໜ້າຫຼັກສະຕັອກ: ສະຖິຕິສາຂາ + ຄົ້ນຫາ + ປຸ່ມສະແກນໃຫຍ່ + ທາງລັດນັບ/ຮັບເຄື່ອງ. */
export function StockHomeScreen({ navigation }: StaffAppScreenProps<'StockHome'>): React.JSX.Element {
  const { t } = useTranslation();
  const { scrolled, onScroll } = useScrolled();
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 300);

  const stats = useInventoryStats();
  const lots = useStockLots({ expiringWithinDays: 30 });
  const counting = useStockCounts('COUNTING');
  const pos = usePosToReceive();
  const list = useProducts(term ? { q: term } : { lowStock: true });

  const refreshing = stats.isRefetching || list.isRefetching;
  const refresh = (): void => {
    void stats.refetch();
    void lots.refetch();
    void counting.refetch();
    void pos.refetch();
    void list.refetch();
  };

  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StockHeader
        title={t('stock.home.title')}
        subtitle={t('stock.home.subtitle')}
        onBack={() => navigation.goBack()}
        scrolled={scrolled}
      >
        <View className="h-10 flex-row items-center gap-2 rounded-xl border border-input bg-card px-3">
          <Ionicons name="search" size={14} color={colors.mutedForeground} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t('stock.home.searchPlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={t('common.search')}
            className="flex-1 font-lao text-foreground"
            style={{ fontSize: 12, lineHeight: 17, paddingVertical: 0 }}
          />
          {q ? (
            <Touchable
              onPress={() => setQ('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear')}
            >
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </Touchable>
          ) : null}
        </View>
      </StockHeader>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 14, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={onScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        {!term ? (
          <>
            {/* ປຸ່ມສະແກນໃຫຍ່ */}
            <AnimatedEntrance index={0}>
              <View className="rounded-2xl" style={shadow.card}>
                <Touchable
                  onPress={() => navigation.navigate('StockScan')}
                  pressScale={0.98}
                  haptic="primary"
                  accessibilityRole="button"
                  accessibilityLabel={t('stock.home.scan')}
                  className="min-h-[72px] flex-row items-center gap-3 overflow-hidden rounded-2xl px-4 py-3.5"
                >
                  <Gradient preset="brand" fill pointerEvents="none" />
                  <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
                    <Ionicons name="barcode-outline" size={22} color="#FFFFFF" />
                  </View>
                  <View className="flex-1">
                    <T className="font-lao-semibold text-white" style={{ fontSize: 14, lineHeight: 19 }}>
                      {t('stock.home.scan')}
                    </T>
                    <T className="font-lao text-white/80" style={SMALL}>
                      {t('stock.home.scanHint')}
                    </T>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
                </Touchable>
              </View>
            </AnimatedEntrance>

            {/* ສະຖິຕິ */}
            <AnimatedEntrance index={1}>
              <View className="gap-2">
                <View className="flex-row gap-2">
                  <StatTile
                    icon="trending-down-outline"
                    tint={TINT.service}
                    label={t('stock.home.lowStock')}
                    value={stats.data ? stats.data.lowStockCount + stats.data.outOfStockCount : undefined}
                    loading={stats.isPending}
                    locked={stats.isError && isForbidden(stats.error)}
                  />
                  <StatTile
                    icon="hourglass-outline"
                    tint={TINT.note}
                    label={t('stock.home.expiring')}
                    value={lots.data?.total}
                    loading={lots.isPending}
                    locked={lots.isError && isForbidden(lots.error)}
                  />
                </View>
                <View className="flex-row gap-2">
                  <StatTile
                    icon="clipboard-outline"
                    tint={TINT.time}
                    label={t('stock.home.openCounts')}
                    value={counting.data?.total}
                    loading={counting.isPending}
                    locked={counting.isError && isForbidden(counting.error)}
                    onPress={() => navigation.navigate('StockCounts')}
                  />
                  <StatTile
                    icon="archive-outline"
                    tint={TINT.money}
                    label={t('stock.home.toReceive')}
                    value={pos.data?.length}
                    loading={pos.isPending}
                    locked={pos.isError && isForbidden(pos.error)}
                    onPress={() => navigation.navigate('StockReceiveList')}
                  />
                </View>
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance index={2}>
              <View className="flex-row gap-2">
                <ActionTile
                  icon="clipboard-outline"
                  tint={TINT.time}
                  label={t('stock.home.countAction')}
                  hint={t('stock.home.countActionHint')}
                  onPress={() => navigation.navigate('StockCounts')}
                />
                <ActionTile
                  icon="archive-outline"
                  tint={TINT.money}
                  label={t('stock.home.receiveAction')}
                  hint={t('stock.home.receiveActionHint')}
                  onPress={() => navigation.navigate('StockReceiveList')}
                />
              </View>
            </AnimatedEntrance>
          </>
        ) : null}

        <SectionHeading
          label={term ? t('stock.home.results') : t('stock.home.needsAttention')}
          hint={term ? undefined : t('stock.home.needsAttentionHint')}
          trailing={
            list.data ? (
              <T className="font-sans text-muted-foreground" style={SMALL}>
                {list.data.total}
              </T>
            ) : undefined
          }
        />
        {list.isPending ? (
          <>
            <Skeleton className="h-[64px] rounded-2xl" />
            <Skeleton className="h-[64px] rounded-2xl" />
          </>
        ) : list.isError ? (
          <EmptyBlock
            icon="cloud-offline-outline"
            title={normalizeError(list.error).message}
            actionLabel={t('common.retry')}
            onAction={() => void list.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyBlock
            icon={term ? 'search-outline' : 'checkmark-done-outline'}
            title={term ? t('stock.home.noResults') : t('stock.home.allGood')}
          />
        ) : (
          items.map((p, i) => (
            <AnimatedEntrance key={p.id} index={Math.min(i, 6)}>
              <ProductRow p={p} onPress={() => navigation.navigate('StockProduct', { id: p.id })} />
            </AnimatedEntrance>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
