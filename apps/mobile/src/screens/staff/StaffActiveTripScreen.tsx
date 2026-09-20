import type { HomeServiceJobStatus } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Socket } from 'socket.io-client';
import { ErrorView, LoadingScreen } from '../../components/shared/StateViews';
import { FooterBar } from '../../components/shared/FooterBar';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Sheet } from '../../components/ui/Sheet';
import { Touchable } from '../../components/ui/Touchable';
import { useHomeServiceTrip, useUpdateTripStatus } from '../../features/staff/home-service.api';
import { useUpdateApptStatus } from '../../features/staff/staff-portal.api';
import { cn } from '../../lib/cn';
import { formatTime, vientiane } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { connectTripSocket } from '../../services/socket';
import { colors, shadow } from '../../theme';
import type { StaffAppScreenProps } from '../../navigation/types';
import {
  ActionTile,
  HeaderIconButton,
  HeroCard,
  SectionHeading,
  SMALL,
  StaffHeader,
  StaffScreenTitle,
  T,
  TINT,
} from './staff-portal.parts';

const STATUS_TONE: Record<HomeServiceJobStatus, React.ComponentProps<typeof Badge>['tone']> = {
  MATCHING: 'neutral',
  ASSIGNED: 'primary',
  EN_ROUTE: 'warning',
  ARRIVED: 'accent',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'destructive',
  NO_MATCH: 'destructive',
};

/** ລຳດັບຂັ້ນຕອນຂອງ trip — ໃຊ້ວັດຄວາມຄືບໜ້າໃນ timeline. */
const FLOW: HomeServiceJobStatus[] = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
const FLOW_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  ASSIGNED: 'clipboard-outline',
  EN_ROUTE: 'car-outline',
  ARRIVED: 'flag-outline',
  IN_PROGRESS: 'cut-outline',
  COMPLETED: 'checkmark-done-outline',
};

