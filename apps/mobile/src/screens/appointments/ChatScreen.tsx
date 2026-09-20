import type { ChatMessageEvent, ChatMessageView, ChatThreadView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Socket } from 'socket.io-client';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { buildChatRows, DaySeparator, LAO_DOW, useDayLabel } from '../../components/chat/chatRows';
import { FooterBar } from '../../components/shared/FooterBar';
import { ErrorView, LoadingScreen } from '../../components/shared/StateViews';
import { Avatar } from '../../components/ui/Avatar';
import { GlassView } from '../../components/ui/GlassView';
import { Skeleton } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { useChatMessages, useChatThread, useSendChatMessage } from '../../features/appointments/chat.api';
import { cn } from '../../lib/cn';
import { formatTime, vientiane } from '../../lib/format';
import { normalizeError } from '../../services/apiError';
import { qk } from '../../services/queryKeys';
import { connectAppSocket } from '../../services/socket';
import { useAuthStore } from '../../store/auth.store';
import { colors, shadow } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

/** ຂໍ້ຄວາມ 12px ຄົງທີ່ — ດຽວກັນກັບ AppointmentDetailScreen. */
function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

/** ຫົວແຊັດ — ຊ່າງ/ຮ້ານ + ປຸ່ມໂທ. */
function ChatHeader({
  thread,
  onBack,
}: {
  thread: ChatThreadView;
  onBack: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const name = thread.staffName ?? t('chat.staffFallback');
  const subtitle = [thread.staffTitle, thread.branchName].filter(Boolean).join(' · ');
  return (
    <View className="h-14 flex-row items-center gap-2 px-2">
      <Touchable
        onPress={onBack}
        hitSlop={8}
        pressScale={0.9}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        className="h-9 w-9 items-center justify-center rounded-full"
      >
        <Ionicons name="chevron-back" size={24} color={colors.primary} />
      </Touchable>
      <Avatar uri={thread.staffAvatarUrl} name={name} size={36} mode="cartoon" />
      <View className="flex-1">
        <T className="font-lao-semibold text-foreground" numberOfLines={1}>
          {name}
        </T>
        {subtitle ? (
          <T className="text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {thread.branchPhone ? (
        <Touchable
          onPress={() => void Linking.openURL(`tel:${thread.branchPhone.replace(/[^\d+]/g, '')}`)}
          hitSlop={6}
          pressScale={0.9}
          accessibilityRole="button"
          accessibilityLabel={t('appointments.callStore')}
          className="mr-1 h-9 w-9 items-center justify-center rounded-full bg-primary-subtle"
        >
          <Ionicons name="call-outline" size={16} color={colors.primaryStrong} />
        </Touchable>
      ) : null}
    </View>
  );
}

/** ບັດບໍລິບົດນັດໝາຍ — ປັກໄວ້ໃຕ້ຫົວແຊັດ, ແຕະເພື່ອເປີດລາຍລະອຽດ. */
function AppointmentContext({ thread, onPress }: { thread: ChatThreadView; onPress: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const start = vientiane(thread.appointmentStartAt);
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={t('chat.aboutAppointment')}
      className="mx-3 mb-2 flex-row items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2"
    >
      <View className="h-8 w-8 items-center justify-center rounded-xl bg-primary-subtle">
        <Ionicons name="calendar-outline" size={15} color={colors.primary} />
      </View>
      <View className="flex-1">
        <T className="font-lao-medium text-foreground" numberOfLines={1}>
          {thread.serviceName}
        </T>
        <T className="text-muted-foreground" numberOfLines={1}>
          {LAO_DOW[start.day()]} {start.format('D MMM')} · {formatTime(thread.appointmentStartAt)} ·{' '}
          {t(`status.${thread.appointmentStatus}`)}
        </T>
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.mutedForeground} />
    </Touchable>
  );
}

