import {
  CHECK_IN_OPENS_BEFORE_MS,
  checkInWindow,
  parseBranchCheckInPayload,
  type AppointmentDetailView,
} from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorView, LoadingScreen } from '../../components/shared/StateViews';
import { Button } from '../../components/ui/Button';
import { GlassView } from '../../components/ui/GlassView';
import { Gradient } from '../../components/ui/Gradient';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { useAppointment, useQueueCheckIn } from '../../features/appointments/appointments.api';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cn } from '../../lib/cn';
import { formatTime, vientiane } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { colors, shadow } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

/** ຂໍ້ຄວາມ 12px ຄົງທີ່ — ດຽວກັນກັບໜ້ານັດໝາຍອື່ນໆ. */
function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

const FRAME = 232;

/** id ນັດໝາຍ → ລະຫັດການຈອງ (#AUR-XXXXX) — ຄືກັນກັບ AppointmentDetailScreen. */
function bookingRef(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase();
  return `#AUR-${tail || '00000'}`;
}

type Ticket = { number: string; status: string; issuedAt: string };

/* ─────────────────────────── viewfinder ─────────────────────────── */

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }): React.JSX.Element {
  const top = pos[0] === 't';
  const left = pos[1] === 'l';
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 34,
        height: 34,
        [top ? 'top' : 'bottom']: -2,
        [left ? 'left' : 'right']: -2,
        borderColor: '#FFFFFF',
        borderTopWidth: top ? 4 : 0,
        borderBottomWidth: top ? 0 : 4,
        borderLeftWidth: left ? 4 : 0,
        borderRightWidth: left ? 0 : 4,
        [`border${top ? 'Top' : 'Bottom'}${left ? 'Left' : 'Right'}Radius`]: 22,
      }}
    />
  );
}

function ScanLine({ active }: { active: boolean }): React.JSX.Element | null {
  const reduced = useReducedMotion();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced || !active) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, active, y]);
  if (reduced || !active) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 18,
        right: 18,
        height: 2,
        borderRadius: 1,
        backgroundColor: colors.aura300,
        shadowColor: colors.primary,
        shadowOpacity: 0.9,
        shadowRadius: 8,
        transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [18, FRAME - 18] }) }],
      }}
    />
  );
}

/* ─────────────────────────── states ─────────────────────────── */

/** ບັດຄິວ — ຫຼັງ check-in ສຳເລັດ ຫຼື ເຄີຍ check-in ແລ້ວ. */
function TicketView({
  appt,
  ticket,
  fresh,
  onDone,
  onDetail,
}: {
  appt: AppointmentDetailView;
  ticket: Ticket;
  fresh: boolean;
  onDone: () => void;
  onDetail: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 10 }).start();
  }, [pop, reduced]);
  const called = ticket.status === 'CALLED';

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }}>
      <StatusBar style="dark" />
      <View className="h-12 flex-row items-center justify-end px-3">
        <Touchable
          onPress={onDone}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          className="h-9 w-9 items-center justify-center rounded-full bg-muted"
        >
          <Ionicons name="close" size={18} color={colors.foreground} />
        </Touchable>
      </View>

      <View className="flex-1 justify-center gap-5 px-6">
        <View className="items-center gap-2">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-success-soft">
            <Ionicons name="checkmark-circle" size={32} color={colors.success} />
          </View>
          <T className="font-lao-semibold text-foreground">
            {fresh ? t('checkIn.successTitle') : t('checkIn.alreadyTitle')}
          </T>
          <T className="text-center font-lao text-muted-foreground">{t('checkIn.waitHint')}</T>
        </View>

        <Animated.View
          className="rounded-3xl bg-card"
          style={[
            shadow.card,
            { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] },
          ]}
        >
          <View className="overflow-hidden rounded-3xl">
            <View className="items-center gap-1 px-5 py-6">
              <Gradient preset="hero" fill pointerEvents="none" />
              <T className="font-lao text-white/80">{t('checkIn.ticketLabel')}</T>
              {/* ເລກຄິວເປັນຈຸດດຽວທີ່ຂະໜາດໃຫຍ່ — ຕ້ອງອ່ານໄດ້ຈາກໄກ ເມື່ອພະນັກງານເອີ້ນ */}
              <Text
                className="font-sans-bold text-white"
                style={{ fontSize: 44, lineHeight: 52, letterSpacing: 2 }}
                accessibilityLabel={`${t('checkIn.ticketLabel')} ${ticket.number}`}
              >
                {ticket.number}
              </Text>
              <View className={cn('mt-1 flex-row items-center gap-1.5 rounded-full px-2.5 py-1', called ? 'bg-champagne' : 'bg-white/20')}>
                <View className={cn('h-1.5 w-1.5 rounded-full', called ? 'bg-aura-900' : 'bg-white')} />
                <T className={cn('font-lao-medium', called ? 'text-aura-900' : 'text-white')}>
                  {t(`checkIn.ticketStatus.${ticket.status}`, { defaultValue: ticket.status })}
                </T>
              </View>
            </View>

            <View className="gap-2 p-4">
              <View className="flex-row items-center gap-2">
                <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
                <T className="flex-1 font-lao-medium text-foreground" numberOfLines={1}>
                  {appt.serviceName}
                </T>
                <T className="font-sans-medium text-foreground">{formatTime(appt.startAt)}</T>
              </View>
              <View className="flex-row items-center gap-2">
                <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
                <T className="flex-1 text-muted-foreground" numberOfLines={1}>
                  {appt.branchName}
                </T>
                <T className="text-muted-foreground">{appt.staffName}</T>
              </View>
              <View className="mt-1 border-t border-dashed border-border pt-2">
                <T className="text-center text-muted-foreground">
                  {t('checkIn.issuedAt', { time: vientiane(ticket.issuedAt).format('HH:mm') })} · {bookingRef(appt.id)}
                </T>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>

      <View className="gap-2 px-6">
        <Button label={t('checkIn.done')} size="sm" labelClassName="text-[12px]" onPress={onDone} />
        <Button
          label={t('appointments.viewDetails')}
          variant="ghost"
          size="sm"
          labelClassName="text-[12px]"
          onPress={onDetail}
        />
      </View>
    </View>
  );
}

