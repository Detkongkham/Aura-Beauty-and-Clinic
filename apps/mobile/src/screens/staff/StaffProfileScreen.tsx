import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppearanceSection } from '../../components/shared/AppearanceSection';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Gradient } from '../../components/ui/Gradient';
import { Segmented } from '../../components/ui/Segmented';
import { Touchable } from '../../components/ui/Touchable';
import { ChangePasswordSheet, ProfileEditSheet } from '../../features/auth/AccountSheets';
import { useAuth } from '../../features/auth/useAuth';
import { useInventoryAccess } from '../../features/inventory/inventory.api';
import {
  useAttendanceState,
  useCommissionSummary,
  useStaffSchedule,
} from '../../features/staff/staff-portal.api';
import type { AppLanguage } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatTime, isoDateInDays, vientiane } from '../../lib/format';
import { useUiStore } from '../../store/ui.store';
import { colors, shadow } from '../../theme';
import type { StaffTabScreenProps } from '../../navigation/types';
import {
  ActionTile,
  IconTile,
  SectionHeading,
  SMALL,
  StaffHeader,
  StaffScreenTitle,
  StatCell,
  StatRibbon,
  T,
  TINT,
  type IconName,
} from './staff-portal.parts';

/** Aura support hotline — dialled from the support row (parity with the customer Profile). */
const SUPPORT_TEL = '+8562099990000';
const SUPPORT_LABEL = '020 9999 0000';

