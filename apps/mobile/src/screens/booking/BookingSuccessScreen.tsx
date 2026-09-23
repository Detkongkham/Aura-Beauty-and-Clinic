import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FooterBar } from '../../components/shared/FooterBar';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Button } from '../../components/ui/Button';
import { CLINIC_PHONE } from '../../config/env';
import { useAppointment } from '../../features/appointments/appointments.api';
import { useCancelPolicyText } from '../../features/booking/useCancelPolicyText';
import { useBranch } from '../../features/catalog/catalog.api';
import { Card, Notice, SMALL, T, type Tone } from '../../features/booking/booking-kit';
import { daysFromToday, longDate, vt } from '../../features/booking/booking-dates';
import {
  AppointmentPass,
  ArrivalGuide,
  QuickActions,
  StatusTracker,
  SuccessMark,
  type PassPayment,
  type QuickAction,
} from '../../features/booking/booking-success.parts';
import { formatLAK, formatTime } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { useBookingDraft } from '../../store/booking-draft.store';
import type { AppScreenProps } from '../../navigation/types';

/** id ນັດໝາຍ → ລະຫັດການຈອງທີ່ອ່ານງ່າຍ (#AUR-XXXXX). ບໍ່ມີ id → null (ບໍ່ສຸ່ມ). */
function refCodeFrom(appointmentId?: string): string | null {
  const tail = (appointmentId ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase();
  return tail.length === 5 ? `#AUR-${tail}` : null;
}

const STATUS_TONE: Record<string, Tone> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'destructive',
  NO_SHOW: 'destructive',
};

