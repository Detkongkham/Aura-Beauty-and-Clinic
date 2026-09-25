import type { ChatMessageView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Modal, Pressable, View } from 'react-native';
import { Text } from '../ui/Text';
import { Touchable } from '../ui/Touchable';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { cn } from '../../lib/cn';
import { formatTime } from '../../lib/format';
import { colors } from '../../theme';

function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

/**
 * ໜຶ່ງກ້ອນຂໍ້ຄວາມ — TEXT/IMAGE/AUDIO (ອັດສຽງ). ໃຊ້ຮ່ວມກັນທຸກໜ້າແຊັດ (`ChatScreen`,
 * `StaffThreadScreen`, `DirectThreadScreen`) ບໍ່ໃຫ້ code ຊ້ຳກັນ 3 ບ່ອນ.
 */
export function ChatBubble({
  item,
  mine,
  showTime = true,
  readReceipt = false,
  tail = true,
  onLongPress,
}: {
  item: ChatMessageView;
  mine: boolean;
  /** ສະແດງເວລາໃຕ້ກ້ອນ — ໜ້າທີ່ຈັດກຸ່ມຂໍ້ຄວາມຕິດກັນ ປິດໄວ້ ຍົກເວັ້ນກ້ອນສຸດທ້າຍຂອງກຸ່ມ. */
  showTime?: boolean;
  /** ສະແດງ ✓ / ✓✓ (readAt) ຂ້າງເວລາ ສຳລັບຂໍ້ຄວາມຂອງຕົນເອງ. */
  readReceipt?: boolean;
  /** ມຸມແຫຼມຝັ່ງຜູ້ສົ່ງ (ກ້ອນສຸດທ້າຍຂອງກຸ່ມ). false = ມົນທຸກມຸມ. */
  tail?: boolean;
  /** ກົດຄ້າງ — ເປີດເມນູຂໍ້ຄວາມ (ສຳເນົາ/ລາຍງານ). */
  onLongPress?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const tailStyle = tail ? (mine ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }) : undefined;
  return (
    <View className={cn('max-w-[80%] gap-0.5', mine ? 'self-end items-end' : 'self-start items-start')}>
      {item.messageType === 'IMAGE' && item.mediaUrl ? (
        <ImageBubble uri={item.mediaUrl} caption={item.body} mine={mine} onLongPress={onLongPress} />
      ) : item.messageType === 'AUDIO' && item.mediaUrl ? (
        <AudioBubble uri={item.mediaUrl} mine={mine} onLongPress={onLongPress} />
      ) : (
        <Pressable
          onLongPress={onLongPress}
          disabled={!onLongPress}
          delayLongPress={320}
          className={cn('rounded-2xl px-3 py-2', mine ? 'bg-primary' : 'border border-border bg-card')}
          style={tailStyle}
        >
          <T selectable={!onLongPress} className={cn('font-lao', mine ? 'text-primary-foreground' : 'text-foreground')}>
            {item.body}
          </T>
        </Pressable>
      )}
      {showTime ? (
        <View className="flex-row items-center gap-1 px-1">
          <T className="text-muted-foreground">{formatTime(item.createdAt)}</T>
          {mine && readReceipt ? (
            <Ionicons
              name={item.readAt ? 'checkmark-done' : 'checkmark'}
              size={13}
              color={item.readAt ? colors.primary : colors.mutedForeground}
              accessibilityLabel={item.readAt ? t('chat.read') : t('chat.sent')}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ImageBubble({
  uri,
  caption,
  mine,
  onLongPress,
}: {
  uri: string;
  caption: string;
  mine: boolean;
  onLongPress?: () => void;
}): React.JSX.Element {
  const [fullscreen, setFullscreen] = useState(false);
  const hasCaption = caption && !caption.startsWith('📷');

  return (
    <>
      <Touchable onPress={() => setFullscreen(true)} onLongPress={onLongPress} delayLongPress={320} pressScale={0.97}>
        <View className={cn('overflow-hidden rounded-xl', mine ? 'bg-primary' : 'bg-muted')}>
          <Image source={{ uri }} style={{ width: 200, height: 200 }} resizeMode="cover" />
          {hasCaption ? (
            <View className="px-3 py-2">
              <T className={cn('font-lao', mine ? 'text-primary-foreground' : 'text-foreground')}>{caption}</T>
            </View>
          ) : null}
        </View>
      </Touchable>

      <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <Pressable
          onPress={() => setFullscreen(false)}
          className="flex-1 items-center justify-center bg-black/90"
          accessibilityRole="button"
          accessibilityLabel="close"
        >
          <Image source={{ uri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
        </Pressable>
      </Modal>
    </>
  );
}

function AudioBubble({
  uri,
  mine,
  onLongPress,
}: {
  uri: string;
  mine: boolean;
  onLongPress?: () => void;
}): React.JSX.Element {
  const { isPlaying, isLoading, toggle, positionMs, durationMs } = useAudioPlayer(uri);
  const progress = durationMs ? Math.min(1, positionMs / durationMs) : 0;
  const clock = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const label = durationMs == null ? null : isPlaying || positionMs > 0 ? clock(positionMs) : clock(durationMs);

  return (
    <Touchable
      onPress={() => void toggle()}
      onLongPress={onLongPress}
      delayLongPress={320}
      pressScale={0.97}
      className={cn(
        'flex-row items-center gap-2 rounded-full px-4 py-2.5',
        mine ? 'bg-primary' : 'bg-muted',
      )}
    >
      <Ionicons
        name={isLoading ? 'ellipsis-horizontal' : isPlaying ? 'pause' : 'play'}
        size={16}
        color={mine ? colors.primaryForeground : colors.foreground}
      />
      <View className="h-1 w-24 overflow-hidden rounded-full bg-primary-foreground/30">
        <View
          className={cn('h-full', mine ? 'bg-primary-foreground' : 'bg-primary')}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </View>
      {label ? (
        <Text
          className={cn('font-sans', mine ? 'text-primary-foreground' : 'text-muted-foreground')}
          style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}
        >
          {label}
        </Text>
      ) : (
        <Ionicons name="mic" size={13} color={mine ? colors.primaryForeground : colors.mutedForeground} />
      )}
    </Touchable>
  );
}