/** ໜ້າຈໍແຈ້ງ (ຍັງບໍ່ຮອດເວລາ / ໝົດເວລາ / ບໍ່ມີສິດກ້ອງ). */
function NoticeView({
  icon,
  title,
  body,
  action,
  refCode,
  onClose,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  refCode: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background px-6" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }}>
      <StatusBar style="dark" />
      <View className="h-12 flex-row items-center justify-end">
        <Touchable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          className="h-9 w-9 items-center justify-center rounded-full bg-muted"
        >
          <Ionicons name="close" size={18} color={colors.foreground} />
        </Touchable>
      </View>
      <View className="flex-1 items-center justify-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-subtle">
          <Ionicons name={icon} size={26} color={colors.primary} />
        </View>
        <T className="text-center font-lao-semibold text-foreground">{title}</T>
        {body ? <T className="text-center font-lao text-muted-foreground">{body}</T> : null}
        {action ? (
          <Button label={action.label} size="sm" labelClassName="text-[12px]" className="mt-2 px-6" fullWidth={false} onPress={action.onPress} />
        ) : null}
      </View>
      <View className="items-center gap-1 rounded-2xl border border-dashed border-aura-200 bg-aura-50 p-3">
        <T className="text-muted-foreground">{t('checkIn.cantScan')}</T>
        <T className="font-sans-semibold text-foreground" style={{ letterSpacing: 0.6 }}>
          {refCode}
        </T>
      </View>
    </View>
  );
}

/* ─────────────────────────── screen ─────────────────────────── */

