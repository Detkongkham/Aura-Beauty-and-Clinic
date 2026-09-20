import type { ChatMessageEvent, ChatMessageView, ChatReadEvent } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Socket } from 'socket.io-client';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { buildChatRows, DaySeparator, UnreadDivider, useDayLabel } from '../../components/chat/chatRows';
import { FooterBar } from '../../components/shared/FooterBar';
import { Avatar } from '../../components/ui/Avatar';
import { GlassView } from '../../components/ui/GlassView';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { useChatMessages, useSendChatMessage } from '../../features/appointments/chat.api';
import {
  useBlockedUsers,
  useBlockUser,
  useConversationMedia,
  useDirectConversation,
} from '../../features/messaging/messaging.api';
import { useThreadReadSync } from '../../features/messaging/useThreadReadSync';
import { cn } from '../../lib/cn';
import { formatTime, vientiane } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { qk } from '../../services/queryKeys';
import { connectAppSocket } from '../../services/socket';
import { useAuthStore } from '../../store/auth.store';
import { colors, shadow } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';
import {
  BlockedNotice,
  IconButton,
  ReportSheet,
  SafetyTips,
  SheetAction,
  SMALL,
  T,
  useConfirmUnblock,
} from './messaging.parts';

/** ເລື່ອນຂຶ້ນເກີນນີ້ (inverted = ຫ່າງຈາກລຸ່ມສຸດ) → ສະແດງປຸ່ມ "ໄປຂໍ້ຄວາມລ່າສຸດ". */
const JUMP_THRESHOLD = 240;

function shortStamp(iso: string): string {
  const d = vientiane(iso);
  return d.format('YYYY-MM-DD') === vientiane().format('YYYY-MM-DD') ? d.format('HH:mm') : d.format('DD/MM HH:mm');
}

/** ຮູບເຕັມຈໍ — ແຕະເພື່ອປິດ. */
function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }): React.JSX.Element {
  return (
    <Modal visible={uri !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/90"
        accessibilityRole="button"
        accessibilityLabel="close"
      >
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
      </Pressable>
    </Modal>
  );
}

function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number | string; label: string }): React.JSX.Element {
  return (
    <View className="flex-1 items-center gap-0.5 rounded-2xl border border-border bg-card py-2.5">
      <Ionicons name={icon} size={15} color={colors.primary} />
      <T className="font-sans-semibold text-foreground">{value}</T>
      <T className="font-lao text-muted-foreground" style={SMALL}>
        {label}
      </T>
    </View>
  );
}

/**
 * ຫ້ອງແຊັດ DIRECT ໜຶ່ງ (ໂມດູນ 38 Wave 8D). ຫົວແກ້ວລັອກ (avatar + ສະຖານະ) → sheet ຂໍ້ມູນຫ້ອງ
 * (ສະຖິຕິ, ຮູບທີ່ແບ່ງປັນ, ລາຍງານ/ບລັອກ). ລາຍການ inverted ຈັດກຸ່ມ + ຕົວຄັ່ນວັນ + ເສັ້ນ "ຂໍ້ຄວາມໃໝ່",
 * read receipt ແບບ live (`chat:read`), ປຸ່ມໄປລ່າສຸດ ແລະ ກົດຄ້າງຂໍ້ຄວາມ (ສຳເນົາ/ລາຍງານ).
 */
