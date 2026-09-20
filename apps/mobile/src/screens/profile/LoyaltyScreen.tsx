import {
  LOYALTY_EARN_DIVISOR_LAK,
  LOYALTY_TIER_THRESHOLDS,
  type LoyaltyAccountView,
  type LoyaltyTier,
  type LoyaltyTransactionView,
} from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { ErrorView } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Chip } from '../../components/ui/Chip';
import { Sheet } from '../../components/ui/Sheet';
import { useMyLoyalty, useMyLoyaltyLedger, type LoyaltyTxTypeValue } from '../../features/loyalty/loyalty.api';
import {
  Card,
  DISPLAY,
  EmptyBlock,
  HeaderAction,
  HeroCard,
  HeroEyebrow,
  IconTile,
  KeyValue,
  LoadingBlock,
  Notice,
  NUM,
  ProgressRail,
  SectionHeader,
  SMALL,
  StatCell,
  T,
  type IconName,
  type Tone,
} from '../../features/profile/profile-kit';
import { cn } from '../../lib/cn';
import { formatDate, formatLAK, vientiane } from '../../lib/format';
import { colors } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

/** ໜ້າ ຄະແນນສະສົມ — type scale ຄົງທີ່ 12px (profile-kit); ມີພຽງ 1 ຕົວເລກ DISPLAY = ຍອດຄະແນນ. */

const TIER_ORDER: readonly LoyaltyTier[] = ['SILVER', 'GOLD', 'PLATINUM'] as const;

const TIER_ICON: Record<LoyaltyTier, IconName> = {
  SILVER: 'ellipse-outline',
  GOLD: 'star',
  PLATINUM: 'diamond',
};

/** ໜ້າຕາແຖວ ledger ຕໍ່ປະເພດລາຍການ — ໄອຄອນ + ໂທນສີ + ເຄື່ອງໝາຍ. */
const TX_STYLE: Record<LoyaltyTxTypeValue, { icon: IconName; tone: Tone; sign: string }> = {
  EARN: { icon: 'add-circle-outline', tone: 'success', sign: '+' },
  REDEEM: { icon: 'pricetag-outline', tone: 'primary', sign: '−' },
  ADJUST: { icon: 'swap-vertical-outline', tone: 'warning', sign: '±' },
  EXPIRE: { icon: 'time-outline', tone: 'muted', sign: '−' },
};

const FILTERS: readonly (LoyaltyTxTypeValue | 'ALL')[] = ['ALL', 'EARN', 'REDEEM', 'ADJUST', 'EXPIRE'];

/**
 * ຄວາມຄືບໜ້າພາຍໃນ "ຊັ້ນປັດຈຸບັນ" — ບໍ່ແມ່ນ lifetime/ເປົ້າໝາຍ.
 * ກ່ອນນີ້ຄິດເປັນ `lifetime / (lifetime + toNext)` ເຊິ່ງນັບຄະແນນຂອງຊັ້ນກ່ອນໆ ລວມເຂົ້ານຳ
 * ເຮັດໃຫ້ແຖບເຕັມເກືອບໝົດຕັ້ງແຕ່ຕົ້ນຊັ້ນ GOLD. ຖືກຕ້ອງຄື ວັດແຕ່ພື້ນຂອງຊັ້ນປັດຈຸບັນ
 * ຫາພື້ນຂອງຊັ້ນຖັດໄປ.
 */
function tierProgress(a: LoyaltyAccountView): number {
  if (!a.nextTier) return 1;
  const floor = LOYALTY_TIER_THRESHOLDS[a.tierLevel];
  const ceiling = LOYALTY_TIER_THRESHOLDS[a.nextTier];
  const span = ceiling - floor;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (a.lifetimePoints - floor) / span));
}

/** ຈັດກຸ່ມ ledger ຕາມເດືອນ — ຫົວຂໍ້ຍ່ອຍຊ່ວຍໃຫ້ລາຍການຍາວອ່ານງ່າຍ. */
type Row = { kind: 'month'; key: string; label: string } | { kind: 'tx'; key: string; tx: LoyaltyTransactionView };

function groupByMonth(items: LoyaltyTransactionView[]): Row[] {
  const out: Row[] = [];
  let current = '';
  for (const tx of items) {
    const month = vientiane(tx.createdAt).format('MMMM YYYY');
    if (month !== current) {
      current = month;
      out.push({ kind: 'month', key: `m-${month}`, label: month });
    }
    out.push({ kind: 'tx', key: tx.id, tx });
  }
  return out;
}

