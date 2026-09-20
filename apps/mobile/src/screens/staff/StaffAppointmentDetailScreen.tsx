import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, View } from 'react-native';
import { Screen } from '../../components/shared/Screen';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { ErrorView, LoadingScreen } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Gradient } from '../../components/ui/Gradient';
import { useStaffAppointment, useUpdateApptStatus } from '../../features/staff/staff-portal.api';
import { haptics } from '../../lib/haptics';
import { cn } from '../../lib/cn';
import { formatDate, formatTime, vientiane } from '../../lib/format';
import { normalizeError } from '../../services/apiError';
import { colors, shadow } from '../../theme';
import type { StaffAppScreenProps } from '../../navigation/types';
import {
  ActionTile,
  InfoRow,
  SectionHeading,
  SMALL,
  StaffStatusPill,
  T,
  TINT,
} from './staff-portal.parts';

type Step = { key: string; label: string; done: boolean; active: boolean };

/** ແຖບຂັ້ນຕອນ 3 ຈຸດ — ຢືນຢັນ → ກຳລັງບໍລິການ → ສຳເລັດ. */
function StatusSteps({ steps }: { steps: Step[] }): React.JSX.Element {
  return (
    <View className="flex-row items-center">
      {steps.map((s, i) => (
        <View key={s.key} className="flex-1 flex-row items-center">
          <View className="items-center" style={{ width: 58 }}>
            <View
              className={cn(
                'h-5 w-5 items-center justify-center rounded-full border',
                s.done
                  ? 'border-primary bg-primary'
                  : s.active
                    ? 'border-primary bg-card'
                    : 'border-border bg-card',
              )}
            >
              {s.done ? (
                <Ionicons name="checkmark" size={11} color={colors.primaryForeground} />
              ) : (
                <View
                  className={cn('h-1.5 w-1.5 rounded-full', s.active ? 'bg-primary' : 'bg-border')}
                />
              )}
            </View>
            <T
              numberOfLines={1}
              className={cn(
                'mt-1 font-lao',
                s.done || s.active ? 'text-foreground' : 'text-muted-foreground',
              )}
              style={SMALL}
            >
              {s.label}
            </T>
          </View>
          {i < steps.length - 1 ? (
            <View className={cn('mb-4 h-px flex-1', s.done ? 'bg-primary' : 'bg-border')} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function StaffAppointmentDetailScreen({
  route,
  navigation,
}: StaffAppScreenProps<'StaffAppointmentDetail'>): React.JSX.Element {
  const { id } = route.params;
  const { t } = useTranslation();
  const query = useStaffAppointment(id);
  const mutation = useUpdateApptStatus();

  const item = query.data;

  const runStatus = (status: 'IN_PROGRESS' | 'COMPLETED'): void => {
    mutation.mutate(
      { id, status },
      {
        onSuccess: () => {
          if (status === 'COMPLETED') haptics.success();
        },
        onError: (err) => {
          haptics.error();
          Alert.alert('', normalizeError(err).message);
        },
      },
    );
  };

  const canStart = item?.status === 'PENDING' || item?.status === 'CONFIRMED';
  const canComplete = item?.status === 'IN_PROGRESS';
  const showTreatment = item?.status === 'IN_PROGRESS' || item?.status === 'COMPLETED';

  const minsUntil = item ? vientiane(item.startAt).diff(vientiane(), 'minute') : 0;
  const impending = !!item && canStart && minsUntil >= 0 && minsUntil <= 120;
  const impendingLabel =
    minsUntil >= 60
      ? t('staffPortal.detail.inHours', { count: Math.round(minsUntil / 60) })
      : t('staffPortal.detail.inMinutes', { count: minsUntil });

  const steps: Step[] = item
    ? [
        {
          key: 'booked',
          label: t('staffPortal.detail.stepBooked'),
          done: item.status !== 'PENDING',
          active: item.status === 'PENDING',
        },
        {
          key: 'inprogress',
          label: t('staffPortal.detail.stepService'),
          done: item.status === 'COMPLETED',
          active: item.status === 'IN_PROGRESS',
        },
        {
          key: 'done',
          label: t('staffPortal.detail.stepDone'),
          done: item.status === 'COMPLETED',
          active: false,
        },
      ]
    : [];

  return (
    <Screen
      scroll
      padded={false}
      edges={['top', 'bottom']}
      footer={
        item ? (
          <View className="gap-2">
            {canStart ? (
              <Button
                label={t('staffPortal.today.start')}
                size="sm"
                icon="play"
                labelClassName="text-[13px]"
                loading={mutation.isPending}
                onPress={() => runStatus('IN_PROGRESS')}
              />
            ) : null}
            {canComplete ? (
              <Button
                label={t('staffPortal.today.complete')}
                size="sm"
                icon="checkmark-done"
                labelClassName="text-[13px]"
                loading={mutation.isPending}
                onPress={() => runStatus('COMPLETED')}
              />
            ) : null}
            {showTreatment ? (
              <Button
                label={t('staffPortal.detail.openTreatment')}
                size="sm"
                labelClassName="text-[13px]"
                variant={canComplete ? 'outline' : 'primary'}
                icon="document-text-outline"
                onPress={() =>
                  navigation.navigate('TreatmentRecord', {
                    appointmentId: id,
                    customerName: item.customerName,
                  })
                }
              />
            ) : null}
          </View>
        ) : undefined
      }
    >
      <ScreenHeader
        title={t('staffPortal.detail.title')}
        titleStyle={{ fontSize: 14, lineHeight: 19 }}
        onBack={() => navigation.goBack()}
        borderless
      />

      {query.isLoading ? (
        <LoadingScreen />
      ) : query.isError || !item ? (
        <ErrorView
          message={normalizeError(query.error).message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <View className="gap-3 px-4 pb-6 pt-1">
          {/* hero — ລູກຄ້າ + ສະຖານະ + ຂັ້ນຕອນ */}
          <AnimatedEntrance index={0}>
            <View
              className="overflow-hidden rounded-2xl border border-border bg-card p-4"
              style={shadow.card}
            >
              <Gradient preset="wash" fill pointerEvents="none" />
              <View className="gap-3">
                <View className="flex-row items-center gap-3">
                  <Avatar name={item.customerName} size={44} mode="cartoon" />
                  <View className="flex-1 gap-0.5">
                    <T numberOfLines={1} className="font-lao-semibold text-foreground">
                      {item.customerName}
                    </T>
                    <View className="flex-row flex-wrap items-center gap-1.5">
                      <View className="rounded-md bg-muted px-1.5 py-0.5">
                        <T className="font-sans-medium text-muted-foreground" style={SMALL}>
                          {item.code}
                        </T>
                      </View>
                      {item.isWalkIn ? (
                        <Badge label={t('staffPortal.today.walkIn')} tone="primary" />
                      ) : null}
                      {item.deliveryType === 'HOME_SERVICE' ? (
                        <Badge label={t('staffPortal.today.homeService')} tone="accent" />
                      ) : null}
                    </View>
                  </View>
                  <StaffStatusPill status={item.status} />
                </View>

                {impending ? (
                  <View className="flex-row items-center gap-1.5 self-start rounded-full border border-warning/40 bg-warning-soft px-2.5 py-1">
                    <Ionicons name="alarm-outline" size={12} color={colors.warning} />
                    <T className="font-lao-medium text-warning" style={SMALL}>
                      {impendingLabel}
                    </T>
                  </View>
                ) : null}

                <StatusSteps steps={steps} />
              </View>
            </View>
          </AnimatedEntrance>

          {/* ຕິດຕໍ່ໄວ */}
          <AnimatedEntrance index={1}>
            <View className="flex-row gap-2.5">
              <ActionTile
                icon="call"
                tint={TINT.money}
                label={t('staffPortal.detail.callCustomer')}
                hint={item.customerPhone}
                onPress={() => void Linking.openURL(`tel:${item.customerPhone}`)}
              />
              <ActionTile
                icon="chatbubble-ellipses"
                tint={TINT.time}
                label={t('staffPortal.detail.messageCustomer')}
                onPress={() => void Linking.openURL(`sms:${item.customerPhone}`)}
              />
            </View>
          </AnimatedEntrance>

          {/* ລາຍລະອຽດ */}
          <AnimatedEntrance index={2}>
            <View className="gap-2">
              <SectionHeading label={t('staffPortal.detail.title')} />
              <Card className="gap-3.5">
                <InfoRow icon="time-outline" tint={TINT.time} label={t('staffPortal.detail.time')}>
                  <T className="mt-1 font-lao-semibold text-foreground">{formatDate(item.startAt)}</T>
                  <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
                    <T className="font-sans-medium text-primary-strong">
                      {formatTime(item.startAt)} – {formatTime(item.endAt)}
                    </T>
                    <T className="text-muted-foreground">·</T>
                    <T className="font-lao text-muted-foreground">
                      {t('staffPortal.detail.duration', { min: item.serviceDurationMin })}
                    </T>
                  </View>
                </InfoRow>

                <View className="h-px bg-border" />

                <InfoRow
                  icon="sparkles-outline"
                  tint={TINT.service}
                  label={t('staffPortal.detail.service')}
                  trailing={
                    item.hasTreatmentRecord ? (
                      <Badge label={t('staffPortal.today.recorded')} tone="success" />
                    ) : null
                  }
                >
                  <T className="mt-1 font-lao-semibold text-foreground">{item.serviceName}</T>
                </InfoRow>

                <View className="h-px bg-border" />

                <InfoRow
                  icon="person-outline"
                  tint={TINT.client}
                  label={t('staffPortal.detail.customer')}
                >
                  <T className="mt-1 font-lao-semibold text-foreground">{item.customerName}</T>
                  <View className="mt-0.5 flex-row items-center gap-1.5">
                    <Ionicons name="call-outline" size={11} color={colors.mutedForeground} />
                    <T className="font-sans text-muted-foreground" style={SMALL}>
                      {item.customerPhone}
                    </T>
                  </View>

                  {item.customerNotes ? (
                    <View
                      className="mt-2 gap-1 rounded-xl border p-2.5"
                      style={{ backgroundColor: TINT.note.bg, borderColor: `${TINT.note.fg}26` }}
                    >
                      <View className="flex-row items-center gap-1.5">
                        <Ionicons name="alert-circle-outline" size={12} color={TINT.note.fg} />
                        <T className="font-lao-semibold" style={[SMALL, { color: TINT.note.fg }]}>
                          {t('staffPortal.detail.notesFromCustomer')}
                        </T>
                      </View>
                      <T className="font-lao text-foreground">{item.customerNotes}</T>
                    </View>
                  ) : null}
                </InfoRow>

                {item.deliveryType === 'HOME_SERVICE' && item.homeAddress ? (
                  <>
                    <View className="h-px bg-border" />
                    <InfoRow
                      icon="location-outline"
                      tint={TINT.place}
                      label={t('staffPortal.detail.address')}
                      trailing={
                        <Badge dot label={t('staffPortal.today.homeService')} tone="accent" />
                      }
                    >
                      <T className="mt-1 font-lao-medium text-foreground">{item.homeAddress}</T>
                      <View className="mt-2 flex-row gap-2">
                        <ActionTile
                          icon="map"
                          tint={TINT.place}
                          label={t('staffPortal.detail.openMap')}
                          onPress={() =>
                            void Linking.openURL(
                              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                item.homeAddress ?? '',
                              )}`,
                            )
                          }
                        />
                        <ActionTile
                          icon="navigate"
                          tint={TINT.time}
                          label={t('staffPortal.homeService.manageTrip')}
                          onPress={() =>
                            navigation.navigate('StaffActiveTrip', {
                              appointmentId: item.id,
                              customerPhone: item.customerPhone,
                            })
                          }
                        />
                      </View>
                    </InfoRow>
                  </>
                ) : null}
              </Card>
            </View>
          </AnimatedEntrance>

          {item.staffNotes ? (
            <AnimatedEntrance index={3}>
              <View className="gap-2">
                <SectionHeading label={t('staffPortal.detail.staffNotes')} />
                <Card elevated={false} className="gap-1 bg-muted p-3">
                  <T className="font-lao text-foreground">{item.staffNotes}</T>
                </Card>
              </View>
            </AnimatedEntrance>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
