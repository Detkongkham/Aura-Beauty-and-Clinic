import type { ChatMessageEvent, ChatMessageView, ChatReadEvent } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Socket } from 'socket.io-client';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatComposer } from '../../components/chat/ChatComposer';
import {
  buildChatRows,
  DaySeparator,
  UnreadDivider,
  useDayLabel,
} from '../../components/chat/chatRows';
import { FooterBar } from '../../components/shared/FooterBar';
import { Avatar } from '../../components/ui/Avatar';
import { GlassView } from '../../components/ui/GlassView';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { useChatMessages } from '../../features/appointments/chat.api';
import { useConversations } from '../../features/staff/messaging.api';
import { useThreadReadSync } from '../../features/messaging/useThreadReadSync';
import { cn } from '../../lib/cn';
import { haptics } from '../../lib/haptics';
import { vientiane } from '../../lib/format';
import { qk } from '../../services/queryKeys';
import { connectAppSocket } from '../../services/socket';
import { useAuthStore } from '../../store/auth.store';
import { colors, shadow } from '../../theme';
import type { StaffAppScreenProps } from '../../navigation/types';
import { HeaderIconButton, SMALL, T } from './staff-portal.parts';

/** ເລື່ອນຂຶ້ນເກີນນີ້ (inverted = ຫ່າງຈາກລຸ່ມສຸດ) → ສະແດງປຸ່ມ "ໄປຂໍ້ຄວາມລ່າສຸດ". */
const JUMP_THRESHOLD = 240;

/**
 * ຫ້ອງແຊັດພາຍໃນທີມ (STAFF_INTERNAL — ໂມດູນ 38 Wave 8B). ໃຊ້ `useChatMessages` ຮ່ວມກັບ
 * `ChatBubble`/`ChatComposer` ແລະ `buildChatRows` ອັນດຽວກັນກັບຫ້ອງ DIRECT ຂອງລູກຄ້າ —
 * ຫົວແກ້ວ (avatar ກຸ່ມ + ຈຳນວນສະມາຊິກ), ຕົວຄັ່ນວັນ, ເສັ້ນ "ຂໍ້ຄວາມໃໝ່", ປຸ່ມໄປລ່າສຸດ ແລະ
 * ກົດຄ້າງເພື່ອສຳເນົາ. ຫ້ອງ CONSULTATION ທີ່ຜູກກັບຄິວຍັງຄົງໃຊ້ `ChatScreen` ຕາມເກົ່າ.
 */