export function LoyaltyScreen({ navigation }: AppScreenProps<'Loyalty'>): React.JSX.Element {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<LoyaltyTxTypeValue | 'ALL'>('ALL');
  const [howOpen, setHowOpen] = useState(false);

  const account = useMyLoyalty();
  const ledger = useMyLoyaltyLedger(filter === 'ALL' ? undefined : filter);

  const a = account.data;
  const rows = useMemo(
    () => groupByMonth(ledger.data?.pages.flatMap((p) => p.items) ?? []),
    [ledger.data],
  );
  const progress = a ? tierProgress(a) : 0;

  const refreshing = account.isRefetching || (ledger.isRefetching && !ledger.isFetchingNextPage);
  const refresh = (): void => {
    void account.refetch();
    void ledger.refetch();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader
        title={t('loyalty.title')}
        onBack={() => navigation.goBack()}
        right={
          <HeaderAction
            icon="help-circle-outline"
            label={t('loyalty.howTitle')}
            onPress={() => setHowOpen(true)}
          />
        }
      />

      {account.isLoading ? (
        <LoadingBlock rows={4} />
      ) : account.isError || !a ? (
        <ErrorView message={t('common.loadError')} onRetry={() => void account.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 6 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (ledger.hasNextPage && !ledger.isFetchingNextPage) void ledger.fetchNextPage();
          }}
          ListHeaderComponent={
            <View className="mb-1 gap-3.5">
              <AnimatedEntrance index={0}>
                <PointsHero account={a} progress={progress} />
              </AnimatedEntrance>

              <AnimatedEntrance index={1}>
                <TierLadder account={a} />
              </AnimatedEntrance>

              <AnimatedEntrance index={2}>
                <Notice
                  tone="accent"
                  icon="sparkles-outline"
                  title={t('loyalty.earnRateTitle')}
                  body={t('loyalty.earnRateBody', {
                    amount: formatLAK(LOYALTY_EARN_DIVISOR_LAK),
                    value: formatLAK(a.pointValueLak),
                  })}
                />
              </AnimatedEntrance>

              <View className="mt-1 gap-2">
                <SectionHeader
                  title={t('loyalty.history')}
                  hint={a.lastActivityAt ? t('loyalty.lastActivity', { date: formatDate(a.lastActivityAt) }) : null}
                />
                <View className="flex-row flex-wrap gap-1.5 px-1">
                  {FILTERS.map((f) => (
                    <Chip
                      key={f}
                      size="sm"
                      label={f === 'ALL' ? t('loyalty.filterAll') : t(`loyalty.txType.${f}`)}
                      selected={filter === f}
                      onPress={() => setFilter(f)}
                    />
                  ))}
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            ledger.isLoading ? (
              <ActivityIndicator className="py-8" color={colors.primary} />
            ) : (
              <EmptyBlock
                icon="time-outline"
                title={t('loyalty.noHistory')}
                body={filter === 'ALL' ? t('loyalty.noHistoryBody') : t('loyalty.noHistoryFiltered')}
              />
            )
          }
          renderItem={({ item }) =>
            item.kind === 'month' ? (
              <T className="px-1 pb-1 pt-3 font-lao-medium text-muted-foreground" style={SMALL}>
                {item.label}
              </T>
            ) : (
              <LedgerRow tx={item.tx} pointValueLak={a.pointValueLak} />
            )
          }
          ListFooterComponent={
            ledger.isFetchingNextPage ? <ActivityIndicator className="py-4" color={colors.primary} /> : null
          }
        />
      )}

      <HowPointsSheet open={howOpen} onClose={() => setHowOpen(false)} account={a ?? null} />
    </SafeAreaView>
  );
}

// ---- hero ------------------------------------------------------------------

