import type { StaffScheduleItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorView, LoadingScreen } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { Touchable } from '../../components/ui/Touchable';
import {
  useHomeServiceAvailability,
  useSetHomeServiceAvailability,
} from '../../features/staff/home-service.api';
import { useStaffSchedule, useUpdateApptStatus } from '../../features/staff/staff-portal.api';
import { cn } from '../../lib/cn';
import { formatTime, isoDateInDays, slotBucket, vientiane } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { colors, shadow } from '../../theme';
import type { StaffTabScreenProps } from '../../navigation/types';
import {
  EmptyBlock,
  FilterChipRow,
  HeaderIconButton,
  HeroCard,
  Ring,
  ScheduleCard,
  SectionHeading,
  SMALL,
  StaffHeader,
  StaffScreenTitle,
  StatCell,
  StatRibbon,
  T,
} from './staff-portal.parts';

function shiftDate(iso: string, days: number): string {
  return vientiane(`${iso}T00:00:00`).add(days, 'day').format('YYYY-MM-DD');
}

const ACTIVE_STATUS = new Set(['PENDING', 'CONFIRMED', 'IN_PROGRESS']);
const BUCKETS = ['morning', 'afternoon', 'evening'] as const;
type Bucket = (typeof BUCKETS)[number];
type Filter = 'all' | Bucket;

/** ຊ່ວງມື້ທີ່ແຖບອາທິດສະແດງ: ຍ້ອນຫຼັງ 2 ມື້ → ໜ້າ 11 ມື້. */
const STRIP_BACK = 2;
const STRIP_FORWARD = 11;

function bucketKey(b: Bucket): string {
  return `staffPortal.today.bucket${b[0]!.toUpperCase()}${b.slice(1)}`;
}

/** ແຖບເລືອກມື້ແບບເລື່ອນຂວາງ — ຈຸດນ້ອຍໃຕ້ຕົວເລກ = ມື້ນັ້ນມີຄິວ (ມື້ນີ້ຮູ້ແນ່ນອນເທົ່ານັ້ນ). */
function DayStrip({
  date,
  today,
  onPick,
}: {
  date: string;
  today: string;
  onPick: (iso: string) => void;
}): React.JSX.Element {
  const { i18n } = useTranslation();
  const ref = useRef<ScrollView | null>(null);
  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = -STRIP_BACK; i <= STRIP_FORWARD; i += 1) out.push(shiftDate(today, i));
    return out;
  }, [today]);
  const dow = i18n.language === 'lo' ? 'dd' : 'ddd';

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingRight: 4 }}
    >
      {days.map((iso) => {
        const d = vientiane(`${iso}T00:00:00`);
        const active = iso === date;
        const isToday = iso === today;
        return (
          <Touchable
            key={iso}
            onPress={() => onPick(iso)}
            pressScale={0.94}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={d.format('D MMMM YYYY')}
            className={cn(
              'h-[52px] w-[44px] items-center justify-center rounded-2xl border',
              active ? 'border-primary bg-primary' : 'border-border bg-card',
            )}
            style={active ? shadow.primary : shadow.xs}
          >
            <T
              className={cn(
                'font-sans-medium',
                active ? 'text-primary-foreground/80' : 'text-muted-foreground',
              )}
              style={SMALL}
            >
              {d.format(dow)}
            </T>
            <T
              className={cn(
                'font-sans-semibold',
                active ? 'text-primary-foreground' : 'text-foreground',
              )}
            >
              {d.format('D')}
            </T>
            <View
              className={cn(
                'mt-0.5 h-1 w-1 rounded-full',
                isToday ? (active ? 'bg-primary-foreground' : 'bg-primary') : 'bg-transparent',
              )}
            />
          </Touchable>
        );
      })}
    </ScrollView>
  );
}