/** Short, human-readable staff code derived from the account id. */
function staffCode(id: string | undefined): string {
  const tail = (id ?? '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(-5)
    .toUpperCase();
  return `#STF-${tail || '00000'}`;
}

function AccountRow({
  icon,
  tint = TINT.time,
  label,
  value,
  trailing,
  last,
  onPress,
}: {
  icon: IconName;
  tint?: { bg: string; fg: string };
  label: string;
  value: string;
  trailing?: React.ReactNode;
  last?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const Row = onPress ? Touchable : View;
  return (
    <Row
      {...(onPress ? { onPress, accessibilityRole: 'button' as const, accessibilityLabel: label } : {})}
      className={cn(
        'min-h-[52px] flex-row items-center gap-2.5 px-3.5 py-2.5',
        !last && 'border-b border-border',
      )}
    >
      <IconTile icon={icon} tint={tint} size={32} />
      <View className="flex-1">
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {label}
        </T>
        <T numberOfLines={1} className="font-lao-medium text-foreground">
          {value}
        </T>
      </View>
      {trailing ??
        (onPress ? (
          <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
        ) : null)}
    </Row>
  );
}

export function StaffProfileScreen({
  navigation,
}: StaffTabScreenProps<'ProfileTab'>): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const language = useUiStore((s) => s.language) ?? (i18n.language as AppLanguage);
  const setLanguagePref = useUiStore((s) => s.setLanguagePref);
  const version = Constants.expoConfig?.version ?? '0.1.0';
  const canStock = useInventoryAccess().canView;

  const schedule = useStaffSchedule(isoDateInDays(0));
  const commission = useCommissionSummary(vientiane().format('YYYY-MM'));
  const attendance = useAttendanceState(vientiane().format('YYYY-MM'));
  const todayCount = schedule.data?.items.length ?? 0;
  const monthDone = commission.data?.appointmentsCompleted ?? 0;
  const ratePct = commission.data ? Math.round(commission.data.commissionRate * 100) : 0;

  const today = attendance.data?.today ?? null;
  const shift: 'idle' | 'working' | 'done' =
    today == null ? 'idle' : today.checkOut == null ? 'working' : 'done';

  const [faceId, setFaceId] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const name = user?.name ?? '-';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StaffHeader>
        <StaffScreenTitle
          eyebrow="Aura Team • Vientiane"
          title={t('staffPortal.profile.title')}
          subtitle={staffCode(user?.id)}
        />
      </StaffHeader>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 32, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {/* hero — staff identity card */}
        <AnimatedEntrance index={0}>
          <View
            className="overflow-hidden rounded-2xl border border-border bg-card"
            style={shadow.card}
          >
            <Gradient preset="wash" fill pointerEvents="none" />
            <View className="items-center px-4 pb-3.5 pt-4">
              {/* avatar with gradient ring + role badge */}
              <View className="items-center">
                <View className="h-[70px] w-[70px] items-center justify-center rounded-full p-[2.5px]">
                  <Gradient preset="luxe" fill radius={999} pointerEvents="none" />
                  <View className="h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-card bg-primary-subtle">
                    <Avatar name={name} size={58} mode="cartoon" className="bg-transparent" />
                  </View>
                </View>
                <View
                  className="-mt-2 flex-row items-center gap-1 overflow-hidden rounded-full border border-card px-2 py-0.5"
                  style={shadow.xs}
                >
                  <Gradient preset="brand" fill pointerEvents="none" />
                  <Ionicons name="briefcase" size={8} color={colors.primaryForeground} />
                  <T
                    className="font-sans-semibold text-primary-foreground"
                    style={{ ...SMALL, letterSpacing: 0.6 }}
                  >
                    STAFF
                  </T>
                </View>
              </View>

              {/* name + verification */}
              <View className="mt-2.5 flex-row items-center gap-1.5">
                <T className="font-lao-semibold text-foreground">{name}</T>
                <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
              </View>
              <View className="mt-1 flex-row items-center gap-1.5">
                <T className="font-sans-medium text-muted-foreground" style={SMALL}>
                  {user?.phone ?? '-'}
                </T>
                <View className="h-1 w-1 rounded-full bg-border" />
                <T
                  className="rounded-full bg-primary-subtle px-1.5 py-0.5 font-sans-medium text-primary-strong"
                  style={SMALL}
                >
                  {staffCode(user?.id)}
                </T>
              </View>

              {/* ສະຖານະກະວຽກມື້ນີ້ */}
              <Touchable
                onPress={() => navigation.navigate('AttendanceTab')}
                pressScale={0.98}
                accessibilityRole="button"
                accessibilityLabel={t('staffPortal.attendance.title')}
                className={cn(
                  'mt-2.5 w-full flex-row items-center gap-2 rounded-xl border px-3 py-2',
                  shift === 'working'
                    ? 'border-success/30 bg-success-soft'
                    : shift === 'done'
                      ? 'border-border bg-card/70'
                      : 'border-warning/30 bg-warning-soft',
                )}
              >
                <Ionicons
                  name={
                    shift === 'working' ? 'time' : shift === 'done' ? 'checkmark-done' : 'finger-print'
                  }
                  size={14}
                  color={
                    shift === 'working'
                      ? colors.success
                      : shift === 'done'
                        ? colors.mutedForeground
                        : colors.warning
                  }
                />
                <T
                  numberOfLines={1}
                  className={cn(
                    'flex-1 font-lao-medium',
                    shift === 'working'
                      ? 'text-success'
                      : shift === 'done'
                        ? 'text-muted-foreground'
                        : 'text-warning',
                  )}
                  style={SMALL}
                >
                  {shift === 'idle'
                    ? t('staffPortal.attendance.notCheckedIn')
                    : shift === 'working'
                      ? `${t('staffPortal.attendance.workingNow')} · ${t(
                          'staffPortal.attendance.checkedInAt',
                          { time: formatTime(today!.checkIn) },
                        )}`
                      : t('staffPortal.attendance.checkedOutAt', {
                          time: formatTime(today!.checkOut!),
                        })}
                </T>
                <Ionicons name="chevron-forward" size={13} color={colors.mutedForeground} />
              </Touchable>

              {/* staff stats ribbon */}
              <StatRibbon className="mt-2.5 w-full bg-card/70">
                <StatCell value={String(todayCount)} label={t('staffPortal.profile.todayJobs')} />
                <StatCell
                  value={String(monthDone)}
                  label={t('staffPortal.profile.monthDone')}
                  tone="primary"
                  border
                />
                <StatCell
                  value={`${ratePct}%`}
                  label={t('staffPortal.profile.commissionRate')}
                  tone="accent"
                />
              </StatRibbon>
            </View>
          </View>
        </AnimatedEntrance>

        {/* ທາງລັດ */}
        <AnimatedEntrance index={1}>
          <View className="gap-2">
            <SectionHeading label={t('staffPortal.profile.shortcuts')} />
            <View className="flex-row gap-2.5">
              {(
                [
                  { tab: 'TodayTab', icon: 'calendar-outline', label: t('staffPortal.tabs.today'), tint: TINT.time },
                  { tab: 'EarningsTab', icon: 'wallet-outline', label: t('staffPortal.tabs.earnings'), tint: TINT.money },
                  { tab: 'MessagesTab', icon: 'chatbubbles-outline', label: t('staffPortal.tabs.messages'), tint: TINT.client },
                ] as const
              ).map((s) => (
                <Touchable
                  key={s.tab}
                  onPress={() => navigation.navigate(s.tab)}
                  pressScale={0.96}
                  accessibilityRole="button"
                  accessibilityLabel={s.label}
                  className="flex-1 items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-3"
                  style={shadow.xs}
                >
                  <IconTile icon={s.icon} tint={s.tint} size={32} />
                  <T numberOfLines={1} className="font-lao-medium text-foreground" style={SMALL}>
                    {s.label}
                  </T>
                </Touchable>
              ))}
            </View>
            {canStock ? (
              <ActionTile
                icon="cube-outline"
                tint={TINT.money}
                label={t('stock.home.title')}
                hint={t('stock.home.shortcutHint')}
                onPress={() => navigation.navigate('StockHome')}
              />
            ) : null}
          </View>
        </AnimatedEntrance>

        {/* account details */}
        <AnimatedEntrance index={2}>
          <View className="gap-2">
            <SectionHeading
              label={t('profile.account')}
              trailing={<Badge dot label={t('profile.verified')} tone="primary" />}
            />

            <View
              className="overflow-hidden rounded-2xl border border-border bg-card"
              style={shadow.card}
            >
              <AccountRow
                icon="person-outline"
                label={t('auth.name')}
                value={name}
                onPress={() => setEditOpen(true)}
              />
              <AccountRow
                icon="call-outline"
                tint={TINT.money}
                label={t('auth.phone')}
                value={user?.phone ?? '-'}
                trailing={
                  <View className="flex-row items-center gap-1 rounded-md bg-success-soft px-1.5 py-0.5">
                    <Ionicons name="checkmark" size={9} color={colors.success} />
                    <T className="font-lao-medium text-success" style={SMALL}>
                      {t('profile.verified')}
                    </T>
                  </View>
                }
              />
              <AccountRow
                icon="mail-outline"
                tint={TINT.place}
                label={t('auth.email')}
                value={user?.email ?? t('profile.notAdded')}
                onPress={() => setEditOpen(true)}
              />
              <AccountRow
                icon="key-outline"
                tint={TINT.service}
                label={t('profile.password')}
                value="••••••••"
                last
                onPress={() => setPwOpen(true)}
              />
            </View>
          </View>
        </AnimatedEntrance>

        <ProfileEditSheet open={editOpen} onClose={() => setEditOpen(false)} />
        <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />

        {/* language */}
        <AnimatedEntrance index={3}>
          <View className="gap-2">
            <SectionHeading label={t('profile.language')} />
            <Segmented
              value={language}
              onChange={(v) => setLanguagePref(v as AppLanguage)}
              options={[
                { value: 'lo', label: t('profile.lao') },
                { value: 'en', label: t('profile.english') },
              ]}
            />
          </View>
        </AnimatedEntrance>

        {/* ຮູບລັກສະນະ — ໂໝດສະຫວ່າງ/ມືດ + ໂທນສີ */}
        <AnimatedEntrance index={4}>
          <View className="gap-2">
            <SectionHeading label={t('appearance.title')} />
            <AppearanceSection />
          </View>
        </AnimatedEntrance>

        {/* privacy & support */}
        <AnimatedEntrance index={5}>
          <View className="gap-2">
            <SectionHeading label={t('profile.preferences')} />
            <View
              className="overflow-hidden rounded-2xl border border-border bg-card"
              style={shadow.card}
            >
              <View className="min-h-[52px] flex-row items-center gap-2.5 border-b border-border px-3.5 py-2.5">
                <IconTile icon="scan-outline" tint={TINT.neutral} size={32} />
                <View className="flex-1">
                  <T className="font-lao-medium text-foreground">{t('profile.faceId')}</T>
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('staffPortal.profile.faceIdHint')}
                  </T>
                </View>
                <Switch
                  value={faceId}
                  onValueChange={setFaceId}
                  trackColor={{ false: colors.input, true: colors.primary }}
                  thumbColor={colors.card}
                  ios_backgroundColor={colors.input}
                  style={{ transform: [{ scale: 0.8 }] }}
                />
              </View>

              <Touchable
                onPress={() => void Linking.openURL(`tel:${SUPPORT_TEL}`)}
                pressScale={1}
                accessibilityRole="button"
                accessibilityLabel={t('profile.concierge')}
                className="min-h-[52px] flex-row items-center gap-2.5 px-3.5 py-2.5"
              >
                <IconTile icon="headset-outline" tint={TINT.service} size={32} />
                <View className="flex-1">
                  <T className="font-lao-medium text-foreground">{t('profile.concierge')}</T>
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('profile.conciergeDesc', { phone: SUPPORT_LABEL })}
                  </T>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
              </Touchable>
            </View>
          </View>
        </AnimatedEntrance>

        {/* logout + version */}
        <AnimatedEntrance index={6}>
          <View className="items-center gap-3 pt-1">
            <Touchable
              onPress={logout}
              haptic="primary"
              pressScale={0.99}
              accessibilityRole="button"
              accessibilityLabel={t('auth.logout')}
              className="h-11 w-full flex-row items-center justify-center gap-2 rounded-2xl border border-destructive/25 bg-card"
              style={shadow.xs}
            >
              <Ionicons name="log-out-outline" size={15} color={colors.destructive} />
              <T className="font-lao-medium text-destructive">{t('auth.logout')}</T>
            </Touchable>
            <T className="font-sans text-muted-foreground" style={SMALL}>
              {t('profile.version', { version })} · Aura Team
            </T>
          </View>
        </AnimatedEntrance>
      </ScrollView>
    </SafeAreaView>
  );
}
