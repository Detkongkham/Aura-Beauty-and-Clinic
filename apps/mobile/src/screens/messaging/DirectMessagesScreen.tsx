import type { ConversationListItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, RefreshControl, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConversationRow } from '../../components/chat/ConversationRow';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Avatar } from '../../components/ui/Avatar';
import { Chip } from '../../components/ui/Chip';
import { GlassView } from '../../components/ui/GlassView';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import {
  useBlockedUsers,
  useBlockUser,
  useDirectConversations,
  useMarkConversationRead,
} from '../../features/messaging/messaging.api';
import { cn } from '../../lib/cn';
import { vientiane } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { useAuthStore } from '../../store/auth.store';
import { colors, shadow } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';
import {
  IconButton,
  PrivacySheet,
  ReportSheet,
  SheetAction,
  SMALL,
  T,
  useConfirmUnblock,
  useDirectMessagesPreference,
} from './messaging.parts';

type Filter = 'all' | 'unread' | 'locked';
type Bucket = 'today' | 'week' | 'earlier';
type Section = { key: Bucket; title: string; data: ConversationListItem[] };

const BUCKET_LABEL: Record<Bucket, string> = {
  today: 'messaging.inbox.sectionToday',
  week: 'messaging.inbox.sectionWeek',
  earlier: 'messaging.inbox.sectionEarlier',
};

/** ຊື່ຫ້ອງແບບດຽວກັນກັບ ConversationRow — ຊື່ຄົນອື່ນໃນຫ້ອງ. */
function titleOf(c: ConversationListItem, myUserId: string | undefined, fallback: string): string {
  return (
    c.participants
      .filter((p) => p.id !== myUserId)
      .map((p) => p.name)
      .join(', ') ||
    c.title ||
    fallback
  );
}

function bucketOf(iso: string): Bucket {
  const days = vientiane().startOf('day').diff(vientiane(iso).startOf('day'), 'day');
  if (days <= 0) return 'today';
  if (days < 7) return 'week';
  return 'earlier';
}

function RowSkeleton(): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-3 px-3.5 py-3">
      <Skeleton className="h-11 w-11 rounded-full" />
      <View className="flex-1 gap-2">
        <Skeleton className="h-3 w-2/5 rounded-full" />
        <Skeleton className="h-2.5 w-3/4 rounded-full" />
      </View>
    </View>
  );
}

/**
 * /profile → "ຂໍ້ຄວາມ" — ໂມດູນ 38 Wave 8D. Inbox ຫ້ອງ DIRECT ທີ່ມີແລ້ວ (ບໍ່ມີ "ສ້າງໃໝ່" — ບໍ່ມີ
 * customer directory ໃນ product ນີ້). ຫົວແກ້ວລັອກ + ຄົ້ນຫາ + ຕົວກອງ + ກຸ່ມຕາມເວລາ, ກົດຄ້າງເພື່ອ
 * ເມນູດ່ວນ (ອ່ານແລ້ວ/ລາຍງານ/ບລັອກ), ແລະ ສະວິດຮັບຂໍ້ຄວາມ (allowDirectMessages) ຢູ່ໃນໜ້າເລີຍ.
 */