export function StaffTodayScreen({
  navigation,
}: StaffTabScreenProps<'TodayTab'>): React.JSX.Element {
  const { t } = useTranslation();
  const today = isoDateInDays(0);
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<Filter>('all');
  const query = useStaffSchedule(date);
  const mutation = useUpdateApptStatus();
  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  const availability = useHomeServiceAvailability();
  const setAvailability = useSetHomeServiceAvailability();

  const stats = useMemo(() => {
    const done = items.filter((i) => i.status === 'COMPLETED').length;
    const left = items.filter((i) => ACTIVE_STATUS.has(i.status)).length;
    const active = items.find((i) => i.status === 'IN_PROGRESS');
    const next = items.find((i) => i.status === 'PENDING' || i.status === 'CONFIRMED');
    const minutes = items
      .filter((i) => i.status !== 'CANCELLED' && i.status !== 'NO_SHOW')
      .reduce((s, i) => s + i.serviceDurationMin, 0);
    return { total: items.length, done, left, active, next, focus: active ?? next, minutes };
  }, [items]);
  const focus = stats.focus;

  const groups = useMemo(() => {
    const by: Record<Bucket, StaffScheduleItem[]> = { morning: [], afternoon: [], evening: [] };
    for (const it of items) by[slotBucket(it.startAt)].push(it);
    return by;
  }, [items]);

  const nextFree = useMemo(() => {
    const up = items
      .filter((i) => ACTIVE_STATUS.has(i.status))
      .slice()
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    for (let i = 0; i < up.length - 1; i += 1) {
      const gap = vientiane(up[i + 1]!.startAt).diff(vientiane(up[i]!.endAt), 'minute');
      if (gap >= 30) return { from: up[i]!.endAt, to: up[i + 1]!.startAt, min: gap };
    }
    return null;
  }, [items]);

  const isToday = date === today;
  const dayLabel = isToday
    ? t('staffPortal.today.todayLabel')
    : vientiane(`${date}T00:00:00`).format('ddd D MMM');
  const nowHour = vientiane().hour();
  const currentBucket: Bucket = nowHour < 12 ? 'morning' : nowHour < 17 ? 'afternoon' : 'evening';
  const minsToFocus =
    focus && !stats.active
      ? Math.round(vientiane(focus.startAt).diff(vientiane(), 'minute', true))
      : null;

  const pendingId = mutation.isPending ? (mutation.variables?.id ?? null) : null;
  const runStatus = (id: string, status: 'IN_PROGRESS' | 'COMPLETED'): void => {
    mutation.mutate(
      { id, status },
      {
        onSuccess: () => haptics.success(),
        onError: (err) => {
          haptics.error();
          Alert.alert('', normalizeError(err).message);
        },
      },
    );
  };

  const openFocus = (item: StaffScheduleItem): void => {
    if (item.deliveryType === 'HOME_SERVICE') {
      navigation.navigate('StaffActiveTrip', {
        appointmentId: item.id,
        customerPhone: item.customerPhone,
      });
      return;
    }
    runStatus(item.id, 'IN_PROGRESS');
  };

  const bucketsToRender: Bucket[] = filter === 'all' ? [...BUCKETS] : [filter];
  const hours = Math.floor(stats.minutes / 60);
  const mins = stats.minutes % 60;
  let runningIndex = 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StaffHeader>
        <StaffScreenTitle
          eyebrow="Aura Team • Vientiane"
          title={t('staffPortal.today.title')}
          subtitle={`${dayLabel} · ${t('staffPortal.today.count', { count: stats.total })}`}
          right={
            <>
              {!isToday ? (
                <HeaderIconButton
                  icon="today-outline"
                  label={t('staffPortal.today.todayLabel')}
                  onPress={() => setDate(today)}
                />
              ) : null}
              <HeaderIconButton
                icon="refresh"
                label={t('common.retry')}
                onPress={() => void query.refetch()}
              />
            </>
          }
        />

        <DayStrip date={date} today={today} onPick={setDate} />
      </StaffHeader>

      {query.isLoading ? (
        <LoadingScreen />
      ) : query.isError ? (
        <ErrorView
          message={normalizeError(query.error).message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingTop: 12,
            gap: 14,
            flexGrow: 1,
            paddingBottom: 40,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={colors.primary}
            />
          }
        >
          {stats.total > 0 ? (
            <AnimatedEntrance index={0}>
              <HeroCard>
                <View className="gap-3">
                  <View className="flex-row items-center gap-3">
                    <Ring value={stats.done} max={stats.total} size={54} stroke={5} tone="primary">
                      <View className="items-center">
                        <T className="font-sans-semibold text-foreground">
                          {stats.done}/{stats.total}
                        </T>
                        <T className="font-lao text-muted-foreground" style={SMALL}>
                          {t('staffPortal.today.statDone')}
                        </T>
                      </View>
                    </Ring>

                    <View className="flex-1 gap-0.5">
                      <View className="flex-row items-center gap-1.5">
                        <View
                          className={cn(
                            'h-2 w-2 rounded-full',
                            stats.active ? 'bg-primary' : stats.next ? 'bg-warning' : 'bg-success',
                          )}
                        />
                        <T className="font-lao-semibold text-primary-strong">
                          {stats.active
                            ? t('staffPortal.today.nowServing')
                            : stats.next
                              ? t('staffPortal.today.nextUp')
                              : t('staffPortal.today.allDone')}
                        </T>
                        {focus ? (
                          <T className="font-sans-medium text-primary" style={SMALL}>
                            · {formatTime(focus.startAt)}
                          </T>
                        ) : null}
                      </View>
                      <T className="font-lao text-muted-foreground" style={SMALL}>
                        {focus
                          ? stats.active
                            ? t('staffPortal.today.sinceLabel', {
                                time: formatTime(stats.active.startAt),
                              })
                            : minsToFocus != null && minsToFocus > 0
                              ? t('staffPortal.today.startsIn', { min: minsToFocus })
                              : t('staffPortal.today.dueNow')
                          : t('staffPortal.today.allDoneHint')}
                      </T>
                      <T className="font-lao text-muted-foreground" style={SMALL}>
                        {t('staffPortal.today.workload', { h: hours, m: mins })}
                      </T>
                    </View>
                  </View>

                  {focus ? (
                    <Touchable
                      onPress={() => navigation.navigate('StaffAppointmentDetail', { id: focus.id })}
                      pressScale={0.99}
                      accessibilityRole="button"
                      accessibilityLabel={focus.serviceName}
                      className="gap-2 rounded-2xl border border-border bg-card p-3"
                      style={shadow.xs}
                    >
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="flex-1 gap-0.5">
                          <T numberOfLines={1} className="font-lao-semibold text-foreground">
                            {focus.serviceName}
                          </T>
                          <View className="flex-row items-center gap-1.5">
                            <Ionicons name="person-outline" size={11} color={colors.mutedForeground} />
                            <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
                              {focus.customerName} ·{' '}
                              {t('staffPortal.detail.duration', { min: focus.serviceDurationMin })}
                            </T>
                          </View>
                        </View>
                        <View className="items-end gap-1">
                          {focus.isWalkIn ? (
                            <Badge label={t('staffPortal.today.walkIn')} tone="primary" />
                          ) : null}
                          {focus.deliveryType === 'HOME_SERVICE' ? (
                            <Badge label={t('staffPortal.today.homeService')} tone="accent" />
                          ) : null}
                        </View>
                      </View>

                      <View className="flex-row items-center gap-1.5">
                        <Touchable
                          onPress={() => void Linking.openURL(`tel:${focus.customerPhone}`)}
                          pressScale={0.92}
                          className="h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
                          accessibilityRole="button"
                          accessibilityLabel={t('staffPortal.detail.callCustomer')}
                        >
                          <Ionicons name="call-outline" size={14} color={colors.primary} />
                        </Touchable>
                        <Touchable
                          onPress={() => void Linking.openURL(`sms:${focus.customerPhone}`)}
                          pressScale={0.92}
                          className="h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
                          accessibilityRole="button"
                          accessibilityLabel={t('staffPortal.detail.messageCustomer')}
                        >
                          <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
                        </Touchable>
                        <View className="flex-1">
                          <Button
                            size="xs"
                            label={
                              stats.active
                                ? t('staffPortal.today.complete')
                                : focus.deliveryType === 'HOME_SERVICE'
                                  ? t('staffPortal.homeService.manageTrip')
                                  : t('staffPortal.today.start')
                            }
                            loading={pendingId === focus.id}
                            onPress={() =>
                              stats.active ? runStatus(focus.id, 'COMPLETED') : openFocus(focus)
                            }
                          />
                        </View>
                      </View>
                    </Touchable>
                  ) : null}

                  <StatRibbon className="bg-card/70">
                    <StatCell
                      value={String(stats.total)}
                      label={t('staffPortal.today.statTotal')}
                      icon="albums-outline"
                    />
                    <StatCell
                      value={String(stats.done)}
                      label={t('staffPortal.today.statDone')}
                      tone="success"
                      icon="checkmark-done-outline"
                      border
                    />
                    <StatCell
                      value={String(stats.left)}
                      label={t('staffPortal.today.statLeft')}
                      tone="primary"
                      icon="hourglass-outline"
                    />
                  </StatRibbon>
                </View>
              </HeroCard>
            </AnimatedEntrance>
          ) : null}

          {!availability.isLoading ? (
            <AnimatedEntrance index={1}>
              <View
                className="flex-row items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5"
                style={shadow.xs}
              >
                <View
                  className={cn(
                    'h-9 w-9 items-center justify-center rounded-xl',
                    availability.data?.isAvailable ? 'bg-success-soft' : 'bg-muted',
                  )}
                >
                  <Ionicons
                    name={availability.data?.isAvailable ? 'navigate' : 'navigate-outline'}
                    size={15}
                    color={availability.data?.isAvailable ? colors.success : colors.mutedForeground}
                  />
                </View>
                <View className="flex-1 pr-1">
                  <T className="font-lao-semibold text-foreground">
                    {t('staffPortal.homeService.availabilityLabel')}
                  </T>
                  <T numberOfLines={2} className="font-lao text-muted-foreground" style={SMALL}>
                    {t('staffPortal.homeService.availabilityHint')}
                  </T>
                </View>
                <Segmented
                  className="w-[124px]"
                  value={availability.data?.isAvailable ? 'on' : 'off'}
                  onChange={(v) => setAvailability.mutate(v === 'on')}
                  options={[
                    { value: 'off', label: t('staffPortal.homeService.availabilityOff') },
                    { value: 'on', label: t('staffPortal.homeService.availabilityOn') },
                  ]}
                />
              </View>
            </AnimatedEntrance>
          ) : null}

          {stats.total > 0 ? (
            <View className="gap-2.5">
              <SectionHeading
                label={t('staffPortal.today.scheduleSection')}
                trailing={
                  isToday ? <Badge dot label={t(bucketKey(currentBucket))} tone="primary" /> : null
                }
              />

              <FilterChipRow<Filter>
                value={filter}
                onChange={setFilter}
                items={[
                  { key: 'all', label: t('staffPortal.today.filterAll'), count: stats.total },
                  ...BUCKETS.map((b) => ({
                    key: b as Filter,
                    label: t(bucketKey(b)),
                    count: groups[b].length,
                    disabled: groups[b].length === 0,
                  })),
                ]}
              />

              {bucketsToRender.map((b) => {
                const list = groups[b];
                if (list.length === 0) return null;
                return (
                  <View key={b} className="gap-1.5">
                    {filter === 'all' ? (
                      <View className="flex-row items-center gap-2 px-1 pt-1">
                        <T className="font-lao-medium text-muted-foreground" style={SMALL}>
                          {t(bucketKey(b))}
                        </T>
                        <View className="h-px flex-1 bg-border" />
                        <T className="font-sans text-muted-foreground" style={SMALL}>
                          {list.length}
                        </T>
                      </View>
                    ) : null}
                    {list.map((item, i) => {
                      const idx = runningIndex++;
                      const canStart = item.status === 'PENDING' || item.status === 'CONFIRMED';
                      const canComplete = item.status === 'IN_PROGRESS';
                      const isHomeService = item.deliveryType === 'HOME_SERVICE';
                      return (
                        <AnimatedEntrance key={item.id} index={idx + 1}>
                          <ScheduleCard
                            item={item}
                            index={0}
                            connector={i < list.length - 1}
                            highlight={item.status === 'IN_PROGRESS'}
                            busy={pendingId === item.id}
                            onPress={() =>
                              navigation.navigate('StaffAppointmentDetail', { id: item.id })
                            }
                            onCall={() => void Linking.openURL(`tel:${item.customerPhone}`)}
                            onStart={canStart ? () => openFocus(item) : undefined}
                            startLabel={
                              isHomeService ? t('staffPortal.homeService.manageTrip') : undefined
                            }
                            onComplete={
                              canComplete ? () => runStatus(item.id, 'COMPLETED') : undefined
                            }
                          />
                        </AnimatedEntrance>
                      );
                    })}
                  </View>
                );
              })}

              {filter === 'all' && nextFree ? (
                <View className="flex-row items-center gap-2 rounded-2xl border border-dashed border-border bg-card/60 px-3 py-2.5">
                  <Ionicons name="cafe-outline" size={14} color={colors.mutedForeground} />
                  <T className="flex-1 font-lao text-muted-foreground" style={SMALL}>
                    {t('staffPortal.today.nextFree')}: {formatTime(nextFree.from)} –{' '}
                    {formatTime(nextFree.to)} · {t('staffPortal.today.gapMinutes', { min: nextFree.min })}
                  </T>
                </View>
              ) : null}
            </View>
          ) : (
            <View className="flex-1 justify-center">
              <EmptyBlock
                icon="cafe-outline"
                title={t('staffPortal.today.empty')}
                hint={t('staffPortal.today.emptyHint')}
                actionLabel={isToday ? undefined : t('staffPortal.today.todayLabel')}
                onAction={isToday ? undefined : () => setDate(today)}
              />
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
