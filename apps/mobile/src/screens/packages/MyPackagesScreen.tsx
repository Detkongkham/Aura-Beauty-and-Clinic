import type { UserPackageView } from '@abcp/shared-types';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { ErrorView } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { DEFAULT_BRANCH_ID } from '../../config/env';
import { Notice, SectionHeader } from '../../features/booking/booking-kit';
import {
  UserPackageCard,
  UserPackageSkeleton,
  WalletSummary,
  displayState,
  EXPIRY_WARN_DAYS,
} from '../../features/packages/my-packages.parts';
import {
  useCancelPendingPackage,
  useMyPackages,
  usePackageUsage,
} from '../../features/packages/packages.api';
import { EmptyBlock, type PackageDisplayState } from '../../features/packages/packages.parts';
import type { AppScreenProps } from '../../navigation/types';
import { useBookingDraft } from '../../store/booking-draft.store';
import { colors } from '../../theme';

type Tab = 'active' | 'pending' | 'archive';

const NO_ROWS: UserPackageView[] = [];

const TAB_OF: Record<PackageDisplayState, Tab> = {
  ACTIVE: 'active',
  PENDING_PAYMENT: 'pending',
  EXPIRED: 'archive',
  USED_UP: 'archive',
  VOID: 'archive',
};

/** ໃນ tab ດຽວກັນ: ໃກ້ໝົດອາຍຸກ່ອນ (ເຕືອນໃຫ້ໃຊ້ທັນ), ແລ້ວຈຶ່ງໃໝ່ສຸດກ່ອນ. */
function sortRows(rows: UserPackageView[]): UserPackageView[] {
  return [...rows].sort(
    (a, b) => a.daysLeft - b.daysLeft || b.purchasedAt.localeCompare(a.purchasedAt),
  );
}

/**
 * ກະເປົ໋າສິດຂອງລູກຄ້າ — ສະຫຼຸບເທິງສຸດ, ແຍກ 3 ໝວດ (ໃຊ້ງານໄດ້ / ລໍຖ້າຈ່າຍ / ເກັບແລ້ວ),
 * ແຕ່ລະບັດຈອງໄດ້ທັນທີຕໍ່ບໍລິການ ແລະ ກາງເບິ່ງປະຫວັດການໃຊ້ໄດ້.
 */
