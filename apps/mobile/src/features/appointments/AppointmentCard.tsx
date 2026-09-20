import type { AppointmentListItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Linking, View } from 'react-native';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { CLINIC_PHONE } from '../../config/env';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cn } from '../../lib/cn';
import { formatLAK, formatTime, vientiane } from '../../lib/format';
import { colors, shadow } from '../../theme';

type Status = AppointmentListItem['status'];

/** ຊື່ວັນ (ຫຍໍ້) ພາສາລາວ — index dayjs (0 = ອາທິດ). */
const LAO_DOW = ['ອາທິດ', 'ຈັນ', 'ອັງຄານ', 'ພຸດ', 'ພະຫັດ', 'ສຸກ', 'ເສົາ'] as const;

/** ໝາຍເລກສາຍດ່ວນ concierge — display copy ຈົນກວ່າຈະມີ branches API. */
export const CONCIERGE_PHONE = CLINIC_PHONE;


/** ໂຕນສີຕາມສະຖານະ — ປ້າຍວັນທີ + badge + ເສັ້ນເນັ້ນຊ້າຍ. */
type Tone = {
  dateBg: string;
  dateBorder: string;
  dateText: string;
  dateSub: string;
  badgeBg: string;
  badgeText: string;
  dot: string;
  bar: string;
};

const TONE: Record<Status, Tone> = {
  PENDING: {
    dateBg: 'bg-primary-subtle',
    dateBorder: 'border-aura-200',
    dateText: 'text-primary-strong',
    dateSub: 'text-primary',
    badgeBg: 'bg-primary-subtle',
    badgeText: 'text-primary-strong',
    dot: 'bg-primary',
    bar: 'bg-primary',
  },
  CONFIRMED: {
    dateBg: 'bg-primary-subtle',
    dateBorder: 'border-aura-200',
    dateText: 'text-primary-strong',
    dateSub: 'text-primary',
    badgeBg: 'bg-success-soft',
    badgeText: 'text-success',
    dot: 'bg-success',
    bar: 'bg-success',
  },
  IN_PROGRESS: {
    dateBg: 'bg-primary-subtle',
    dateBorder: 'border-aura-200',
    dateText: 'text-primary-strong',
    dateSub: 'text-primary',
    badgeBg: 'bg-primary-subtle',
    badgeText: 'text-primary-strong',
    dot: 'bg-primary',
    bar: 'bg-primary',
  },
  COMPLETED: {
    dateBg: 'bg-muted',
    dateBorder: 'border-border',
    dateText: 'text-foreground',
    dateSub: 'text-muted-foreground',
    badgeBg: 'bg-muted',
    badgeText: 'text-muted-foreground',
    dot: 'bg-primary-strong',
    bar: 'bg-primary-strong',
  },
  CANCELLED: {
    dateBg: 'bg-destructive-soft',
    dateBorder: 'border-destructive-soft',
    dateText: 'text-destructive',
    dateSub: 'text-destructive',
    badgeBg: 'bg-destructive-soft',
    badgeText: 'text-destructive',
    dot: 'bg-destructive',
    bar: 'bg-destructive',
  },
  NO_SHOW: {
    dateBg: 'bg-muted',
    dateBorder: 'border-border',
    dateText: 'text-muted-foreground',
    dateSub: 'text-muted-foreground',
    badgeBg: 'bg-muted',
    badgeText: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    bar: 'bg-muted-foreground',
  },
};

/** ຂໍ້ຄວາມໃນກາດ = 12px ຄົງທີ່ (ເທົ່າຊ່ອງຄົ້ນຫາ). className ໃຊ້ຄຸມ weight/ສີ ເທົ່ານັ້ນ.
 * ໃຊ້ inline style ເພາະ variant "body" (text-base) ຂອງ <Text> ຊະນະ class text-[Npx]. */
function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

/* ── "Aura Pass" identity — ບັດ = ປີ້ນັດໝາຍ (ຕໍ່ເນື່ອງກັບ BookingSuccess / ServiceDetail) ── */

/** ເສັ້ນປາຂີດ foil + ຮອຍຫຍັກ 2 ຂ້າງ — ຕັດຜ່ານເຕັມບັດ (bleed ຜ່ານ p-4). */
function Perforation(): React.JSX.Element {
  return (
    <View className="relative -mx-4 my-3 h-2 justify-center">
      <View className="mx-4 flex-row overflow-hidden">
        {Array.from({ length: 44 }).map((_, i) => (
          <View key={i} className="mr-1 h-px w-1.5 rounded-full bg-champagne/60" />
        ))}
      </View>
      <View
        pointerEvents="none"
        className="absolute h-4 w-4 rounded-full bg-background"
        style={{ left: -8, top: -4 }}
      />
      <View
        pointerEvents="none"
        className="absolute h-4 w-4 rounded-full bg-background"
        style={{ right: -8, top: -4 }}
      />
    </View>
  );
}