export function ChatScreen({ navigation, route }: AppScreenProps<'Chat'>): React.JSX.Element {
  const { t } = useTranslation();
  const { appointmentId } = route.params;
  const qc = useQueryClient();
  const myUserId = useAuthStore((s) => s.user?.id);

  const thread = useChatThread(appointmentId);
  const threadId = thread.data?.id;
  const messages = useChatMessages(threadId);
  const send = useSendChatMessage(threadId);

  useEffect(() => {
    if (!threadId) return undefined;
    const socket: Socket = connectAppSocket();
    socket.emit('join-chat', { threadId });

    socket.on('chat:message', (evt: ChatMessageEvent) => {
      if (evt.threadId !== threadId) return;
      qc.setQueryData<ChatMessageView[]>(qk.chatMessages(threadId), (prev) =>
        prev?.some((m) => m.id === evt.id) ? prev : [...(prev ?? []), evt],
      );
    });

    return () => {
      socket.emit('leave-chat', { threadId });
      socket.disconnect();
    };
  }, [threadId, qc]);

  const dayLabel = useDayLabel();
  const rows = useMemo(
    () => buildChatRows(messages.data ?? [], myUserId, dayLabel),
    [messages.data, myUserId, dayLabel],
  );

  if (thread.isLoading) return <LoadingScreen />;
  if (thread.isError || !thread.data) {
    return <ErrorView message={normalizeError(thread.error).message} onRetry={() => thread.refetch()} />;
  }

  const th = thread.data;
  const staffName = th.staffName ?? t('chat.staffFallback');
  const isEmpty = !messages.isLoading && rows.length === 0;
  const suggestions = [t('chat.suggestHello'), t('chat.suggestLate'), t('chat.suggestPrep'), t('chat.suggestParking')];

  const sendQuick = (body: string): void => {
    send.mutate(body, { onError: (err) => Alert.alert('', normalizeError(err).message) });
  };

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
          <ChatHeader thread={th} onBack={() => navigation.goBack()} />
          <AppointmentContext
            thread={th}
            onPress={() => navigation.navigate('AppointmentDetail', { id: th.appointmentId })}
          />
        </GlassView>

        {messages.isLoading ? (
          <View className="flex-1 justify-end gap-2 p-4">
            <Skeleton className="h-9 w-40 self-start rounded-2xl" />
            <Skeleton className="h-9 w-52 self-end rounded-2xl" />
            <Skeleton className="h-9 w-32 self-start rounded-2xl" />
          </View>
        ) : isEmpty ? (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="items-center gap-2">
              <Avatar uri={th.staffAvatarUrl} name={staffName} size={64} mode="cartoon" />
              <T className="font-lao-semibold text-foreground">{t('chat.emptyTitle')}</T>
              <T className="text-center font-lao text-muted-foreground">
                {t('chat.emptyBody', { name: staffName })}
              </T>
              <View className="flex-row items-center gap-1">
                <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
                <T className="text-muted-foreground">{t('chat.replyHint')}</T>
              </View>
            </View>
            <View className="gap-2">
              <T className="px-1 font-lao-medium text-muted-foreground">{t('chat.suggestionsTitle')}</T>
              {suggestions.map((s) => (
                <Touchable
                  key={s}
                  onPress={() => sendQuick(s)}
                  disabled={send.isPending}
                  pressScale={0.98}
                  accessibilityRole="button"
                  className="flex-row items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5"
                >
                  <Ionicons name="chatbubble-outline" size={14} color={colors.primary} />
                  <T className="flex-1 font-lao text-foreground">{s}</T>
                  <Ionicons name="arrow-up-circle" size={18} color={colors.aura300} />
                </Touchable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={(r) => r.key}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: r }) => {
              if (r.kind === 'day') return <DaySeparator label={r.label} />;
              if (r.kind === 'unread') return null;
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
                    {!r.mine && r.first ? (
                      <T className="mb-0.5 px-1 font-lao-medium text-muted-foreground">{r.item.senderName}</T>
                    ) : null}
                    <ChatBubble item={r.item} mine={r.mine} showTime={r.last} tail={r.last} readReceipt />
                  </View>
                </View>
              );
            }}
          />
        )}

        {threadId ? (
          <FooterBar>
            <ChatComposer threadId={threadId} />
          </FooterBar>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
