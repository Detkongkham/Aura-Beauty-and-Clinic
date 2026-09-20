import type { HomeServiceJobStatus, HomeServiceLocationEvent, HomeServiceStatusEvent } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Linking, Platform, ScrollView, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Socket } from 'socket.io-client';
import { ErrorView, LoadingScreen } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Avatar } from '../../components/ui/Avatar';
import { GlassView } from '../../components/ui/GlassView';
import { Gradient } from '../../components/ui/Gradient';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { CONCIERGE_PHONE } from '../../features/appointments/AppointmentCard';
import { useHomeServiceTrip } from '../../features/appointments/home-service-tracking.api';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cn } from '../../lib/cn';
import { formatTime, vientiane } from '../../lib/format';
import { normalizeError } from '../../services/apiError';
import { qk } from '../../services/queryKeys';
import { connectTripSocket } from '../../services/socket';
import { colors, shadow } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

type IconName = keyof typeof Ionicons.glyphMap;

/** ຂໍ້ຄວາມ 12px ຄົງທີ່ — ດຽວກັນກັບ AppointmentDetailScreen. */
function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

const TIMELINE_STEPS: HomeServiceJobStatus[] = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];

const STEP_ICON: Record<HomeServiceJobStatus, IconName> = {
  MATCHING: 'search',
  ASSIGNED: 'person-circle-outline',
  EN_ROUTE: 'car-outline',
  ARRIVED: 'home-outline',
  IN_PROGRESS: 'sparkles-outline',
  COMPLETED: 'checkmark-done',
  CANCELLED: 'close-circle-outline',
  NO_MATCH: 'alert-circle-outline',
};

/** trip status ທີ່ຍັງມີການເຄື່ອນທີ່ຂອງຊ່າງໃຫ້ຕິດຕາມ — ຫຼັງຈາກນີ້ (IN_PROGRESS/COMPLETED/CANCELLED)
 * ຊ່າງໄປຮອດແລ້ວ ບໍ່ຈຳເປັນຕ້ອງເປີດ socket/map ອີກ. */
const LIVE_STATUSES: HomeServiceJobStatus[] = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'];

/** ຈຸດເຕັ້ນ "ສົດ" — ເຄົາລົບ Reduce Motion. */
function PulseDot({ color }: { color: string }): React.JSX.Element {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduced, v]);
  return (
    <View className="h-2 w-2 items-center justify-center">
      {!reduced ? (
        <Animated.View
          style={{
            position: 'absolute',
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
          }}
        />
      ) : null}
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

/** ປຸ່ມກົມແກ້ວ ລອຍເທິງແຜນທີ່. */
function FloatingButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }): React.JSX.Element {
  return (
    <View className="rounded-full" style={shadow.card}>
      <Touchable onPress={onPress} pressScale={0.92} hitSlop={6} accessibilityRole="button" accessibilityLabel={label}>
        <GlassView intensity={40} radius={20}>
          <View className="h-10 w-10 items-center justify-center">
            <Ionicons name={icon} size={icon === 'chevron-back' ? 22 : 17} color={colors.foreground} />
          </View>
        </GlassView>
      </Touchable>
    </View>
  );
}

function Surface({ className, children }: { className?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View className={cn('rounded-2xl border border-border bg-card', className)} style={shadow.xs}>
      {children}
    </View>
  );
}

