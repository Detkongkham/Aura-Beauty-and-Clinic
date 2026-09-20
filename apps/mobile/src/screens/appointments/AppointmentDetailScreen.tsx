import { checkInWindow, type AppointmentDetailView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FooterBar } from '../../components/shared/FooterBar';
import { ErrorView } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { GlassView } from '../../components/ui/GlassView';
import { Gradient } from '../../components/ui/Gradient';
import { RatingStars } from '../../components/ui/RatingStars';
import { Skeleton } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { useAppointment } from '../../features/appointments/appointments.api';
import { CancelSheet } from '../../features/appointments/CancelSheet';
import { ReviewSheet } from '../../features/appointments/ReviewSheet';
import { cn } from '../../lib/cn';
import { formatDateTime, formatLAK, formatTime, vientiane } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { colors, shadow } from '../../theme';
import { useBookingDraft } from '../../store/booking-draft.store';
import type { AppScreenProps } from '../../navigation/types';

type Status = AppointmentDetailView['status'];
type IconName = keyof typeof Ionicons.glyphMap;

/** ຂໍ້ຄວາມທຸກໂຕໃນໜ້ານີ້ = 12px / lineHeight 17 ຄົງທີ່ — ຄ່າດຽວກັນກັບ AppointmentsScreen
 * ແລະ AppointmentCard. className ຄຸມ weight/ສີ ເທົ່ານັ້ນ. inline style ຈຳເປັນ ເພາະ
 * variant "body" (text-base) ຂອງ <Text> ຊະນະ class text-[Npx] ໃນ NativeWind 4. */
function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

/** ຊື່ວັນ (ຫຍໍ້) ພາສາລາວ — index dayjs (0 = ອາທິດ). ຄືກັນກັບ AppointmentCard. */
const LAO_DOW = ['ອາທິດ', 'ຈັນ', 'ອັງຄານ', 'ພຸດ', 'ພະຫັດ', 'ສຸກ', 'ເສົາ'] as const;

/** id ນັດໝາຍ → ລະຫັດການຈອງທີ່ອ່ານງ່າຍ (#AUR-XXXXX). */
function bookingRef(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase();
  return `#AUR-${tail || '00000'}`;
}

/** ໂຕນຂອງ pill ສະຖານະ ເທິງບັດ hero (ພື້ນເຂັ້ມ) — ຈຸດສີ + ປ້າຍແກ້ວ. */
const statusDot = (): Record<Status, string> => ({
  PENDING: colors.champagne,
  CONFIRMED: '#4ADE80',
  IN_PROGRESS: colors.aura300,
  COMPLETED: '#FFFFFF',
  CANCELLED: '#FB7185',
  NO_SHOW: '#CBD5E1',
});

/** ຂັ້ນຕອນຂອງນັດ (happy path). CANCELLED / NO_SHOW ສະແດງເປັນ banner ແທນ. */
const PROGRESS: Status[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];

const payTones = (): Record<string, { bg: string; text: string; color: string; icon: IconName }> => ({
  PENDING: { bg: 'bg-warning-soft', text: 'text-warning', color: colors.warning, icon: 'time-outline' },
  DEPOSIT_PAID: { bg: 'bg-primary-subtle', text: 'text-primary-strong', color: colors.primaryStrong, icon: 'shield-half-outline' },
  FULLY_PAID: { bg: 'bg-success-soft', text: 'text-success', color: colors.success, icon: 'checkmark-circle' },
  REFUNDED: { bg: 'bg-muted', text: 'text-muted-foreground', color: colors.mutedForeground, icon: 'return-down-back-outline' },
  FAILED: { bg: 'bg-destructive-soft', text: 'text-destructive', color: colors.destructive, icon: 'alert-circle-outline' },
  NONE: { bg: 'bg-muted', text: 'text-muted-foreground', color: colors.mutedForeground, icon: 'storefront-outline' },
});

/* ───────────────────────────── building blocks ───────────────────────────── */