export function BookingSuccessScreen({
  navigation,
  route,
}: AppScreenProps<'BookingSuccess'>): React.JSX.Element {
  const { t } = useTranslation();
  const reset = useBookingDraft((s) => s.reset);
  const { appointmentId, mode } = route.params;
  const isReschedule = mode === 'reschedule';

  // snapshot ຂອງ draft ກ່ອນ reset() — fallback ລະຫວ່າງລໍຖ້າຂໍ້ມູນຈິງຈາກ API.
  const [snap] = useState(() => useBookingDraft.getState());
  const refCode = refCodeFrom(appointmentId);

  useEffect(() => {
    reset();
    haptics.success();
  }, [reset]);

  // ຂໍ້ມູນຈິງ: ສະຖານະ, ຊ່າງທີ່ຖືກຈັດ, ທີ່ຢູ່/ເບີສາຂາ, ການຊຳລະ.
  const appt = useAppointment(appointmentId ?? '', !!appointmentId).data;
  // fallback ລະຫວ່າງລໍຖ້ານັດ: ຂໍ້ມູນສາຂາຈາກ API (ບໍ່ hard-code).
  const branch = useBranch(snap.branchId || appt?.branchId).data;
  const policyText = useCancelPolicyText();

  const status = appt?.status ?? 'PENDING';
  const startAt = appt?.startAt ?? snap.slot?.startAt ?? null;
  const endAt = appt?.endAt ?? snap.slot?.endAt ?? null;
  const service = appt?.serviceName ?? snap.serviceName ?? '-';
  const total = appt?.totalAmount ?? snap.price;
  const branchName = appt?.branchName ?? branch?.name ?? '…';
  const branchAddress = appt?.branchAddress || branch?.address || '';
  const branchPhone = appt?.branchPhone || branch?.phone || CLINIC_PHONE;
  const wasAnyStaff = snap.staffProfileId === null && !isReschedule;
  const staffName = appt?.staffName ?? snap.staffName ?? t('success.anyStaff');

  // ---- ການຊຳລະ -------------------------------------------------------------
  const pay = appt?.payment ?? null;
  const depositRequired = (pay?.depositAmount ?? snap.depositAmount ?? 0) > 0;
  const paid = pay?.status === 'DEPOSIT_PAID' || pay?.status === 'FULLY_PAID';
  const canPay = !isReschedule && !!appointmentId && !paid && pay?.status !== 'REFUNDED' && pay?.status !== 'VOIDED';

  let passPayment: PassPayment = null;
  if (pay?.status === 'FULLY_PAID') {
    passPayment = { label: t('success.payFull'), value: formatLAK(pay.paidAmount), tone: 'success' };
  } else if (pay?.status === 'DEPOSIT_PAID') {
    passPayment = {
      label: t('success.payDepositPaid'),
      value: formatLAK(pay.paidAmount),
      tone: 'success',
    };
  } else if (!isReschedule && depositRequired) {
    passPayment = {
      label: t('success.payDepositDue'),
      value: formatLAK(pay?.depositAmount ?? snap.depositAmount ?? 0),
      tone: 'warning',
    };
  } else if (!isReschedule && total != null) {
    passPayment = { label: t('success.payAtStore'), value: formatLAK(total), tone: 'muted' };
  }

  // ---- ວັນ-ເວລາ ------------------------------------------------------------
  const start = startAt ? vt(startAt) : null;
  const dayOffset = startAt ? daysFromToday(startAt) : null;
  const relativeDay =
    dayOffset === 0 ? t('success.today') : dayOffset === 1 ? t('success.tomorrow') : null;
  const timeRange = startAt
    ? endAt
      ? `${formatTime(startAt)} – ${formatTime(endAt)}`
      : formatTime(startAt)
    : '-';
  const durationMin = snap.durationMinutes;

  // ---- actions ---------------------------------------------------------------
  const onShare = (): void => {
    void Share.share({
      message: t('success.shareMessage', {
        code: refCode ?? '',
        service,
        date: start ? longDate(start) : '-',
        time: timeRange,
        branch: branchName,
      }),
    });
  };

  const onDirections = (): void => {
    const lat = appt?.branchLatitude;
    const lng = appt?.branchLongitude;
    const q =
      lat != null && lng != null
        ? `${lat},${lng}`
        : encodeURIComponent(`${branchName}, ${branchAddress}`);
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  const onCall = (): void => {
    void Linking.openURL(`tel:${branchPhone.replace(/\s/g, '')}`);
  };

  const goDetails = (): void => {
    navigation.reset({
      index: appointmentId ? 1 : 0,
      routes: [
        { name: 'Tabs', state: { routes: [{ name: 'AppointmentsTab' }] } },
        ...(appointmentId ? [{ name: 'AppointmentDetail' as const, params: { id: appointmentId } }] : []),
      ],
    });
  };

  const goHome = (): void => {
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  const goPay = (): void => {
    if (appointmentId) navigation.navigate('Payment', { appointmentId });
  };

  const actions: QuickAction[] = [
    { key: 'share', icon: 'share-outline', label: t('success.actionShare'), onPress: onShare },
    { key: 'map', icon: 'navigate-outline', label: t('success.actionDirections'), onPress: onDirections },
    { key: 'call', icon: 'call-outline', label: t('success.actionCall'), onPress: onCall },
    ...(appointmentId
      ? [
          {
            key: 'chat',
            icon: 'chatbubble-ellipses-outline' as const,
            label: t('success.actionChat'),
            onPress: () => navigation.navigate('Chat', { appointmentId }),
          },
        ]
      : []),
  ];

  // QR ເລືອກໄວ້ → ປຸ່ມຫຼັກ = ຈ່າຍມັດຈຳ. ຈ່າຍໜ້າຮ້ານ → ປຸ່ມຫຼັກ = ເບິ່ງນັດ, ຈ່າຍເປັນລິ້ງຮອງ.
  const payFirst = canPay && depositRequired && snap.payMethod === 'bcel_qr';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 20, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <AnimatedEntrance index={0}>
          <View className="items-center">
            <SuccessMark />
            <T
              accessibilityRole="header"
              className="mt-2 text-center font-lao-semibold text-foreground"
              style={{ fontSize: 15, lineHeight: 21 }}
            >
              {isReschedule ? t('success.rescheduleTitle') : t('success.title')}
            </T>
            <T className="mt-1 max-w-[300px] text-center font-lao text-muted-foreground">
              {isReschedule ? t('success.rescheduleSubtitle') : t('success.subtitle')}
            </T>
          </View>
        </AnimatedEntrance>

        {/* ຄວາມຄືບໜ້າ */}
        <AnimatedEntrance index={1}>
          <Card flat className="px-2 py-3">
            <StatusTracker confirmed={status !== 'PENDING'} paid={paid} />
          </Card>
        </AnimatedEntrance>

        {/* ໃບຜ່ານ */}
        <AnimatedEntrance index={2}>
          <AppointmentPass
            refCode={refCode}
            statusLabel={t(`status.${status}`)}
            statusTone={STATUS_TONE[status] ?? 'muted'}
            service={service}
            duration={durationMin != null ? t('common.minutesShort', { count: durationMin }) : null}
            price={total != null ? formatLAK(total) : null}
            dateLabel={start ? longDate(start) : '-'}
            timeRange={timeRange}
            relativeDay={relativeDay}
            staffName={staffName}
            staffSub={
              wasAnyStaff ? (appt ? t('success.assignedForYou') : t('success.anyStaffSub')) : (appt?.staffTitle ?? null)
            }
            staffAvatarUrl={appt?.staffAvatarUrl ?? null}
            branch={branchName}
            branchSub={branchAddress}
            payment={passPayment}
          />
        </AnimatedEntrance>

        {/* ມັດຈຳຄ້າງ */}
        {canPay && depositRequired && !payFirst ? (
          <AnimatedEntrance index={3}>
            <Notice
              tone="warning"
              icon="wallet-outline"
              title={t('success.depositNoticeTitle')}
              body={t('success.depositNoticeBody')}
            />
          </AnimatedEntrance>
        ) : null}

        <AnimatedEntrance index={4}>
          <QuickActions actions={actions} />
        </AnimatedEntrance>

        <AnimatedEntrance index={5}>
          <ArrivalGuide
            items={[
              { icon: 'time-outline', text: t('success.guideArrive') },
              { icon: 'chatbubble-outline', text: t('success.guideNotify') },
              { icon: 'calendar-outline', text: policyText },
            ]}
          />
        </AnimatedEntrance>

        {refCode ? (
          <T className="text-center font-lao text-muted-foreground" style={SMALL}>
            {t('success.refHint')}
          </T>
        ) : null}
      </ScrollView>

      <FooterBar>
        {payFirst ? (
          <>
            <Button
              label={t('success.payDepositCta', {
                amount: formatLAK(pay?.depositAmount ?? snap.depositAmount ?? 0),
              })}
              size="md"
              icon="qr-code-outline"
              labelClassName="text-[13px] text-center"
              onPress={goPay}
            />
            <Button
              label={t('success.viewAppointments')}
              variant="ghost"
              size="sm"
              labelClassName="text-[12px]"
              onPress={goDetails}
            />
          </>
        ) : (
          <>
            <Button
              label={t('success.viewAppointments')}
              size="md"
              icon="arrow-forward"
              labelClassName="text-[13px] text-center"
              onPress={goDetails}
            />
            <View className="flex-row gap-2">
              {canPay ? (
                <Button
                  label={t('success.payNow')}
                  variant="ghost"
                  size="sm"
                  icon="card-outline"
                  labelClassName="text-[12px]"
                  className="flex-1"
                  fullWidth={false}
                  onPress={goPay}
                />
              ) : null}
              <Button
                label={t('success.backHome')}
                variant="ghost"
                size="sm"
                icon="home-outline"
                labelClassName="text-[12px]"
                className="flex-1"
                fullWidth={false}
                onPress={goHome}
              />
            </View>
          </>
        )}
      </FooterBar>
    </SafeAreaView>
  );
}
