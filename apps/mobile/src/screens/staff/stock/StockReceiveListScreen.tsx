import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedEntrance } from '../../../components/ui/AnimatedEntrance';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Touchable } from '../../../components/ui/Touchable';
import { isForbidden, useInventoryAccess, usePosToReceive } from '../../../features/inventory/inventory.api';
import { vientiane } from '../../../lib/format';
import { normalizeError } from '../../../services/apiError';
import { colors, shadow } from '../../../theme';
import type { StaffAppScreenProps } from '../../../navigation/types';
import { EmptyBlock, IconTile, SMALL, T, TINT } from '../staff-portal.parts';
import { LockedBlock, Notice, StockHeader, useScrolled } from './stock.parts';

/** M14 — PO ທີ່ລໍຮັບເຄື່ອງ (ORDERED + PARTIALLY_RECEIVED) ຂອງສາຂາ. */
export function StockReceiveListScreen({ navigation }: StaffAppScreenProps<'StockReceiveList'>): React.JSX.Element {
  const { t } = useTranslation();
  const access = useInventoryAccess();
  const { scrolled, onScroll } = useScrolled();
  const query = usePosToReceive();
  const items = query.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StockHeader
        title={t('stock.receive.listTitle')}
        subtitle={t('stock.receive.listSubtitle', { count: items.length })}
        onBack={() => navigation.goBack()}
        scrolled={scrolled}
      />
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
        {!access.canManage ? <Notice tone="info">{t('stock.receive.staffNotice')}</Notice> : null}
        {query.isPending ? (
          <>
            <Skeleton className="h-[72px] rounded-2xl" />
            <Skeleton className="h-[72px] rounded-2xl" />
          </>
        ) : query.isError ? (
          isForbidden(query.error) ? (
            <LockedBlock />
          ) : (
            <EmptyBlock
              icon="cloud-offline-outline"
              title={normalizeError(query.error).message}
              actionLabel={t('common.retry')}
              onAction={() => void query.refetch()}
            />
          )
        ) : items.length === 0 ? (
          <EmptyBlock icon="archive-outline" title={t('stock.receive.empty')} />
        ) : (
          items.map((po, i) => (
            <AnimatedEntrance key={po.id} index={Math.min(i, 6)}>
              <Touchable
                onPress={() => navigation.navigate('StockReceive', { poId: po.id })}
                pressScale={0.985}
                accessibilityRole="button"
                accessibilityLabel={`${po.poNumber}, ${po.supplierName}`}
                className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3"
                style={shadow.xs}
              >
                <IconTile icon="archive-outline" tint={TINT.money} />
                <View className="min-w-0 flex-1 gap-0.5">
                  <View className="flex-row items-center justify-between gap-2">
                    <T className="font-sans-semibold text-foreground">{po.poNumber}</T>
                    <Badge
                      dot
                      label={t(`stock.poStatus.${po.status}`, { defaultValue: po.status })}
                      tone={po.status === 'PARTIALLY_RECEIVED' ? 'warning' : 'info'}
                    />
                  </View>
                  <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
                    {po.supplierName} · {t('stock.receive.items', { count: po.itemCount })} ·{' '}
                    {vientiane(po.orderDate).format('D MMM')}
                  </T>
                </View>
              </Touchable>
            </AnimatedEntrance>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