/** ຫົວຂໍ້ section ນ້ອຍ — ໄອຄອນ + ປ້າຍ (ບໍ່ tracking ເພາະເປັນພາສາລາວ). */
function SectionLabel({ icon, label, right }: { icon: IconName; label: string; right?: React.ReactNode }): React.JSX.Element {
  return (
    <View className="flex-row items-center justify-between px-1 pb-1.5">
      <View className="flex-row items-center gap-1.5">
        <Ionicons name={icon} size={13} color={colors.mutedForeground} />
        <T className="font-lao-medium text-muted-foreground">{label}</T>
      </View>
      {right}
    </View>
  );
}

/** ພື້ນຜິວບັດມາດຕະຖານຂອງໜ້ານີ້ — rounded-2xl, hairline, ເງົາອ່ອນ. */
function Surface({ className, children }: { className?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View className={cn('rounded-2xl border border-border bg-card', className)} style={shadow.xs}>
      {children}
    </View>
  );
}

/** ແຖວຂໍ້ມູນໃນບັດ — ໄອຄອນ tile 28px + ປ້າຍ + ຄ່າ (+ slot ຂວາ). */
function Row({
  icon,
  label,
  value,
  sub,
  right,
  divider,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub?: string | null;
  right?: React.ReactNode;
  divider?: boolean;
}): React.JSX.Element {
  return (
    <View className={cn('flex-row items-center gap-2.5 px-3 py-2.5', divider && 'border-t border-border')}>
      <View className="h-7 w-7 items-center justify-center rounded-lg bg-primary-subtle">
        <Ionicons name={icon} size={14} color={colors.primary} />
      </View>
      <View className="flex-1">
        <T className="text-muted-foreground">{label}</T>
        <T className="font-lao-medium text-foreground">{value}</T>
        {sub ? <T className="text-muted-foreground">{sub}</T> : null}
      </View>
      {right}
    </View>
  );
}

/** ປຸ່ມກົມ action ດ່ວນ — ໄອຄອນ 40px + ປ້າຍ 12px ຂ້າງລຸ່ມ. */
function QuickAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      pressScale={0.94}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={cn('flex-1 items-center gap-1 py-1', disabled && 'opacity-40')}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-subtle">
        <Ionicons name={icon} size={17} color={colors.primaryStrong} />
      </View>
      <T numberOfLines={1} className="font-lao-medium text-foreground">
        {label}
      </T>
    </Touchable>
  );
}

/** ແຖວເງິນໃນບັດສະຫຼຸບ. */
function MoneyLine({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }): React.JSX.Element {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <T className={cn('flex-1', strong ? 'font-lao-medium text-foreground' : 'text-muted-foreground')}>{label}</T>
      <T className={cn(strong ? 'font-sans-semibold text-primary-strong' : 'font-sans-medium text-foreground', tone)}>
        {value}
      </T>
    </View>
  );
}