/** ເສັ້ນເວລາຂອງ trip — ຈຸດ + ເສັ້ນຕັ້ງ, ຂັ້ນທີ່ຜ່ານມາແລ້ວເປັນສີ brand. */
function TripTimeline({ status }: { status: HomeServiceJobStatus }): React.JSX.Element {
  const { t } = useTranslation();
  const current = FLOW.indexOf(status);
  return (
    <View className="gap-0">
      {FLOW.map((step, i) => {
        const done = current > i;
        const active = current === i;
        const last = i === FLOW.length - 1;
        return (
          <View key={step} className="flex-row gap-2.5">
            <View className="items-center" style={{ width: 26 }}>
              <View
                className={cn(
                  'h-6 w-6 items-center justify-center rounded-full border',
                  done || active ? 'border-primary bg-primary' : 'border-border bg-card',
                )}
              >
                <Ionicons
                  name={FLOW_ICON[step]!}
                  size={12}
                  color={done || active ? colors.primaryForeground : colors.mutedForeground}
                />
              </View>
              {!last ? (
                <View className={cn('w-px flex-1', done ? 'bg-primary' : 'bg-border')} style={{ minHeight: 16 }} />
              ) : null}
            </View>
            <View className={cn('flex-1', last ? 'pb-0' : 'pb-3')}>
              <T
                className={cn(
                  'font-lao',
                  active ? 'font-lao-semibold text-primary-strong' : done ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t(`staffPortal.homeService.status.${step}`)}
              </T>
              {active ? (
                <T className="font-lao text-muted-foreground" style={SMALL}>
                  {t('staffPortal.homeService.currentStep')}
                </T>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function StaffActiveTripScreen({
  navigation,
  route,
}: StaffAppScreenProps<'StaffActiveTrip'>): React.JSX.Element {
  const { t } = useTranslation();
  const { appointmentId, customerPhone } = route.params;

  const query = useHomeServiceTrip(appointmentId);
  const tripStatus = useUpdateTripStatus(appointmentId);
  const apptStatus = useUpdateApptStatus();

  const [tracking, setTracking] = useState(false);
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const status = query.data?.status;
  const shouldTrack = status === 'EN_ROUTE';

  useEffect(() => {
    if (!shouldTrack) return undefined;

    let cancelled = false;
    const socket = connectTripSocket();
    socketRef.current = socket;
    socket.emit('join-trip', { appointmentId });

    void (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted' || cancelled) {
        Alert.alert('', t('staffPortal.attendance.permissionDenied'));
        return;
      }
      setTracking(true);
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 20 },
        (pos) => {
          const payload = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (socket.connected) {
            socket.emit('stylist:location', payload);
          }
        },
      );
    })();

    return () => {
      cancelled = true;
      setTracking(false);
      watchRef.current?.remove();
      watchRef.current = null;
      socket.emit('leave-trip', { appointmentId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [shouldTrack, appointmentId, t]);

  const runTripStatus = (next: 'EN_ROUTE' | 'ARRIVED' | 'CANCELLED', reason?: string): void => {
    tripStatus.mutate(
      { status: next, ...(reason ? { reason } : {}) },
      {
        onSuccess: () => haptics.success(),
        onError: (err) => {
          haptics.error();
          Alert.alert('', normalizeError(err).message);
        },
      },
    );
  };

  const runApptStatus = (next: 'IN_PROGRESS' | 'COMPLETED'): void => {
    apptStatus.mutate(
      { id: appointmentId, status: next },
      {
        onSuccess: () => haptics.success(),
        onError: (err) => {
          haptics.error();
          Alert.alert('', normalizeError(err).message);
        },
      },
    );
  };

  const submitCancel = (): void => {
    setCancelSheetOpen(false);
    runTripStatus('CANCELLED', cancelReason.trim() || undefined);
    setCancelReason('');
  };

  if (query.isLoading) return <LoadingScreen />;
  if (query.isError || !query.data) {
    return (
      <ErrorView message={normalizeError(query.error).message} onRetry={() => void query.refetch()} />
    );
  }

  const trip = query.data;
  const busy = tripStatus.isPending || apptStatus.isPending;
  const canCancel =
    trip.status === 'ASSIGNED' || trip.status === 'EN_ROUTE' || trip.status === 'ARRIVED';
  const phone = customerPhone ?? trip.customerPhone;
  const mapQuery =
    trip.destLatitude != null && trip.destLongitude != null
      ? `${trip.destLatitude},${trip.destLongitude}`
      : (trip.homeAddress ?? '');
  const km = trip.distanceMeters != null ? (trip.distanceMeters / 1000).toFixed(1) : null;

  const primary =
    trip.status === 'ASSIGNED'
      ? {
          label: t('staffPortal.homeService.startTrip'),
          icon: 'navigate-outline' as const,
          loading: tripStatus.isPending,
          run: () => runTripStatus('EN_ROUTE'),
        }
      : trip.status === 'EN_ROUTE'
        ? {
            label: t('staffPortal.homeService.arrived'),
            icon: 'flag-outline' as const,
            loading: tripStatus.isPending,
            run: () => runTripStatus('ARRIVED'),
          }
        : trip.status === 'ARRIVED'
          ? {
              label: t('staffPortal.homeService.startService'),
              icon: 'play-outline' as const,
              loading: apptStatus.isPending,
              run: () => runApptStatus('IN_PROGRESS'),
            }
          : trip.status === 'IN_PROGRESS'
            ? {
                label: t('staffPortal.today.complete'),
                icon: 'checkmark-done-outline' as const,
                loading: apptStatus.isPending,
                run: () => runApptStatus('COMPLETED'),
              }
            : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StaffHeader>
        <StaffScreenTitle
          eyebrow="Aura Team • Home Service"
          title={t('staffPortal.homeService.title')}
          subtitle={t('staffPortal.homeService.startAt', { time: formatTime(trip.startAt) })}
          right={
            <HeaderIconButton
              icon="close"
              label={t('common.back')}
              onPress={() => navigation.goBack()}
            />
          }
        />
      </StaffHeader>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 14, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <AnimatedEntrance index={0}>
          <HeroCard>
            <View className="gap-3">
              <View className="flex-row items-center justify-between gap-2">
                <Badge
                  dot
                  label={t(`staffPortal.homeService.status.${trip.status}`)}
                  tone={STATUS_TONE[trip.status]}
                />
                {tracking ? (
                  <View className="flex-row items-center gap-1.5 rounded-full bg-success-soft px-2 py-1">
                    <View className="h-1.5 w-1.5 rounded-full bg-success" />
                    <T className="font-lao-medium text-success" style={SMALL}>
                      {t('staffPortal.homeService.sharingLocation')}
                    </T>
                  </View>
                ) : null}
              </View>

              <View className="flex-row items-center gap-3">
                <Avatar name={trip.customerName} size={44} mode="cartoon" />
                <View className="flex-1 gap-0.5">
                  <T numberOfLines={1} className="font-lao-semibold text-foreground">
                    {trip.customerName}
                  </T>
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="cut-outline" size={11} color={colors.mutedForeground} />
                    <T numberOfLines={1} className="flex-1 font-lao text-muted-foreground" style={SMALL}>
                      {trip.serviceName}
                    </T>
                  </View>
                </View>
              </View>

              {trip.homeAddress ? (
                <View className="flex-row items-start gap-1.5 rounded-xl bg-muted px-3 py-2">
                  <Ionicons name="location-outline" size={12} color={colors.mutedForeground} style={{ marginTop: 1 }} />
                  <T className="flex-1 font-lao text-foreground" style={SMALL}>
                    {trip.homeAddress}
                  </T>
                </View>
              ) : null}

              <View className="flex-row gap-2">
                <View className="flex-1 items-center rounded-xl border border-border bg-card/70 py-2">
                  <T className="font-sans-semibold text-foreground">
                    {trip.etaMinutes != null ? `${trip.etaMinutes}` : '–'}
                  </T>
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('staffPortal.homeService.etaLabel')}
                  </T>
                </View>
                <View className="flex-1 items-center rounded-xl border border-border bg-card/70 py-2">
                  <T className="font-sans-semibold text-foreground">{km ?? '–'}</T>
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('staffPortal.homeService.distanceLabel')}
                  </T>
                </View>
                <View className="flex-1 items-center rounded-xl border border-border bg-card/70 py-2">
                  <T className="font-sans-semibold text-foreground">{formatTime(trip.startAt)}</T>
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('staffPortal.homeService.startLabel')}
                  </T>
                </View>
              </View>

              {trip.lastPingAt ? (
                <T className="font-lao text-muted-foreground" style={SMALL}>
                  {t('staffPortal.homeService.lastPing', {
                    time: vientiane(trip.lastPingAt).format('HH:mm'),
                  })}
                </T>
              ) : null}
            </View>
          </HeroCard>
        </AnimatedEntrance>

        <AnimatedEntrance index={1}>
          <View className="flex-row gap-2.5">
            <ActionTile
              icon="call"
              tint={TINT.money}
              label={t('staffPortal.detail.callCustomer')}
              hint={phone}
              onPress={() => void Linking.openURL(`tel:${phone}`)}
            />
            <ActionTile
              icon="map"
              tint={TINT.place}
              label={t('staffPortal.detail.openMap')}
              onPress={() =>
                void Linking.openURL(
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`,
                )
              }
              disabled={!mapQuery}
            />
          </View>
        </AnimatedEntrance>

        {trip.customerNotes ? (
          <AnimatedEntrance index={2}>
            <View className="gap-2">
              <SectionHeading label={t('staffPortal.homeService.notesLabel')} />
              <View
                className="gap-1 rounded-2xl border p-3"
                style={{ backgroundColor: TINT.note.bg, borderColor: `${TINT.note.fg}26` }}
              >
                <T className="font-lao text-foreground">{trip.customerNotes}</T>
              </View>
            </View>
          </AnimatedEntrance>
        ) : null}

        <AnimatedEntrance index={3}>
          <View className="gap-2">
            <SectionHeading label={t('staffPortal.homeService.stepsSection')} />
            <View className="rounded-2xl border border-border bg-card p-3.5" style={shadow.xs}>
              <TripTimeline status={trip.status} />
            </View>
          </View>
        </AnimatedEntrance>

        <AnimatedEntrance index={4}>
          <Touchable
            onPress={() => void Linking.openURL(`tel:${trip.branchPhone}`)}
            pressScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={t('staffPortal.homeService.callBranch')}
            className="flex-row items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5"
            style={shadow.xs}
          >
            <View className="h-8 w-8 items-center justify-center rounded-xl bg-primary-subtle">
              <Ionicons name="business-outline" size={15} color={colors.primary} />
            </View>
            <View className="flex-1">
              <T className="font-lao-semibold text-foreground">{trip.branchName}</T>
              <T className="font-sans text-muted-foreground" style={SMALL}>
                {trip.branchPhone}
              </T>
            </View>
            <Ionicons name="call-outline" size={15} color={colors.primary} />
          </Touchable>
        </AnimatedEntrance>

        {trip.status === 'CANCELLED' && trip.cancelReason ? (
          <View className="gap-1 rounded-2xl border border-destructive/30 bg-destructive-soft p-3">
            <T className="font-lao-semibold text-destructive" style={SMALL}>
              {t('staffPortal.homeService.cancelReasonLabel')}
            </T>
            <T className="font-lao text-foreground">{trip.cancelReason}</T>
          </View>
        ) : null}
      </ScrollView>

      <FooterBar>
        {primary ? (
          <Button label={primary.label} size="sm" icon={primary.icon} loading={primary.loading} onPress={primary.run} />
        ) : (
          <View className="flex-row items-center justify-center gap-1.5 py-1">
            <Badge
              dot
              label={t(`staffPortal.homeService.status.${trip.status}`)}
              tone={STATUS_TONE[trip.status]}
            />
          </View>
        )}
        {canCancel ? (
          <Button
            label={t('staffPortal.homeService.cancelTrip')}
            size="sm"
            variant="ghost"
            disabled={busy}
            onPress={() => setCancelSheetOpen(true)}
          />
        ) : null}
      </FooterBar>

      <Sheet
        open={cancelSheetOpen}
        onClose={() => setCancelSheetOpen(false)}
        title={t('staffPortal.homeService.cancelTitle')}
        description={t('staffPortal.homeService.cancelBody')}
      >
        <View className="gap-3">
          <Input
            label={t('staffPortal.homeService.cancelReasonLabel')}
            placeholder={t('staffPortal.homeService.cancelReasonPlaceholder')}
            value={cancelReason}
            onChangeText={setCancelReason}
            multiline
          />
          <Button
            label={t('staffPortal.homeService.cancelConfirm')}
            size="sm"
            variant="destructive"
            loading={tripStatus.isPending}
            onPress={submitCancel}
          />
          <Button
            label={t('common.back')}
            size="sm"
            variant="ghost"
            onPress={() => setCancelSheetOpen(false)}
          />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