/** ປ້າຍວັນທີ — ໜ້າປະຕິທິນຫຍໍ້ທີ່ແຕະໄດ້.
 * ເດັ້ງເຂົ້າຕອນ mount, ມີແຖບຫົວ + ເງົາເຫຼືອບ, ແລະ action: ແຕະເພື່ອປ່ຽນວັນ (reschedule)
 * ຖ້າ reschedule ບໍ່ໄດ້ → ເປີດລາຍລະອຽດ. */
function DateBadge({
  day,
  month,
  weekday,
  tone,
  onPress,
  canReschedule,
  label,
}: {
  day: string;
  month: string;
  weekday: string;
  tone: Tone;
  onPress: () => void;
  canReschedule: boolean;
  label: string;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      pop.setValue(1);
      return;
    }
    const anim = Animated.spring(pop, {
      toValue: 1,
      useNativeDriver: true,
      speed: 12,
      bounciness: 9,
      delay: 60,
    });
    anim.start();
    return () => anim.stop();
  }, [reduced, pop]);

  return (
    <Animated.View
      style={{
        opacity: pop,
        transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
      }}
    >
      <Touchable
        onPress={onPress}
        pressScale={0.9}
        haptic="primary"
        dim={false}
        accessibilityRole="button"
        accessibilityLabel={label}
        className={cn(
          'h-[46px] w-[42px] overflow-hidden rounded-xl border',
          tone.dateBg,
          tone.dateBorder,
        )}
        style={shadow.xs}
      >
        {/* ແຖບຫົວ ຄ້າຍສັນຜູກປະຕິທິນ */}
        <View className={cn('h-[3px] w-full', tone.bar)} />
        <View className="flex-1 items-center justify-center">
          <T
            className={cn('font-lao-semibold leading-none', tone.dateText)}
            style={{ fontSize: 14, lineHeight: 15, marginTop: 9 }}
          >
            {day}
          </T>
          <T
            className={cn('font-sans-medium', tone.dateText)}
            style={{ fontSize: 9, lineHeight: 10, letterSpacing: 0.4, marginTop: 1 }}
          >
            {month}
          </T>
          <T
            numberOfLines={1}
            className={cn('font-lao', tone.dateSub)}
            style={{ fontSize: 9, lineHeight: 10 }}
          >
            {weekday}
          </T>
        </View>
      </Touchable>
      {canReschedule ? (
        <View
          pointerEvents="none"
          className="absolute h-3.5 w-3.5 items-center justify-center rounded-full border border-border bg-card"
          style={{ right: -3, bottom: -3, ...shadow.xs }}
        >
          <Ionicons name="pencil" size={7} color={colors.primary} />
        </View>
      ) : null}
    </Animated.View>
  );
}