function PointsHero({
  account: a,
  progress,
}: {
  account: LoyaltyAccountView;
  progress: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  const worth = a.points * a.pointValueLak;

  return (
    <HeroCard>
      <View className="p-4">
        <View className="flex-row items-start justify-between">
          <HeroEyebrow label={t('loyalty.balance')} />
          <View className="flex-row items-center gap-1 rounded-full bg-champagne/20 px-2 py-0.5">
            <Ionicons name={TIER_ICON[a.tierLevel]} size={10} color={colors.champagne} />
            <T className="font-lao-semibold text-champagne">{t(`loyalty.tier.${a.tierLevel}`)}</T>
          </View>
        </View>

        <View className="mt-2 flex-row items-baseline gap-1.5">
          <T className="font-sans-semibold text-white" style={DISPLAY}>
            {a.points.toLocaleString('en-US')}
          </T>
          <T className="font-lao-medium text-white/70">{t('loyalty.pointsUnit')}</T>
        </View>
        <T className="mt-0.5 font-lao text-white/70" style={SMALL}>
          {t('loyalty.worth', { amount: worth.toLocaleString('en-US') })}
        </T>

        {/* ຄວາມຄືບໜ້າພາຍໃນຊັ້ນປັດຈຸບັນ */}
        <View className="mt-3.5 gap-1.5">
          <View className="flex-row items-end justify-between gap-3">
            <T numberOfLines={1} className="flex-1 font-lao-medium text-white">
              {a.nextTier && a.pointsToNextTier != null
                ? t('loyalty.toNext', {
                    points: a.pointsToNextTier.toLocaleString('en-US'),
                    tier: t(`loyalty.tier.${a.nextTier}`),
                  })
                : t('loyalty.topTier')}
            </T>
            <T className="font-sans-medium text-white/70" style={SMALL}>
              {Math.round(progress * 100)}%
            </T>
          </View>
          <ProgressRail value={progress} dark />
        </View>

        {/* ribbon ສະຖິຕິ */}
        <View className="mt-3.5 flex-row rounded-2xl border border-white/15 bg-white/10 py-2.5">
          <StatCell dark value={a.lifetimePoints.toLocaleString('en-US')} label={t('loyalty.lifetime')} />
          <StatCell dark border value={a.redeemedPoints.toLocaleString('en-US')} label={t('loyalty.redeemed')} />
          <StatCell dark value={vientiane(a.memberSince).format('MMM YYYY')} label={t('loyalty.memberSince')} />
        </View>
      </View>
    </HeroCard>
  );
}

// ---- tier ladder -----------------------------------------------------------

function TierLadder({ account: a }: { account: LoyaltyAccountView }): React.JSX.Element {
  const { t } = useTranslation();
  const currentIndex = TIER_ORDER.indexOf(a.tierLevel);

  return (
    <Card className="p-3.5">
      <SectionHeader title={t('loyalty.ladderTitle')} hint={t('loyalty.ladderHint')} className="px-0" />
      <View className="mt-3 flex-row gap-2">
        {TIER_ORDER.map((tier, i) => {
          const reached = i <= currentIndex;
          const active = i === currentIndex;
          return (
            <View
              key={tier}
              className={cn(
                'flex-1 items-center gap-1 rounded-2xl border px-1.5 py-2.5',
                active
                  ? 'border-primary bg-primary-subtle'
                  : reached
                    ? 'border-border bg-muted'
                    : 'border-dashed border-border bg-card',
              )}
            >
              <Ionicons
                name={reached ? TIER_ICON[tier] : 'lock-closed-outline'}
                size={14}
                color={active ? colors.primaryStrong : reached ? colors.foreground : colors.mutedForeground}
              />
              <T
                numberOfLines={1}
                className={cn(
                  'font-lao-semibold',
                  active ? 'text-primary-strong' : reached ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t(`loyalty.tier.${tier}`)}
              </T>
              <T className="font-sans text-muted-foreground" style={SMALL}>
                {LOYALTY_TIER_THRESHOLDS[tier].toLocaleString('en-US')}+
              </T>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

// ---- ledger row ------------------------------------------------------------

function LedgerRow({
  tx,
  pointValueLak,
}: {
  tx: LoyaltyTransactionView;
  pointValueLak: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  const style = TX_STYLE[tx.type] ?? TX_STYLE.ADJUST;
  const negative = tx.points < 0;

  return (
    <View className="min-h-[56px] flex-row items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5">
      <IconTile icon={style.icon} tone={style.tone} />
      <View className="min-w-0 flex-1">
        <T numberOfLines={1} className="font-lao-medium text-foreground">
          {tx.notes ?? t(`loyalty.txType.${tx.type}`)}
        </T>
        <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
          {t(`loyalty.txType.${tx.type}`)} · {formatDate(tx.createdAt)}
        </T>
      </View>
      <View className="items-end">
        <T
          className={cn('font-sans-semibold', negative ? 'text-destructive' : 'text-success')}
          style={NUM}
        >
          {style.sign}
          {Math.abs(tx.points).toLocaleString('en-US')}
        </T>
        <T className="font-sans text-muted-foreground" style={SMALL}>
          {formatLAK(Math.abs(tx.points) * pointValueLak)}
        </T>
      </View>
    </View>
  );
}

// ---- how-it-works sheet ----------------------------------------------------

function HowPointsSheet({
  open,
  onClose,
  account,
}: {
  open: boolean;
  onClose: () => void;
  account: LoyaltyAccountView | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onClose={onClose} title={t('loyalty.howTitle')} description={t('loyalty.howSubtitle')}>
      <View className="gap-3">
        {[1, 2, 3].map((n) => (
          <View key={n} className="flex-row items-start gap-2.5">
            <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-primary-subtle">
              <T className="font-sans-semibold text-primary-strong" style={SMALL}>
                {n}
              </T>
            </View>
            <T className="flex-1 font-lao text-muted-foreground">
              {t(`loyalty.how${n}`, {
                amount: formatLAK(LOYALTY_EARN_DIVISOR_LAK),
                value: formatLAK(account?.pointValueLak ?? 0),
              })}
            </T>
          </View>
        ))}

        {account ? (
          <View className="mt-1 rounded-2xl bg-muted p-3">
            <KeyValue label={t('loyalty.memberCode')} value={account.userName} />
            <KeyValue
              label={t('loyalty.memberSince')}
              value={formatDate(account.memberSince)}
            />
            <KeyValue
              label={t('loyalty.lifetime')}
              value={`${account.lifetimePoints.toLocaleString('en-US')} ${t('loyalty.pointsUnit')}`}
              divider={false}
            />
          </View>
        ) : null}

        <Notice tone="muted" icon="information-circle-outline" body={t('loyalty.redeemNote')} />
      </View>
    </Sheet>
  );
}
