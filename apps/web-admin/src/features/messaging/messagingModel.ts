import type { ConversationListItem } from '@abcp/shared-types';
import type { TFunction } from 'i18next';

import { dayjs } from '@/lib/format';
import { APP_TIMEZONE } from '@/lib/constants';

export type Participant = ConversationListItem['participants'][number];

/** Inbox filter tabs. `direct` = 1:1, `group` = 3+ people. */
export type InboxFilter = 'all' | 'unread' | 'direct' | 'group';

export const INBOX_FILTERS: InboxFilter[] = ['all', 'unread', 'direct', 'group'];

export interface ConversationRow {
  conversation: ConversationListItem;
  /** First other person's name. The rest go into `extraCount` so long groups don't overflow the row. */
  label: string;
  extraCount: number;
  /** Every other member's name, for the tooltip and search. */
  fullNames: string;
  others: Participant[];
  isGroup: boolean;
}

export function toConversationRow(
  c: ConversationListItem,
  userId: string | undefined,
  fallback: string,
): ConversationRow {
  const others = c.participants.filter((p) => p.id !== userId);
  const fullNames = others.map((p) => p.name).join(', ') || c.title || fallback;
  const label = others[0]?.name ?? c.title ?? fallback;
  return {
    conversation: c,
    label,
    extraCount: Math.max(others.length - 1, 0),
    fullNames,
    others,
    isGroup: others.length > 1,
  };
}

export function matchesFilter(row: ConversationRow, filter: InboxFilter): boolean {
  switch (filter) {
    case 'unread':
      return row.conversation.unreadCount > 0;
    case 'direct':
      return !row.isGroup;
    case 'group':
      return row.isGroup;
    default:
      return true;
  }
}

/** Search hits member names and the last message text. */
export function matchesQuery(row: ConversationRow, q: string): boolean {
  if (!q) return true;
  return (
    row.fullNames.toLowerCase().includes(q) ||
    (row.conversation.lastMessage?.body.toLowerCase().includes(q) ?? false)
  );
}

export type MediaKind = 'IMAGE' | 'AUDIO' | 'TEXT';

export function mediaKind(messageType: string | undefined): MediaKind {
  return messageType === 'IMAGE' || messageType === 'AUDIO' ? messageType : 'TEXT';
}

/** One-line preview under the name: "You: …" for your own message, "Name: …" in groups. */
export function previewText(row: ConversationRow, userId: string | undefined, t: TFunction): string {
  const last = row.conversation.lastMessage;
  if (!last) return t('messaging.noMessagesYet');
  const kind = mediaKind(last.messageType);
  const body =
    kind === 'IMAGE' ? t('messaging.preview.photo') : kind === 'AUDIO' ? t('messaging.preview.voice') : last.body;
  if (last.senderId === userId) return t('messaging.preview.you', { body });
  if (row.isGroup) return `${firstName(last.senderName)}: ${body}`;
  return body;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Date bucket for list sections — Vientiane-local, like the thread's day dividers. */
export type RecencyBucket = 'today' | 'yesterday' | 'week' | 'older' | 'never';

export function recencyBucket(value: string | null): RecencyBucket {
  if (!value) return 'never';
  const now = dayjs().tz(APP_TIMEZONE);
  const d = dayjs(value).tz(APP_TIMEZONE);
  if (d.isSame(now, 'day')) return 'today';
  if (d.isSame(now.subtract(1, 'day'), 'day')) return 'yesterday';
  if (now.diff(d, 'day') < 7) return 'week';
  return 'older';
}

const LAO_WEEKDAYS = ['ອາທິດ', 'ຈັນ', 'ອັງຄານ', 'ພຸດ', 'ພະຫັດ', 'ສຸກ', 'ເສົາ'];

/** Short list timestamp: time today, weekday this week, date after that. */
export function compactStamp(value: string | null, locale: string): string {
  if (!value) return '';
  const d = dayjs(value).tz(APP_TIMEZONE);
  switch (recencyBucket(value)) {
    case 'today':
      return d.format('HH:mm');
    case 'yesterday':
    case 'week':
      // dayjs has no Lao locale loaded, and not every browser ships Lao weekday names for Intl.
      return locale === 'lo' ? (LAO_WEEKDAYS[d.day()] ?? d.format('ddd')) : d.format('ddd');
    default:
      return d.format('DD/MM/YY');
  }
}
