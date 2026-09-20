import type { AttendanceRecordView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorView, LoadingScreen } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAttendanceState, useCheckInOut } from '../../features/staff/staff-portal.api';
import { haptics } from '../../lib/haptics';
import { cn } from '../../lib/cn';
import { formatTime, vientiane } from '../../lib/format';
import { normalizeError } from '../../services/apiError';
import { colors, shadow } from '../../theme';
import type { StaffTabScreenProps } from '../../navigation/types';
import {
  EmptyBlock,
  HeroCard,
  MiniBar,
  Ring,
  SectionHeading,
  SMALL,
  StaffHeader,
  StaffScreenTitle,
  StatCell,
  StatRibbon,
  PeriodStepper,
  T,
} from './staff-portal.parts';

const STATUS_TONE: Record<
  AttendanceRecordView['status'],
  React.ComponentProps<typeof Badge>['tone']
> = {
  ON_TIME: 'success',
  LATE: 'warning',
  OVERTIME: 'info',
  ABSENT: 'destructive',
};

/** ເປົ້າໝາຍຊົ່ວໂມງຕໍ່ມື້ — ໃຊ້ເປັນຖານຂອງວົງແຫວນ/ແຖບ (ບໍ່ແມ່ນກົດຂອງ backend). */
const DAY_TARGET_MIN = 8 * 60;

function hm(mins: number): { h: number; m: number } {
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

function workedLabel(mins: number, t: TFunction): string {
  return t('staffPortal.attendance.worked', hm(mins));
}

function shiftMonth(month: string, delta: number): string {
  return vientiane(`${month}-01T00:00:00`).add(delta, 'month').format('YYYY-MM');
}

/** ນັບມື້ມາວຽກຕິດຕໍ່ກັນ (ຈາກມື້ນີ້ ຫຼື ມື້ວານ ຖອຍຫຼັງ). */
function computeStreak(dates: string[]): number {
  const set = new Set(dates);
  const today = vientiane().format('YYYY-MM-DD');
  const yest = vientiane().subtract(1, 'day').format('YYYY-MM-DD');
  let cursor = set.has(today) ? today : set.has(yest) ? yest : null;
  let n = 0;
  while (cursor && set.has(cursor)) {
    n += 1;
    cursor = vientiane(`${cursor}T00:00:00`).subtract(1, 'day').format('YYYY-MM-DD');
  }
  return n;
}

/** ນາທີທີ່ເຮັດວຽກມາແລ້ວ (ຍັງບໍ່ໄດ້ອອກວຽກ) — ອັບເດດທຸກນາທີ. */
function useElapsed(checkIn: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!checkIn) return undefined;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [checkIn]);
  if (!checkIn) return 0;
  return Math.max(0, Math.round((now - new Date(checkIn).getTime()) / 60000));
}

/** ຮູບແທ່ງນ້ອຍ 7 ມື້ລ່າສຸດ — ບໍ່ມີ lib, ໃຊ້ View ສູງຕາມສັດສ່ວນ. */
function WeekBars({ rows, max }: { rows: AttendanceRecordView[]; max: number }): React.JSX.Element {
  const { t } = useTranslation();
  const last = rows.slice(0, 7).reverse();
  return (
    <View className="gap-1.5 rounded-2xl border border-border bg-card p-3" style={shadow.xs}>
      <View className="h-[64px] flex-row items-end justify-between gap-1.5">
        {last.map((r) => {
          const mins = r.workedMinutes ?? 0;
          const pct = max > 0 ? Math.max(0.08, Math.min(1, mins / max)) : 0.08;
          const late = r.status === 'LATE';
          return (
            <View key={r.id} className="flex-1 items-center gap-1">
              <View className="w-full flex-1 justify-end">
                <View
                  className={cn('w-full rounded-t-md', late ? 'bg-warning' : 'bg-primary')}
                  style={{ height: `${pct * 100}%`, opacity: late ? 0.9 : 1 }}
                />
              </View>
              <T className="font-sans text-muted-foreground" style={SMALL}>
                {vientiane(`${r.date}T00:00:00`).format('D')}
              </T>
            </View>
          );
        })}
      </View>
      <T className="font-lao text-muted-foreground" style={SMALL}>
        {t('staffPortal.attendance.recentHours')}
      </T>
    </View>
  );
}

