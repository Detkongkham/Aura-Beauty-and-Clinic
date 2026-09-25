import type { StockCountStatusValue, StockCountView } from '@abcp/shared-types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedEntrance } from '../../../components/ui/AnimatedEntrance';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Touchable } from '../../../components/ui/Touchable';
import {
  isForbidden,
  useCreateAndStartCount,
  useInventoryAccess,
  useStockCounts,
} from '../../../features/inventory/inventory.api';
import { vientiane } from '../../../lib/format';
import { haptics } from '../../../lib/haptics';
import { normalizeError } from '../../../services/apiError';
import { colors, shadow } from '../../../theme';
import type { StaffAppScreenProps } from '../../../navigation/types';
import {
  EmptyBlock,
  FilterChipRow,
  HeaderIconButton,
  MiniBar,
  SMALL,
  T,
} from '../staff-portal.parts';
import { LockedBlock, StockHeader, useScrolled } from './stock.parts';

type Group = 'COUNTING' | 'PENDING_APPROVAL' | 'POSTED';

export const COUNT_STATUS_TONE: Record<StockCountStatusValue, React.ComponentProps<typeof Badge>['tone']> = {
  DRAFT: 'neutral',
  COUNTING: 'primary',
  PENDING_APPROVAL: 'warning',
  POSTED: 'success',
  CANCELLED: 'destructive',
};

function CountRow({ c, onPress }: { c: StockCountView; onPress: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${c.countNumber}, ${t(`stock.countStatus.${c.status}`)}`}
      className="gap-2 rounded-2xl border border-border bg-card p-3"
      style={shadow.xs}
    >
      <View className="flex-row items-center justify-between gap-2">
        <T className="font-sans-semibold text-foreground">{c.countNumber}</T>
        <Badge dot label={t(`stock.countStatus.${c.status}`)} tone={COUNT_STATUS_TONE[c.status]} />
      </View>
      <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
        {t(`stock.countType.${c.type}`)} · {c.branchName} ·{' '}
        {vientiane(c.startedAt ?? c.createdAt).format('D MMM · HH:mm')}
      </T>
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <MiniBar value={c.countedLineCount} max={Math.max(1, c.lineCount)} tone="primary" />
        </View>
        <T className="font-sans text-muted-foreground" style={SMALL}>
          {c.countedLineCount}/{c.lineCount}
        </T>
      </View>
    </Touchable>
  );
}

/** M14 — ລາຍການໃບນັບສະຕັອກ (ກຳລັງນັບ / ລໍອະນຸມັດ / ບັນທຶກແລ້ວ). admin ເປີດໃບນັບທັງສາຂາໄດ້. */
export function StockCountsScreen({ navigation }: StaffAppScreenProps<'StockCounts'>): React.JSX.Element {
  const { t } = useTranslation();
  const access = useInventoryAccess();
  const { scrolled, onScroll } = useScrolled();
  const [group, setGroup] = useState<Group>('COUNTING');
  const counting = useStockCounts('COUNTING');
  const pending = useStockCounts('PENDING_APPROVAL');
  const posted = useStockCounts('POSTED', group === 'POSTED');
  const query = group === 'COUNTING' ? counting : group === 'PENDING_APPROVAL' ? pending : posted;
  const create = useCreateAndStartCount();

  const newFullCount = (): void => {
    if (!access.branchId) {
      Alert.alert('', t('stock.counts.noBranch'));
      return;
    }
    Alert.alert(t('stock.counts.newTitle'), t('stock.counts.newBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () =>
          create.mutate(
            { branchId: access.branchId!, type: 'FULL' },
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
          ),
      },
    ]);
  };

  const items = query.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StockHeader
        title={t('stock.counts.title')}
        subtitle={t('stock.counts.subtitle')}
        onBack={() => navigation.goBack()}
        scrolled={scrolled}
        right={
          access.canManage ? (
            <HeaderIconButton
              icon="add"
              tone="solid"
              label={t('stock.counts.new')}
              disabled={create.isPending}
              onPress={newFullCount}
            />
          ) : undefined
        }
      >
        <FilterChipRow
          value={group}
          onChange={setGroup}
          items={[
            { key: 'COUNTING', label: t('stock.countStatus.COUNTING'), count: counting.data?.total },
            { key: 'PENDING_APPROVAL', label: t('stock.countStatus.PENDING_APPROVAL'), count: pending.data?.total },
            { key: 'POSTED', label: t('stock.countStatus.POSTED') },
          ]}
        />
      </StockHeader>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 10, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {query.isPending ? (
          <>
            <Skeleton className="h-[84px] rounded-2xl" />
            <Skeleton className="h-[84px] rounded-2xl" />
          </>
        ) : query.isError ? (
          isForbidden(query.error) ? (
            <LockedBlock hint={t('stock.counts.lockedHint')} />
          ) : (
            <EmptyBlock
              icon="cloud-offline-outline"
              title={normalizeError(query.error).message}
              actionLabel={t('common.retry')}
              onAction={() => void query.refetch()}
            />
          )
        ) : items.length === 0 ? (
          <EmptyBlock
            icon="clipboard-outline"
            title={t('stock.counts.empty')}
            hint={group === 'COUNTING' ? t('stock.counts.emptyHint') : undefined}
          />
        ) : (
          items.map((c, i) => (
            <AnimatedEntrance key={c.id} index={Math.min(i, 6)}>
              <CountRow c={c} onPress={() => navigation.navigate('StockCount', { id: c.id })} />
            </AnimatedEntrance>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