export function MyPackagesScreen({ navigation }: AppScreenProps<'MyPackages'>): React.JSX.Element {
  const { t } = useTranslation();
  const mine = useMyPackages();
  const cancel = useCancelPendingPackage();
  const startDraft = useBookingDraft((s) => s.start);

  const [tab, setTab] = useState<Tab>('active');
  const [openId, setOpenId] = useState<string | null>(null);
  const usage = usePackageUsage(openId ?? '', openId != null);

  const all = mine.data ?? NO_ROWS;
  const groups = useMemo(() => {
    const out: Record<Tab, UserPackageView[]> = { active: [], pending: [], archive: [] };
    for (const u of all) out[TAB_OF[displayState(u)]].push(u);
    return { active: sortRows(out.active), pending: sortRows(out.pending), archive: out.archive };
  }, [all]);

  const sessionsLeft = groups.active.reduce((s, u) => s + u.remainingSessions, 0);
  const nextExpiry = groups.active[0] ?? null;
  const expiringSoon = groups.active.filter((u) => u.daysLeft <= EXPIRY_WARN_DAYS);
  const rows = groups[tab];

  const tabs = [
    { value: 'active' as const, label: `${t('packages.tabActive')} ${groups.active.length}` },
    { value: 'pending' as const, label: `${t('packages.tabPending')} ${groups.pending.length}` },
    { value: 'archive' as const, label: `${t('packages.tabArchive')} ${groups.archive.length}` },
  ];

  const onBook = (u: UserPackageView, item: UserPackageView['items'][number]): void => {
    startDraft({
      mode: 'create',
      branchId: DEFAULT_BRANCH_ID,
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      serviceImageUrl: item.serviceImageUrl,
      price: 0,
      durationMinutes: item.durationMinutes,
      userPackageItemId: item.id,
      packageName: u.packageName,
      packageRemaining: item.remainingUnits,
    });
    navigation.navigate('WizardService');
  };

  const onCancel = (u: UserPackageView): void => {
    Alert.alert(t('packages.cancelTitle'), t('packages.cancelBody', { name: u.packageName }), [
      { text: t('common.close'), style: 'cancel' },
      {
        text: t('packages.cancelConfirm'),
        style: 'destructive',
        onPress: () =>
          cancel.mutate(u.id, { onError: () => Alert.alert(t('errors.generic')) }),
      },
    ]);
  };

  if (mine.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScreenHeader
          title={t('packages.myTitle')}
          titleStyle={{ fontSize: 14, lineHeight: 19 }}
          onBack={() => navigation.goBack()}
        />
        <ErrorView message={t('errors.generic')} onRetry={() => mine.refetch()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader
        title={t('packages.myTitle')}
        titleStyle={{ fontSize: 14, lineHeight: 19 }}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={mine.isRefetching}
            onRefresh={() => void mine.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {mine.isLoading ? (
          <View className="gap-3">
            {[0, 1].map((i) => (
              <UserPackageSkeleton key={i} />
            ))}
          </View>
        ) : all.length === 0 ? (
          <EmptyBlock
            icon="gift-outline"
            title={t('packages.myEmptyTitle')}
            body={t('packages.myEmptyBody')}
            action={
              <Button
                label={t('packages.browse')}
                size="xs"
                fullWidth={false}
                icon="bag-handle-outline"
                onPress={() => navigation.navigate('Packages')}
              />
            }
          />
        ) : (
          <>
            <AnimatedEntrance index={0}>
              <WalletSummary
                activeCount={groups.active.length}
                sessionsLeft={sessionsLeft}
                nextExpiry={nextExpiry}
                onBrowse={() => navigation.navigate('Packages')}
              />
            </AnimatedEntrance>

            {expiringSoon.length > 0 ? (
              <AnimatedEntrance index={1}>
                <Notice
                  tone="warning"
                  icon="alert-circle-outline"
                  title={t('packages.expiringTitle', { count: expiringSoon.length })}
                  body={t('packages.expiringBody', {
                    name: expiringSoon[0]!.packageName,
                    count: expiringSoon[0]!.daysLeft,
                  })}
                />
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance index={2}>
              <Segmented options={tabs} value={tab} onChange={setTab} />
            </AnimatedEntrance>

            {rows.length === 0 ? (
              <EmptyBlock
                icon={tab === 'pending' ? 'time-outline' : 'albums-outline'}
                title={t('packages.emptyFilterTitle')}
                body={t('packages.emptyFilterBody')}
                action={
                  tab !== 'active' ? (
                    <Button
                      label={t('packages.tabActive')}
                      size="xs"
                      variant="secondary"
                      fullWidth={false}
                      onPress={() => setTab('active')}
                    />
                  ) : (
                    <Button
                      label={t('packages.browse')}
                      size="xs"
                      fullWidth={false}
                      icon="bag-handle-outline"
                      onPress={() => navigation.navigate('Packages')}
                    />
                  )
                }
              />
            ) : (
              <View className="gap-3">
                <SectionHeader
                  title={t(`packages.tab${tab === 'active' ? 'Active' : tab === 'pending' ? 'Pending' : 'Archive'}`)}
                  hint={t('packages.resultCount', { count: rows.length })}
                />
                {rows.map((u, idx) => (
                  <AnimatedEntrance key={u.id} index={idx + 3}>
                    <UserPackageCard
                      u={u}
                      state={displayState(u)}
                      usage={openId === u.id ? usage.data : undefined}
                      usageOpen={openId === u.id}
                      usageLoading={openId === u.id && usage.isLoading}
                      cancelling={cancel.isPending && cancel.variables === u.id}
                      onToggleUsage={() => setOpenId((cur) => (cur === u.id ? null : u.id))}
                      onBook={(item) => onBook(u, item)}
                      onCancel={() => onCancel(u)}
                      onPay={() =>
                        navigation.navigate('PackageCheckout', {
                          paymentId: u.paymentId!,
                          amount: u.totalPrice,
                          packageName: u.packageName,
                        })
                      }
                    />
                  </AnimatedEntrance>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
