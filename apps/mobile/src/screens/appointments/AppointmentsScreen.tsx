import type { AppointmentListItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Linking,
  ScrollView,
  SectionList,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { GlassView } from '../../components/ui/GlassView';
import { Skeleton } from '../../components/ui/Skeleton';
import { Text as UIText } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { AppointmentCard, CONCIERGE_PHONE } from '../../features/appointments/AppointmentCard';
import {
  useMyAppointments,
  type AppointmentScope,
} from '../../features/appointments/appointments.api';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cn } from '../../lib/cn';
import { vientiane } from '../../lib/format';
import { colors, shadow } from '../../theme';
import { useBookingDraft } from '../../store/booking-draft.store';
import type { TabScreenProps } from '../../navigation/types';

type Status = AppointmentListItem['status'];
type TabKey = 'upcoming' | 'history' | 'cancelled';
type StatusFilter = Status | 'ALL';

const SCOPE_OF: Record<TabKey, AppointmentScope> = {
  upcoming: 'upcoming',
  history: 'history',
  cancelled: 'history',
};

/** ຊື່ເດືອນພາສາລາວ — index dayjs month() (0 = ມັງກອນ). */
const LAO_MONTHS = [
  'ມັງກອນ', 'ກຸມພາ', 'ມີນາ', 'ເມສາ', 'ພຶດສະພາ', 'ມິຖຸນາ',
  'ກໍລະກົດ', 'ສິງຫາ', 'ກັນຍາ', 'ຕຸລາ', 'ພະຈິກ', 'ທັນວາ',
] as const;

/** ໜ້າ ນັດໝາຍ: front ມາດຕະຖານ = 12px ຄົງທີ່ (ທຸກໂຕ). className ຄຸມ weight/ສີ ເທົ່ານັ້ນ.
 * inline style ຈຳເປັນ ເພາະ variant "body" (text-base) ຂອງ <UIText> ຊະນະ class text-[Npx] ໃນ NativeWind 4. */
function T({ style, ...rest }: React.ComponentProps<typeof UIText>): React.JSX.Element {
  return <UIText {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

/** ໂຕນສີ soft ຂອງຊິບກັ່ນຕອງ — ໃຊ້ token ຄົງທີ່ຂອງລະບົບ (ບໍ່ມີ opacity modifier). */
const CHIP_TONE: Record<Status, { bg: string; text: string; dot: string }> = {
  PENDING: { bg: 'bg-primary-subtle', text: 'text-primary-strong', dot: 'bg-primary' },
  CONFIRMED: { bg: 'bg-success-soft', text: 'text-success', dot: 'bg-success' },
  IN_PROGRESS: { bg: 'bg-primary-subtle', text: 'text-primary-strong', dot: 'bg-primary' },
  COMPLETED: { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-primary-strong' },
  CANCELLED: { bg: 'bg-destructive-soft', text: 'text-destructive', dot: 'bg-destructive' },
  NO_SHOW: { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
};

function BookingTabs({
  value,
  onChange,
  upcomingCount,
}: {
  value: TabKey;
  onChange: (v: TabKey) => void;
  upcomingCount: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'upcoming', label: t('appointments.upcoming'), count: upcomingCount },
    { key: 'history', label: t('appointments.history') },
    { key: 'cancelled', label: t('appointments.cancelledTab') },
  ];
  const activeIndex = Math.max(0, tabs.findIndex((tb) => tb.key === value));

  const [w, setW] = useState(0);
  const cell = w > 0 ? (w - 6) / tabs.length : 0; // p-[3px] ຂອບ 2 ຂ້າງ
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const to = activeIndex * cell;
    if (reduced || cell === 0) {
      x.setValue(to);
      return;
    }
    const a = Animated.spring(x, { toValue: to, useNativeDriver: true, speed: 16, bounciness: 6 });
    a.start();
    return () => a.stop();
  }, [activeIndex, cell, reduced, x]);

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      className="relative flex-row items-center rounded-full bg-muted p-[3px]"
    >
      {cell > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 3,
              top: 3,
              bottom: 3,
              width: cell,
              borderRadius: 999,
              backgroundColor: colors.card,
              transform: [{ translateX: x }],
            },
            shadow.xs,
          ]}
        />
      ) : null}
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <Touchable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.key)}
            pressScale={0.98}
            dim={false}
            className="h-8 flex-1 flex-row items-center justify-center gap-1 rounded-full"
          >
            <T
              numberOfLines={1}
              className={cn('font-lao-medium', active ? 'text-foreground' : 'text-muted-foreground')}
            >
              {tab.label}
            </T>
            {tab.count ? (
              <View
                className={cn(
                  'min-w-[16px] items-center justify-center rounded-full px-1',
                  active ? 'bg-primary' : 'bg-aura-200',
                )}
              >
                <T
                  className={cn('font-sans-semibold', active ? 'text-primary-foreground' : 'text-primary-strong')}
                  style={{ lineHeight: 16 }}
                >
                  {tab.count}
                </T>
              </View>
            ) : null}
          </Touchable>
        );
      })}
    </View>
  );
}

