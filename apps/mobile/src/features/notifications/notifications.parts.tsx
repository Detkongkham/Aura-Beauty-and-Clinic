import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { GlassView } from '../../components/ui/GlassView';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { vientiane } from '../../lib/format';
import { colors, shadow } from '../../theme';
import type { AppStackParamList } from '../../navigation/types';
import { T } from '../home/home.parts';
import type { AppNotification, NotificationModule } from './notifications.api';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** ຕົວກອງ: ທັງໝົດ / ຍັງບໍ່ອ່ານ / ສຳຄັນ / ໜຶ່ງ module. */
export type Filter = 'all' | 'unread' | 'alerts' | `m:${NotificationModule}`;
export type Bucket = 'today' | 'week' | 'earlier';

export const MODULE_ICON: Record<NotificationModule, IoniconName> = {
  appointments: 'calendar',
  waitlist: 'hourglass',
  homeService: 'car',
  staff: 'people',
  inventory: 'cube',
  payments: 'card',
  giftCards: 'gift',
  loyalty: 'diamond',
  marketing: 'pricetag',
  system: 'notifications',
};

type Tone = { bg: string; fg: string };

const moduleTone = (): Record<NotificationModule, Tone> => ({
  appointments: { bg: 'bg-primary-subtle', fg: colors.primary },
  waitlist: { bg: 'bg-warning-soft', fg: colors.warning },
  homeService: { bg: 'bg-primary-subtle', fg: colors.primary },
  staff: { bg: 'bg-muted', fg: colors.mutedForeground },
  inventory: { bg: 'bg-muted', fg: colors.mutedForeground },
  payments: { bg: 'bg-success-soft', fg: colors.success },
  giftCards: { bg: 'bg-accent-soft', fg: colors.accentForeground },
  loyalty: { bg: 'bg-accent-soft', fg: colors.accentForeground },
  marketing: { bg: 'bg-destructive-soft', fg: colors.destructive },
  system: { bg: 'bg-muted', fg: colors.mutedForeground },
});

/** severity ຄຸມ tone ກ່ອນ module — ເລື່ອງດ່ວນຕ້ອງເຫັນທັນທີ. */
export function toneOf(n: AppNotification): Tone {
  if (n.severity === 'critical') return { bg: 'bg-destructive-soft', fg: colors.destructive };
  if (n.severity === 'warning') return { bg: 'bg-warning-soft', fg: colors.warning };
  const map = moduleTone();
  return map[n.module] ?? map.system;
}

export function moduleLabel(t: TFunction, m: NotificationModule): string {
  return t(`notifications.modules.${m}`, { defaultValue: t('notifications.modules.system') });
}

export function bucketOf(iso: string): Bucket {
  const days = vientiane().startOf('day').diff(vientiane(iso).startOf('day'), 'day');
  if (days <= 0) return 'today';
  if (days < 7) return 'week';
  return 'earlier';
}

export function relativeTime(t: TFunction, iso: string): string {
  const mins = vientiane().diff(vientiane(iso), 'minute');
  if (mins < 1) return t('notifications.justNow');
  if (mins < 60) return t('notifications.minutesAgo', { count: mins });
  if (mins < 24 * 60) return t('notifications.hoursAgo', { count: Math.floor(mins / 60) });
  return vientiane(iso).format('D MMM · HH:mm');
}

export function fullTime(iso: string): string {
  return vientiane(iso).format('D MMM YYYY · HH:mm');
}

export type Target = {
  [K in keyof AppStackParamList]: [K, AppStackParamList[K]];
}[keyof AppStackParamList];

/** deep link ຈາກ `data` ທີ່ backend ແນບມາກັບ notifyUser — null = ບໍ່ມີໜ້າປາຍທາງ. */
export function targetOf(n: AppNotification): Target | null {
  const str = (k: string): string | null =>
    typeof n.data?.[k] === 'string' ? (n.data[k] as string) : null;
  const appointmentId = str('appointmentId');
  if (n.module === 'homeService' && appointmentId)
    return ['HomeServiceTracking', { appointmentId }];
  // ຜົນກວດສະລິບ / ໃບຮັບເງິນ → ໜ້າຈ່າຍເງິນຂອງນັດນັ້ນ (ເຫັນສະຖານະສະລິບ)
  if (n.module === 'payments' && appointmentId) return ['Payment', { appointmentId }];
  if (appointmentId) return ['AppointmentDetail', { id: appointmentId }];
  if (n.module === 'waitlist' && str('serviceId')) {
    return ['ServiceDetail', { serviceId: str('serviceId')! }];
  }
  if (n.module === 'giftCards') return ['GiftCards', undefined];
  if (n.module === 'loyalty') return ['Loyalty', undefined];
  if (n.module === 'marketing') return ['ServiceList', {}];
  return null;
}

