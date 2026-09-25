import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorView, LoadingScreen } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Gradient } from '../../components/ui/Gradient';
import { useCommissionSummary, useMyPayslips } from '../../features/staff/staff-portal.api';
import type { MyPayslipView } from '@abcp/shared-types';
import { cn } from '../../lib/cn';
import { formatLAK, vientiane } from '../../lib/format';
import { normalizeError } from '../../services/apiError';
import { colors, shadow } from '../../theme';
import type { StaffTabScreenProps } from '../../navigation/types';
import {
  EmptyBlock,
  MiniBar,
  PeriodStepper,
  Ring,
  SectionHeading,
  SMALL,
  StaffHeader,
  StaffScreenTitle,
  StatCell,
  StatRibbon,
  T,
} from './staff-portal.parts';

function shiftMonth(month: string, delta: number): string {
  return vientiane(`${month}-01T00:00:00`).add(delta, 'month').format('YYYY-MM');
}

export function StaffEarningsScreen(_props: StaffTabScreenProps<'EarningsTab'>): React.JSX.Element {
  const { t } = useTranslation();
  const thisMonth = vientiane().format('YYYY-MM');
  const [month, setMonth] = useState(thisMonth);
  const query = useCommissionSummary(month);
  const prev = useCommissionSummary(shiftMonth(month, -1));
  const payslips = useMyPayslips();
  const payslip = payslips.data?.find((p) => p.monthYear === month) ?? null;

  const monthLabel = vientiane(`${month}-01T00:00:00`).format('MMMM YYYY');
  const data = query.data;

  const prevTotal = prev.data?.totalPayout ?? 0;
  const deltaPct =
    data && prevTotal > 0 ? Math.round(((data.totalPayout - prevTotal) / prevTotal) * 100) : null;
  const avgPerJob =
    data && data.appointmentsCompleted > 0 ? data.totalPayout / data.appointmentsCompleted : 0;
  const maxSvc = data ? data.services.reduce((m, s) => Math.max(m, s.payoutAmount), 1) : 1;
  const paidRatio = data && data.totalPayout > 0 ? data.paidPayout / data.totalPayout : 0;
  const goalPct =
    data?.kpiGoal && data.kpiGoal.targetRevenue > 0
      ? Math.round((data.kpiGoal.actualRevenue / data.kpiGoal.targetRevenue) * 100)
      : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StaffHeader>
        <StaffScreenTitle
          eyebrow="Aura Team • Vientiane"
          title={t('staffPortal.earnings.title')}
          subtitle={
            data ? t('staffPortal.earnings.rate', { pct: Math.round(data.commissionRate * 100) }) : undefined
          }
        />
        <PeriodStepper
          label={monthLabel}
          onPrev={() => setMonth((m) => shiftMonth(m, -1))}
          onNext={() => setMonth((m) => shiftMonth(m, 1))}
          onReset={() => setMonth(thisMonth)}
          atNow={month === thisMonth}
          resetLabel={t('staffPortal.earnings.thisMonth')}
          prevLabel={t('common.back')}
          nextLabel={t('common.next')}
        />
      </StaffHeader>

      {query.isLoading ? (
        <LoadingScreen />
      ) : query.isError || !data ? (
        <ErrorView
          message={normalizeError(query.error).message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 14, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => {
                void query.refetch();
                void payslips.refetch();
              }}
              tintColor={colors.primary}
            />
          }
        >
          {/* hero — ຄອມມິດຊັນລວມ + ສ່ວນແບ່ງຈ່າຍແລ້ວ/ຄ້າງຈ່າຍ */}
          <AnimatedEntrance index={0}>
            <View className="overflow-hidden rounded-2xl p-4" style={shadow.card}>
              <Gradient preset="hero" fill pointerEvents="none" />
              <View className="gap-2.5">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <T className="font-lao text-white/70" style={SMALL}>
                      {t('staffPortal.earnings.totalPayout')}
                    </T>
                    <T className="font-display text-white" style={{ fontSize: 22, lineHeight: 28 }}>
                      {formatLAK(data.totalPayout)}
                    </T>
                  </View>
                  {deltaPct != null ? (
                    <View
                      className={cn(
                        'flex-row items-center gap-1 rounded-full px-2 py-1',
                        deltaPct >= 0 ? 'bg-white/20' : 'bg-destructive/30',
                      )}
                    >
                      <Ionicons
                        name={deltaPct >= 0 ? 'trending-up' : 'trending-down'}
                        size={11}
                        color="#fff"
                      />
                      <T className="font-lao text-white" style={SMALL}>
                        {t('staffPortal.earnings.vsPrev', { pct: Math.abs(deltaPct) })}
                      </T>
                    </View>
                  ) : null}
                </View>

                <View className="h-2 flex-row overflow-hidden rounded-full bg-white/20">
                  <View
                    className="h-full rounded-full bg-white"
                    style={{ width: `${Math.round(paidRatio * 100)}%` }}
                  />
                </View>
                <View className="flex-row justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <View className="h-1.5 w-1.5 rounded-full bg-white" />
                    <T className="font-lao text-white/85" style={SMALL}>
                      {t('staffPortal.earnings.paidLabel')} {formatLAK(data.paidPayout)}
                    </T>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View className="h-1.5 w-1.5 rounded-full bg-white/40" />
                    <T className="font-lao text-white/85" style={SMALL}>
                      {t('staffPortal.earnings.unpaidLabel')} {formatLAK(data.unpaidPayout)}
                    </T>
                  </View>
                </View>
              </View>
            </View>
          </AnimatedEntrance>

          {payslip ? (
            <AnimatedEntrance index={1}>
              <PayslipCard slip={payslip} />
            </AnimatedEntrance>
          ) : null}

          <AnimatedEntrance index={1}>
            <StatRibbon>
              <StatCell
                value={String(data.appointmentsCompleted)}
                label={t('staffPortal.earnings.completed')}
                icon="checkmark-done-outline"
              />
              <StatCell
                value={formatLAK(avgPerJob)}
                label={t('staffPortal.earnings.avgPerJob')}
                tone="primary"
                icon="pricetag-outline"
                border
              />
              <StatCell
                value={formatLAK(data.grossServiceAmount)}
                label={t('staffPortal.earnings.grossSales')}
                tone="accent"
                icon="cash-outline"
              />
            </StatRibbon>
          </AnimatedEntrance>

          {data.kpiGoal ? (
            <AnimatedEntrance index={2}>
              <View className="gap-2">
                <SectionHeading label={t('staffPortal.earnings.kpiTitle')} />
                <View
                  className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
                  style={shadow.xs}
                >
                  <Ring
                    value={data.kpiGoal.actualRevenue}
                    max={data.kpiGoal.targetRevenue || 1}
                    size={56}
                    stroke={5}
                    tone={
                      data.kpiGoal.actualRevenue >= data.kpiGoal.targetRevenue ? 'success' : 'primary'
                    }
                  >
                    <T className="font-sans-semibold text-foreground">{goalPct ?? 0}%</T>
                  </Ring>
                  <View className="flex-1 gap-1">
                    <T className="font-lao-semibold text-foreground">
                      {formatLAK(data.kpiGoal.actualRevenue)}{' '}
                      <T className="font-lao text-muted-foreground" style={SMALL}>
                        / {formatLAK(data.kpiGoal.targetRevenue)}
                      </T>
                    </T>
                    <T className="font-lao text-muted-foreground" style={SMALL}>
                      {data.kpiGoal.actualRevenue >= data.kpiGoal.targetRevenue
                        ? t('staffPortal.earnings.goalReached')
                        : t('staffPortal.earnings.toGoal', {
                            amount: formatLAK(
                              data.kpiGoal.targetRevenue - data.kpiGoal.actualRevenue,
                            ),
                          })}
                    </T>
                    {data.kpiGoal.bonusAmount > 0 ? (
                      <View className="flex-row items-center gap-1 self-start rounded-full bg-accent-soft px-2 py-0.5">
                        <Ionicons name="gift-outline" size={10} color={colors.accentForeground} />
                        <T className="font-lao-medium text-accent-foreground" style={SMALL}>
                          {t('staffPortal.earnings.bonus', {
                            amount: formatLAK(data.kpiGoal.bonusAmount),
                          })}
                          {' · '}
                          {data.kpiGoal.isBonusPaid
                            ? t('staffPortal.earnings.paidLabel')
                            : t('staffPortal.earnings.unpaidLabel')}
                        </T>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </AnimatedEntrance>
          ) : null}

          {data.services.length > 0 ? (
            <View className="gap-2">
              <SectionHeading
                label={t('staffPortal.earnings.byService')}
                trailing={
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('staffPortal.earnings.serviceCount', { count: data.services.length })}
                  </T>
                }
              />
              <View className="gap-2.5 rounded-2xl border border-border bg-card p-3" style={shadow.xs}>
                {data.services.map((s, i) => {
                  const share =
                    data.totalPayout > 0 ? Math.round((s.payoutAmount / data.totalPayout) * 100) : 0;
                  return (
                    <View
                      key={s.serviceId}
                      className={cn(
                        'gap-1.5',
                        i === data.services.length - 1 ? '' : 'border-b border-border pb-2.5',
                      )}
                    >
                      <View className="flex-row items-center gap-2">
                        <View
                          className={cn(
                            'h-6 w-6 items-center justify-center rounded-lg',
                            i === 0 ? 'bg-primary' : 'bg-muted',
                          )}
                        >
                          <T
                            className={cn(
                              'font-sans-semibold',
                              i === 0 ? 'text-primary-foreground' : 'text-muted-foreground',
                            )}
                            style={SMALL}
                          >
                            {i + 1}
                          </T>
                        </View>
                        <T numberOfLines={1} className="flex-1 font-lao-medium text-foreground">
                          {s.serviceName}
                        </T>
                        <T className="font-lao-semibold text-foreground">
                          {formatLAK(s.payoutAmount)}
                        </T>
                      </View>
                      <MiniBar
                        value={s.payoutAmount}
                        max={maxSvc}
                        tone={i === 0 ? 'primary' : 'accent'}
                        height={5}
                      />
                      <View className="flex-row items-center justify-between">
                        <T className="font-lao text-muted-foreground" style={SMALL}>
                          {t('staffPortal.earnings.count', { count: s.count })} ·{' '}
                          {formatLAK(s.serviceAmount)}
                        </T>
                        <T className="font-sans text-muted-foreground" style={SMALL}>
                          {t('staffPortal.earnings.share', { pct: share })}
                        </T>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <EmptyBlock
              icon="wallet-outline"
              title={t('staffPortal.earnings.empty')}
              hint={t('staffPortal.earnings.emptyHint')}
            />
          )}

          <View className="flex-row items-start gap-1.5 px-1">
            <Ionicons name="information-circle-outline" size={12} color={colors.mutedForeground} />
            <T className="flex-1 font-lao text-muted-foreground" style={SMALL}>
              {t('staffPortal.earnings.footnote')}
            </T>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** Payroll G5.2 — ໃບຈ່າຍເງິນເດືອນຂອງເດືອນທີ່ເລືອກ (ສະເພາະຮອບທີ່ອະນຸມັດ/ຈ່າຍແລ້ວ). */
function PayslipCard({ slip }: { slip: MyPayslipView }): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const paid = slip.runStatus === 'PAID';
  const earnings: Array<[string, number]> = [
    [t('staffPortal.payslip.basePay'), slip.basePay - slip.absenceDeduction],
    [t('staffPortal.payslip.overtime'), slip.overtimePay],
    [t('staffPortal.payslip.commission'), slip.commission],
    [t('staffPortal.payslip.bonus'), slip.bonus],
    [t('staffPortal.payslip.allowances'), slip.allowances],
  ];
  const deductions: Array<[string, number]> = [
    [t('staffPortal.payslip.sso'), slip.ssoEmployee],
    [t('staffPortal.payslip.tax'), slip.incomeTax],
    [t('staffPortal.payslip.advances'), slip.advances],
    [t('staffPortal.payslip.other'), slip.otherDeductions + slip.clawback],
  ];
  const Row = ({ label, amount, minus }: { label: string; amount: number; minus?: boolean }) =>
    amount === 0 ? null : (
      <View className="flex-row items-center justify-between py-1">
        <T className="font-lao text-muted-foreground">{label}</T>
        <T className={cn('font-sans', minus ? 'text-destructive' : 'text-foreground')}>
          {minus ? '−' : ''}
          {formatLAK(amount)}
        </T>
      </View>
    );
  return (
    <View className="gap-2">
      <SectionHeading label={t('staffPortal.payslip.title')} />
      <View className="rounded-2xl border border-border bg-card p-3.5" style={shadow.xs}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {t('staffPortal.payslip.net')}
            </T>
            <T className="font-display text-foreground" style={{ fontSize: 20, lineHeight: 26 }}>
              {formatLAK(slip.netPay)}
            </T>
          </View>
          <View className={cn('rounded-full px-2 py-0.5', paid ? 'bg-success-soft' : 'bg-warning-soft')}>
            <T className={cn('font-lao-medium', paid ? 'text-success' : 'text-warning')} style={SMALL}>
              {paid ? t('staffPortal.payslip.paid') : t('staffPortal.payslip.approved')}
            </T>
          </View>
        </View>
        {open ? (
          <View className="mt-2 border-t border-border pt-2">
            {earnings.map(([l, a]) => (
              <Row key={l} label={l} amount={a} />
            ))}
            <Row label={t('staffPortal.payslip.gross')} amount={slip.grossPay} />
            <View className="my-1 h-px bg-border" />
            {deductions.map(([l, a]) => (
              <Row key={l} label={l} amount={a} minus />
            ))}
          </View>
        ) : null}
        <T
          className="mt-2 font-lao-medium text-primary"
          style={SMALL}
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
        >
          {open ? t('staffPortal.payslip.hide') : t('staffPortal.payslip.show')}
        </T>
      </View>
    </View>
  );
}