export function AppointmentCard({
  item,
  featured = false,
  onPress,
  onReschedule,
  onChat,
  onCheckIn,
}: {
  item: AppointmentListItem;
  /** ບັດທຳອິດຂອງ tab "ກຳລັງຈະມາ" — ໄດ້ hero treatment (ນັບຖອຍຫຼັງ + 2 ປຸ່ມໃຫຍ່). */
  featured?: boolean;
  onPress: () => void;
  onReschedule?: () => void;
  /** ເປີດແຊັດກັບຮ້ານ/ຊ່າງຂອງນັດນີ້. */
  onChat?: () => void;
  /** ເປີດໜ້າສະແກນ QR check-in (ປຸ່ມ hero). ບໍ່ສົ່ງ → ເປີດລາຍລະອຽດແທນ. */
  onCheckIn?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const start = vientiane(item.startAt);
  const tone = TONE[item.status];
  const isConfirmed = item.status === 'CONFIRMED';
  const isPending = item.status === 'PENDING';

  const hoursUntil = start.diff(vientiane(), 'hour', true);
  const hero = featured && isConfirmed && hoursUntil > 0;

  /** ບັດ hero: sheen ກວາດ 1 ຄັ້ງຕອນ mount + ຈຸດນັບຖອຍຫຼັງເຕັ້ນ. ເຄົາລົບ Reduce Motion. */
  const sheen = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced || !hero) return;
    const sweep = Animated.timing(sheen, {
      toValue: 1,
      duration: 900,
      delay: 220,
      useNativeDriver: true,
    });
    const beat = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    sweep.start();
    beat.start();
    return () => {
      sweep.stop();
      beat.stop();
    };
  }, [reduced, hero, sheen, pulse]);

  const deliveryLabel =
    item.deliveryType === 'HOME_SERVICE'
      ? t('appointments.homeService')
      : t('appointments.inStore');

  const countdown =
    hoursUntil < 1
      ? t('appointments.impendingMinutes', { count: Math.max(1, Math.round(hoursUntil * 60)) })
      : hoursUntil < 24
        ? t('appointments.impendingHours', { count: Math.round(hoursUntil) })
        : t('appointments.impendingDays', { count: Math.round(hoursUntil / 24) });

  const callStore = (): void => {
    void Linking.openURL(`tel:${CONCIERGE_PHONE.replace(/\s/g, '')}`);
  };
  const openRoute = (): void => {
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.branchName)}`,
    );
  };

  /** ປຸ່ມຂໍ້ຄວາມ ຊ້າຍ ໃນ layout ແບບ link (ບັດທີ່ບໍ່ແມ່ນ hero). */
  const leftAction: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap } =
    isPending && item.canReschedule && onReschedule
      ? { label: t('appointments.rescheduleShort'), onPress: onReschedule }
      : item.canReview
        ? { label: t('appointments.review'), onPress, icon: 'star-outline' }
        : item.canReschedule && onReschedule
          ? { label: t('appointments.reschedule'), onPress: onReschedule }
          : { label: t('appointments.callStore'), onPress: callStore, icon: 'call-outline' };

  return (
    <View
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-4"
      style={shadow.card}
    >
      {isPending ? <View className={cn('absolute bottom-0 left-0 top-0 w-1', tone.bar)} /> : null}

      {/* ຂີດ foil ຊຳແປນ ຫົວບັດ — ໝາຍ brand "Aura Pass" */}
      <View pointerEvents="none" className="absolute inset-x-4 h-px bg-champagne/50" style={{ top: 0 }} />
      {hero && !reduced ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 64,
            backgroundColor: 'rgba(255,255,255,0.30)',
            transform: [
              { rotate: '18deg' },
              { translateX: sheen.interpolate({ inputRange: [0, 1], outputRange: [-150, 430] }) },
            ],
          }}
        />
      ) : null}

      {/* ຫົວບັດ: ປ້າຍວັນທີ + ບໍລິການ + ສະຖານະ */}
      <View className="flex-row items-start justify-between gap-3 border-b border-border pb-3.5">
        <View className="flex-1 flex-row items-center gap-3">
          <DateBadge
            day={start.format('D')}
            month={start.format('MMM').toUpperCase()}
            weekday={LAO_DOW[start.day()]}
            tone={tone}
            canReschedule={Boolean(onReschedule && item.canReschedule)}
            label={
              onReschedule && item.canReschedule
                ? t('appointments.reschedule')
                : item.serviceName
            }
            onPress={onReschedule && item.canReschedule ? onReschedule : onPress}
          />

          <Touchable
            onPress={onPress}
            pressScale={0.98}
            dim={false}
            accessibilityRole="button"
            accessibilityLabel={item.serviceName}
            className="flex-1"
          >
            <T numberOfLines={1} className="font-lao text-muted-foreground">
              {deliveryLabel}
            </T>
            <T
              numberOfLines={2}
              className="mt-1 font-lao-medium text-[11px] leading-[17px] text-foreground"
            >
              {item.serviceName}
            </T>
          </Touchable>
        </View>

        <View className={cn('flex-row items-center gap-1 rounded-full px-2 py-0.5', tone.badgeBg)}>
          <View className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
          <T className={cn('font-lao-medium text-[11px]', tone.badgeText)}>
            {t(`status.${item.status}`)}
          </T>
        </View>
      </View>

      {/* ແຖວຊ່າງ + ຄະແນນ */}
      <View className="flex-row items-center justify-between gap-2 py-3.5">
        <View className="flex-1 flex-row items-center gap-2.5">
          <Avatar uri={item.staffAvatarUrl} name={item.staffName} size={32} mode="cartoon" />
          <View className="flex-1">
            <T numberOfLines={1} className="font-lao-medium text-[11px] text-foreground">
              {item.staffName}
            </T>
            <T numberOfLines={1} className="mt-0.5 text-muted-foreground">
              <T className="font-sans-medium text-primary">★ {item.staffRating.toFixed(1)}</T>
              {item.staffTitle ? ` · ${item.staffTitle}` : ''}
            </T>
          </View>
        </View>
        <Touchable
          onPress={onChat ?? callStore}
          pressScale={0.9}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={onChat ? t('chat.quickAction') : t('appointments.callStore')}
          className="h-8 w-8 items-center justify-center rounded-full border border-border"
        >
          <Ionicons
            name={onChat ? 'chatbubble-ellipses-outline' : 'call-outline'}
            size={14}
            color={colors.mutedForeground}
          />
        </Touchable>
      </View>

      {/* ກ່ອງເວລາ + ສະຖານທີ່ */}
      <View className="gap-2 rounded-xl bg-muted p-3">
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-1 flex-row items-center gap-1.5">
            <Ionicons name="time-outline" size={13} color={colors.primary} />
            <T className="font-lao-medium text-[11px] text-foreground">
              {formatTime(item.startAt)} - {formatTime(item.endAt)} ນ.
            </T>
          </View>
          <T className="font-lao-medium text-[11px] text-foreground">
            {formatLAK(item.totalAmount)}
          </T>
        </View>
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-1 flex-row items-center gap-1.5">
            <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
            <T numberOfLines={1} className="flex-1 font-lao text-[11px] text-muted-foreground">
              {item.branchName}
            </T>
          </View>
          <T className="font-sans-medium text-muted-foreground">
            {t('common.minutesShort', { count: Math.max(0, vientiane(item.endAt).diff(start, 'minute')) })}
          </T>
        </View>
      </View>

      {/* ນັບຖອຍຫຼັງ (ບັດ hero) */}
      {hero ? (
        <View className="mt-2.5 flex-row items-center justify-between gap-2 rounded-lg bg-primary-subtle px-2.5 py-1">
          <View className="flex-1 flex-row items-center gap-1.5">
            <Animated.View
              className="h-1.5 w-1.5 rounded-full bg-primary"
              style={
                reduced
                  ? undefined
                  : {
                      transform: [
                        { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) },
                      ],
                      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
                    }
              }
            />
            <T numberOfLines={1} className="flex-1 font-lao text-[11px] text-primary-strong">
              {countdown}
            </T>
          </View>
          <Touchable onPress={openRoute} hitSlop={6} accessibilityRole="button">
            <T className="font-lao-medium text-[11px] text-primary-strong underline">
              {t('appointments.checkRoute')}
            </T>
          </Touchable>
        </View>
      ) : null}

      {/* ໝາຍເຫດ ລໍຢືນຢັນ */}
      {isPending ? (
        <View className="mt-2.5 flex-row items-start gap-1.5 rounded-lg bg-muted p-2.5">
          <Ionicons
            name="information-circle-outline"
            size={14}
            color={colors.mutedForeground}
            style={{ marginTop: 1 }}
          />
          <T className="flex-1 font-lao text-[11px] text-muted-foreground">
            {t('appointments.pendingNotice')}
          </T>
        </View>
      ) : null}

      {/* ປຸ່ມການກະທຳ — ຫຼັງເສັ້ນປາຂີດ (tear-off stub) */}
      <Perforation />
      {hero ? (
        <View className="flex-row gap-1.5">
          <Button
            label={t('appointments.viewDetails')}
            variant="outline"
            size="sm"
            className="flex-1"
            labelClassName="text-[11px]"
            onPress={onPress}
          />
          <Button
            label={t('appointments.qrCheckIn')}
            size="sm"
            className="flex-1"
            labelClassName="text-[11px]"
            icon="qr-code-outline"
            onPress={onCheckIn ?? onPress}
          />
        </View>
      ) : (
        <View className="flex-row items-center justify-between">
          <Touchable
            onPress={leftAction.onPress}
            hitSlop={6}
            accessibilityRole="button"
            className="flex-row items-center gap-1"
          >
            {leftAction.icon ? (
              <Ionicons name={leftAction.icon} size={14} color={colors.mutedForeground} />
            ) : null}
            <T className="font-lao-medium text-[11px] text-muted-foreground">{leftAction.label}</T>
          </Touchable>
          <Touchable
            onPress={onPress}
            hitSlop={6}
            accessibilityRole="button"
            className="flex-row items-center gap-1"
          >
            <T className="font-lao-medium text-[11px] text-primary">
              {t('appointments.viewDetails')}
            </T>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Touchable>
        </View>
      )}
    </View>
  );
}