export function DirectThreadScreen({ navigation, route }: AppScreenProps<'DirectThread'>): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { threadId, title, locked } = route.params;
  const qc = useQueryClient();
  const myUserId = useAuthStore((s) => s.user?.id);
  const conversation = useDirectConversation(threadId);

  // snapshot unread ກ່ອນ useThreadReadSync ລ້າງ badge ໃນ cache — ໃຊ້ວາງເສັ້ນ "ຂໍ້ຄວາມໃໝ່".
  const [initialUnread] = useState(
    () =>
      qc
        .getQueryData<{ id: string; unreadCount: number }[]>(qk.conversations('DIRECT'))
        ?.find((c) => c.id === threadId)?.unreadCount ?? 0,
  );
  useThreadReadSync(threadId);

  const messages = useChatMessages(threadId);
  const send = useSendChatMessage(threadId);
  const blockUser = useBlockUser();
  const blocked = useBlockedUsers();
  const unblock = useConfirmUnblock();
  const media = useConversationMedia(threadId, true);
  const listRef = useRef<FlatList | null>(null);

  const [showJump, setShowJump] = useState(false);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const awayRef = useRef(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [selected, setSelected] = useState<ChatMessageView | null>(null);
  const [report, setReport] = useState<{ messageId?: string } | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  useEffect(() => {
    const socket: Socket = connectAppSocket();
    socket.emit('join-chat', { threadId });
    socket.emit('chat:read', { threadId });
    socket.on('chat:message', (evt: ChatMessageEvent) => {
      if (evt.threadId !== threadId) return;
      qc.setQueryData<ChatMessageView[]>(qk.chatMessages(threadId), (prev) =>
        prev?.some((m) => m.id === evt.id) ? prev : [...(prev ?? []), evt],
      );
      if (evt.senderId !== useAuthStore.getState().user?.id) {
        if (awayRef.current) setNewWhileAway((n) => n + 1);
        if (evt.messageType === 'IMAGE') void qc.invalidateQueries({ queryKey: ['conversations', 'media', threadId] });
      }
      // ເປີດຫ້ອງຢູ່ = ເຫັນຂໍ້ຄວາມແລ້ວ.
      socket.emit('chat:read', { threadId });
    });
    // ອີກຝ່າຍອ່ານ → ໝາຍ ✓✓ ໃຫ້ຂໍ້ຄວາມຂອງເຮົາທີ່ສົ່ງກ່ອນເວລານັ້ນ (live, ບໍ່ຕ້ອງ refetch).
    socket.on('chat:read', (evt: ChatReadEvent) => {
      if (evt.threadId !== threadId || evt.readerId === useAuthStore.getState().user?.id) return;
      qc.setQueryData<ChatMessageView[]>(qk.chatMessages(threadId), (prev) =>
        prev?.map((m) =>
          !m.readAt && m.senderId !== evt.readerId && m.createdAt <= evt.readAt ? { ...m, readAt: evt.readAt } : m,
        ),
      );
    });
    return () => {
      socket.emit('leave-chat', { threadId });
      socket.disconnect();
    };
  }, [threadId, qc]);

  const items = useMemo(() => messages.data ?? [], [messages.data]);
  const participants = conversation?.participants ?? [];
  const other =
    participants.find((p) => p.id !== myUserId) ??
    (() => {
      const m = items.find((x) => x.senderId !== myUserId);
      return m ? { id: m.senderId, name: m.senderName, role: m.senderRole } : undefined;
    })();
  const name = other?.name ?? title;
  const isLocked = conversation?.isLocked ?? locked ?? false;
  // ສະເພາະທີ່ຂ້ອຍບລັອກ — ຝ່າຍທີ່ບລັອກຂ້ອຍ API ບໍ່ເປີດເຜີຍ (ສົ່ງແລ້ວໄດ້ 409 ແທນ).
  const isBlocked = !!other && (blocked.data ?? []).some((b) => b.userId === other.id);

  // ຈຸດເລີ່ມ "ຂໍ້ຄວາມໃໝ່" — ຂໍ້ຄວາມທີ N ນັບຈາກທ້າຍ (ສະເພາະຂອງອີກຝ່າຍ), ຄິດຄັ້ງດຽວຕອນໂຫຼດສຳເລັດ.
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

  const sendQuick = (body: string): void => {
    haptics.select();
    send.mutate(body, { onError: (err) => Alert.alert('', normalizeError(err).message) });
  };

  const confirmBlock = (): void => {
    if (!other) return;
    setInfoOpen(false);
    Alert.alert(t('messaging.thread.blockConfirmTitle', { name: other.name }), t('messaging.thread.blockConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('messaging.blockAction'),
        style: 'destructive',
        onPress: () =>
          blockUser.mutate(other.id, {
            // ຢູ່ໜ້າເດີມ — BlockedNotice ແທນ composer ແລະ ຍົກເລີກໄດ້ທັນທີ.
            onSuccess: () => haptics.success(),
            onError: (err) => Alert.alert('', normalizeError(err).message),
          }),
      },
    ]);
  };

  /** ປິດ sheet ໜຶ່ງແລ້ວເປີດອີກອັນ — iOS ຊ້ອນ Modal ທັນທີບໍ່ໄດ້. */
  const openReport = (messageId?: string): void => {
    setInfoOpen(false);
    setSelected(null);
    setTimeout(() => setReport({ messageId }), 350);
  };

  const subtitle = isBlocked
    ? t('messaging.blocked.subtitle')
    : isLocked
    ? t('messaging.thread.lockedSubtitle')
    : conversation?.lastMessageAt
      ? t('messaging.thread.subtitleActive', { time: shortStamp(conversation.lastMessageAt) })
      : t('messaging.thread.subtitle', { count: conversation?.messageCount ?? items.length });

  const dateFmt = i18n.language === 'lo' ? 'DD/MM/YYYY' : 'D MMM YYYY';
  const quick = [t('messaging.thread.quickHello'), t('messaging.thread.quickHowAreYou'), t('messaging.thread.quickThanks')];

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
    if (messages.isError) {
      return (
        <View className="flex-1 items-center justify-center gap-3 px-10">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Ionicons name="cloud-offline-outline" size={24} color={colors.mutedForeground} />
          </View>
          <T className="text-center font-lao text-muted-foreground">{normalizeError(messages.error).message}</T>
          <Touchable
            onPress={() => void messages.refetch()}
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
    if (rows.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, gap: 14 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center gap-1.5">
            <Avatar name={name} size={64} mode="cartoon" />
            <T className="mt-1 text-center font-lao-semibold text-foreground">
              {t('messaging.thread.emptyTitle', { name })}
            </T>
            <T className="text-center font-lao text-muted-foreground">{t('messaging.thread.emptyBody')}</T>
          </View>
          {!isLocked && !isBlocked ? (
            <View className="gap-1.5">
              <T className="px-1 font-lao-medium text-muted-foreground">{t('messaging.thread.quickTitle')}</T>
              <View className="flex-row flex-wrap gap-1.5">
                {quick.map((q) => (
                  <Touchable
                    key={q}
                    onPress={() => sendQuick(q)}
                    disabled={send.isPending}
                    pressScale={0.96}
                    accessibilityRole="button"
                    className="min-h-[36px] flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3"
                  >
                    <T className="font-lao text-foreground">{q}</T>
                    <Ionicons name="arrow-up-circle" size={16} color={colors.aura400} />
                  </Touchable>
                ))}
              </View>
            </View>
          ) : null}
          <SafetyTips />
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
                  <T className="text-center font-lao text-muted-foreground">{r.item.body}</T>
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
                  <ChatBubble
                    item={r.item}
                    mine={r.mine}
                    showTime={r.last}
                    tail={r.last}
                    readReceipt
                    onLongPress={
                      r.item.messageType === 'TEXT' || !r.mine
                        ? () => {
                            haptics.tapPrimary();
                            setSelected(r.item);
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
      </View>
    );
  };

  const photos = media.data?.photos ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <GlassView
          intensity={24}
          style={[
            { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, zIndex: 2 },
            shadow.xs,
          ]}
        >
          <View className="h-14 flex-row items-center gap-1.5 px-2">
            <IconButton icon="chevron-back" label={t('common.back')} onPress={() => navigation.goBack()} />
            <Touchable
              onPress={() => setInfoOpen(true)}
              pressScale={0.98}
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${t('messaging.thread.info')}`}
              className="flex-1 flex-row items-center gap-2.5"
            >
              <View>
                <Avatar name={name} size={36} mode="cartoon" />
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
                <T className="font-lao-semibold text-foreground" numberOfLines={1}>
                  {name}
                </T>
                <T
                  className="font-lao"
                  style={[SMALL, { color: isBlocked ? colors.destructive : isLocked ? colors.warning : colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {subtitle}
                </T>
              </View>
            </Touchable>
            <IconButton
              icon="information-circle-outline"
              label={t('messaging.thread.info')}
              onPress={() => setInfoOpen(true)}
            />
          </View>
        </GlassView>

        {renderBody()}

        <FooterBar>
          {isBlocked && other ? (
            <BlockedNotice user={other} />
          ) : (
            <ChatComposer threadId={threadId} locked={isLocked} />
          )}
        </FooterBar>
      </KeyboardAvoidingView>

      {/* ຂໍ້ມູນຫ້ອງ */}
      <Sheet open={infoOpen} onClose={() => setInfoOpen(false)}>
        <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
          <View className="gap-3.5">
            <View className="items-center gap-1">
              <Avatar name={name} size={60} mode="cartoon" />
              <T className="mt-1 font-lao-semibold text-foreground">{name}</T>
              <T className="font-lao text-muted-foreground" style={SMALL}>
                {conversation
                  ? t('messaging.thread.since', { date: vientiane(conversation.createdAt).format(dateFmt) })
                  : ' '}
              </T>
              {isLocked ? (
                <View
                  className="mt-1 flex-row items-center gap-1 rounded-full px-2 py-0.5"
                  style={{ backgroundColor: colors.warningSoft }}
                >
                  <Ionicons name="lock-closed" size={10} color={colors.warning} />
                  <T className="font-lao-medium" style={[SMALL, { color: colors.warning }]}>
                    {t('messaging.thread.lockedSubtitle')}
                  </T>
                </View>
              ) : null}
            </View>

            <View className="flex-row gap-2">
              <Stat
                icon="chatbubble-outline"
                value={conversation?.messageCount ?? items.length}
                label={t('messaging.thread.statMessages')}
              />
              <Stat icon="image-outline" value={media.data?.photoCount ?? '–'} label={t('messaging.thread.statPhotos')} />
              <Stat icon="mic-outline" value={media.data?.voiceCount ?? '–'} label={t('messaging.thread.statVoice')} />
            </View>

            <View className="gap-1.5">
              <T className="px-1 font-lao-semibold text-muted-foreground">{t('messaging.thread.sharedPhotos')}</T>
              {media.isLoading ? (
                <View className="flex-row gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-[72px] flex-1 rounded-xl" />
                  ))}
                </View>
              ) : photos.length === 0 ? (
                <View className="items-center rounded-2xl border border-dashed border-border py-4">
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('messaging.thread.noPhotos')}
                  </T>
                </View>
              ) : (
                <View className="flex-row flex-wrap gap-1.5">
                  {photos.slice(0, 8).map((p) => (
                    <Touchable
                      key={p.id}
                      onPress={() => {
                        setInfoOpen(false);
                        setTimeout(() => setViewerUri(p.mediaUrl), 350);
                      }}
                      pressScale={0.95}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`${t('messaging.thread.photoMessage')} · ${p.senderName}`}
                      style={{ width: '23.5%', aspectRatio: 1 }}
                      className="overflow-hidden rounded-xl bg-muted"
                    >
                      <Image source={{ uri: p.mediaUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </Touchable>
                  ))}
                </View>
              )}
            </View>

            <View className="overflow-hidden rounded-2xl border border-border bg-card">
              <SheetAction
                icon="flag-outline"
                label={t('messaging.thread.reportConversation')}
                hint={t('messaging.thread.reportHint')}
                destructive
                onPress={() => openReport()}
              />
              <View className="ml-14 h-px bg-border" />
              {isBlocked && other ? (
                <SheetAction
                  icon="lock-open-outline"
                  label={t('messaging.blocked.unblockAction')}
                  hint={t('messaging.blocked.unblockHint')}
                  loading={unblock.pendingId === other.id}
                  onPress={() => {
                    setInfoOpen(false);
                    unblock.confirm(other);
                  }}
                />
              ) : (
                <SheetAction
                  icon="hand-left-outline"
                  label={t('messaging.blockAction')}
                  hint={t('messaging.thread.blockHint')}
                  destructive
                  disabled={!other}
                  loading={blockUser.isPending}
                  onPress={confirmBlock}
                />
              )}
            </View>
          </View>
        </ScrollView>
      </Sheet>

      {/* ເມນູຂໍ້ຄວາມ (ກົດຄ້າງ) */}
      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={t('messaging.thread.messageActions')}>
        {selected ? (
          <View className="gap-3">
            <View className="rounded-2xl bg-muted px-3.5 py-2.5">
              <T className="font-lao-medium text-muted-foreground" style={SMALL}>
                {selected.senderId === myUserId ? t('messaging.thread.you') : selected.senderName}
                {' · '}
                {formatTime(selected.createdAt)}
              </T>
              <T className="font-lao text-foreground" numberOfLines={4}>
                {selected.messageType === 'IMAGE'
                  ? t('messaging.thread.photoMessage')
                  : selected.messageType === 'AUDIO'
                    ? t('messaging.thread.voiceMessage')
                    : selected.body}
              </T>
            </View>
            <View className="overflow-hidden rounded-2xl border border-border bg-card">
              {selected.messageType === 'TEXT' ? (
                <SheetAction
                  icon="copy-outline"
                  label={t('messaging.thread.copy')}
                  onPress={() => {
                    void Clipboard.setStringAsync(selected.body);
                    haptics.success();
                    setSelected(null);
                  }}
                />
              ) : null}
              {selected.senderId !== myUserId ? (
                <>
                  {selected.messageType === 'TEXT' ? <View className="ml-14 h-px bg-border" /> : null}
                  <SheetAction
                    icon="flag-outline"
                    label={t('messaging.thread.reportMessage')}
                    hint={t('messaging.thread.reportHint')}
                    destructive
                    onPress={() => openReport(selected.id)}
                  />
                </>
              ) : null}
            </View>
          </View>
        ) : null}
      </Sheet>

      {report ? (
        <ReportSheet threadId={threadId} messageId={report.messageId} open onClose={() => setReport(null)} />
      ) : null}

      <PhotoViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
    </SafeAreaView>
  );
}