export function DirectMessagesScreen({ navigation }: AppScreenProps<'DirectMessages'>): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const myUserId = useAuthStore((s) => s.user?.id);
  const conversations = useDirectConversations();
  const markRead = useMarkConversationRead();
  const blockUser = useBlockUser();
  const blocked = useBlockedUsers();
  const blockedIds = useMemo(() => new Set((blocked.data ?? []).map((b) => b.userId)), [blocked.data]);
  const unblock = useConfirmUnblock();
  const pref = useDirectMessagesPreference();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [scrolled, setScrolled] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<ConversationListItem | null>(null);
  const [reportThreadId, setReportThreadId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void conversations.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch identity is stable enough
    }, []),
  );

  const all = useMemo(() => conversations.data ?? [], [conversations.data]);
  const untitled = t('messaging.untitled');
  const unreadRooms = all.filter((c) => c.unreadCount > 0);
  const totalUnread = unreadRooms.reduce((sum, c) => sum + c.unreadCount, 0);
  const lockedCount = all.filter((c) => c.isLocked).length;

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = all
      .filter((c) => (filter === 'unread' ? c.unreadCount > 0 : filter === 'locked' ? c.isLocked : true))
      .filter((c) => {
        if (!q) return true;
        const hay = `${titleOf(c, myUserId, untitled)} ${c.lastMessage?.body ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => Date.parse(b.lastMessageAt ?? b.createdAt) - Date.parse(a.lastMessageAt ?? a.createdAt));
    const groups = new Map<Bucket, ConversationListItem[]>();
    for (const c of filtered) {
      const b = bucketOf(c.lastMessageAt ?? c.createdAt);
      groups.set(b, [...(groups.get(b) ?? []), c]);
    }
    return (['today', 'week', 'earlier'] as const)
      .filter((b) => groups.has(b))
      .map((b) => ({ key: b, title: t(BUCKET_LABEL[b]), data: groups.get(b)! }));
  }, [all, filter, query, myUserId, untitled, t]);

  const openThread = (c: ConversationListItem, title: string): void =>
    navigation.navigate('DirectThread', { threadId: c.id, title, locked: c.isLocked });

  const markAllRead = (): void => {
    haptics.select();
    unreadRooms.forEach((c) => markRead.mutate(c.id));
  };

  const confirmBlock = (c: ConversationListItem): void => {
    const other = c.participants.find((p) => p.id !== myUserId);
    if (!other) return;
    setActionsFor(null);
    Alert.alert(
      t('messaging.thread.blockConfirmTitle', { name: other.name }),
      t('messaging.thread.blockConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('messaging.blockAction'),
          style: 'destructive',
          onPress: () =>
            blockUser.mutate(other.id, {
              onSuccess: () => haptics.success(),
              onError: (err) => Alert.alert('', normalizeError(err).message),
            }),
        },
      ],
    );
  };

  const isInitialLoading = conversations.isLoading;
  const hasQueryOrFilter = query.trim().length > 0 || filter !== 'all';
  const summary =
    totalUnread > 0
      ? t('messaging.inbox.summaryUnread', { rooms: all.length, unread: totalUnread })
      : t('messaging.inbox.summary', { rooms: all.length });

  const emptyView = (): React.JSX.Element | null => {
    if (isInitialLoading) {
      return (
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {[0, 1, 2, 3, 4].map((i) => (
            <RowSkeleton key={i} />
          ))}
        </View>
      );
    }
    if (conversations.isError) {
      return (
        <View className="items-center gap-3 py-16">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Ionicons name="cloud-offline-outline" size={24} color={colors.mutedForeground} />
          </View>
          <T className="text-center font-lao text-muted-foreground">{normalizeError(conversations.error).message}</T>
          <Touchable
            onPress={() => void conversations.refetch()}
            pressScale={0.96}
            accessibilityRole="button"
            className="h-10 flex-row items-center gap-1.5 rounded-full bg-primary-subtle px-4"
          >
            <Ionicons name="refresh" size={14} color={colors.primaryStrong} />
            <T className="font-lao-semibold text-primary-strong">{t('common.retry')}</T>
          </Touchable>
        </View>
      );
    }
    if (hasQueryOrFilter) {
      const message = query.trim()
        ? t('messaging.inbox.noResults', { q: query.trim() })
        : filter === 'unread'
          ? t('messaging.inbox.noUnread')
          : t('messaging.inbox.noLocked');
      return (
        <View className="items-center gap-3 py-16">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Ionicons
              name={filter === 'unread' && !query.trim() ? 'checkmark-done' : 'search'}
              size={22}
              color={colors.mutedForeground}
            />
          </View>
          <T className="text-center font-lao text-muted-foreground">{message}</T>
          <Touchable
            onPress={() => {
              setQuery('');
              setFilter('all');
            }}
            pressScale={0.96}
            accessibilityRole="button"
            className="h-9 items-center justify-center rounded-full bg-muted px-4"
          >
            <T className="font-lao-medium text-foreground">{t('messaging.inbox.clearSearch')}</T>
          </Touchable>
        </View>
      );
    }
    return (
      <View className="items-center gap-2 px-6 py-14">
        <View className="h-16 w-16 items-center justify-center rounded-3xl bg-primary-subtle" style={shadow.xs}>
          <Ionicons name="chatbubbles" size={28} color={colors.primary} />
        </View>
        <T className="mt-2 font-lao-semibold text-foreground">{t('messaging.inbox.emptyTitle')}</T>
        <T className="text-center font-lao text-muted-foreground">
          {pref.enabled ? t('messaging.inbox.emptyBody') : t('messaging.inbox.emptyOffBody')}
        </T>
        {!pref.enabled ? (
          <Touchable
            onPress={() => pref.setEnabled(true)}
            disabled={pref.pending}
            pressScale={0.96}
            accessibilityRole="button"
            className="mt-2 h-10 flex-row items-center gap-1.5 rounded-full bg-primary px-5"
            style={shadow.primary}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primaryForeground} />
            <T className="font-lao-semibold text-white">{t('messaging.privacy.turnOn')}</T>
          </Touchable>
        ) : null}
      </View>
    );
  };

  const actionsTitle = actionsFor ? titleOf(actionsFor, myUserId, untitled) : '';
  const actionsOther = actionsFor?.participants.find((p) => p.id !== myUserId);
  const actionsBlocked = actionsOther ? blockedIds.has(actionsOther.id) : false;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
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
        <View className="h-12 flex-row items-center gap-1.5 px-2">
          <IconButton icon="chevron-back" label={t('common.back')} onPress={() => navigation.goBack()} />
          <View className="flex-1">
            <T className="font-lao-semibold text-foreground" accessibilityRole="header">
              {t('messaging.title')}
            </T>
            {!isInitialLoading ? (
              <T className="font-lao text-muted-foreground" style={SMALL} numberOfLines={1}>
                {summary}
              </T>
            ) : null}
          </View>
          <IconButton
            icon="shield-checkmark-outline"
            label={`${t('messaging.privacy.title')}: ${pref.enabled ? t('messaging.privacy.on') : t('messaging.privacy.off')}`}
            onPress={() => setPrivacyOpen(true)}
            badge={pref.enabled ? colors.success : colors.input}
          />
        </View>

        <View className="px-4 pb-2">
          <View className="h-9 flex-row items-center gap-2 rounded-full bg-muted px-3">
            <Ionicons name="search" size={15} color={colors.mutedForeground} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('messaging.inbox.searchPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              selectionColor={colors.primary}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel={t('messaging.inbox.searchPlaceholder')}
              className="flex-1 font-lao text-foreground"
              style={{ fontSize: 12, lineHeight: 17, paddingVertical: 0 }}
            />
            {query ? (
              <Touchable
                onPress={() => setQuery('')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('messaging.inbox.clearSearch')}
              >
                <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
              </Touchable>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center gap-1.5 px-4 pb-2.5">
          <Chip size="sm" label={t('messaging.inbox.filterAll')} selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip
            size="sm"
            label={
              unreadRooms.length > 0
                ? `${t('messaging.inbox.filterUnread')} · ${unreadRooms.length}`
                : t('messaging.inbox.filterUnread')
            }
            selected={filter === 'unread'}
            onPress={() => setFilter('unread')}
          />
          {lockedCount > 0 ? (
            <Chip
              size="sm"
              icon="lock-closed"
              label={`${t('messaging.inbox.filterLocked')} · ${lockedCount}`}
              selected={filter === 'locked'}
              onPress={() => setFilter('locked')}
            />
          ) : null}
          <View className="flex-1" />
          {totalUnread > 0 ? (
            <Touchable
              onPress={markAllRead}
              hitSlop={8}
              pressScale={0.95}
              accessibilityRole="button"
              className="flex-row items-center gap-1"
            >
              <Ionicons name="checkmark-done" size={14} color={colors.primary} />
              <T className="font-lao-medium text-primary">{t('messaging.inbox.markAllRead')}</T>
            </Touchable>
          ) : null}
        </View>
      </GlassView>

      <SectionList
        sections={sections}
        keyExtractor={(c) => c.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 4)}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, flexGrow: 1 }}
        ListHeaderComponent={
          !pref.enabled && all.length > 0 ? (
            <View
              className="mb-1 mt-2 flex-row items-center gap-3 rounded-2xl px-3.5 py-3"
              style={{ backgroundColor: colors.warningSoft }}
            >
              <Ionicons name="notifications-off-outline" size={18} color={colors.warning} />
              <View className="flex-1">
                <T className="font-lao-semibold text-foreground">{t('messaging.privacy.offTitle')}</T>
                <T className="font-lao text-muted-foreground" style={SMALL}>
                  {t('messaging.privacy.offBody')}
                </T>
              </View>
              <Touchable
                onPress={() => pref.setEnabled(true)}
                disabled={pref.pending}
                pressScale={0.95}
                accessibilityRole="button"
                className="h-8 items-center justify-center rounded-full bg-card px-3"
              >
                <T className="font-lao-semibold text-foreground">{t('messaging.privacy.turnOn')}</T>
              </Touchable>
            </View>
          ) : null
        }
        ListEmptyComponent={emptyView()}
        ListFooterComponent={
          all.length > 0 && sections.length > 0 ? (
            <View className="mt-5 items-center gap-1 px-6">
              <View className="flex-row items-center gap-1">
                <Ionicons name="lock-closed-outline" size={11} color={colors.mutedForeground} />
                <T className="font-lao text-muted-foreground" style={SMALL}>
                  {t('messaging.inbox.footer')}
                </T>
              </View>
              <T className="font-lao text-muted-foreground" style={SMALL}>
                {t('messaging.inbox.longPressHint')}
              </T>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={conversations.isRefetching && !conversations.isLoading}
            onRefresh={() => void conversations.refetch()}
            tintColor={colors.primary}
          />
        }
        renderSectionHeader={({ section }) => (
          <View className="flex-row items-center justify-between px-1 pb-1.5 pt-4">
            <T className="font-lao-semibold text-muted-foreground">{section.title}</T>
            <T className="font-sans text-muted-foreground" style={SMALL}>
              {section.data.length}
            </T>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <AnimatedEntrance index={index} offset={6}>
              <View
                className={cn(
                  'border-x border-border',
                  item.unreadCount > 0 ? 'bg-aura-50' : 'bg-card',
                  first && 'rounded-t-2xl border-t',
                  last && 'rounded-b-2xl border-b',
                )}
                style={last ? shadow.xs : undefined}
              >
                {!first ? <View className="ml-[70px] h-px bg-border" /> : null}
                <ConversationRow
                  variant="plain"
                  conversation={item}
                  myUserId={myUserId}
                  onPress={(title) => openThread(item, title)}
                  onLongPress={() => {
                    haptics.tapPrimary();
                    setActionsFor(item);
                  }}
                />
              </View>
            </AnimatedEntrance>
          );
        }}
      />

      <PrivacySheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} />

      <Sheet open={actionsFor !== null} onClose={() => setActionsFor(null)}>
        {actionsFor ? (
          <View className="gap-3">
            <View className="flex-row items-center gap-3 px-1">
              <Avatar
                name={actionsFor.participants.find((p) => p.id !== myUserId)?.name ?? actionsTitle}
                size={44}
                mode="cartoon"
              />
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <T className="flex-shrink font-lao-semibold text-foreground" numberOfLines={1}>
                    {actionsTitle}
                  </T>
                  {actionsFor.isLocked ? (
                    <View className="flex-row items-center gap-0.5 rounded-full px-1.5" style={{ backgroundColor: colors.warningSoft }}>
                      <Ionicons name="lock-closed" size={9} color={colors.warning} />
                      <T className="font-lao-medium" style={[SMALL, { color: colors.warning }]}>
                        {t('messaging.inbox.lockedTag')}
                      </T>
                    </View>
                  ) : null}
                  {actionsBlocked ? (
                    <View className="flex-row items-center gap-0.5 rounded-full px-1.5" style={{ backgroundColor: colors.destructiveSoft }}>
                      <Ionicons name="hand-left" size={9} color={colors.destructive} />
                      <T className="font-lao-medium" style={[SMALL, { color: colors.destructive }]}>
                        {t('messaging.blocked.tag')}
                      </T>
                    </View>
                  ) : null}
                </View>
                <T className="font-lao text-muted-foreground" style={SMALL}>
                  {t('messaging.inbox.meta', {
                    count: actionsFor.messageCount,
                    date: vientiane(actionsFor.createdAt).format(i18n.language === 'lo' ? 'DD/MM/YYYY' : 'D MMM YYYY'),
                  })}
                </T>
              </View>
            </View>

            <View className="overflow-hidden rounded-2xl border border-border bg-card">
              <SheetAction
                icon="chatbubble-outline"
                label={t('messaging.inbox.openAction')}
                onPress={() => {
                  const c = actionsFor;
                  setActionsFor(null);
                  openThread(c, actionsTitle);
                }}
              />
              {actionsFor.unreadCount > 0 ? (
                <>
                  <View className="ml-14 h-px bg-border" />
                  <SheetAction
                    icon="checkmark-done-outline"
                    label={t('messaging.inbox.markReadAction')}
                    hint={t('messaging.unreadMessages', { count: actionsFor.unreadCount })}
                    onPress={() => {
                      markRead.mutate(actionsFor.id);
                      haptics.select();
                      setActionsFor(null);
                    }}
                  />
                </>
              ) : null}
            </View>

            <View className="overflow-hidden rounded-2xl border border-border bg-card">
              <SheetAction
                icon="flag-outline"
                label={t('messaging.thread.reportConversation')}
                hint={t('messaging.thread.reportHint')}
                destructive
                onPress={() => {
                  const id = actionsFor.id;
                  setActionsFor(null);
                  // ລໍຖ້າ sheet ທຳອິດປິດກ່ອນ — iOS ເປີດ Modal ຊ້ອນກັນທັນທີບໍ່ໄດ້.
                  setTimeout(() => setReportThreadId(id), 350);
                }}
              />
              <View className="ml-14 h-px bg-border" />
              {actionsBlocked && actionsOther ? (
                <SheetAction
                  icon="lock-open-outline"
                  label={t('messaging.blocked.unblockAction')}
                  hint={t('messaging.blocked.unblockHint')}
                  loading={unblock.pendingId === actionsOther.id}
                  onPress={() => {
                    setActionsFor(null);
                    unblock.confirm(actionsOther);
                  }}
                />
              ) : (
                <SheetAction
                  icon="hand-left-outline"
                  label={t('messaging.blockAction')}
                  hint={t('messaging.thread.blockHint')}
                  destructive
                  disabled={!actionsOther}
                  loading={blockUser.isPending}
                  onPress={() => confirmBlock(actionsFor)}
                />
              )}
            </View>
          </View>
        ) : null}
      </Sheet>

      {reportThreadId ? (
        <ReportSheet threadId={reportThreadId} open onClose={() => setReportThreadId(null)} />
      ) : null}
    </SafeAreaView>
  );
}
