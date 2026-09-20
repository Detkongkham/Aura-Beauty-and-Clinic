import type { ConversationListItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { vientiane } from '../../lib/format';
import { colors } from '../../theme';
import { Avatar } from '../ui/Avatar';
import { Text } from '../ui/Text';
import { Touchable } from '../ui/Touchable';

const SMALL = { fontSize: 10, lineHeight: 14 } as const;

function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

const LAO_WEEKDAYS = ['ອາທິດ', 'ຈັນ', 'ອັງຄານ', 'ພຸດ', 'ພະຫັດ', 'ສຸກ', 'ເສົາ'];
const EN_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** ເວລາສັ້ນໃນ list: ມື້ນີ້ → HH:mm, ພາຍໃນອາທິດ → ຊື່ມື້, ເກົ່າກວ່າ → DD/MM/YY. ໃຊ້ `vientiane()` ບໍ່ແມ່ນ
 * `.tz()` / Intl ເພາະ Hermes ບໍ່ມີ timezone/locale data. */
function compactStamp(iso: string, lang: string): string {
  const d = vientiane(iso);
  const now = vientiane();
  if (d.format('YYYY-MM-DD') === now.format('YYYY-MM-DD')) return d.format('HH:mm');
  if (now.startOf('day').diff(d.startOf('day'), 'day') < 7) {
    return (lang === 'lo' ? LAO_WEEKDAYS : EN_WEEKDAYS)[d.day()] ?? d.format('DD/MM');
  }
  return d.format('DD/MM/YY');
}

function previewText(
  c: ConversationListItem,
  myUserId: string | undefined,
  isGroup: boolean,
  t: TFunction,
): string {
  const last = c.lastMessage;
  if (!last) return t('messaging.noMessagesYet');
  const body =
    last.messageType === 'IMAGE'
      ? t('messaging.preview.photo')
      : last.messageType === 'AUDIO'
        ? t('messaging.preview.voice')
        : last.body;
  if (last.senderId === myUserId) return t('messaging.preview.you', { body });
  if (isGroup) return `${last.senderName.trim().split(/\s+/)[0] ?? last.senderName}: ${body}`;
  return body;
}

/** ແຖວ inbox ຮ່ວມກັນລະຫວ່າງ staff `ConversationListScreen` ແລະ customer `DirectMessagesScreen` —
 * avatar, preview ຂໍ້ຄວາມລ່າສຸດ, ເວລາ, unread badge ແລະ ໄອຄອນ lock. */
export function ConversationRow({
  conversation: c,
  myUserId,
  onPress,
  onLongPress,
  variant = 'card',
}: {
  conversation: ConversationListItem;
  myUserId: string | undefined;
  onPress: (title: string) => void;
  /** ກົດຄ້າງ — ເມນູດ່ວນຂອງຫ້ອງ. */
  onLongPress?: () => void;
  /** `card` = ກ້ອນມີຂອບ (staff list); `plain` = ແຖວໂປ່ງ ວາງໃນ grouped section (customer inbox). */
  variant?: 'card' | 'plain';
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const others = c.participants.filter((p) => p.id !== myUserId);
  const isGroup = others.length > 1;
  const title = others.map((p) => p.name).join(', ') || c.title || t('messaging.untitled');
  const unread = c.unreadCount > 0;
  const last = c.lastMessage;
  const mine = last?.senderId === myUserId;
  const mediaIcon =
    last?.messageType === 'IMAGE' ? 'image-outline' : last?.messageType === 'AUDIO' ? 'mic-outline' : null;

  return (
    <Touchable
      onPress={() => onPress(title)}
      onLongPress={onLongPress}
      delayLongPress={350}
      pressScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={
        unread ? `${title}, ${t('messaging.unreadMessages', { count: c.unreadCount })}` : title
      }
      className={
        variant === 'card'
          ? 'flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3'
          : 'flex-row items-center gap-3 px-3.5 py-3'
      }
    >
      <View>
        {isGroup ? (
          <View style={{ width: 44, height: 44 }}>
            <View style={{ position: 'absolute', left: 0, top: 0 }}>
              <Avatar name={others[0]!.name} size={32} mode="cartoon" />
            </View>
            <View
              style={{ position: 'absolute', right: 0, bottom: 0, borderRadius: 999, borderWidth: 2, borderColor: colors.card }}
            >
              {others.length > 2 ? (
                <View className="h-7 w-7 items-center justify-center rounded-full bg-primary">
                  <T className="font-sans-semibold text-white" style={SMALL}>
                    +{others.length - 1}
                  </T>
                </View>
              ) : (
                <Avatar name={others[1]!.name} size={28} mode="cartoon" />
              )}
            </View>
          </View>
        ) : (
          <Avatar name={others[0]?.name ?? title} size={44} mode="cartoon" />
        )}
        {c.isLocked ? (
          <View
            className="absolute -bottom-0.5 -right-0.5 h-[18px] w-[18px] items-center justify-center rounded-full"
            style={{ backgroundColor: colors.warning, borderWidth: 2, borderColor: colors.card }}
          >
            <Ionicons name="lock-closed" size={9} color="#FFFFFF" />
          </View>
        ) : null}
      </View>

      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <T
            numberOfLines={1}
            className={`flex-1 font-lao text-foreground ${unread ? 'font-lao-semibold' : 'font-lao-medium'}`}
          >
            {title}
          </T>
          <T
            className={unread ? 'font-sans-semibold text-primary' : 'text-muted-foreground'}
            style={SMALL}
          >
            {compactStamp(c.lastMessageAt ?? c.createdAt, i18n.language)}
          </T>
        </View>
        <View className="flex-row items-center gap-1.5">
          {mine ? <Ionicons name="checkmark-done" size={13} color={colors.primary} /> : null}
          {mediaIcon ? (
            <Ionicons name={mediaIcon} size={13} color={unread ? colors.foreground : colors.mutedForeground} />
          ) : null}
          <T
            numberOfLines={1}
            className={`flex-1 font-lao ${unread ? 'text-foreground' : 'text-muted-foreground'}`}
            style={SMALL}
          >
            {previewText(c, myUserId, isGroup, t)}
          </T>
          {unread ? (
            <View className="h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5">
              <T className="font-sans-semibold text-white" style={SMALL}>
                {c.unreadCount > 99 ? '99+' : c.unreadCount}
              </T>
            </View>
          ) : null}
        </View>
      </View>
    </Touchable>
  );
}