// ---- header pieces ---------------------------------------------------------

/** ຊ່ອງຄົ້ນຫາແໜ້ນ (h-9) — ຂະໜາດຕົວໜັງສື 12px ຄືກັນກັບທັງໜ້າ. */
export function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className="h-9 flex-row items-center gap-2 rounded-full border border-border bg-card px-3">
      <Ionicons name="search" size={14} color={colors.mutedForeground} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t('notifications.searchPlaceholder')}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        returnKeyType="search"
        accessibilityLabel={t('notifications.searchPlaceholder')}
        className="h-9 flex-1 font-lao text-foreground"
        style={{ fontSize: 12, paddingVertical: 0 }}
      />
      {value.length > 0 ? (
        <Touchable
          onPress={() => onChange('')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        >
          <Ionicons name="close-circle" size={15} color={colors.mutedForeground} />
        </Touchable>
      ) : null}
    </View>
  );
}

export function FilterChip({
  label,
  count,
  icon,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  icon?: IoniconName;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.96}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      className={cn(
        'h-9 flex-row items-center gap-1.5 rounded-full border px-3',
        active ? 'border-primary bg-primary' : 'border-border bg-card',
      )}
      style={active ? shadow.xs : undefined}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={13}
          color={active ? colors.primaryForeground : colors.mutedForeground}
        />
      ) : null}
      <T className={cn('font-lao-medium', active ? 'text-primary-foreground' : 'text-foreground')}>
        {label}
      </T>
      {typeof count === 'number' && count > 0 ? (
        <View
          className={cn(
            'min-w-[18px] items-center rounded-full px-1',
            active ? 'bg-white/25' : 'bg-primary-subtle',
          )}
        >
          <T
            className={cn(
              'font-sans-semibold',
              active ? 'text-primary-foreground' : 'text-primary-strong',
            )}
          >
            {count}
          </T>
        </View>
      ) : null}
    </Touchable>
  );
}

/** ແຖບເຕືອນເທິງສຸດ — ມີເລື່ອງດ່ວນທີ່ຍັງບໍ່ໄດ້ອ່ານ. */
export function AttentionBanner({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.99}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-3"
      style={shadow.xs}
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-warning/15">
        <Ionicons name="alert-circle" size={17} color={colors.warning} />
      </View>
      <View className="flex-1">
        <T className="font-lao-semibold text-foreground">{t('notifications.attentionTitle')}</T>
        <T numberOfLines={2} className="font-lao text-muted-foreground">
          {t('notifications.attentionBody', { count })}
        </T>
      </View>
      <View className="flex-row items-center gap-0.5">
        <T className="font-lao-medium text-warning">{t('notifications.viewAlerts')}</T>
        <Ionicons name="chevron-forward" size={12} color={colors.warning} />
      </View>
    </Touchable>
  );
}

// ---- row -------------------------------------------------------------------

function SwipeAction({
  progress,
  align,
  icon,
  label,
  tint,
  onPress,
}: {
  progress: Animated.AnimatedInterpolation<number>;
  align: 'left' | 'right';
  icon: IoniconName;
  label: string;
  tint: string;
  onPress: () => void;
}): React.JSX.Element {
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      style={{ transform: [{ scale }] }}
      className={cn('justify-center py-0.5', align === 'left' ? 'pr-2' : 'pl-2')}
    >
      <Touchable
        onPress={onPress}
        haptic="primary"
        accessibilityRole="button"
        accessibilityLabel={label}
        className="h-full w-[72px] items-center justify-center gap-1 rounded-2xl"
        style={{ backgroundColor: tint }}
      >
        <Ionicons name={icon} size={17} color="#FFFFFF" />
        <T numberOfLines={1} className="font-lao-medium text-white">
          {label}
        </T>
      </Touchable>
    </Animated.View>
  );
}

