import type { ChatMessageView } from '@abcp/shared-types';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { vientiane } from '../../lib/format';
import { colors } from '../../theme';
import { Text } from '../ui/Text';

function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

export const LAO_DOW = ['ອາທິດ', 'ຈັນ', 'ອັງຄານ', 'ພຸດ', 'ພະຫັດ', 'ສຸກ', 'ເສົາ'] as const;

/** ຂໍ້ຄວາມຕິດກັນຈາກຄົນດຽວກັນ ພາຍໃນ 5 ນາທີ = ກຸ່ມດຽວ (ເຊື່ອງເວລາ/ຊື່ ລະຫວ່າງກາງ). */
const GROUP_GAP_MS = 5 * 60 * 1000;

export type ChatRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'unread'; key: string }
  | {
      kind: 'msg';
      key: string;
      item: ChatMessageView;
      mine: boolean;
      /** ກ້ອນທຳອິດຂອງກຸ່ມ (ສະແດງຊື່ຜູ້ສົ່ງ). */
      first: boolean;
      /** ກ້ອນສຸດທ້າຍຂອງກຸ່ມ (ເວລາ + avatar + ມຸມແຫຼມ). */
      last: boolean;
    };

const dayKey = (iso: string): string => vientiane(iso).format('YYYY-MM-DD');

/**
 * ປ່ຽນລາຍການຂໍ້ຄວາມ (ເກົ່າ→ໃໝ່) ເປັນແຖວ + ຕົວຄັ່ນວັນ (+ ເສັ້ນ "ຂໍ້ຄວາມໃໝ່" ກ່ອນ `unreadFromId`),
 * ແລ້ວ reverse ສຳລັບ FlatList inverted. ໃຊ້ຮ່ວມກັນ `ChatScreen` ແລະ `DirectThreadScreen`.
 */
export function buildChatRows(
  items: ChatMessageView[],
  myUserId: string | undefined,
  dayLabel: (iso: string) => string,
  unreadFromId?: string | null,
): ChatRow[] {
  const rows: ChatRow[] = [];
  const joins = (a?: ChatMessageView, b?: ChatMessageView): boolean =>
    !!a &&
    !!b &&
    a.senderId === b.senderId &&
    a.messageType !== 'SYSTEM' &&
    b.messageType !== 'SYSTEM' &&
    b.id !== unreadFromId &&
    Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) < GROUP_GAP_MS &&
    dayKey(a.createdAt) === dayKey(b.createdAt);

  items.forEach((m, i) => {
    const prev = items[i - 1];
    const next = items[i + 1];
    if (!prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)) {
      rows.push({ kind: 'day', key: `day-${dayKey(m.createdAt)}`, label: dayLabel(m.createdAt) });
    }
    if (m.id === unreadFromId) rows.push({ kind: 'unread', key: 'unread-divider' });
    rows.push({
      kind: 'msg',
      key: m.id,
      item: m,
      mine: m.senderId === myUserId,
      first: !joins(prev, m),
      last: !joins(m, next),
    });
  });
  return rows.reverse();
}

/** ປ້າຍວັນ: ມື້ນີ້ / ມື້ວານ / "ພຸດ 17 Sep 2026". ໃຊ້ `vientiane()` (Hermes ບໍ່ມີ Intl tz). */
export function useDayLabel(): (iso: string) => string {
  const { t, i18n } = useTranslation();
  return useCallback(
    (iso: string) => {
      const d = vientiane(iso);
      const key = d.format('YYYY-MM-DD');
      if (key === vientiane().format('YYYY-MM-DD')) return t('chat.today');
      if (key === vientiane().subtract(1, 'day').format('YYYY-MM-DD')) return t('chat.yesterday');
      const dow = i18n.language === 'lo' ? LAO_DOW[d.day()] : d.format('ddd');
      return `${dow} ${d.format('D MMM YYYY')}`;
    },
    [t, i18n.language],
  );
}

export function DaySeparator({ label }: { label: string }): React.JSX.Element {
  return (
    <View className="my-2 items-center" accessibilityRole="header">
      <View className="rounded-full bg-muted px-2.5 py-0.5">
        <T className="font-lao-medium text-muted-foreground">{label}</T>
      </View>
    </View>
  );
}

/** ເສັ້ນ "ຂໍ້ຄວາມໃໝ່" — ໝາຍຈຸດທີ່ຍັງບໍ່ໄດ້ອ່ານ ຕອນເປີດຫ້ອງ. */
export function UnreadDivider(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className="my-2.5 flex-row items-center gap-2 px-2" accessibilityRole="header">
      <View className="h-px flex-1" style={{ backgroundColor: colors.aura300 }} />
      <T className="font-lao-medium text-primary">{t('messaging.thread.newMessages')}</T>
      <View className="h-px flex-1" style={{ backgroundColor: colors.aura300 }} />
    </View>
  );
}