export function CheckInScreen({ navigation, route }: AppScreenProps<'CheckIn'>): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { appointmentId } = route.params;
  const appt = useAppointment(appointmentId);
  const checkIn = useQueueCheckIn(appointmentId);
  const [permission, requestPermission] = useCameraPermissions();

  const [torch, setTorch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Ticket | null>(null);
  /** ກັນ onBarcodeScanned ຍິງຊ້ຳຫຼາຍເທື່ອຕໍ່ວິນາທີ ລະຫວ່າງກຳລັງສົ່ງ/ສະແດງ error. */
  const lock = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  if (appt.isLoading || !permission) return <LoadingScreen />;
  if (appt.isError || !appt.data) {
    return <ErrorView message={t('errors.NOT_FOUND')} onRetry={() => appt.refetch()} />;
  }

  const a = appt.data;
  const refCode = bookingRef(a.id);
  const close = (): void => navigation.goBack();
  const toDetail = (): void => {
    navigation.goBack();
    navigation.navigate('AppointmentDetail', { id: a.id });
  };

  // ── ເຄີຍ check-in ແລ້ວ (ບັດຍັງ active) ──
  const existing = a.queueTicket && ['WAITING', 'CALLED', 'IN_SERVICE'].includes(a.queueTicket.status) ? a.queueTicket : null;
  if (result || existing) {
    return (
      <TicketView appt={a} ticket={(result ?? existing)!} fresh={!!result} onDone={close} onDetail={toDetail} />
    );
  }

  // ── ນັດບໍ່ເຂົ້າເງື່ອນໄຂ ──
  if (a.status !== 'PENDING' && a.status !== 'CONFIRMED') {
    return <NoticeView icon="alert-circle-outline" title={t('checkIn.notEligible')} body={t(`status.${a.status}`)} refCode={refCode} onClose={close} />;
  }
  const window = checkInWindow(a.startAt);
  if (window === 'too-early') {
    const opens = vientiane(new Date(Date.parse(a.startAt) - CHECK_IN_OPENS_BEFORE_MS));
    return (
      <NoticeView
        icon="time-outline"
        title={t('checkIn.tooEarly', { time: `${opens.format('D MMM')} · ${opens.format('HH:mm')}` })}
        body={`${a.serviceName} · ${vientiane(a.startAt).format('D MMM')} · ${formatTime(a.startAt)}`}
        refCode={refCode}
        onClose={close}
      />
    );
  }
  if (window === 'closed') {
    return <NoticeView icon="hourglass-outline" title={t('checkIn.closed')} refCode={refCode} onClose={close} />;
  }

  // ── ສິດກ້ອງ ──
  if (!permission.granted) {
    return (
      <NoticeView
        icon="camera-outline"
        title={t('checkIn.permissionTitle')}
        body={t('checkIn.permissionBody')}
        action={
          permission.canAskAgain
            ? { label: t('checkIn.allowCamera'), onPress: () => void requestPermission() }
            : { label: t('checkIn.openSettings'), onPress: () => void Linking.openSettings() }
        }
        refCode={refCode}
        onClose={close}
      />
    );
  }

  const fail = (message: string): void => {
    haptics.error();
    setError(message);
  };

  const onScanned = ({ data }: BarcodeScanningResult): void => {
    if (lock.current || checkIn.isPending || error) return;
    lock.current = true;
    const branchId = parseBranchCheckInPayload(data);
    if (!branchId) {
      fail(t('checkIn.invalidQr'));
      return;
    }
    if (branchId !== a.branchId.toLowerCase()) {
      fail(t('checkIn.wrongBranch', { branch: a.branchName }));
      return;
    }
    checkIn.mutate(
      { branchId },
      {
        onSuccess: (res) => {
          haptics.success();
          setResult({ number: res.ticket.number, status: res.status, issuedAt: res.ticket.issuedAt });
        },
        onError: (err) => fail(normalizeError(err).message),
      },
    );
  };

  const retry = (): void => {
    setError(null);
    lock.current = false;
  };

  const scanning = !checkIn.isPending && !error;

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanning ? onScanned : undefined}
      />

      {/* ໜ້າກາກມືດອ້ອມກອບ — 4 ແຜ່ນ ອ້ອມຊ່ອງໃສ FRAME×FRAME */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={styles.mask} />
        <View style={{ flexDirection: 'row', height: FRAME }}>
          <View style={styles.mask} />
          <View style={{ width: FRAME }} />
          <View style={styles.mask} />
        </View>
        <View style={styles.mask} />
      </View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill} className="items-center justify-center">
        <View style={{ width: FRAME, height: FRAME }}>
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />
          <ScanLine active={scanning} />
        </View>
      </View>

      {/* ແຖບເທິງ */}
      <View className="absolute left-0 right-0 flex-row items-center justify-between px-4" style={{ top: insets.top + 6 }}>
        <Touchable
          onPress={close}
          hitSlop={8}
          pressScale={0.92}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
        >
          <Ionicons name="close" size={20} color="#FFFFFF" />
        </Touchable>
        <T className="font-lao-semibold text-white">{t('checkIn.title')}</T>
        <Touchable
          onPress={() => setTorch((v) => !v)}
          hitSlop={8}
          pressScale={0.92}
          accessibilityRole="button"
          accessibilityLabel={torch ? t('checkIn.torchOff') : t('checkIn.torchOn')}
          accessibilityState={{ selected: torch }}
          className={cn('h-10 w-10 items-center justify-center rounded-full', torch ? 'bg-champagne' : 'bg-white/15')}
        >
          <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={18} color={torch ? colors.aura900 : '#FFFFFF'} />
        </Touchable>
      </View>

      {/* ຄຳແນະນຳໃຕ້ກອບ */}
      <View pointerEvents="none" className="absolute left-0 right-0 items-center px-8" style={{ top: '50%', marginTop: FRAME / 2 + 20 }}>
        <T className="text-center font-lao-medium text-white">
          {checkIn.isPending ? t('checkIn.checkingIn') : t('checkIn.instruction')}
        </T>
      </View>

      {/* ບັດນັດ / error ລຸ່ມຈໍ */}
      <View className="absolute left-0 right-0 px-4" style={{ bottom: Math.max(insets.bottom, 16) }}>
        <GlassView intensity={50} tint="dark" radius={22}>
          <View className="gap-2.5 p-3.5">
            {error ? (
              <>
                <View className="flex-row items-start gap-2">
                  <Ionicons name="alert-circle" size={16} color="#FB7185" style={{ marginTop: 1 }} />
                  <T className="flex-1 font-lao-medium text-white">{error}</T>
                </View>
                <Button label={t('checkIn.tryAgain')} icon="scan-outline" size="sm" labelClassName="text-[12px]" onPress={retry} />
              </>
            ) : (
              <View className="flex-row items-center gap-2.5">
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                  <Ionicons name="calendar-outline" size={16} color={colors.champagne} />
                </View>
                <View className="flex-1">
                  <T className="font-lao-medium text-white" numberOfLines={1}>
                    {a.serviceName}
                  </T>
                  <T className="font-lao text-white/70" numberOfLines={1}>
                    {formatTime(a.startAt)} · {a.branchName}
                  </T>
                </View>
                <T className="font-sans-medium text-white/70">{refCode}</T>
              </View>
            )}
          </View>
        </GlassView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(12,8,24,0.62)' },
});