export type RowProps = {
  n: AppNotification;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onToggleRead: () => void;
  onDelete: () => void;
};

function RowBase({
  n,
  selecting,
  selected,
  onPress,
  onLongPress,
  onToggleRead,
  onDelete,
}: RowProps): React.JSX.Element {
  const { t } = useTranslation();
  const tone = toneOf(n);
  const hasTarget = targetOf(n) != null;
  const alert = n.severity !== 'info';

  const card = (
    <Touchable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      pressScale={0.985}
      accessibilityRole="button"
      accessibilityState={{ selected: selecting ? selected : undefined }}
      accessibilityLabel={`${n.read ? '' : `${t('notifications.unread')} · `}${n.title}`}
      accessibilityHint={selecting ? undefined : t('notifications.longPressHint')}
      className={cn(
        'flex-row items-start gap-3 overflow-hidden rounded-2xl border p-3',
        selected
          ? 'border-primary bg-primary-subtle'
          : n.read
            ? 'border-border bg-card'
            : 'border-aura-200 bg-aura-50',
      )}
      style={n.read && !selected ? undefined : shadow.xs}
    >
      {!n.read ? (
        <View
          className={cn(
            'absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full',
            n.severity === 'critical'
              ? 'bg-destructive'
              : n.severity === 'warning'
                ? 'bg-warning'
                : 'bg-primary',
          )}
        />
      ) : null}

      {selecting ? (
        <View
          className={cn(
            'mt-0.5 h-10 w-10 items-center justify-center rounded-xl border',
            selected ? 'border-primary bg-primary' : 'border-border bg-muted',
          )}
        >
          <Ionicons
            name={selected ? 'checkmark' : 'ellipse-outline'}
            size={17}
            color={selected ? colors.primaryForeground : colors.mutedForeground}
          />
        </View>
      ) : (
        <View className={cn('h-10 w-10 items-center justify-center rounded-xl', tone.bg)}>
          <Ionicons name={MODULE_ICON[n.module] ?? 'notifications'} size={17} color={tone.fg} />
          {alert ? (
            <View
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-4 w-4 items-center justify-center rounded-full border-2 border-card',
                n.severity === 'critical' ? 'bg-destructive' : 'bg-warning',
              )}
            >
              <Ionicons name="alert" size={8} color="#FFFFFF" />
            </View>
          ) : null}
        </View>
      )}

      <View className="flex-1">
        <View className="flex-row items-start gap-2">
          <T
            numberOfLines={2}
            className={cn(
              'flex-1 text-foreground',
              n.read ? 'font-lao-medium' : 'font-lao-semibold',
            )}
          >
            {n.title}
          </T>
          <T className="font-sans text-muted-foreground">{relativeTime(t, n.createdAt)}</T>
        </View>

        <T numberOfLines={2} className="mt-0.5 font-lao text-muted-foreground">
          {n.body}
        </T>

        <View className="mt-2 flex-row items-center gap-1.5">
          <View className={cn('rounded-full px-2 py-0.5', tone.bg)}>
            <T className="font-lao-medium" style={{ color: tone.fg }}>
              {moduleLabel(t, n.module)}
            </T>
          </View>
          {alert ? (
            <View
              className={cn(
                'rounded-full px-2 py-0.5',
                n.severity === 'critical' ? 'bg-destructive' : 'bg-warning',
              )}
            >
              <T className="font-lao-medium text-white">
                {t(n.severity === 'critical' ? 'notifications.critical' : 'notifications.warning')}
              </T>
            </View>
          ) : null}
          {!n.read ? <View className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
          <View className="flex-1" />
          {hasTarget && !selecting ? (
            <View className="flex-row items-center gap-0.5">
              <T className="font-lao-medium text-primary">{t('notifications.open')}</T>
              <Ionicons name="chevron-forward" size={12} color={colors.primary} />
            </View>
          ) : null}
        </View>
      </View>
    </Touchable>
  );

  // ໃນໂໝດເລືອກຫຼາຍລາຍການ ປິດ swipe ໄວ້ — ຫຼີກລ່ຽງ gesture ຊ້ອນກັນ.
  if (selecting) return card;

  return (
    <Swipeable
      friction={1.8}
      overshootFriction={8}
      leftThreshold={44}
      rightThreshold={44}
      renderLeftActions={(progress) => (
        <SwipeAction
          progress={progress}
          align="left"
          icon={n.read ? 'mail-unread-outline' : 'checkmark-done'}
          label={t(n.read ? 'notifications.markUnread' : 'notifications.markRead')}
          tint={colors.primary}
          onPress={onToggleRead}
        />
      )}
      renderRightActions={(progress) => (
        <SwipeAction
          progress={progress}
          align="right"
          icon="trash-outline"
          label={t('notifications.delete')}
          tint={colors.destructive}
          onPress={onDelete}
        />
      )}
    >
      {card}
    </Swipeable>
  );
}