export function StaffThreadScreen({
  navigation,
  route,
}: StaffAppScreenProps<'StaffThread'>): React.JSX.Element {
  const { t } = useTranslation();
  const { threadId, title, locked } = route.params;
  const qc = useQueryClient();
  const myUserId = useAuthStore((s) => s.user?.id);

  // snapshot unread ກ່ອນ useThreadReadSync ລ້າງ badge ໃນ cache — ໃຊ້ວາງເສັ້ນ "ຂໍ້ຄວາມໃໝ່".
  const [initialUnread] = useState(
    () =>
      qc
        .getQueryData<{ id: string; unreadCount: number }[]>(qk.conversations('STAFF_INTERNAL'))
        ?.find((c) => c.id === threadId)?.unreadCount ?? 0,
  );
  useThreadReadSync(threadId);

  const conversations = useConversations('STAFF_INTERNAL');
  const conversation = (conversations.data ?? []).find((c) => c.id === threadId);
  const messages = useChatMessages(threadId);
  const listRef = useRef<FlatList | null>(null);

  const [showJump, setShowJump] = useState(false);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const awayRef = useRef(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const socket: Socket = connectAppSocket();
    socket.emit('join-chat', { threadId });
    socket.emit('chat:read', { threadId });

    socket.on('chat:message', (evt: ChatMessageEvent) => {
      if (evt.threadId !== threadId) return;
      qc.setQueryData<ChatMessageView[]>(qk.chatMessages(threadId), (prev) =>
        prev?.some((m) => m.id === evt.id) ? prev : [...(prev ?? []), evt],
      );
      if (evt.senderId !== useAuthStore.getState().user?.id && awayRef.current) {
        setNewWhileAway((n) => n + 1);
      }
      // ເປີດຫ້ອງຢູ່ = ເຫັນຂໍ້ຄວາມແລ້ວ.
      socket.emit('chat:read', { threadId });
    });

    // ອີກຝ່າຍອ່ານ → ໝາຍ ✓✓ ໃຫ້ຂໍ້ຄວາມຂອງເຮົາ (live, ບໍ່ຕ້ອງ refetch).
    socket.on('chat:read', (evt: ChatReadEvent) => {
      if (evt.threadId !== threadId || evt.readerId === useAuthStore.getState().user?.id) return;
      qc.setQueryData<ChatMessageView[]>(qk.chatMessages(threadId), (prev) =>
        prev?.map((m) =>
          !m.readAt && m.senderId !== evt.readerId && m.createdAt <= evt.readAt
            ? { ...m, readAt: evt.readAt }
            : m,
        ),
      );
    });

    return () => {
      socket.emit('leave-chat', { threadId });
      socket.disconnect();
    };
  }, [threadId, qc]);

  const items = useMemo(() => messages.data ?? [], [messages.data]);
  const others = (conversation?.participants ?? []).filter((p) => p.id !== myUserId);
  const isGroup = others.length > 1;
  const isLocked = conversation?.isLocked ?? locked ?? false;
  const name = others.map((p) => p.name).join(', ') || title;

  // ຈຸດເລີ່ມ "ຂໍ້ຄວາມໃໝ່" — ຂໍ້ຄວາມທີ N ນັບຈາກທ້າຍ (ສະເພາະຂອງຄົນອື່ນ), ຄິດຄັ້ງດຽວຕອນໂຫຼດສຳເລັດ.
  const [unreadFromId, setUnreadFromId] = useState<string | null>(null);
  const computedUnread = useRef(false);
  useEffect(() => {
    if (computedUnread.current || !messages.data) return;
    computedUnread.current = true;
    if (initialUnread <= 0) return;
    let seen = 0;
    for (let i = messages.data.length - 1; i >= 0; i -= 1) {
      const m = messages.data[i]!;
      if (m.senderId === myUserId) continue;
      seen += 1;
      if (seen === initialUnread) {
        setUnreadFromId(m.id);
        return;
      }
    }
  }, [messages.data, initialUnread, myUserId]);

  const dayLabel = useDayLabel();
  const rows = useMemo(
    () => buildChatRows(items, myUserId, dayLabel, unreadFromId),
    [items, myUserId, dayLabel, unreadFromId],
  );

  const jumpToLatest = (): void => {
    haptics.select();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setNewWhileAway(0);
  };

  const copyMessage = async (body: string): Promise<void> => {
    await Clipboard.setStringAsync(body);
    haptics.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const subtitle = isLocked
    ? t('messaging.thread.lockedSubtitle')
    : isGroup
      ? t('messaging.thread.members', { count: others.length + 1 })
      : conversation?.lastMessageAt
        ? t('messaging.thread.subtitleActive', {
            time: vientiane(conversation.lastMessageAt).format('DD/MM HH:mm'),
          })
        : t('messaging.thread.subtitle', { count: conversation?.messageCount ?? items.length });

  const renderBody = (): React.JSX.Element => {
    if (messages.isLoading) {
      return (
        <View className="flex-1 justify-end gap-2 p-4">
          <Skeleton className="h-9 w-40 self-start rounded-2xl" />
          <Skeleton className="h-9 w-52 self-end rounded-2xl" />
          <Skeleton className="h-14 w-44 self-start rounded-2xl" />
          <Skeleton className="h-9 w-32 self-end rounded-2xl" />
        </View>
      );
    }
    if (rows.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 10 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center gap-1.5">
            <Avatar name={name} size={60} mode="cartoon" />
            <T className="mt-1 text-center font-lao-semibold text-foreground">
              {t('messaging.thread.emptyTitle', { name })}
            </T>
            <T className="text-center font-lao text-muted-foreground" style={SMALL}>
              {t('staffPortal.messages.emptyThreadHint')}
            </T>
          </View>
        </ScrollView>
      );
    }
    return (
      <View className="flex-1">
        <FlatList
          ref={listRef}
          inverted
          data={rows}
          keyExtractor={(r) => r.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}
          scrollEventThrottle={32}
          onScroll={(e) => {
            const away = e.nativeEvent.contentOffset.y > JUMP_THRESHOLD;
            awayRef.current = away;
            if (away !== showJump) setShowJump(away);
            if (!away && newWhileAway > 0) setNewWhileAway(0);
          }}
          renderItem={({ item: r }) => {
            if (r.kind === 'day') return <DaySeparator label={r.label} />;
            if (r.kind === 'unread') return <UnreadDivider />;
            if (r.item.messageType === 'SYSTEM') {
              return (
                <View className="my-1.5 items-center px-6">
                  <T className="text-center font-lao text-muted-foreground" style={SMALL}>
                    {r.item.body}
                  </T>
                </View>
              );
            }
            return (
              <View
                className={cn('flex-row items-end gap-1.5', r.mine ? 'justify-end' : 'justify-start')}
                style={{ marginTop: r.first ? 10 : 2 }}
              >
                {!r.mine ? (
                  <View style={{ width: 26 }}>
                    {r.last ? <Avatar name={r.item.senderName} size={26} mode="cartoon" /> : null}
                  </View>
                ) : null}
                <View className={cn('flex-1', r.mine ? 'items-end' : 'items-start')}>
                  {!r.mine && r.first && isGroup ? (
                    <T className="mb-0.5 ml-1 font-lao-medium text-muted-foreground" style={SMALL}>
                      {r.item.senderName}
                    </T>
                  ) : null}
                  <ChatBubble
                    item={r.item}
                    mine={r.mine}
                    showTime={r.last}
                    tail={r.last}
                    readReceipt
                    onLongPress={
                      r.item.messageType === 'TEXT'
                        ? () => {
                            haptics.tapPrimary();
                            void copyMessage(r.item.body);
                          }
                        : undefined
                    }
                  />
                </View>
              </View>
            );
          }}
        />

        {showJump ? (
          <Touchable
            onPress={jumpToLatest}
            pressScale={0.92}
            accessibilityRole="button"
            accessibilityLabel={t('messaging.thread.jumpLatest')}
            className="absolute bottom-3 right-4 h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
            style={shadow.card}
          >
            <Ionicons name="chevron-down" size={18} color={colors.foreground} />
            {newWhileAway > 0 ? (
              <View className="absolute -top-1.5 h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5">
                <T className="font-sans-semibold text-white" style={SMALL}>
                  {newWhileAway > 99 ? '99+' : newWhileAway}
                </T>
              </View>
            ) : null}
          </Touchable>
        ) : null}

        {copied ? (
          <View className="absolute bottom-3 left-0 right-0 items-center">
            <View className="flex-row items-center gap-1.5 rounded-full bg-foreground/90 px-3 py-1.5">
              <Ionicons name="copy-outline" size={12} color="#fff" />
              <T className="font-lao text-white" style={SMALL}>
                {t('messaging.thread.copied')}
              </T>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <GlassView
          intensity={24}
          style={[
            {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
              zIndex: 2,
            },
            shadow.xs,
          ]}
        >
          <View className="h-14 flex-row items-center gap-1.5 px-2">
            <HeaderIconButton
              icon="chevron-back"
              label={t('common.back')}
              tone="plain"
              onPress={() => navigation.goBack()}
            />
            <Touchable
              onPress={() => setInfoOpen(true)}
              pressScale={0.98}
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${t('messaging.thread.info')}`}
              className="flex-1 flex-row items-center gap-2.5"
            >
              <View>
                <Avatar name={others[0]?.name ?? name} size={34} mode="cartoon" />
                {isLocked ? (
                  <View
                    className="absolute -bottom-0.5 -right-0.5 h-4 w-4 items-center justify-center rounded-full"
                    style={{ backgroundColor: colors.warning, borderWidth: 2, borderColor: colors.background }}
                  >
                    <Ionicons name="lock-closed" size={7} color="#FFFFFF" />
                  </View>
                ) : null}
              </View>
              <View className="flex-1">
                <T numberOfLines={1} className="font-lao-semibold text-foreground">
                  {name}
                </T>
                <T
                  numberOfLines={1}
                  className="font-lao"
                  style={[SMALL, { color: isLocked ? colors.warning : colors.mutedForeground }]}
                >
                  {subtitle}
                </T>
              </View>
            </Touchable>
            <HeaderIconButton
              icon="information-circle-outline"
              label={t('messaging.thread.info')}
              tone="plain"
              onPress={() => setInfoOpen(true)}
            />
          </View>
        </GlassView>

        {renderBody()}

        {isLocked ? (
          <View className="flex-row items-center gap-2 border-t border-border bg-warning-soft px-4 py-2.5">
            <Ionicons name="lock-closed" size={13} color={colors.warning} />
            <View className="flex-1">
              <T className="font-lao-semibold text-warning">{t('messaging.lockedTitle')}</T>
              <T className="font-lao text-warning" style={SMALL}>
                {t('messaging.lockedHint')}
              </T>
            </View>
          </View>
        ) : (
          <FooterBar>
            <ChatComposer threadId={threadId} locked={isLocked} />
          </FooterBar>
        )}
      </KeyboardAvoidingView>

      {/* ຂໍ້ມູນຫ້ອງ — ສະມາຊິກ + ສະຖິຕິ */}
      <Sheet open={infoOpen} onClose={() => setInfoOpen(false)} title={t('messaging.thread.info')}>
        <View className="gap-3">
          <View className="items-center gap-1">
            <Avatar name={others[0]?.name ?? name} size={56} mode="cartoon" />
            <T className="mt-1 text-center font-lao-semibold text-foreground">{name}</T>
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {t('messaging.thread.subtitle', { count: conversation?.messageCount ?? items.length })}
            </T>
          </View>

          <View className="gap-1.5 rounded-2xl border border-border bg-card p-2">
            {(conversation?.participants ?? []).map((p) => (
              <View key={p.id} className="flex-row items-center gap-2.5 px-1.5 py-1.5">
                <Avatar name={p.name} size={30} mode="cartoon" />
                <T numberOfLines={1} className="flex-1 font-lao-medium text-foreground">
                  {p.name}
                  {p.id === myUserId ? (
                    <T className="font-lao text-muted-foreground" style={SMALL}>
                      {' '}
                      · {t('messaging.thread.you')}
                    </T>
                  ) : null}
                </T>
                <T className="font-sans text-muted-foreground" style={SMALL}>
                  {p.role}
                </T>
              </View>
            ))}
          </View>

          <View className="flex-row items-start gap-1.5 px-1">
            <Ionicons name="shield-checkmark-outline" size={12} color={colors.mutedForeground} />
            <T className="flex-1 font-lao text-muted-foreground" style={SMALL}>
              {t('staffPortal.messages.internalNotice')}
            </T>
          </View>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