function HistoryRow({
  row,
  maxMin,
  isLast,
}: {
  row: AttendanceRecordView;
  maxMin: number;
  isLast: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const open = row.checkOut == null;
  return (
    <View className={cn('gap-1.5 py-2.5', !isLast && 'border-b border-border')}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <View
            className={cn(
              'h-7 w-7 items-center justify-center rounded-xl',
              row.status === 'LATE' ? 'bg-warning-soft' : 'bg-primary-subtle',
            )}
          >
            <T
              className={cn(
                'font-sans-semibold',
                row.status === 'LATE' ? 'text-warning' : 'text-primary-strong',
              )}
              style={SMALL}
            >
              {vientiane(`${row.date}T00:00:00`).format('D')}
            </T>
          </View>
          <View>
            <T className="font-lao-medium text-foreground">
              {vientiane(`${row.date}T00:00:00`).format('ddd D MMM')}
            </T>
            <T className="font-sans text-muted-foreground" style={SMALL}>
              {formatTime(row.checkIn)}
              {row.checkOut ? ` – ${formatTime(row.checkOut)}` : ' – ···'}
              {row.workedMinutes != null ? ` · ${workedLabel(row.workedMinutes, t)}` : ''}
            </T>
          </View>
        </View>
        <Badge
          label={
            open
              ? t('staffPortal.attendance.openShift')
              : t(`staffPortal.attendance.status_${row.status}`)
          }
          tone={open ? 'info' : STATUS_TONE[row.status]}
        />
      </View>
      {row.workedMinutes != null ? (
        <MiniBar
          value={row.workedMinutes}
          max={maxMin}
          tone={row.status === 'LATE' ? 'warning' : 'primary'}
          height={5}
        />
      ) : null}
    </View>
  );
}

export function StaffAttendanceScreen(
  _props: StaffTabScreenProps<'AttendanceTab'>,
): React.JSX.Element {
  const { t } = useTranslation();
  const thisMonth = vientiane().format('YYYY-MM');
  const [month, setMonth] = useState(thisMonth);
  const query = useAttendanceState(month);
  const { checkIn, checkOut } = useCheckInOut(month);
  const [locating, setLocating] = useState(false);

  const busy = locating || checkIn.isPending || checkOut.isPending;

  const summary = useMemo(() => {
    const h = query.data?.history ?? [];
    const present = h.length;
    const onTime = h.filter((r) => r.status === 'ON_TIME').length;
    const late = h.filter((r) => r.status === 'LATE').length;
    const totalMin = h.reduce((s, r) => s + (r.workedMinutes ?? 0), 0);
    const maxMin = h.reduce((m, r) => Math.max(m, r.workedMinutes ?? 0), 60);
    const closed = h.filter((r) => r.workedMinutes != null).length;
    const avgMin = closed > 0 ? Math.round(totalMin / closed) : 0;
    const streak = computeStreak(h.map((r) => r.date));
    return { present, onTime, late, totalMin, maxMin, avgMin, streak };
  }, [query.data]);

  const today = query.data?.today ?? null;
  const elapsed = useElapsed(today && today.checkOut == null ? today.checkIn : null);

  const act = async (kind: 'in' | 'out'): Promise<void> => {
    try {
      setLocating(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('', t('staffPortal.attendance.permissionDenied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const body = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      await (kind === 'in' ? checkIn : checkOut).mutateAsync(body);
      haptics.success();
    } catch (err) {
      haptics.error();
      Alert.alert('', normalizeError(err).message);
    } finally {
      setLocating(false);
    }
  };

  if (query.isLoading) return <LoadingScreen />;
  if (query.isError || !query.data) {
    return (
      <ErrorView message={normalizeError(query.error).message} onRetry={() => void query.refetch()} />
    );
  }

  const { branch, history } = query.data;
  const isThisMonth = month === thisMonth;
  const phase: 'idle' | 'working' | 'done' =
    today == null ? 'idle' : today.checkOut == null ? 'working' : 'done';
  const monthLabel = vientiane(`${month}-01T00:00:00`).format('MMMM YYYY');
  const hours = hm(summary.totalMin);
  const avg = hm(summary.avgMin);
  const ringValue =
    phase === 'working' ? elapsed : phase === 'done' ? (today?.workedMinutes ?? 0) : 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StaffHeader>
        <StaffScreenTitle
          eyebrow="Aura Team • Vientiane"
          title={t('staffPortal.attendance.title')}
          subtitle={t('staffPortal.attendance.atBranch', { branch: branch.name })}
          right={
            summary.streak > 1 ? (
              <View className="flex-row items-center gap-1 rounded-full bg-accent-soft px-2 py-1">
                <Ionicons name="flame" size={11} color={colors.accentForeground} />
                <T className="font-lao-medium text-accent-foreground" style={SMALL}>
                  {t('staffPortal.attendance.streak', { count: summary.streak })}
                </T>
              </View>
            ) : undefined
          }
        />
        <PeriodStepper
          label={monthLabel}
          onPrev={() => setMonth((m) => shiftMonth(m, -1))}
          onNext={() => setMonth((m) => shiftMonth(m, 1))}
          onReset={() => setMonth(thisMonth)}
          atNow={isThisMonth}
          resetLabel={t('staffPortal.attendance.thisMonth')}
          prevLabel={t('common.back')}
          nextLabel={t('common.next')}
        />
      </StaffHeader>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 14, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {isThisMonth ? (
          <AnimatedEntrance index={0}>
            <HeroCard>
              <View className="gap-3">
                <View className="flex-row items-center gap-3">
                  <Ring
                    value={ringValue}
                    max={DAY_TARGET_MIN}
                    size={62}
                    stroke={6}
                    tone={phase === 'done' ? 'success' : 'primary'}
                  >
                    <Ionicons
                      name={
                        phase === 'done' ? 'checkmark-done' : phase === 'working' ? 'time' : 'finger-print'
                      }
                      size={20}
                      color={
                        phase === 'idle'
                          ? colors.mutedForeground
                          : phase === 'done'
                            ? colors.success
                            : colors.primary
                      }
                    />
                  </Ring>

                  <View className="flex-1 gap-1">
                    {phase === 'idle' ? (
                      <>
                        <T className="font-lao-semibold text-foreground">
                          {t('staffPortal.attendance.notCheckedIn')}
                        </T>
                        <T className="font-lao text-muted-foreground" style={SMALL}>
                          {t('staffPortal.attendance.geofenceHint', {
                            m: branch.radiusMeters,
                            branch: branch.name,
                          })}
                        </T>
                      </>
                    ) : (
                      <>
                        <View className="flex-row flex-wrap items-center gap-1.5">
                          <T className="font-lao-semibold text-foreground">
                            {t('staffPortal.attendance.checkedInAt', {
                              time: formatTime(today!.checkIn),
                            })}
                          </T>
                          <Badge
                            label={t(`staffPortal.attendance.status_${today!.status}`)}
                            tone={STATUS_TONE[today!.status]}
                          />
                        </View>
                        <T className="font-lao text-muted-foreground" style={SMALL}>
                          {phase === 'working'
                            ? `${t('staffPortal.attendance.workingNow')} · ${workedLabel(elapsed, t)}`
                            : `${t('staffPortal.attendance.checkedOutAt', {
                                time: formatTime(today!.checkOut!),
                              })}${
                                today!.workedMinutes != null
                                  ? ` · ${workedLabel(today!.workedMinutes, t)}`
                                  : ''
                              }`}
                        </T>
                      </>
                    )}
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="location-outline" size={11} color={colors.mutedForeground} />
                      <T numberOfLines={1} className="flex-1 font-lao text-muted-foreground" style={SMALL}>
                        {branch.name} · {t('staffPortal.attendance.withinRadius', { m: branch.radiusMeters })}
                      </T>
                    </View>
                  </View>
                </View>

                {phase === 'idle' ? (
                  <Button
                    label={
                      busy ? t('staffPortal.attendance.locating') : t('staffPortal.attendance.checkIn')
                    }
                    size="sm"
                    icon="log-in-outline"
                    loading={busy}
                    onPress={() => void act('in')}
                  />
                ) : phase === 'working' ? (
                  <Button
                    label={
                      busy ? t('staffPortal.attendance.locating') : t('staffPortal.attendance.checkOut')
                    }
                    size="sm"
                    icon="log-out-outline"
                    variant="destructive"
                    loading={busy}
                    onPress={() => void act('out')}
                  />
                ) : (
                  <View className="flex-row items-center justify-center gap-1.5 rounded-2xl bg-success-soft py-2.5">
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <T className="font-lao-semibold text-success">
                      {t('staffPortal.attendance.done')}
                    </T>
                  </View>
                )}
              </View>
            </HeroCard>
          </AnimatedEntrance>
        ) : null}

        <AnimatedEntrance index={1}>
          <View className="gap-2">
            <SectionHeading
              label={t('staffPortal.attendance.summarySection')}
              hint={monthLabel}
              trailing={
                summary.avgMin > 0 ? (
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('staffPortal.attendance.avgPerDay')} {avg.h}:
                    {String(avg.m).padStart(2, '0')}
                  </T>
                ) : undefined
              }
            />
            <StatRibbon>
              <StatCell
                value={String(summary.present)}
                unit={t('staffPortal.attendance.daysUnit')}
                label={t('staffPortal.attendance.monthPresent')}
              />
              <StatCell
                value={String(summary.onTime)}
                label={t('staffPortal.attendance.monthOnTime')}
                tone="success"
                border
              />
              <StatCell
                value={String(summary.late)}
                label={t('staffPortal.attendance.monthLate')}
                tone="warning"
                border
              />
              <StatCell
                value={`${hours.h}:${String(hours.m).padStart(2, '0')}`}
                label={t('staffPortal.attendance.monthHours')}
                tone="primary"
              />
            </StatRibbon>
          </View>
        </AnimatedEntrance>

        {history.length > 0 ? (
          <AnimatedEntrance index={2}>
            <WeekBars rows={history} max={summary.maxMin} />
          </AnimatedEntrance>
        ) : null}

        <View className="gap-2">
          <SectionHeading
            label={t('staffPortal.attendance.history')}
            trailing={
              history.length > 0 ? (
                <T className="font-lao text-muted-foreground" style={SMALL}>
                  {t('staffPortal.attendance.recordCount', { count: history.length })}
                </T>
              ) : undefined
            }
          />
          {history.length > 0 ? (
            <View className="rounded-2xl border border-border bg-card px-3" style={shadow.xs}>
              {history.map((row, i) => (
                <HistoryRow
                  key={row.id}
                  row={row}
                  maxMin={summary.maxMin}
                  isLast={i === history.length - 1}
                />
              ))}
            </View>
          ) : (
            <EmptyBlock
              icon="calendar-outline"
              title={t('staffPortal.attendance.noHistory')}
              hint={t('staffPortal.attendance.noHistoryHint')}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