/** Row ຖືກ memo — list ຍາວ 100 ລາຍການ ບໍ່ຕ້ອງ render ຄືນທັງໝົດຕອນເລືອກ. */
export const NotificationRow = memo(RowBase);

// ---- selection action bar --------------------------------------------------

export function SelectionBar({
  count,
  bottomInset,
  onMarkRead,
  onDelete,
}: {
  count: number;
  bottomInset: number;
  onMarkRead: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const disabled = count === 0;
  return (
    <GlassView
      intensity={32}
      sheen
      style={[{ position: 'absolute', left: 0, right: 0, bottom: 0 }, shadow.lg]}
    >
      <View
        className="flex-row items-center gap-2 px-4 pt-3"
        style={{ paddingBottom: bottomInset + 12 }}
      >
        <Touchable
          onPress={onMarkRead}
          disabled={disabled}
          pressScale={0.97}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          className={cn(
            'h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-full',
            disabled ? 'bg-muted' : 'bg-primary',
          )}
          style={disabled ? undefined : shadow.primary}
        >
          <Ionicons
            name="checkmark-done"
            size={15}
            color={disabled ? colors.mutedForeground : colors.primaryForeground}
          />
          <T
            className={cn(
              'font-lao-semibold',
              disabled ? 'text-muted-foreground' : 'text-primary-foreground',
            )}
          >
            {t('notifications.markSelectedRead')}
          </T>
        </Touchable>
        <Touchable
          onPress={onDelete}
          disabled={disabled}
          pressScale={0.97}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          className={cn(
            'h-11 flex-row items-center justify-center gap-1.5 rounded-full px-4',
            disabled ? 'bg-muted' : 'bg-destructive-soft',
          )}
        >
          <Ionicons
            name="trash-outline"
            size={15}
            color={disabled ? colors.mutedForeground : colors.destructive}
          />
          <T
            className={cn(
              'font-lao-semibold',
              disabled ? 'text-muted-foreground' : 'text-destructive',
            )}
          >
            {t('notifications.deleteSelected')}
          </T>
        </Touchable>
      </View>
    </GlassView>
  );
}

// ---- states ----------------------------------------------------------------

export function RowSkeletons(): React.JSX.Element {
  return (
    <View className="gap-2.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-[92px] rounded-2xl" />
      ))}
    </View>
  );
}

export function StateMessage({
  icon,
  tone = 'muted',
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IoniconName;
  tone?: 'muted' | 'primary';
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <View className="items-center gap-2 py-16">
      <View
        className={cn(
          'h-14 w-14 items-center justify-center rounded-2xl',
          tone === 'primary' ? 'bg-primary-subtle' : 'bg-muted',
        )}
      >
        <Ionicons
          name={icon}
          size={24}
          color={tone === 'primary' ? colors.primary : colors.mutedForeground}
        />
      </View>
      <T className="text-center font-lao-semibold text-foreground">{title}</T>
      {body ? <T className="px-10 text-center font-lao text-muted-foreground">{body}</T> : null}
      {actionLabel && onAction ? (
        <Touchable
          onPress={onAction}
          accessibilityRole="button"
          className="mt-1 h-10 flex-row items-center gap-1.5 rounded-full bg-primary-subtle px-4"
        >
          <Ionicons name="refresh" size={14} color={colors.primaryStrong} />
          <T className="font-lao-semibold text-primary-strong">{actionLabel}</T>
        </Touchable>
      ) : null}
    </View>
  );
}
