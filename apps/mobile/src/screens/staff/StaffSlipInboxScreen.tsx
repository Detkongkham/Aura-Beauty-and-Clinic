import type { PaymentSlipView } from '@abcp/shared-types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { ErrorView } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { Pill, type IconName, type Tone } from '../../features/booking/booking-kit';
import { actionableCount, type SlipInboxGroup, useSlipInbox } from '../../features/payments/transfer.api';
import { formatLAK, formatTime, vientiane } from '../../lib/format';
import { shadow } from '../../theme';
import type { StaffAppScreenProps } from '../../navigation/types';
import { EmptyBlock, FilterChipRow, SMALL, T } from './staff-portal.parts';

/** ສະຖານະສະລິບ (ມຸມມອງພະນັກງານ) → ສີ + ໄອຄອນ + ຄີແປ. */
export function staffSlipMeta(s: PaymentSlipView): { tone: Tone; icon: IconName; key: string } {
  switch (s.verdict) {
    case 'AUTO_MATCHED':
      return { tone: 'success', icon: 'checkmark-done-outline', key: 'AUTO_MATCHED' };
    case 'NEEDS_REVIEW':
      return { tone: 'warning', icon: 'alert-circle-outline', key: 'NEEDS_REVIEW' };
    case 'DUPLICATE':
      return { tone: 'destructive', icon: 'copy-outline', key: 'DUPLICATE' };
    case 'APPROVED':
      return { tone: 'success', icon: 'checkmark-circle', key: 'APPROVED' };
    case 'REJECTED':
      return { tone: 'muted', icon: 'close-circle', key: 'REJECTED' };
    case 'REVERSED':
      return { tone: 'destructive', icon: 'arrow-undo-outline', key: 'REVERSED' };
    default:
      return { tone: 'primary', icon: 'scan-outline', key: 'PENDING' };
  }
}

function SlipRow({ slip, onPress }: { slip: PaymentSlipView; onPress: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const meta = staffSlipMeta(slip);
  const shown = slip.amount ?? slip.declaredAmount;
  const when = vientiane(slip.createdAt);
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${slip.customerName ?? slip.uploadedByName}, ${shown != null ? formatLAK(shown) : ''}`}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3"
      style={shadow.xs}
    >
      <Image
        source={{ uri: slip.imageUrl }}
        accessibilityIgnoresInvertColors
        className="h-14 w-14 rounded-xl bg-muted"
        resizeMode="cover"
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center justify-between gap-2">
          <T numberOfLines={1} className="min-w-0 flex-1 font-lao-semibold text-foreground">
            {slip.customerName ?? slip.uploadedByName}
          </T>
          <T className="font-lao-semibold text-foreground">
            {shown != null ? formatLAK(shown) : t('payment.slip.amountUnknown')}
          </T>
        </View>
        <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
          {`${slip.branchName} · ${when.isSame(vientiane(), 'day') ? '' : `${when.format('D MMM')} · `}${formatTime(slip.createdAt)}`}
        </T>
        <View className="mt-1 flex-row items-center gap-2">
          <Pill tone={meta.tone} icon={meta.icon} label={t(`staffPortal.slips.verdict_${meta.key}`)} />
          {slip.ocrStatus === 'DONE' && slip.mismatchFields.length > 0 ? (
            <T className="font-lao text-warning" style={SMALL}>
              {t('staffPortal.slips.mismatchCount', { count: slip.mismatchFields.length })}
            </T>
          ) : null}
        </View>
      </View>
    </Touchable>
  );
}

/** ກ່ອງກວດສະລິບໂອນເງິນ (Module 39 W6) — ສະເພາະພະນັກງານທີ່ມີສິດ `payments:review`. */
export function StaffSlipInboxScreen({ navigation }: StaffAppScreenProps<'StaffSlipInbox'>): React.JSX.Element {
  const { t } = useTranslation();
  const [group, setGroup] = useState<SlipInboxGroup>('review');
  const review = useSlipInbox('review');
  const done = useSlipInbox('done');
  const query = group === 'review' ? review : done;
  const items = query.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title={t('staffPortal.slips.title')} onBack={() => navigation.goBack()} />

      <View className="px-4 pb-2 pt-3">
        <FilterChipRow
          value={group}
          onChange={setGroup}
          items={[
            { key: 'review', label: t('staffPortal.slips.tabReview'), count: actionableCount(review.data) },
            { key: 'done', label: t('staffPortal.slips.tabDone') },
          ]}
        />
      </View>

      {query.isError ? (
        <ErrorView message={t('errors.generic')} onRetry={() => void query.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 32, gap: 10 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
          }
        >
          {query.isPending ? (
            <>
              <Skeleton className="h-[84px] rounded-2xl" />
              <Skeleton className="h-[84px] rounded-2xl" />
              <Skeleton className="h-[84px] rounded-2xl" />
            </>
          ) : items.length === 0 ? (
            <EmptyBlock
              icon={group === 'review' ? 'checkmark-done-outline' : 'receipt-outline'}
              title={t(group === 'review' ? 'staffPortal.slips.emptyReview' : 'staffPortal.slips.emptyDone')}
              hint={group === 'review' ? t('staffPortal.slips.emptyReviewHint') : undefined}
            />
          ) : (
            items.map((s, i) => (
              <AnimatedEntrance key={s.id} index={Math.min(i, 6)}>
                <SlipRow slip={s} onPress={() => navigation.navigate('StaffSlipReview', { slipId: s.id })} />
              </AnimatedEntrance>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
