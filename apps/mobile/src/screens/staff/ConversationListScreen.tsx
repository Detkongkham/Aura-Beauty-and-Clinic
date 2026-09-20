import type { ConversationListItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, RefreshControl, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConversationRow } from '../../components/chat/ConversationRow';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { Touchable } from '../../components/ui/Touchable';
import {
  useConversations,
  useCreateStaffConversation,
  useStaffDirectory,
} from '../../features/staff/messaging.api';
import { useDebounced } from '../../hooks/useDebounced';
import { cn } from '../../lib/cn';
import { vientiane } from '../../lib/format';
import { colors, shadow } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import type { StaffTabScreenProps } from '../../navigation/types';
import {
  EmptyBlock,
  FilterChipRow,
  HeaderIconButton,
  SMALL,
  StaffHeader,
  StaffScreenTitle,
  T,
} from './staff-portal.parts';

/** ຈຳນວນລາຍຊື່ "ແນະນຳ" ທີ່ສະແດງກ່ອນພິມຄົ້ນຫາ — ດຶງມາແບບບໍ່ມີເງື່ອນໄຂຫຍັງ (ບໍ່ອີງໃສ່ປະຫວັດແຊັດ). */
const SUGGESTION_COUNT = 5;

type Filter = 'all' | 'unread' | 'locked';
type Row =
  | { kind: 'section'; key: string; label: string }
  | { kind: 'room'; key: string; item: ConversationListItem };

function titleOf(c: ConversationListItem, myUserId: string | undefined, fallback: string): string {
  const others = c.participants.filter((p) => p.id !== myUserId);
  return others.map((p) => p.name).join(', ') || c.title || fallback;
}

/** ຈັດກຸ່ມຕາມຄວາມສົດ: ມື້ນີ້ / 7 ວັນຜ່ານມາ / ກ່ອນໜ້ານີ້. */
function buildRows(
  list: ConversationListItem[],
  labels: { today: string; week: string; earlier: string },
): Row[] {
  const now = vientiane();
  const buckets: Record<'today' | 'week' | 'earlier', ConversationListItem[]> = {
    today: [],
    week: [],
    earlier: [],
  };
  for (const c of list) {
    const d = vientiane(c.lastMessageAt ?? c.createdAt);
    const days = now.startOf('day').diff(d.startOf('day'), 'day');
    if (days <= 0) buckets.today.push(c);
    else if (days < 7) buckets.week.push(c);
    else buckets.earlier.push(c);
  }
  const rows: Row[] = [];
  (['today', 'week', 'earlier'] as const).forEach((k) => {
    if (buckets[k].length === 0) return;
    rows.push({ kind: 'section', key: `s-${k}`, label: labels[k] });
    for (const c of buckets[k]) rows.push({ kind: 'room', key: c.id, item: c });
  });
  return rows;
}

/** ໜ້າ list ຫ້ອງແຊັດ STAFF_INTERNAL ຂອງພະນັກງານ (ໂມດູນ 38, Wave 8B) — ຄົ້ນຫາ + ກອງ + ຈັດກຸ່ມຕາມເວລາ. */
export function ConversationListScreen({
  navigation,
}: StaffTabScreenProps<'MessagesTab'>): React.JSX.Element {
  const { t } = useTranslation();
  const myUserId = useAuthStore((s) => s.user?.id);
  const conversations = useConversations('STAFF_INTERNAL');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [rawQ, setRawQ] = useState('');
  const q = useDebounced(rawQ, 250).trim().toLowerCase();

  const all = useMemo(() => conversations.data ?? [], [conversations.data]);
  const totalUnread = all.reduce((sum, c) => sum + c.unreadCount, 0);
  const lockedCount = all.filter((c) => c.isLocked).length;
  const unreadCount = all.filter((c) => c.unreadCount > 0).length;

  const filtered = useMemo(() => {
    let list = all;
    if (filter === 'unread') list = list.filter((c) => c.unreadCount > 0);
    if (filter === 'locked') list = list.filter((c) => c.isLocked);
    if (q) {
      list = list.filter((c) => {
        const name = titleOf(c, myUserId, '').toLowerCase();
        const body = (c.lastMessage?.body ?? '').toLowerCase();
        return name.includes(q) || body.includes(q);
      });
    }
    return list;
  }, [all, filter, q, myUserId]);

  const rows = useMemo(
    () =>
      buildRows(filtered, {
        today: t('messaging.inbox.sectionToday'),
        week: t('messaging.inbox.sectionWeek'),
        earlier: t('messaging.inbox.sectionEarlier'),
      }),
    [filtered, t],
  );

  // ກັບມາໜ້ານີ້ (ເຊັ່ນ ອອກຈາກຫ້ອງແຊັດ) → ດຶງ list ໃໝ່ ບໍ່ລໍຖ້າ poll.
  useFocusEffect(
    useCallback(() => {
      void conversations.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch identity is stable enough
    }, []),
  );

  const emptyTitle =
    q.length > 0
      ? t('messaging.inbox.noResults', { q: rawQ.trim() })
      : filter === 'unread'
        ? t('messaging.inbox.noUnread')
        : filter === 'locked'
          ? t('messaging.inbox.noLocked')
          : t('messaging.empty');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StaffHeader>
        <StaffScreenTitle
          eyebrow={t('staffPortal.tabs.messages')}
          title={t('messaging.title')}
          subtitle={
            totalUnread > 0
              ? t('messaging.inbox.summaryUnread', { rooms: all.length, unread: totalUnread })
              : t('messaging.inbox.summary', { rooms: all.length })
          }
          right={
            <HeaderIconButton
              icon="create-outline"
              label={t('messaging.newConversation')}
              tone="solid"
              onPress={() => setPickerOpen(true)}
            />
          }
        />

        <View
          className="h-10 flex-row items-center gap-2 rounded-2xl border border-border bg-card px-3"
          style={shadow.xs}
        >
          <Ionicons name="search" size={14} color={colors.mutedForeground} />
          <TextInput
            value={rawQ}
            onChangeText={setRawQ}
            placeholder={t('messaging.inbox.searchPlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            returnKeyType="search"
            className="h-10 flex-1 font-lao text-[12px] leading-[17px] text-foreground"
          />
          {rawQ.length > 0 ? (
            <Touchable
              onPress={() => setRawQ('')}
              hitSlop={8}
              pressScale={0.9}
              accessibilityRole="button"
              accessibilityLabel={t('messaging.inbox.clearSearch')}
            >
              <Ionicons name="close-circle" size={15} color={colors.mutedForeground} />
            </Touchable>
          ) : null}
        </View>

        <FilterChipRow<Filter>
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'all', label: t('messaging.inbox.filterAll'), count: all.length },
            {
              key: 'unread',
              label: t('messaging.inbox.filterUnread'),
              count: unreadCount,
              disabled: unreadCount === 0,
            },
            {
              key: 'locked',
              label: t('messaging.inbox.filterLocked'),
              count: lockedCount,
              disabled: lockedCount === 0,
            },
          ]}
        />
      </StaffHeader>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 8, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !conversations.isLoading ? (
            <View className="flex-1 justify-center">
              <EmptyBlock
                icon="chatbubbles-outline"
                title={emptyTitle}
                hint={q || filter !== 'all' ? undefined : t('messaging.emptyHint')}
                actionLabel={q || filter !== 'all' ? undefined : t('messaging.newConversation')}
                onAction={q || filter !== 'all' ? undefined : () => setPickerOpen(true)}
              />
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
        renderItem={({ item: r }) =>
          r.kind === 'section' ? (
            <View className="flex-row items-center gap-2 px-1 pt-1">
              <T className="font-lao-medium text-muted-foreground" style={SMALL}>
                {r.label}
              </T>
              <View className="h-px flex-1 bg-border" />
            </View>
          ) : (
            <ConversationRow
              conversation={r.item}
              myUserId={myUserId}
              onPress={(title) =>
                navigation.navigate('StaffThread', {
                  threadId: r.item.id,
                  title,
                  locked: r.item.isLocked,
                })
              }
            />
          )
        }
      />

      <NewConversationSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onCreated={(threadId, title) => {
          setPickerOpen(false);
          navigation.navigate('StaffThread', { threadId, title });
        }}
      />
    </SafeAreaView>
  );
}

function NewConversationSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (threadId: string, title: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const myUserId = useAuthStore((s) => s.user?.id);
  const [rawQ, setRawQ] = useState('');
  const q = useDebounced(rawQ, 300);
  const searching = rawQ.trim().length >= 2;
  // ບໍ່ໄດ້ພິມ → ດຶງ 5 ຄົນທຳອິດຈາກ directory ມາເປັນ "ແນະນຳ" ໂດຍກົງ, ບໍ່ມີເງື່ອນໄຂຫຍັງ.
  const directory = useStaffDirectory(searching ? q : '', searching ? 50 : SUGGESTION_COUNT);
  const create = useCreateStaffConversation();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const candidates = useMemo(
    () => (directory.data ?? []).filter((s) => s.userId !== myUserId),
    [directory.data, myUserId],
  );

  const onPick = (userId: string, name: string): void => {
    setPendingId(userId);
    create.mutate([userId], {
      onSuccess: (conversation) => {
        setRawQ('');
        setPendingId(null);
        onCreated(conversation.id, name);
      },
      onSettled: () => setPendingId(null),
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('messaging.newConversation')}>
      <View className="gap-3">
        <View className="h-11 flex-row items-center gap-2 rounded-2xl border border-border bg-card px-3">
          <Ionicons name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            value={rawQ}
            onChangeText={setRawQ}
            placeholder={t('messaging.searchStaff')}
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            autoFocus
            className="h-11 flex-1 font-lao text-[12px] leading-[17px] text-foreground"
          />
          {directory.isFetching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>

        <T className="px-1 font-lao-medium text-muted-foreground" style={SMALL}>
          {searching ? t('messaging.searchResults') : t('messaging.suggested')}
        </T>

        {candidates.length === 0 ? (
          <View className="items-center gap-1.5 py-6">
            <Ionicons name="people-outline" size={22} color={colors.mutedForeground} />
            <T className="font-lao text-muted-foreground">{t('messaging.noStaffFound')}</T>
          </View>
        ) : (
          <FlatList
            data={candidates}
            keyExtractor={(s) => s.userId}
            style={{ maxHeight: 320 }}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View className="ml-[52px] h-px bg-border" />}
            renderItem={({ item }) => (
              <Touchable
                onPress={() => onPick(item.userId, item.name)}
                disabled={create.isPending}
                pressScale={0.98}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                className={cn(
                  'min-h-[52px] flex-row items-center gap-3 py-2.5',
                  create.isPending && pendingId !== item.userId && 'opacity-40',
                )}
              >
                <Avatar name={item.name} size={36} mode="cartoon" />
                <View className="flex-1">
                  <T numberOfLines={1} className="font-lao-medium text-foreground">
                    {item.name}
                  </T>
                  <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
                    {item.branchName}
                  </T>
                </View>
                {pendingId === item.userId ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
                )}
              </Touchable>
            )}
          />
        )}

        <Button variant="ghost" size="sm" label={t('common.cancel')} onPress={onClose} />
      </View>
    </Sheet>
  );
}
