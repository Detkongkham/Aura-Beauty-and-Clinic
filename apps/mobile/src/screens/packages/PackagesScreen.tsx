import type { PackageView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { ErrorView } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { Touchable } from '../../components/ui/Touchable';
import { DEFAULT_BRANCH_ID } from '../../config/env';
import { Notice, SectionHeader, SMALL, T } from '../../features/booking/booking-kit';
import { useMyPackages, usePackages } from '../../features/packages/packages.api';
import {
  EmptyBlock,
  PackageCard,
  PackageCardSkeleton,
  WalletEntry,
} from '../../features/packages/packages.parts';
import type { AppScreenProps } from '../../navigation/types';
import { colors } from '../../theme';

type Sort = 'value' | 'price' | 'sessions';

const SORTERS: Record<Sort, (a: PackageView, b: PackageView) => number> = {
  value: (a, b) => b.savingsPct - a.savingsPct || a.totalPrice - b.totalPrice,
  price: (a, b) => a.totalPrice - b.totalPrice,
  sessions: (a, b) => b.totalSessions - a.totalSessions || a.perSessionPrice - b.perSessionPrice,
};

/**
 * ໜ້າຮ້ານແພັກເກັດ — ທັງໝົດ ຫຼື ສະເພາະທີ່ມີບໍລິການ (route.serviceId).
 *
 * ລຳດັບຂອງໜ້າ: ກະເປົ໋າສິດຂອງຂ້ອຍ (ສິ່ງທີ່ຊື້ແລ້ວ) → ບິນຄ້າງຈ່າຍ (ຖ້າມີ) → ຕົວຈັດລຳດັບ
 * → ບັດແພັກເກັດ. ບັດທີ່ປະຢັດສູງສຸດໄດ້ປ້າຍ "ຄຸ້ມທີ່ສຸດ" ເພື່ອຊ່ວຍຕັດສິນໃຈໄວ.
 */
export function PackagesScreen({ navigation, route }: AppScreenProps<'Packages'>): React.JSX.Element {
  const { t } = useTranslation();
  const [serviceId, setServiceId] = useState(route.params?.serviceId);
  const [sort, setSort] = useState<Sort>('value');

  const list = usePackages({ branchId: DEFAULT_BRANCH_ID, serviceId });
  const mine = useMyPackages();

  const active = (mine.data ?? []).filter((u) => u.status === 'ACTIVE' && !u.expired);
  const sessionsLeft = active.reduce((s, u) => s + u.remainingSessions, 0);
  const pending = (mine.data ?? []).filter((u) => u.status === 'PENDING_PAYMENT');

  const rows = useMemo(() => [...(list.data ?? [])].sort(SORTERS[sort]), [list.data, sort]);
  /** ປ້າຍ "ຄຸ້ມທີ່ສຸດ" — ໃຫ້ບັດດຽວ ແລະ ສະເພາະເມື່ອປະຢັດແທ້. */
  const bestId = useMemo(() => {
    const best = rows.reduce<PackageView | null>(
      (top, p) => (p.savingsPct > (top?.savingsPct ?? 0) ? p : top),
      null,
    );
    return best && best.savingsPct >= 5 ? best.id : null;
  }, [rows]);

  const sortOptions = [
    { value: 'value' as const, label: t('packages.sortValue') },
    { value: 'price' as const, label: t('packages.sortPrice') },
    { value: 'sessions' as const, label: t('packages.sortSessions') },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader
        title={t('packages.storeTitle')}
        titleStyle={{ fontSize: 14, lineHeight: 19 }}
        onBack={() => navigation.goBack()}
      />

      {list.isError ? (
        <ErrorView message={t('errors.generic')} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={list.isLoading ? [] : rows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={list.isRefetching}
              onRefresh={() => {
                void list.refetch();
                void mine.refetch();
              }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View className="gap-3 pb-1">
              <WalletEntry
                activeCount={active.length}
                sessionsLeft={sessionsLeft}
                onPress={() => navigation.navigate('MyPackages')}
              />

              {pending.length > 0 ? (
                <Notice
                  tone="warning"
                  icon="time-outline"
                  title={t('packages.pendingBanner', { count: pending.length })}
                  body={t('packages.pendingBannerBody')}
                >
                  <Touchable
                    onPress={() => navigation.navigate('MyPackages')}
                    haptic="none"
                    hitSlop={8}
                    accessibilityRole="button"
                    className="mt-1 self-start"
                  >
                    <T className="font-lao-semibold text-warning underline" style={SMALL}>
                      {t('packages.payNow')}
                    </T>
                  </Touchable>
                </Notice>
              ) : null}

              {serviceId ? (
                <Touchable
                  onPress={() => setServiceId(undefined)}
                  haptic="select"
                  accessibilityRole="button"
                  accessibilityLabel={`${t('packages.forThisService')}, ${t('common.clear')}`}
                  className="h-8 flex-row items-center gap-1.5 self-start rounded-full bg-primary-subtle px-3"
                >
                  <T className="font-lao-medium text-primary-strong" style={SMALL}>
                    {t('packages.forThisService')}
                  </T>
                  <View className="h-4 w-4 items-center justify-center rounded-full bg-primary/15">
                    <Ionicons name="close" size={10} color={colors.primaryStrong} />
                  </View>
                </Touchable>
              ) : null}

              {rows.length > 0 ? (
                <View className="gap-2">
                  <SectionHeader
                    title={t('packages.storeSectionTitle')}
                    hint={t('packages.resultCount', { count: rows.length })}
                  />
                  <Segmented options={sortOptions} value={sort} onChange={setSort} />
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            list.isLoading ? (
              <View className="gap-3">
                {[0, 1, 2].map((i) => (
                  <PackageCardSkeleton key={i} />
                ))}
              </View>
            ) : (
              <EmptyBlock
                icon="gift-outline"
                title={serviceId ? t('packages.emptyServiceTitle') : t('packages.emptyTitle')}
                body={t('packages.emptyBody')}
                action={
                  serviceId ? (
                    <Button
                      label={t('packages.seeAllPackages')}
                      size="xs"
                      fullWidth={false}
                      icon="albums-outline"
                      onPress={() => setServiceId(undefined)}
                    />
                  ) : null
                }
              />
            )
          }
          renderItem={({ item, index }) => (
            <AnimatedEntrance index={index}>
              <PackageCard
                pkg={item}
                best={item.id === bestId}
                onPress={() => navigation.navigate('PackageDetail', { packageId: item.id })}
              />
            </AnimatedEntrance>
          )}
        />
      )}
    </SafeAreaView>
  );
}