/** ແຖບຄວາມຄືບໜ້າ 4 ຂັ້ນ — PENDING → CONFIRMED → IN_PROGRESS → COMPLETED. */
function ProgressTrack({ status }: { status: Status }): React.JSX.Element {
  const { t } = useTranslation();
  const idx = PROGRESS.indexOf(status);
  const labels = [t('appointments.progressBooked'), t('status.CONFIRMED'), t('status.IN_PROGRESS'), t('status.COMPLETED')];
  return (
    <View className="gap-1.5">
      <View className="flex-row gap-1">
        {PROGRESS.map((s, i) => (
          <View key={s} className={cn('h-1 flex-1 rounded-full', i <= idx ? 'bg-primary' : 'bg-border')} />
        ))}
      </View>
      <View className="flex-row">
        {labels.map((l, i) => (
          <T
            key={l}
            numberOfLines={1}
            className={cn(
              'flex-1',
              i === 0 ? 'text-left' : i === labels.length - 1 ? 'text-right' : 'text-center',
              i === idx ? 'font-lao-medium text-primary-strong' : i < idx ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {l}
          </T>
        ))}
      </View>
    </View>
  );
}

function DetailSkeleton({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="h-12 flex-row items-center px-2">
        <Touchable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="back" className="h-9 w-9 items-center justify-center">
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </Touchable>
      </View>
      <View className="gap-3 px-4 pt-1">
        <Skeleton className="h-[188px] w-full rounded-3xl" />
        <Skeleton className="h-[64px] w-full rounded-2xl" />
        <Skeleton className="h-[72px] w-full rounded-2xl" />
        <Skeleton className="h-[120px] w-full rounded-2xl" />
      </View>
    </SafeAreaView>
  );
}

/* ───────────────────────────────── screen ───────────────────────────────── */

export function AppointmentDetailScreen({
  navigation,
  route,
}: AppScreenProps<'AppointmentDetail'>): React.JSX.Element {
  const { t } = useTranslation();
  const { id } = route.params;
  const appt = useAppointment(id);
  const startDraft = useBookingDraft((s) => s.start);
  const [showCancel, setShowCancel] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [copied, setCopied] = useState(false);

  if (appt.isLoading) return <DetailSkeleton onBack={() => navigation.goBack()} />;
  if (appt.isError || !appt.data) {
    return <ErrorView message={t('errors.NOT_FOUND')} onRetry={() => appt.refetch()} />;
  }

  const a = appt.data;
  const refCode = bookingRef(a.id);
  const start = vientiane(a.startAt);
  const durationMin = Math.max(0, vientiane(a.endAt).diff(start, 'minute'));
  const isHome = a.deliveryType === 'HOME_SERVICE';
  const isClosed = a.status === 'CANCELLED' || a.status === 'NO_SHOW';
  const isActive = a.status === 'PENDING' || a.status === 'CONFIRMED';
  const canTrack = isHome && (isActive || a.status === 'IN_PROGRESS');
  const hoursUntil = start.diff(vientiane(), 'hour', true);
  const ticket = a.queueTicket;
  const ticketActive = !!ticket && ['WAITING', 'CALLED', 'IN_SERVICE'].includes(ticket.status);
  const canCheckIn = !isHome && isActive && !ticketActive && checkInWindow(a.startAt) === 'open';

  const pay = a.payment;
  const payKey = pay?.status ?? 'NONE';
  const tones = payTones();
  const payTone = tones[payKey] ?? tones.NONE!;
  const paidAmount = pay?.paidAmount ?? 0;
  const balance = Math.max(0, a.totalAmount - paidAmount);
  const canPay = !isClosed && a.status !== 'COMPLETED' && balance > 0 && payKey !== 'REFUNDED';
  const servicePrice = Math.max(0, a.totalAmount - a.travelFee);

  const countdown = isActive
    ? hoursUntil <= 0
      ? t('appointments.startsNow')
      : hoursUntil < 1
        ? t('appointments.impendingMinutes', { count: Math.max(1, Math.round(hoursUntil * 60)) })
        : hoursUntil < 24
          ? t('appointments.impendingHours', { count: Math.round(hoursUntil) })
          : t('appointments.impendingDays', { count: Math.round(hoursUntil / 24) })
    : a.status === 'IN_PROGRESS'
      ? t('appointments.inProgressNow')
      : a.status === 'COMPLETED'
        ? t('appointments.completedOn', { date: start.format('D MMM YYYY') })
        : null;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const next = e.nativeEvent.contentOffset.y > 4;
    if (next !== scrolled) setScrolled(next);
  };

  const onReschedule = (): void => {
    startDraft({
      mode: 'reschedule',
      rescheduleId: a.id,
      branchId: a.branchId,
      serviceId: a.serviceId,
      serviceName: a.serviceName,
      staffProfileId: a.staffProfileId,
      staffName: a.staffName,
      price: a.totalAmount,
    });
    navigation.navigate('WizardDateTime');
  };

  const onShare = (): void => {
    void Share.share({
      message: t('success.shareMessage', {
        code: refCode,
        service: a.serviceName,
        date: start.format('D MMM YYYY'),
        time: formatTime(a.startAt),
        branch: a.branchName,
      }),
    });
  };

  const onCopyRef = async (): Promise<void> => {
    await Clipboard.setStringAsync(refCode);
    haptics.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const onDirections = (): void => {
    const query =
      isHome && a.homeAddress
        ? encodeURIComponent(a.homeAddress)
        : a.branchLatitude != null && a.branchLongitude != null
          ? `${a.branchLatitude},${a.branchLongitude}`
          : encodeURIComponent(`${a.branchName}, ${a.branchAddress}`);
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  };

  const onCall = (): void => {
    void Linking.openURL(`tel:${a.branchPhone.replace(/[^\d+]/g, '')}`);
  };

  const onChat = (): void => navigation.navigate('Chat', { appointmentId: a.id });

  const hasFooter = canCheckIn || canPay || a.canReview || a.canReschedule || a.canCancel || isClosed;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* ── header ລັອກ — GlassView + hairline ເມື່ອເລື່ອນ ── */}
      <GlassView
        intensity={24}
        style={[
          {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: scrolled ? colors.border : 'transparent',
            zIndex: 2,
          },
          scrolled ? shadow.xs : null,
        ]}
      >
        <View className="h-12 flex-row items-center gap-1 px-2">
          <Touchable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            pressScale={0.9}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            className="h-9 w-9 items-center justify-center rounded-full"
          >
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </Touchable>
          <View className="flex-1 items-center">
            <T className="font-lao-semibold text-foreground" numberOfLines={1}>
              {t('appointments.detailTitle')}
            </T>
            {scrolled ? (
              <T className="font-sans-medium text-muted-foreground" numberOfLines={1}>
                {refCode}
              </T>
            ) : null}
          </View>
          <Touchable
            onPress={onShare}
            hitSlop={8}
            pressScale={0.9}
            accessibilityRole="button"
            accessibilityLabel={t('success.shareDetails')}
            className="h-9 w-9 items-center justify-center rounded-full bg-muted"
          >
            <Ionicons name="share-outline" size={16} color={colors.foreground} />
          </Touchable>
        </View>
      </GlassView>

      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO: ຮູບບໍລິການ + ສະຖານະ + ວັນເວລາ + ລະຫັດ ── */}
        <AnimatedEntrance index={0}>
          <View className="rounded-3xl bg-card" style={shadow.card}>
            <View className="overflow-hidden rounded-3xl">
              <View style={{ minHeight: 132 }} className="justify-between p-3.5">
                {a.serviceImageUrl ? (
                  <Image source={{ uri: a.serviceImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : null}
                <Gradient preset={a.serviceImageUrl ? 'imageScrim' : 'hero'} fill pointerEvents="none" />
                {a.serviceImageUrl ? (
                  <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(30,20,56,0.35)' }]} />
                ) : null}

                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1">
                    <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusDot()[a.status] }} />
                    <T className="font-lao-medium text-white">{t(`status.${a.status}`)}</T>
                  </View>
                  <View className="flex-row items-center gap-1 rounded-full bg-white/20 px-2.5 py-1">
                    <Ionicons name={isHome ? 'home-outline' : 'storefront-outline'} size={12} color="#FFFFFF" />
                    <T className="font-lao-medium text-white">
                      {isHome ? t('appointments.homeService') : t('appointments.inStore')}
                    </T>
                  </View>
                </View>

                <View className="gap-0.5 pt-6">
                  <T className="font-lao-semibold text-white" numberOfLines={2}>
                    {a.serviceName}
                  </T>
                  <T className="font-lao text-white/80" numberOfLines={1}>
                    {LAO_DOW[start.day()]} {start.format('D MMM YYYY')} · {formatTime(a.startAt)}–{formatTime(a.endAt)}
                  </T>
                </View>
              </View>

              {/* ແຖບລຸ່ມ hero: ນັບຖອຍຫຼັງ / ຄວາມຄືບໜ້າ + ລະຫັດການຈອງ */}
              <View className="gap-3 p-3.5">
                {countdown ? (
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons
                      name={a.status === 'COMPLETED' ? 'checkmark-done' : 'hourglass-outline'}
                      size={13}
                      color={colors.primary}
                    />
                    <T className="flex-1 font-lao-medium text-primary-strong">{countdown}</T>
                  </View>
                ) : null}

                {isClosed ? (
                  <View className="flex-row items-center gap-2 rounded-xl bg-destructive-soft px-3 py-2">
                    <Ionicons name="close-circle" size={15} color={colors.destructive} />
                    <T className="flex-1 font-lao-medium text-destructive">
                      {a.status === 'CANCELLED' ? t('appointments.cancelledBanner') : t('appointments.noShowBanner')}
                    </T>
                  </View>
                ) : (
                  <ProgressTrack status={a.status} />
                )}

                <View className="flex-row items-center justify-between gap-2 rounded-xl border border-dashed border-aura-200 bg-aura-50 px-3 py-2">
                  <View className="flex-1">
                    <T className="text-muted-foreground">{t('appointments.refNo')}</T>
                    <T className="font-sans-semibold text-foreground" style={{ letterSpacing: 0.6 }}>
                      {refCode}
                    </T>
                  </View>
                  <Touchable
                    onPress={() => void onCopyRef()}
                    pressScale={0.94}
                    haptic="none"
                    accessibilityRole="button"
                    accessibilityLabel={t('success.copyRef')}
                    className={cn(
                      'flex-row items-center gap-1 rounded-full px-2.5 py-1.5',
                      copied ? 'bg-success-soft' : 'bg-card',
                    )}
                  >
                    <Ionicons
                      name={copied ? 'checkmark' : 'copy-outline'}
                      size={13}
                      color={copied ? colors.success : colors.primaryStrong}
                    />
                    <T className={cn('font-lao-medium', copied ? 'text-success' : 'text-primary-strong')}>
                      {copied ? t('success.copied') : t('success.copyRef')}
                    </T>
                  </Touchable>
                </View>
                {isActive ? (
                  <T className="-mt-1.5 text-center text-muted-foreground">{t('appointments.showAtDesk')}</T>
                ) : null}
              </View>
            </View>
          </View>
        </AnimatedEntrance>

        {/* ── Quick actions ── */}
        <AnimatedEntrance index={1}>
          <Surface className="flex-row px-1 py-2.5">
            <QuickAction icon="navigate-outline" label={t('appointments.quickDirections')} onPress={onDirections} />
            <QuickAction icon="call-outline" label={t('appointments.quickCall')} onPress={onCall} disabled={!a.branchPhone} />
            <QuickAction icon="chatbubble-ellipses-outline" label={t('chat.quickAction')} onPress={onChat} />
            <QuickAction icon="share-social-outline" label={t('appointments.quickShare')} onPress={onShare} />
          </Surface>
        </AnimatedEntrance>

        {/* ── ບັດຄິວ (ຫຼັງ check-in) ── */}
        {ticketActive && ticket ? (
          <AnimatedEntrance index={2}>
            <Touchable
              onPress={() => navigation.navigate('CheckIn', { appointmentId: a.id })}
              pressScale={0.98}
              accessibilityRole="button"
              accessibilityLabel={t('checkIn.checkedIn', { number: ticket.number })}
              className="flex-row items-center gap-3 rounded-2xl border border-success-soft bg-card p-3"
              style={shadow.xs}
            >
              <View className="h-11 min-w-[52px] items-center justify-center rounded-xl bg-success-soft px-2">
                <T className="font-sans-bold text-success">{ticket.number}</T>
              </View>
              <View className="flex-1">
                <T className="font-lao-semibold text-foreground">{t('checkIn.checkedIn', { number: ticket.number })}</T>
                <T className={cn('font-lao', ticket.status === 'CALLED' ? 'text-primary-strong' : 'text-muted-foreground')}>
                  {t(`checkIn.ticketStatus.${ticket.status}`, { defaultValue: ticket.status })}
                </T>
              </View>
              <Ionicons name="chevron-forward" size={15} color={colors.mutedForeground} />
            </Touchable>
          </AnimatedEntrance>
        ) : null}

        {/* ── ຕິດຕາມຊ່າງ (Home Service) ── */}
        {canTrack ? (
          <AnimatedEntrance index={2}>
            <Touchable
              onPress={() => navigation.navigate('HomeServiceTracking', { appointmentId: a.id })}
              pressScale={0.98}
              accessibilityRole="button"
              accessibilityLabel={t('tracking.trackButton')}
              className="flex-row items-center gap-2.5 overflow-hidden rounded-2xl p-3"
            >
              <Gradient preset="brand" fill pointerEvents="none" />
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                <Ionicons name="navigate" size={16} color="#FFFFFF" />
              </View>
              <View className="flex-1">
                <T className="font-lao-semibold text-white">{t('tracking.trackButton')}</T>
                <T className="font-lao text-white/80">{t('tracking.trackHint')}</T>
              </View>
              <View className="flex-row items-center gap-1 rounded-full bg-white/20 px-2 py-0.5">
                <View className="h-1.5 w-1.5 rounded-full bg-white" />
                <T className="font-lao-medium text-white">{t('tracking.live')}</T>
              </View>
            </Touchable>
          </AnimatedEntrance>
        ) : null}

        {/* ── ຊ່າງ ── */}
        <AnimatedEntrance index={3}>
          <View>
            <SectionLabel icon="person-outline" label={t('appointments.stylistSection')} />
            <Surface className="flex-row items-center gap-3 p-3">
              <Avatar uri={a.staffAvatarUrl} name={a.staffName} size={44} mode="cartoon" />
              <View className="flex-1">
                <T className="font-lao-semibold text-foreground" numberOfLines={1}>
                  {a.staffName}
                </T>
                {a.staffTitle ? (
                  <T className="text-muted-foreground" numberOfLines={1}>
                    {a.staffTitle}
                  </T>
                ) : null}
                <View className="mt-0.5 flex-row items-center gap-1">
                  <Ionicons name="star" size={11} color={colors.champagne} />
                  <T className="font-sans-medium text-foreground">{a.staffRating.toFixed(1)}</T>
                  <T className="text-muted-foreground">· {t('appointments.reviewsCount', { count: a.staffTotalReviews })}</T>
                </View>
              </View>
              <Touchable
                onPress={onChat}
                pressScale={0.92}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('chat.quickAction')}
                className="h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
              </Touchable>
            </Surface>
          </View>
        </AnimatedEntrance>

        {/* ── ກຳນົດເວລາ + ສະຖານທີ່ ── */}
        <AnimatedEntrance index={4}>
          <View>
            <SectionLabel icon="calendar-clear-outline" label={t('appointments.scheduleSection')} />
            <Surface>
              <Row
                icon="calendar-outline"
                label={t('confirm.dateTime')}
                value={`${LAO_DOW[start.day()]} ${start.format('D MMM YYYY')}`}
                sub={`${formatTime(a.startAt)} – ${formatTime(a.endAt)} · ${t('common.minutesShort', { count: durationMin })}`}
              />
              {a.roomName ? <Row divider icon="bed-outline" label={t('appointments.room')} value={a.roomName} /> : null}
              {isHome ? (
                <Row
                  divider
                  icon="home-outline"
                  label={t('appointments.homeAddress')}
                  value={a.homeAddress ?? '—'}
                  sub={t('appointments.dispatchedFrom', { branch: a.branchName })}
                />
              ) : (
                <Row
                  divider
                  icon="location-outline"
                  label={t('confirm.branch')}
                  value={a.branchName}
                  sub={a.branchAddress}
                  right={
                    <Touchable
                      onPress={onDirections}
                      pressScale={0.94}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={t('appointments.openMap')}
                      className="flex-row items-center gap-1 rounded-full bg-primary-subtle px-2.5 py-1"
                    >
                      <Ionicons name="map-outline" size={12} color={colors.primaryStrong} />
                      <T className="font-lao-medium text-primary-strong">{t('success.viewMap')}</T>
                    </Touchable>
                  }
                />
              )}
            </Surface>
          </View>
        </AnimatedEntrance>

        {/* ── ການຊຳລະເງິນ ── */}
        <AnimatedEntrance index={5}>
          <View>
            <SectionLabel
              icon="wallet-outline"
              label={t('appointments.summaryTitle')}
              right={
                <View className={cn('flex-row items-center gap-1 rounded-full px-2 py-0.5', payTone.bg)}>
                  <Ionicons name={payTone.icon} size={11} color={payTone.color} />
                  <T className={cn('font-lao-medium', payTone.text)}>{t(`appointments.payStatus.${payKey}`)}</T>
                </View>
              }
            />
            <Surface className="gap-2 p-3">
              <MoneyLine label={a.serviceName} value={formatLAK(servicePrice)} />
              {a.travelFee > 0 ? <MoneyLine label={t('appointments.travelFee')} value={formatLAK(a.travelFee)} /> : null}
              <View className="my-0.5 h-px bg-border" />
              <MoneyLine label={t('wizard.total')} value={formatLAK(a.totalAmount)} strong />
              <View className="flex-row items-center gap-1">
                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                <T className="text-muted-foreground">{t('confirm.taxIncluded')}</T>
              </View>

              {pay && (paidAmount > 0 || pay.depositAmount > 0) ? (
                <View className="mt-1 gap-1.5 rounded-xl bg-muted p-2.5">
                  {pay.depositAmount > 0 ? (
                    <MoneyLine label={t('appointments.deposit')} value={formatLAK(pay.depositAmount)} />
                  ) : null}
                  <MoneyLine label={t('appointments.paid')} value={`− ${formatLAK(paidAmount)}`} tone="text-success" />
                  <MoneyLine
                    label={t('appointments.balanceDue')}
                    value={formatLAK(balance)}
                    tone={balance > 0 ? 'text-foreground' : 'text-success'}
                  />
                  {pay.paidAt ? (
                    <T className="text-muted-foreground">{formatDateTime(pay.paidAt)}</T>
                  ) : null}
                </View>
              ) : null}
            </Surface>
          </View>
        </AnimatedEntrance>

        {/* ── ໝາຍເຫດ ── */}
        {a.customerNotes || a.staffNotes ? (
          <AnimatedEntrance index={6}>
            <View>
              <SectionLabel icon="document-text-outline" label={t('confirm.notes')} />
              <Surface className="gap-2.5 p-3">
                {a.customerNotes ? (
                  <View className="gap-0.5">
                    <T className="text-muted-foreground">{t('confirm.notes')}</T>
                    <T className="font-lao text-foreground">{a.customerNotes}</T>
                  </View>
                ) : null}
                {a.staffNotes ? (
                  <View className="gap-0.5 rounded-xl bg-accent-soft p-2.5">
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="sparkles-outline" size={12} color={colors.accentForeground} />
                      <T className="font-lao-medium text-accent-foreground">{t('appointments.staffNotes')}</T>
                    </View>
                    <T className="font-lao text-accent-foreground">{a.staffNotes}</T>
                  </View>
                ) : null}
              </Surface>
            </View>
          </AnimatedEntrance>
        ) : null}

        {/* ── ຄະແນນ ── */}
        {a.review ? (
          <AnimatedEntrance index={7}>
            <View>
              <SectionLabel icon="star-outline" label={t('review.yourRating')} />
              <Surface className="gap-1.5 p-3">
                <RatingStars value={a.review.rating} size={14} />
                {a.review.comment ? <T className="font-lao text-foreground">{a.review.comment}</T> : null}
              </Surface>
            </View>
          </AnimatedEntrance>
        ) : a.canReview ? (
          <AnimatedEntrance index={7}>
            <Touchable
              onPress={() => setShowReview(true)}
              pressScale={0.98}
              accessibilityRole="button"
              className="flex-row items-center gap-2.5 rounded-2xl bg-accent-soft p-3"
            >
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-card">
                <Ionicons name="star" size={16} color={colors.champagne} />
              </View>
              <T className="flex-1 font-lao-medium text-accent-foreground">{t('appointments.ratePrompt')}</T>
              <Ionicons name="chevron-forward" size={15} color={colors.accentForeground} />
            </Touchable>
          </AnimatedEntrance>
        ) : null}

        {/* ── ປະຫວັດການຈອງ + ນະໂຍບາຍ ── */}
        <AnimatedEntrance index={8}>
          <View>
            <SectionLabel icon="time-outline" label={t('appointments.activitySection')} />
            <Surface className="gap-1.5 p-3">
              <View className="flex-row items-center gap-2">
                <View className="h-1.5 w-1.5 rounded-full bg-primary" />
                <T className="flex-1 text-foreground">{t('appointments.bookedAt', { date: formatDateTime(a.createdAt) })}</T>
              </View>
              {a.updatedAt !== a.createdAt ? (
                <View className="flex-row items-center gap-2">
                  <View className="h-1.5 w-1.5 rounded-full bg-aura-300" />
                  <T className="flex-1 text-muted-foreground">
                    {t('appointments.updatedAt', { date: formatDateTime(a.updatedAt) })}
                  </T>
                </View>
              ) : null}
              {isActive ? (
                <View className="mt-1 flex-row items-start gap-1.5 border-t border-border pt-2">
                  <Ionicons name="information-circle-outline" size={13} color={colors.mutedForeground} style={{ marginTop: 2 }} />
                  <T className="flex-1 font-lao text-muted-foreground">
                    {a.canCancel || a.canReschedule
                      ? t('appointments.cancelUntil', { date: formatDateTime(a.cancelDeadline) })
                      : t('appointments.cancelWindowPassed')}
                  </T>
                </View>
              ) : null}
            </Surface>
          </View>
        </AnimatedEntrance>

        <Touchable
          onPress={onCall}
          pressScale={0.97}
          haptic="none"
          accessibilityRole="button"
          className="flex-row items-center justify-center gap-1 py-1"
        >
          <Ionicons name="headset-outline" size={13} color={colors.mutedForeground} />
          <T className="font-lao text-muted-foreground">{t('appointments.needHelp')}</T>
        </Touchable>
      </ScrollView>

      {/* ── Footer actions ── */}
      {hasFooter ? (
        <FooterBar>
          {canCheckIn ? (
            <Button
              label={t('appointments.qrCheckIn')}
              icon="qr-code-outline"
              size="sm"
              labelClassName="text-[12px]"
              onPress={() => navigation.navigate('CheckIn', { appointmentId: a.id })}
            />
          ) : null}
          {canPay ? (
            <Button
              label={`${t('appointments.payNow')} · ${formatLAK(balance)}`}
              icon="card-outline"
              variant={canCheckIn ? 'secondary' : 'primary'}
              size="sm"
              labelClassName="text-[12px]"
              onPress={() => navigation.navigate('Payment', { appointmentId: a.id })}
            />
          ) : null}
          {a.canReview && !canPay ? (
            <Button
              label={t('appointments.review')}
              icon="star-outline"
              size="sm"
              labelClassName="text-[12px]"
              onPress={() => setShowReview(true)}
            />
          ) : null}
          {isClosed || (a.status === 'COMPLETED' && !a.canReview) ? (
            <Button
              label={t('appointments.bookAgain')}
              icon="refresh-outline"
              size="sm"
              labelClassName="text-[12px]"
              onPress={() => navigation.navigate('ServiceDetail', { serviceId: a.serviceId })}
            />
          ) : null}
          {a.canReschedule || a.canCancel ? (
            <View className="flex-row gap-2">
              {a.canCancel ? (
                <Button
                  label={t('appointments.cancel')}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  labelClassName="text-[12px] text-destructive"
                  onPress={() => setShowCancel(true)}
                />
              ) : null}
              {a.canReschedule ? (
                <Button
                  label={t('appointments.reschedule')}
                  variant={canPay || canCheckIn ? 'secondary' : 'primary'}
                  icon="calendar-outline"
                  size="sm"
                  className="flex-1"
                  labelClassName="text-[12px]"
                  onPress={onReschedule}
                />
              ) : null}
            </View>
          ) : null}
        </FooterBar>
      ) : null}

      <CancelSheet appointmentId={a.id} open={showCancel} onClose={() => setShowCancel(false)} />
      <ReviewSheet appointmentId={a.id} open={showReview} onClose={() => setShowReview(false)} />
    </SafeAreaView>
  );
}