function FilterChip({
  label,
  count,
  active,
  status,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  status?: Status;
  onPress: () => void;
}): React.JSX.Element {
  const tone = status ? CHIP_TONE[status] : undefined;
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.95}
      dim={false}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={cn(
        'h-7 flex-row items-center gap-1.5 rounded-full px-2.5',
        active ? 'bg-foreground' : tone ? tone.bg : 'border border-border bg-card',
      )}
    >
      {!active && tone ? <View className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} /> : null}
      <T className={cn('font-lao-medium', active ? 'text-card' : tone ? tone.text : 'text-muted-foreground')}>
        {label}
      </T>
      <T className={cn('font-sans-medium', active ? 'text-white/70' : 'text-muted-foreground')}>{count}</T>
    </Touchable>
  );
}

/** ຫົວ section ເດືອນ — "ກັນຍາ 2026 · 3 ນັດ". */
function MonthHeader({ title, count }: { title: string; count: number }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-2 px-0.5 pb-2 pt-1">
      <T className="font-lao-semibold text-foreground">{title}</T>
      <View className="h-px flex-1 bg-border" />
      <T className="text-muted-foreground">{t('appointments.monthCount', { count })}</T>
    </View>
  );
}

/** ແບນເນີ concierge ທ້າຍລາຍການ — ແຕະເພື່ອໂທສາຍດ່ວນ. */
function ConciergeBanner(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={() => void Linking.openURL(`tel:${CONCIERGE_PHONE.replace(/\s/g, '')}`)}
      pressScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={t('appointments.conciergeCall', { phone: CONCIERGE_PHONE })}
      className="relative mt-2 flex-row items-center justify-between gap-2 overflow-hidden rounded-2xl p-3"
      style={{ backgroundColor: colors.aura900 }}
    >
      <View
        pointerEvents="none"
        className="absolute h-32 w-32 rounded-full bg-aura-500/25"
        style={{ left: -28, top: -46 }}
      />
      <View className="flex-1 flex-row items-center gap-2.5">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-white/10">
          <Ionicons name="headset-outline" size={16} color={colors.champagne} />
        </View>
        <View className="flex-1">
          <T className="font-sans-medium text-champagne" style={{ letterSpacing: 0.5 }}>
            {t('appointments.conciergeTag')}
          </T>
          <T numberOfLines={1} className="font-lao text-white/80">
            {t('appointments.conciergePrompt')}
          </T>
        </View>
      </View>
      <View className="flex-row items-center gap-1 rounded-full bg-white/15 px-2.5 py-1.5">
        <Ionicons name="call" size={12} color="#FFFFFF" />
        <T className="font-sans-medium text-white">{CONCIERGE_PHONE}</T>
      </View>
    </Touchable>
  );
}