export function HomeServiceTrackingScreen({
  navigation,
  route,
}: AppScreenProps<'HomeServiceTracking'>): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { appointmentId } = route.params;
  const qc = useQueryClient();
  const query = useHomeServiceTrip(appointmentId);

  const [stylistPos, setStylistPos] = useState<{ lat: number; lng: number } | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [lastPingAt, setLastPingAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mapRef = useRef<MapView | null>(null);

  const trip = query.data;
  const isLive = trip ? LIVE_STATUSES.includes(trip.status) : false;

  useEffect(() => {
    if (trip?.lastLatitude != null && trip.lastLongitude != null) {
      setStylistPos({ lat: trip.lastLatitude, lng: trip.lastLongitude });
    }
    if (trip?.etaMinutes != null) setEtaMinutes(trip.etaMinutes);
    if (trip?.lastPingAt) setLastPingAt(trip.lastPingAt);
  }, [trip?.lastLatitude, trip?.lastLongitude, trip?.etaMinutes, trip?.lastPingAt]);

  useEffect(() => {
    if (!isLive) return undefined;

    const socket: Socket = connectTripSocket();
    socket.emit('join-trip', { appointmentId });

    socket.on('trip:location', (evt: HomeServiceLocationEvent) => {
      if (evt.appointmentId !== appointmentId) return;
      setStylistPos({ lat: evt.lat, lng: evt.lng });
      setEtaMinutes(evt.etaMinutes);
      setLastPingAt(evt.ts);
    });

    socket.on('trip:status', (evt: HomeServiceStatusEvent) => {
      if (evt.appointmentId !== appointmentId) return;
      void qc.invalidateQueries({ queryKey: qk.homeServiceTrip(appointmentId) });
    });

    return () => {
      socket.emit('leave-trip', { appointmentId });
      socket.disconnect();
    };
  }, [isLive, appointmentId, qc]);

  /** ນາຬິກາສຳລັບ "ອັບເດດ N ນາທີກ່ອນ" — tick ທຸກ 30 ວິ ຕອນ live ເທົ່ານັ້ນ. */
  useEffect(() => {
    if (!isLive) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isLive]);

  const hasDest = trip?.destLatitude != null && trip?.destLongitude != null;

  const fitMap = useCallback(() => {
    if (!mapRef.current) return;
    const points: { latitude: number; longitude: number }[] = [];
    if (stylistPos) points.push({ latitude: stylistPos.lat, longitude: stylistPos.lng });
    if (trip && hasDest) points.push({ latitude: trip.destLatitude as number, longitude: trip.destLongitude as number });
    if (points.length === 0) return;
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: insets.top + 72, right: 64, bottom: 64, left: 64 },
      animated: true,
    });
  }, [stylistPos, trip, hasDest, insets.top]);

  useEffect(() => {
    fitMap();
  }, [fitMap]);

  if (query.isLoading) return <LoadingScreen />;
  if (query.isError || !trip) {
    return <ErrorView message={normalizeError(query.error).message} onRetry={() => void query.refetch()} />;
  }

  const activeStepIndex = TIMELINE_STEPS.indexOf(trip.status);
  const isFailed = trip.status === 'CANCELLED' || trip.status === 'NO_MATCH';
  const staffName = trip.matchedStaffName;
  const pingMin = lastPingAt ? Math.max(0, Math.floor((now - Date.parse(lastPingAt)) / 60_000)) : null;
  const arrivalAt = isLive && etaMinutes != null && trip.status !== 'ARRIVED' ? vientiane().add(etaMinutes, 'minute') : null;
  const distanceKm = trip.distanceMeters != null ? (trip.distanceMeters / 1000).toFixed(1) : null;

  const STEP_AT: Partial<Record<HomeServiceJobStatus, string | null>> = {
    ASSIGNED: trip.assignedAt,
    EN_ROUTE: trip.enRouteAt,
    ARRIVED: trip.arrivedAt,
    IN_PROGRESS: trip.startedAt,
    COMPLETED: trip.completedAt,
  };

  const initialRegion = {
    latitude: stylistPos?.lat ?? trip.destLatitude ?? 17.9757,
    longitude: stylistPos?.lng ?? trip.destLongitude ?? 102.6331,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const callSalon = (): void =>
    void Linking.openURL(`tel:${(trip.branchPhone || CONCIERGE_PHONE).replace(/[^\d+]/g, '')}`);
  const openChat = (): void => navigation.navigate('Chat', { appointmentId });

  const heroTone = isFailed ? 'text-destructive' : trip.status === 'COMPLETED' ? 'text-success' : 'text-primary-strong';
  const heroTile = isFailed ? 'bg-destructive-soft' : trip.status === 'COMPLETED' ? 'bg-success-soft' : 'bg-primary-subtle';
  const heroIconColor = isFailed ? colors.destructive : trip.status === 'COMPLETED' ? colors.success : colors.primary;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      {/* ── ພື້ນທີ່ເທິງ: ແຜນທີ່ສົດ ຫຼື hero gradient ── */}
      <View style={{ height: isLive ? 320 + insets.top : 150 + insets.top }} className="w-full">
        {isLive ? (
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={initialRegion}
            showsCompass={false}
            toolbarEnabled={false}
          >
            {stylistPos && hasDest ? (
              <Polyline
                coordinates={[
                  { latitude: stylistPos.lat, longitude: stylistPos.lng },
                  { latitude: trip.destLatitude as number, longitude: trip.destLongitude as number },
                ]}
                strokeColor={colors.primary}
                strokeWidth={3}
                lineDashPattern={[8, 6]}
              />
            ) : null}
            {stylistPos ? (
              <Marker
                coordinate={{ latitude: stylistPos.lat, longitude: stylistPos.lng }}
                title={staffName ?? t('confirm.staff')}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View
                  className="h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-primary"
                  style={shadow.card}
                >
                  <Ionicons name="car" size={16} color={colors.primaryForeground} />
                </View>
              </Marker>
            ) : null}
            {hasDest ? (
              <Marker
                coordinate={{ latitude: trip.destLatitude as number, longitude: trip.destLongitude as number }}
                title={t('tracking.yourLocation')}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View
                  className="h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-accent-foreground"
                  style={shadow.card}
                >
                  <Ionicons name="home" size={14} color={colors.champagne} />
                </View>
              </Marker>
            ) : null}
          </MapView>
        ) : (
          <Gradient preset={isFailed ? 'wash' : 'hero'} fill pointerEvents="none" />
        )}

        {/* ປຸ່ມລອຍ */}
        <View
          className="absolute left-0 right-0 flex-row items-center justify-between px-4"
          style={{ top: insets.top + 6 }}
          pointerEvents="box-none"
        >
          <FloatingButton icon="chevron-back" label={t('common.back')} onPress={() => navigation.goBack()} />
          <View className="rounded-full" style={shadow.card}>
            <GlassView intensity={40} radius={16}>
              <View className="h-8 flex-row items-center gap-1.5 px-3">
                {isLive ? <PulseDot color={colors.success} /> : null}
                <T className="font-lao-semibold text-foreground">{t('tracking.title')}</T>
              </View>
            </GlassView>
          </View>
          {isLive ? (
            <FloatingButton icon="locate-outline" label={t('tracking.recenter')} onPress={fitMap} />
          ) : (
            <View className="w-10" />
          )}
        </View>
      </View>

      {/* ── Sheet ── */}
      <ScrollView
        className="-mt-5 flex-1 rounded-t-3xl bg-background"
        contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 8, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-1 h-1 w-10 self-center rounded-full bg-border" />

        {/* ສະຖານະ + ETA */}
        <AnimatedEntrance index={0}>
          <Surface className="gap-3 p-3.5">
            <View className="flex-row items-start gap-3">
              <View className={cn('h-10 w-10 items-center justify-center rounded-xl', heroTile)}>
                <Ionicons name={STEP_ICON[trip.status]} size={19} color={heroIconColor} />
              </View>
              <View className="flex-1">
                <T className={cn('font-lao-semibold', heroTone)}>{t(`tracking.status.${trip.status}`)}</T>
                <T className="font-lao text-muted-foreground">{t(`tracking.body.${trip.status}`)}</T>
              </View>
              {isLive && etaMinutes != null && trip.status !== 'ARRIVED' ? (
                <View className="items-center rounded-xl bg-primary px-2.5 py-1.5" style={shadow.primary}>
                  <T className="font-sans-semibold text-white">{t('tracking.etaMinutes', { count: etaMinutes })}</T>
                </View>
              ) : null}
            </View>

            {!isFailed && trip.status !== 'MATCHING' ? (
              <View className="flex-row gap-1">
                {TIMELINE_STEPS.map((s, i) => (
                  <View
                    key={s}
                    className={cn('h-1 flex-1 rounded-full', i <= activeStepIndex ? 'bg-primary' : 'bg-border')}
                  />
                ))}
              </View>
            ) : null}

            {isLive ? (
              <View className="flex-row items-center justify-between gap-2 border-t border-border pt-2.5">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
                  <T className="text-foreground">
                    {arrivalAt
                      ? t('tracking.etaArrival', { time: arrivalAt.format('HH:mm') })
                      : stylistPos
                        ? t(`tracking.status.${trip.status}`)
                        : t('tracking.waitingLocation')}
                  </T>
                </View>
                {pingMin != null ? (
                  <T className="text-muted-foreground">
                    {pingMin < 1 ? t('tracking.justNow') : t('tracking.updatedMinAgo', { count: pingMin })}
                  </T>
                ) : null}
              </View>
            ) : null}

            {isFailed ? (
              <View className="gap-2 border-t border-border pt-2.5">
                {trip.cancelReason ? (
                  <T className="font-lao text-muted-foreground">{t('tracking.reason', { reason: trip.cancelReason })}</T>
                ) : null}
                <Touchable
                  onPress={callSalon}
                  pressScale={0.97}
                  accessibilityRole="button"
                  className="h-9 flex-row items-center justify-center gap-1.5 rounded-full bg-destructive-soft"
                >
                  <Ionicons name="call-outline" size={14} color={colors.destructive} />
                  <T className="font-lao-medium text-destructive">{t('appointments.callStore')}</T>
                </Touchable>
              </View>
            ) : null}
          </Surface>
        </AnimatedEntrance>

        {/* ຊ່າງ */}
        {staffName ? (
          <AnimatedEntrance index={1}>
            <Surface className="flex-row items-center gap-3 p-3">
              <Avatar uri={trip.matchedStaffAvatarUrl} name={staffName} size={44} mode="cartoon" />
              <View className="flex-1">
                <T className="font-lao-semibold text-foreground" numberOfLines={1}>
                  {staffName}
                </T>
                <View className="flex-row items-center gap-1">
                  {trip.matchedStaffRating != null ? (
                    <>
                      <Ionicons name="star" size={11} color={colors.champagne} />
                      <T className="font-sans-medium text-foreground">{trip.matchedStaffRating.toFixed(1)}</T>
                    </>
                  ) : null}
                  {trip.matchedStaffTitle ? (
                    <T className="flex-1 text-muted-foreground" numberOfLines={1}>
                      {trip.matchedStaffRating != null ? '· ' : ''}
                      {trip.matchedStaffTitle}
                    </T>
                  ) : null}
                </View>
              </View>
              <Touchable
                onPress={openChat}
                pressScale={0.92}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('chat.quickAction')}
                className="h-9 w-9 items-center justify-center rounded-full bg-primary-subtle"
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primaryStrong} />
              </Touchable>
              <Touchable
                onPress={callSalon}
                pressScale={0.92}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('appointments.callStore')}
                className="h-9 w-9 items-center justify-center rounded-full bg-primary"
              >
                <Ionicons name="call" size={15} color={colors.primaryForeground} />
              </Touchable>
            </Surface>
          </AnimatedEntrance>
        ) : null}

        {/* ຈຸດໝາຍ */}
        <AnimatedEntrance index={2}>
          <Surface>
            <View className="flex-row items-start gap-2.5 p-3">
              <View className="h-7 w-7 items-center justify-center rounded-lg bg-accent-soft">
                <Ionicons name="home-outline" size={14} color={colors.accentForeground} />
              </View>
              <View className="flex-1">
                <T className="text-muted-foreground">{t('tracking.destination')}</T>
                <T className="font-lao-medium text-foreground">{trip.homeAddress ?? t('tracking.yourLocation')}</T>
              </View>
              {distanceKm ? (
                <View className="rounded-full bg-muted px-2 py-0.5">
                  <T className="font-sans-medium text-muted-foreground">{t('tracking.distanceKm', { km: distanceKm })}</T>
                </View>
              ) : null}
            </View>
            <View className="flex-row items-start gap-2.5 border-t border-border p-3">
              <View className="h-7 w-7 items-center justify-center rounded-lg bg-primary-subtle">
                <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
              </View>
              <View className="flex-1">
                <T className="font-lao-medium text-foreground" numberOfLines={1}>
                  {trip.serviceName}
                </T>
                <T className="text-muted-foreground">
                  {t('tracking.scheduledAt')} · {vientiane(trip.startAt).format('D MMM')} · {formatTime(trip.startAt)}
                </T>
              </View>
            </View>
          </Surface>
        </AnimatedEntrance>

        {/* Timeline */}
        {!isFailed ? (
          <AnimatedEntrance index={3}>
            <Surface className="p-3">
              <T className="mb-2 font-lao-medium text-muted-foreground">{t('tracking.timelineTitle')}</T>
              {TIMELINE_STEPS.map((step, i) => {
                const done = activeStepIndex >= 0 && i < activeStepIndex;
                const current = i === activeStepIndex;
                const at = STEP_AT[step];
                const isLast = i === TIMELINE_STEPS.length - 1;
                return (
                  <View key={step} className="flex-row gap-2.5">
                    <View className="items-center" style={{ width: 22 }}>
                      <View
                        className={cn(
                          'h-[22px] w-[22px] items-center justify-center rounded-full',
                          done ? 'bg-primary' : current ? 'border-2 border-primary bg-card' : 'bg-muted',
                        )}
                      >
                        {done ? (
                          <Ionicons name="checkmark" size={12} color={colors.primaryForeground} />
                        ) : current ? (
                          <PulseDot color={colors.primary} />
                        ) : (
                          <Ionicons name={STEP_ICON[step]} size={11} color={colors.mutedForeground} />
                        )}
                      </View>
                      {!isLast ? (
                        <View className={cn('w-0.5 flex-1', done ? 'bg-primary' : 'bg-border')} style={{ minHeight: 14 }} />
                      ) : null}
                    </View>
                    <View className={cn('flex-1 flex-row justify-between gap-2', !isLast && 'pb-3')}>
                      <T
                        className={cn(
                          current ? 'font-lao-semibold text-primary-strong' : done ? 'font-lao-medium text-foreground' : 'font-lao text-muted-foreground',
                        )}
                        style={{ lineHeight: 22 }}
                      >
                        {t(`tracking.status.${step}`)}
                      </T>
                      {at ? (
                        <T className="font-sans-medium text-muted-foreground" style={{ lineHeight: 22 }}>
                          {formatTime(at)}
                        </T>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </Surface>
          </AnimatedEntrance>
        ) : null}

        <Touchable
          onPress={() => navigation.navigate('AppointmentDetail', { id: appointmentId })}
          pressScale={0.97}
          haptic="none"
          accessibilityRole="button"
          className="flex-row items-center justify-center gap-1 py-1"
        >
          <T className="font-lao-medium text-primary">{t('tracking.viewAppointment')}</T>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </Touchable>
      </ScrollView>
    </SafeAreaView>
  );
}
