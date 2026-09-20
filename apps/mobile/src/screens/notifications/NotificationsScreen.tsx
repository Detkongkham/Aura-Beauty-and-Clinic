import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { GlassView } from '../../components/ui/GlassView';
import { Sheet } from '../../components/ui/Sheet';
import { Touchable } from '../../components/ui/Touchable';
import { T } from '../../features/home/home.parts';
import {
  type AppNotification,
  type NotificationModule,
  useBulkNotificationAction,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../../features/notifications/notifications.api';
import {
  AttentionBanner,
  type Bucket,
  type Filter,
  FilterChip,
  MODULE_ICON,
  NotificationRow,
  RowSkeletons,
  SearchField,
  SelectionBar,
  StateMessage,
  type Target,
  bucketOf,
  fullTime,
  moduleLabel,
  relativeTime,
  targetOf,
  toneOf,
} from '../../features/notifications/notifications.parts';
import { cn } from '../../lib/cn';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { colors, shadow } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

const BUCKET_LABEL: Record<Bucket, string> = {
  today: 'messaging.inbox.sectionToday',
  week: 'messaging.inbox.sectionWeek',
  earlier: 'messaging.inbox.sectionEarlier',
};

/**
 * Inbox ການແຈ້ງເຕືອນຂອງລູກຄ້າ — `/notifications` (inbox ດຽວກັນກັບ web-admin, scope = ຜູ້ໃຊ້ປັດຈຸບັນ).
 * ຄົ້ນຫາ + ກອງຕາມ module/ຄວາມສຳຄັນ, swipe ເພື່ອອ່ານ/ລຶບ, ກົດຄ້າງເພື່ອເລືອກຫຼາຍລາຍການ (bulk).
 * ຕົວໜັງສືຄົງທີ່ 12px ທັງໜ້າ (mobile-flat-type-scale) — ລຳດັບຊັ້ນມາຈາກ weight/ສີ/ພື້ນທີ່.
 */
export function NotificationsScreen({
  navigation,
}: AppScreenProps<'Notifications'>): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const list = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const remove = useDeleteNotification();
  const bulk = useBulkNotificationAction();

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [sheetFor, setSheetFor] = useState<AppNotification | null>(null);
  const listRef = useRef<SectionList<AppNotification>>(null);

  useFocusEffect(
    useCallback(() => {
      void list.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch identity is stable enough
    }, []),
  );

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const unread = items.filter((n) => !n.read).length;
  const alerts = items.filter((n) => !n.read && n.severity !== 'info').length;
  const readCount = items.length - unread;

  /** module ທີ່ມີຢູ່ຈິງເທົ່ານັ້ນ ຈຶ່ງຂຶ້ນເປັນ chip — ບໍ່ສະແດງຕົວກອງທີ່ວ່າງເປົ່າ. */
  const moduleChips = useMemo(() => {
    const counts = new Map<NotificationModule, number>();
    for (const n of items) counts.set(n.module, (counts.get(n.module) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((n) => {
      if (filter === 'unread' && n.read) return false;
      if (filter === 'alerts' && n.severity === 'info') return false;
      if (filter.startsWith('m:') && n.module !== filter.slice(2)) return false;
      if (q && !`${n.title} ${n.body}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filter, query]);

  const sections = useMemo(() => {
    const groups = new Map<Bucket, AppNotification[]>();
    for (const n of filtered) {
      const b = bucketOf(n.createdAt);
      groups.set(b, [...(groups.get(b) ?? []), n]);
    }
    return (['today', 'week', 'earlier'] as const)
      .filter((b) => groups.has(b))
      .map((b) => ({ key: b, title: t(BUCKET_LABEL[b]), data: groups.get(b)! }));
  }, [filtered, t]);

  // ---- actions -------------------------------------------------------------

  const openTarget = (n: AppNotification): void => {
    if (!n.read) markRead.mutate({ id: n.id, read: true });
    const target = targetOf(n);
    if (target) (navigation.navigate as (...a: Target) => void)(...target);
  };

  const toggleSelected = (id: string): void => {
    haptics.select();
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const startSelecting = (id?: string): void => {
    haptics.select();
    setSelecting(true);
    setSelected(id ? [id] : []);
  };

  const stopSelecting = (): void => {
    setSelecting(false);
    setSelected([]);
  };

  const confirmDelete = (ids: string[], onConfirm: () => void): void => {
    Alert.alert(
      t('notifications.confirmDeleteTitle'),
      t('notifications.confirmDeleteBody', { count: ids.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('notifications.delete'),
          style: 'destructive',
          onPress: () => {
            haptics.select();
            onConfirm();
          },
        },
      ],
    );
  };

  const onRowPress = (n: AppNotification): void => {
    if (selecting) {
      toggleSelected(n.id);
      return;
    }
    if (targetOf(n)) openTarget(n);
    else setSheetFor(n);
  };

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await list.refetch();
    setRefreshing(false);
  };

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 4);
  }, []);

  const moreActions = (): void => {
    haptics.select();
    const options: Parameters<typeof Alert.alert>[2] = [];
    if (unread > 0) {
      options.push({
        text: t('notifications.markAllRead'),
        onPress: () => markAll.mutate(),
      });
    }
    if (items.length > 0) {
      options.push({ text: t('notifications.select'), onPress: () => startSelecting() });
    }
    if (readCount > 0) {
      options.push({
        text: t('notifications.deleteRead', { count: readCount }),
        style: 'destructive',
        onPress: () => {
          const ids = items.filter((n) => n.read).map((n) => n.id);
          confirmDelete(ids, () => bulk.mutate({ ids, action: 'delete' }));
        },
      });
    }
    options.push({ text: t('common.cancel'), style: 'cancel' });
    Alert.alert(t('home.notifications'), undefined, options);
  };

  // ---- render --------------------------------------------------------------

  const empty = (): React.JSX.Element => {
    if (list.isLoading) return <RowSkeletons />;
    if (list.isError) {
      return (
        <StateMessage
          icon="cloud-offline-outline"
          title={t('errors.generic')}
          body={normalizeError(list.error).message}
          actionLabel={t('common.retry')}
          onAction={() => void list.refetch()}
        />
      );
    }
    if (query.trim().length > 0) {
      return (
        <StateMessage
          icon="search-outline"
          title={t('notifications.noResultsTitle')}
          body={t('notifications.noResultsBody')}
        />
      );
    }
    if (filter !== 'all') {
      return (
        <StateMessage
          icon="checkmark-done"
          tone="primary"
          title={t('notifications.allCaughtUp')}
          body={t('notifications.emptyFilterBody')}
        />
      );
    }
    return (
      <StateMessage
        icon="notifications-outline"
        tone="primary"
        title={t('notifications.emptyTitle')}
        body={t('notifications.emptyBody')}
      />
    );
  };

  const header = selecting ? (
    <View className="flex-row items-center gap-2 px-4 pb-2 pt-1">
      <Touchable
        onPress={stopSelecting}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('notifications.clearSelection')}
        className="h-10 w-10 items-center justify-center rounded-full"
      >
        <Ionicons name="close" size={20} color={colors.foreground} />
      </Touchable>
      <View className="flex-1">
        <T className="font-lao-semibold text-foreground">
          {t('notifications.selectedCount', { count: selected.length })}
        </T>
        <T className="font-lao text-muted-foreground">{t('notifications.selectHint')}</T>
      </View>
      <Touchable
        onPress={() =>
          setSelected(selected.length === filtered.length ? [] : filtered.map((n) => n.id))
        }
        accessibilityRole="button"
        className="h-9 flex-row items-center gap-1 rounded-full bg-primary-subtle px-3"
      >
        <Ionicons
          name={selected.length === filtered.length ? 'remove-circle-outline' : 'checkbox-outline'}
          size={14}
          color={colors.primaryStrong}
        />
        <T className="font-lao-medium text-primary-strong">
          {selected.length === filtered.length
            ? t('notifications.clearSelection')
            : t('notifications.selectAll')}
        </T>
      </Touchable>
    </View>
  ) : (
    <View className="flex-row items-center gap-2 px-4 pb-2 pt-1">
      <Touchable
        onPress={() => navigation.goBack()}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        className="h-10 w-10 items-center justify-center rounded-full"
      >
        <Ionicons name="chevron-back" size={20} color={colors.foreground} />
      </Touchable>
      <View className="flex-1">
        <T className="font-lao-semibold text-foreground">{t('home.notifications')}</T>
        <T numberOfLines={1} className="font-lao text-muted-foreground">
          {unread > 0
            ? t('notifications.unreadSummary', { count: unread })
            : t('notifications.allRead')}
          {items.length > 0 ? ` · ${t('notifications.totalSummary', { count: items.length })}` : ''}
        </T>
      </View>
      {unread > 0 ? (
        <Touchable
          onPress={() => {
            haptics.select();
            markAll.mutate();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.markAllRead')}
          className="h-9 flex-row items-center gap-1 rounded-full bg-primary-subtle px-3"
        >
          <Ionicons name="checkmark-done" size={14} color={colors.primaryStrong} />
          <T className="font-lao-medium text-primary-strong">{t('notifications.markAllRead')}</T>
        </Touchable>
      ) : null}
      <Touchable
        onPress={moreActions}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('notifications.moreActions')}
        className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
      >
        <Ionicons name="ellipsis-horizontal" size={17} color={colors.foreground} />
      </Touchable>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <GlassView
        intensity={28}
        sheen
        style={[
          {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: scrolled ? colors.border : 'transparent',
          },
          scrolled ? shadow.xs : null,
        ]}
      >
        {header}

        {!selecting ? (
          <>
            {items.length > 5 ? (
              <View className="px-4 pb-2">
                <SearchField value={query} onChange={setQuery} />
              </View>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}
            >
              <FilterChip
                label={t('notifications.filterAll')}
                count={items.length}
                active={filter === 'all'}
                onPress={() => setFilter('all')}
              />
              <FilterChip
                label={t('notifications.filterUnread')}
                count={unread}
                active={filter === 'unread'}
                onPress={() => setFilter('unread')}
              />
              {alerts > 0 ? (
                <FilterChip
                  label={t('notifications.filterAlerts')}
                  icon="alert-circle"
                  count={alerts}
                  active={filter === 'alerts'}
                  onPress={() => setFilter('alerts')}
                />
              ) : null}
              {moduleChips.map(([m, count]) => (
                <FilterChip
                  key={m}
                  label={moduleLabel(t, m)}
                  icon={MODULE_ICON[m]}
                  count={count}
                  active={filter === `m:${m}`}
                  onPress={() => setFilter(`m:${m}`)}
                />
              ))}
            </ScrollView>
          </>
        ) : null}
      </GlassView>

      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(n) => n.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: selecting ? 116 : 36,
          gap: 10,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          !selecting && alerts > 0 && filter !== 'alerts' ? (
            <AttentionBanner
              count={alerts}
              onPress={() => {
                setFilter('alerts');
                listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: true });
              }}
            />
          ) : null
        }
        ListEmptyComponent={empty}
        renderSectionHeader={({ section }) => (
          <View className="mt-1 flex-row items-center gap-2 px-1">
            <T className="font-lao-semibold text-muted-foreground">{section.title}</T>
            <View className="rounded-full bg-muted px-1.5">
              <T className="font-sans-semibold text-muted-foreground">{section.data.length}</T>
            </View>
            <View className="h-px flex-1 bg-border" />
          </View>
        )}
        renderItem={({ item, index }) => (
          <AnimatedEntrance index={index}>
            <NotificationRow
              n={item}
              selecting={selecting}
              selected={selected.includes(item.id)}
              onPress={() => onRowPress(item)}
              onLongPress={() => (selecting ? toggleSelected(item.id) : startSelecting(item.id))}
              onToggleRead={() => markRead.mutate({ id: item.id, read: !item.read })}
              onDelete={() => confirmDelete([item.id], () => remove.mutate(item.id))}
            />
          </AnimatedEntrance>
        )}
      />

      {selecting ? (
        <SelectionBar
          count={selected.length}
          bottomInset={insets.bottom}
          onMarkRead={() => {
            bulk.mutate({ ids: selected, action: 'read' });
            stopSelecting();
          }}
          onDelete={() =>
            confirmDelete(selected, () => {
              bulk.mutate({ ids: selected, action: 'delete' });
              stopSelecting();
            })
          }
        />
      ) : null}

      <Sheet open={sheetFor != null} onClose={() => setSheetFor(null)}>
        {sheetFor ? (
          <DetailSheet
            n={sheetFor}
            onAction={(a) => {
              const n = sheetFor;
              setSheetFor(null);
              if (a === 'toggleRead') markRead.mutate({ id: n.id, read: !n.read });
              if (a === 'delete') confirmDelete([n.id], () => remove.mutate(n.id));
              if (a === 'open') openTarget(n);
            }}
          />
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

/** ລາຍລະອຽດເຕັມ + ການກະທຳ — ແທນ Alert ແບບເກົ່າ (ອ່ານເນື້ອຫາຍາວໄດ້ຄົບ). */
function DetailSheet({
  n,
  onAction,
}: {
  n: AppNotification;
  onAction: (a: 'open' | 'toggleRead' | 'delete') => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const tone = toneOf(n);
  const hasTarget = targetOf(n) != null;

  return (
    <View className="gap-3">
      <View className="flex-row items-start gap-3">
        <View className={cn('h-10 w-10 items-center justify-center rounded-xl', tone.bg)}>
          <Ionicons name={MODULE_ICON[n.module] ?? 'notifications'} size={17} color={tone.fg} />
        </View>
        <View className="flex-1 gap-0.5">
          <T className="font-lao-semibold text-foreground">{n.title}</T>
          <T className="font-sans text-muted-foreground">
            {relativeTime(t, n.createdAt)} · {moduleLabel(t, n.module)}
          </T>
        </View>
      </View>

      <View className="rounded-2xl border border-border bg-muted/60 p-3">
        <T className="font-lao text-foreground">{n.body}</T>
        <T className="mt-2 font-sans text-muted-foreground">{fullTime(n.createdAt)}</T>
      </View>

      <View className="gap-2">
        {hasTarget ? (
          <Touchable
            onPress={() => onAction('open')}
            accessibilityRole="button"
            className="h-11 flex-row items-center justify-center gap-1.5 rounded-full bg-primary"
            style={shadow.primary}
          >
            <T className="font-lao-semibold text-primary-foreground">{t('notifications.open')}</T>
            <Ionicons name="arrow-forward" size={14} color={colors.primaryForeground} />
          </Touchable>
        ) : null}
        <View className="flex-row gap-2">
          <Touchable
            onPress={() => onAction('toggleRead')}
            accessibilityRole="button"
            className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-full border border-border bg-card"
          >
            <Ionicons
              name={n.read ? 'mail-unread-outline' : 'checkmark-done'}
              size={15}
              color={colors.foreground}
            />
            <T className="font-lao-medium text-foreground">
              {t(n.read ? 'notifications.markUnread' : 'notifications.markRead')}
            </T>
          </Touchable>
          <Touchable
            onPress={() => onAction('delete')}
            accessibilityRole="button"
            className="h-11 flex-row items-center justify-center gap-1.5 rounded-full bg-destructive-soft px-4"
          >
            <Ionicons name="trash-outline" size={15} color={colors.destructive} />
            <T className="font-lao-medium text-destructive">{t('notifications.delete')}</T>
          </Touchable>
        </View>
      </View>
    </View>
  );
}