export function AppointmentsScreen({
  navigation,
}: TabScreenProps<'AppointmentsTab'>): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<TabKey>('upcoming');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [q, setQ] = useState('');
  const [scrolled, setScrolled] = useState(false);

  const scope = SCOPE_OF[tab];
  const query = useMyAppointments(scope);
  const upcomingQuery = useMyAppointments('upcoming');
  const upcomingCount = upcomingQuery.data?.pages[0]?.total ?? 0;

  const rawItems = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const tabItems = useMemo(() => {
    if (tab === 'history') return rawItems.filter((i) => i.status === 'COMPLETED');
    if (tab === 'cancelled') {
      return rawItems.filter((i) => i.status === 'CANCELLED' || i.status === 'NO_SHOW');
    }
    return rawItems;
  }, [rawItems, tab]);

  const statusChips = useMemo(() => {
    const counts = new Map<Status, number>();
    for (const it of tabItems) counts.set(it.status, (counts.get(it.status) ?? 0) + 1);
    return [...counts.entries()].map(([st, n]) => ({ key: st, count: n }));
  }, [tabItems]);

  const filtered = useMemo(
    () => (statusFilter === 'ALL' ? tabItems : tabItems.filter((it) => it.status === statusFilter)),
    [tabItems, statusFilter],
  );

  /** ກັ່ນຕອງດ້ວຍຄຳຄົ້ນຫາ — ຊື່ບໍລິການ / ຊື່ຊ່າງ / ສາຂາ (client-side, over loaded pages). */
  const searched = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return filtered;
    return filtered.filter(
      (it) =>
        it.serviceName.toLowerCase().includes(term) ||
        it.staffName.toLowerCase().includes(term) ||
        it.branchName.toLowerCase().includes(term),
    );
  }, [filtered, q]);

  /** ຈັດກຸ່ມຕາມເດືອນ (ລຳດັບຕາມທີ່ API ສົ່ງມາ: upcoming ນ້ອຍ→ໃຫຍ່, history ໃຫຍ່→ນ້ອຍ). */
  const sections = useMemo(() => {
    const out: { key: string; title: string; data: AppointmentListItem[] }[] = [];
    for (const it of searched) {
      const d = vientiane(it.startAt);
      const key = d.format('YYYY-MM');
      let sec = out[out.length - 1];
      if (!sec || sec.key !== key) {
        const month = i18n.language === 'lo' ? LAO_MONTHS[d.month()] : d.format('MMMM');
        sec = { key, title: `${month} ${d.format('YYYY')}`, data: [] };
        out.push(sec);
      }
      sec.data.push(it);
    }
    return out;
  }, [searched, i18n.language]);

  const firstId = searched[0]?.id;

  const switchTab = (v: TabKey): void => {
    setTab(v);
    setStatusFilter('ALL');
    setQ('');
  };

  const startDraft = useBookingDraft((s) => s.start);
  const reschedule = (item: AppointmentListItem): void => {
    startDraft({
      mode: 'reschedule',
      rescheduleId: item.id,
      branchId: item.branchId,
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      staffProfileId: item.staffProfileId,
      staffName: item.staffName,
      price: item.totalAmount,
    });
    navigation.navigate('WizardDateTime');
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const next = e.nativeEvent.contentOffset.y > 4;
    if (next !== scrolled) setScrolled(next);
  };

  const emptyKey = tab === 'upcoming' ? 'appointments.emptyUpcoming' : 'appointments.emptyHistory';
  const searching = q.trim().length > 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* ── header ລັອກ (GlassView + hairline ເມື່ອເລື່ອນ) ── */}
      <GlassView
        intensity={24}
        style={[
          {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: scrolled ? colors.border : 'transparent',
            zIndex: 2,
          },
          scrolled ? shadow.xs : null,
        ]}
      >
        <View className="gap-2.5 px-4 pb-3 pt-2">
          <View className="flex-row items-end justify-between gap-3">
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <View className="h-1 w-1 rotate-45 bg-champagne" />
                <T className="font-sans-medium text-muted-foreground" style={{ letterSpacing: 0.5 }}>
                  AURA SANCTUARY • VIENTIANE
                </T>
              </View>
              <View className="flex-row items-baseline gap-2">
                <T className="font-lao-semibold text-foreground">{t('tabs.appointments')}</T>
                {upcomingCount > 0 ? (
                  <T className="text-muted-foreground">
                    · {t('appointments.upcomingSummary', { count: upcomingCount })}
                  </T>
                ) : null}
              </View>
            </View>

            <Touchable
              onPress={() => navigation.navigate('ServiceList')}
              pressScale={0.95}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('appointments.bookNow')}
              className="h-8 flex-row items-center gap-1 rounded-full bg-primary-strong px-3"
              style={shadow.primary}
            >
              <Ionicons name="add" size={15} color={colors.primaryForeground} />
              <T className="font-lao-medium text-white">{t('appointments.bookNow')}</T>
            </Touchable>
          </View>

          {/* Search */}
          <View className="h-9 flex-row items-center gap-2 rounded-full border border-border bg-card px-3">
            <Ionicons name="search" size={14} color={colors.mutedForeground} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={t('appointments.searchPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              selectionColor={colors.primary}
              returnKeyType="search"
              className="flex-1 p-0 font-lao text-foreground"
              style={{ fontSize: 12, paddingVertical: 0 }}
              accessibilityLabel={t('common.search')}
            />
            {q ? (
              <Touchable
                onPress={() => setQ('')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('common.clear')}
              >
                <Ionicons name="close-circle" size={15} color={colors.mutedForeground} />
              </Touchable>
            ) : null}
          </View>

          <BookingTabs value={tab} onChange={switchTab} upcomingCount={upcomingCount} />

          {statusChips.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingRight: 8 }}
            >
              <FilterChip
                label={t('appointments.filterAll')}
                count={tabItems.length}
                active={statusFilter === 'ALL'}
                onPress={() => setStatusFilter('ALL')}
              />
              {statusChips.map((c) => (
                <FilterChip
                  key={c.key}
                  label={t(`status.${c.key}`)}
                  count={c.count}
                  status={c.key}
                  active={statusFilter === c.key}
                  onPress={() => setStatusFilter(c.key)}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>
      </GlassView>

      {query.isLoading ? (
        <View className="gap-3 px-4 pt-3">
          <Skeleton className="h-4 w-32 rounded-md" />
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[248px] w-full rounded-2xl" />
          ))}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(a) => a.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderSectionFooter={() => <View style={{ height: 16 }} />}
          showsVerticalScrollIndicator={false}
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          onEndReached={() => query.hasNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.4}
          renderSectionHeader={({ section }) => (
            <MonthHeader title={section.title} count={section.data.length} />
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center">
              <EmptyState
                icon={searching ? 'search-outline' : 'calendar-outline'}
                title={searching ? t('appointments.searchEmpty') : t(emptyKey)}
                actionLabel={!searching && tab === 'upcoming' ? t('appointments.bookNow') : undefined}
                onAction={
                  !searching && tab === 'upcoming' ? () => navigation.navigate('ServiceList') : undefined
                }
              />
            </View>
          }
          ListFooterComponent={searched.length > 0 ? <ConciergeBanner /> : null}
          renderItem={({ item, index }) => (
            <AnimatedEntrance index={index}>
              <AppointmentCard
                item={item}
                featured={item.id === firstId && tab === 'upcoming' && !searching}
                onPress={() => navigation.navigate('AppointmentDetail', { id: item.id })}
                onReschedule={() => reschedule(item)}
                onChat={() => navigation.navigate('Chat', { appointmentId: item.id })}
                onCheckIn={
                  item.deliveryType === 'IN_STORE'
                    ? () => navigation.navigate('CheckIn', { appointmentId: item.id })
                    : undefined
                }
              />
            </AnimatedEntrance>
          )}
        />
      )}
    </SafeAreaView>
  );
}
