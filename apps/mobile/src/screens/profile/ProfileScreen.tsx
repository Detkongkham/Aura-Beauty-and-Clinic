import { LOYALTY_TIER_THRESHOLDS, type LoyaltyAccountView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppearanceSection } from '../../components/shared/AppearanceSection';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Avatar } from '../../components/ui/Avatar';
import { Gradient } from '../../components/ui/Gradient';
import { Segmented } from '../../components/ui/Segmented';
import { Touchable } from '../../components/ui/Touchable';
import { apiUpdateProfile } from '../../features/auth/auth.api';
import { ChangePasswordSheet, ProfileEditSheet } from '../../features/auth/AccountSheets';
import { TelegramLinkSheet } from '../../features/chatbot/TelegramLinkSheet';
import { useMyAppointments } from '../../features/appointments/appointments.api';
import { useMyLoyalty } from '../../features/loyalty/loyalty.api';
import { useUnreadNotificationCount } from '../../features/notifications/notifications.api';
import { useAuth } from '../../features/auth/useAuth';
import {
  Card,
  CopyPill,
  HeroCard,
  IconTile,
  ListRow,
  Notice,
  ProgressRail,
  QuickAction,
  SectionHeader,
  SMALL,
  StatCell,
  T,
  type IconName,
} from '../../features/profile/profile-kit';
import type { AppLanguage } from '../../i18n';
import { formatDate, vientiane } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { useUiStore } from '../../store/ui.store';
import { colors, shadow } from '../../theme';
import type { TabScreenProps } from '../../navigation/types';

/** Aura Concierge hotline — dialled from the support row (see [[appointments-page-money]] footer copy). */
const CONCIERGE_TEL = '+8562099990000';
const CONCIERGE_LABEL = '020 9999 0000';

/** Short, human-readable membership code derived from the account id. */
function memberCode(id: string | undefined): string {
  const tail = (id ?? '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(-5)
    .toUpperCase();
  return `#AUR-${tail || '00000'}`;
}

/**
 * ຄວາມຄືບໜ້າພາຍໃນຊັ້ນປັດຈຸບັນ — ວັດຈາກພື້ນຂອງຊັ້ນນີ້ຫາພື້ນຂອງຊັ້ນຖັດໄປ
 * (ສູດດຽວກັນກັບ LoyaltyScreen ເພື່ອບໍ່ໃຫ້ສອງໜ້າສະແດງຄ່າຕ່າງກັນ).
 */
function tierProgress(a: LoyaltyAccountView): number {
  if (!a.nextTier) return 1;
  const floor = LOYALTY_TIER_THRESHOLDS[a.tierLevel];
  const span = LOYALTY_TIER_THRESHOLDS[a.nextTier] - floor;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (a.lifetimePoints - floor) / span));
}

/** ໜ້າ ໂປຣໄຟລ໌ — 12px ຄົງທີ່ທຸກໂຕ (profile-kit / mobile-flat-type-scale). */
export function ProfileScreen({ navigation }: TabScreenProps<'ProfileTab'>): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { user, logout, updateUser } = useAuth();

  const allowDirectMessages = user?.allowDirectMessages ?? false;
  const directMessagesMutation = useMutation({
    mutationFn: (next: boolean) => apiUpdateProfile({ allowDirectMessages: next }),
    onSuccess: (next) => updateUser({ allowDirectMessages: next.allowDirectMessages }),
  });

  const language = useUiStore((s) => s.language) ?? (i18n.language as AppLanguage);
  const setLanguagePref = useUiStore((s) => s.setLanguagePref);
  const biometricLock = useUiStore((s) => s.biometricLock);
  const setBiometricLock = useUiStore((s) => s.setBiometricLock);
  const version = Constants.expoConfig?.version ?? '0.1.0';

  const upcoming = useMyAppointments('upcoming');
  const upcomingCount = upcoming.data?.pages[0]?.total ?? 0;
  const loyalty = useMyLoyalty();
  const unread = useUnreadNotificationCount();

  const points = loyalty.data?.points ?? 0;
  const tierLabel = loyalty.data ? t(`loyalty.tier.${loyalty.data.tierLevel}`) : '—';
  const progress = loyalty.data ? tierProgress(loyalty.data) : 0;

  const [editOpen, setEditOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const name = user?.name ?? '-';
  const code = memberCode(user?.id);

  /** ຄວາມສົມບູນຂອງໂປຣໄຟລ໌ — ບອກລູກຄ້າວ່າຍັງຂາດຫຍັງ ແທນທີ່ຈະປ່ອຍໃຫ້ຄົ້ນເອງ. */
  const completeness = useMemo(() => {
    const checks = [Boolean(user?.name), Boolean(user?.phone), Boolean(user?.email)];
    const done = checks.filter(Boolean).length;
    return { done, total: checks.length, ratio: done / checks.length, missingEmail: !user?.email };
  }, [user?.name, user?.phone, user?.email]);

  const copyCode = async (): Promise<void> => {
    await Clipboard.setStringAsync(code);
    haptics.success();
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1600);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* header — brand eyebrow + screen title (parity with AppointmentsScreen) */}
      <View className="gap-0.5 px-5 pb-1.5 pt-1.5">
        <View className="flex-row items-center gap-1.5">
          <T className="font-sans-medium text-primary" style={{ letterSpacing: 1.4 }}>
            AURA SANCTUARY
          </T>
          <View className="h-1 w-1 rounded-full bg-primary" />
          <T className="font-sans-medium text-muted-foreground" style={{ letterSpacing: 0.6 }}>
            VIENTIANE
          </T>
        </View>
        <T variant="title" className="font-lao-semibold leading-6">
          {t('profile.memberTitle')}
        </T>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 32, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* hero — ບັດສະມາຊິກ VIP */}
        <AnimatedEntrance index={0}>
          <HeroCard>
            <View className="items-center px-4 pb-3.5 pt-4">
              {/* avatar ວົງແຫວນ gradient + ປ້າຍລະດັບ */}
              <View className="items-center">
                <View className="h-[72px] w-[72px] items-center justify-center rounded-full p-[2.5px]">
                  <Gradient preset="luxe" fill radius={999} pointerEvents="none" />
                  <View className="h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-aura-900 bg-aura-900">
                    <Avatar name={name} size={60} mode="cartoon" className="bg-transparent" />
                  </View>
                </View>
                <View
                  className="-mt-2 flex-row items-center gap-1 overflow-hidden rounded-full border border-aura-900 px-2 py-0.5"
                  style={shadow.xs}
                >
                  <Gradient preset="gold" fill pointerEvents="none" />
                  <Ionicons name="star" size={8} color={colors.accentForeground} />
                  {/* ປ້າຍລະດັບ — ບໍ່ໃສ່ uppercase/tracking ເພາະຂໍ້ຄວາມເປັນພາສາລາວ
                      (lao-typography-no-tracking). */}
                  <T className="font-lao-semibold text-accent-foreground">
                    {tierLabel === '—' ? t('profile.tier') : tierLabel}
                  </T>
                </View>
              </View>

              {/* ຊື່ + ການຢືນຢັນ */}
              <View className="mt-2.5 flex-row items-center gap-1.5">
                <T className="font-lao-semibold text-white">{name}</T>
                <Ionicons name="checkmark-circle" size={14} color={colors.champagne} />
              </View>
              <View className="mt-1 flex-row items-center gap-2">
                <T className="font-sans-medium text-white/70">{user?.phone ?? '-'}</T>
                <CopyPill dark value={code} label={t('profile.memberCode')} copied={codeCopied} onPress={copyCode} />
              </View>

              {/* ຄວາມຄືບໜ້າລະດັບສະມາຊິກ */}
              {loyalty.data ? (
                <View className="mt-3.5 w-full gap-1.5">
                  <View className="flex-row items-end justify-between gap-3">
                    <T numberOfLines={1} className="flex-1 font-lao text-white/75" style={SMALL}>
                      {loyalty.data.nextTier && loyalty.data.pointsToNextTier != null
                        ? t('loyalty.toNext', {
                            points: loyalty.data.pointsToNextTier.toLocaleString('en-US'),
                            tier: t(`loyalty.tier.${loyalty.data.nextTier}`),
                          })
                        : t('loyalty.topTier')}
                    </T>
                    <T className="font-sans-medium text-champagne" style={SMALL}>
                      {Math.round(progress * 100)}%
                    </T>
                  </View>
                  <ProgressRail value={progress} dark height={5} />
                </View>
              ) : null}

              {/* ribbon ສະຖິຕິ — ແຕະເພື່ອໄປໜ້າຄະແນນ */}
              <Touchable
                onPress={() => navigation.navigate('Loyalty')}
                pressScale={0.99}
                accessibilityRole="button"
                accessibilityLabel={t('profile.loyaltyRow')}
                className="mt-3 w-full flex-row rounded-2xl border border-white/15 bg-white/10 py-2.5"
              >
                <StatCell dark value={points.toLocaleString('en-US')} label={t('profile.points')} />
                <StatCell dark border value={tierLabel} label={t('profile.tierLabel')} />
                <StatCell dark value={String(upcomingCount)} label={t('profile.bookings')} />
              </Touchable>
            </View>
          </HeroCard>
        </AnimatedEntrance>

        {/* ທາງລັດ */}
        <AnimatedEntrance index={1}>
          <View className="flex-row gap-2.5">
            <QuickAction
              icon="calendar-outline"
              label={t('profile.quickBookings')}
              onPress={() => navigation.navigate('AppointmentsTab')}
            />
            <QuickAction
              icon="notifications-outline"
              label={t('profile.quickNotifications')}
              badge={unread.data ?? 0}
              onPress={() => navigation.navigate('Notifications')}
            />
            <QuickAction
              icon="chatbubbles-outline"
              label={t('profile.quickMessages')}
              onPress={() => navigation.navigate('DirectMessages')}
            />
            <QuickAction
              icon="sparkles-outline"
              tone="accent"
              label={t('profile.quickBook')}
              onPress={() => navigation.navigate('ServiceList')}
            />
          </View>
        </AnimatedEntrance>

        {/* ຄວາມສົມບູນຂອງໂປຣໄຟລ໌ — ເຊື່ອງເມື່ອຄົບແລ້ວ */}
        {completeness.ratio < 1 ? (
          <AnimatedEntrance index={2}>
            <Touchable
              onPress={() => setEditOpen(true)}
              pressScale={0.99}
              accessibilityRole="button"
              accessibilityLabel={t('profile.completenessTitle')}
              className="gap-2 rounded-2xl border border-border bg-card p-3.5"
              style={shadow.xs}
            >
              <View className="flex-row items-center gap-2.5">
                <IconTile icon="person-circle-outline" tone="warning" />
                <View className="min-w-0 flex-1">
                  <T className="font-lao-semibold text-foreground">{t('profile.completenessTitle')}</T>
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {completeness.missingEmail
                      ? t('profile.completenessEmail')
                      : t('profile.completenessGeneric')}
                  </T>
                </View>
                <T className="font-sans-semibold text-warning">
                  {completeness.done}/{completeness.total}
                </T>
              </View>
              <ProgressRail value={completeness.ratio} tone="warning" height={5} />
            </Touchable>
          </AnimatedEntrance>
        ) : null}

        {/* ບັນຊີ */}
        <AnimatedEntrance index={3}>
          <View className="gap-2">
            <SectionHeader
              title={t('profile.account')}
              hint={
                loyalty.data ? t('profile.memberSince', { date: formatDate(loyalty.data.memberSince) }) : null
              }
              right={
                <View className="flex-row items-center gap-1 rounded-full bg-primary-subtle px-2 py-0.5">
                  <Ionicons name="shield-checkmark" size={10} color={colors.primary} />
                  <T className="font-lao-medium text-primary-strong" style={SMALL}>
                    {t('profile.verified')}
                  </T>
                </View>
              }
            />
            <Card className="overflow-hidden">
              <ListRow
                icon="person-outline"
                label={t('auth.name')}
                value={name}
                onPress={() => setEditOpen(true)}
              />
              <ListRow
                icon="call-outline"
                label={t('auth.phone')}
                value={user?.phone ?? '-'}
                right={
                  <View className="flex-row items-center gap-1 rounded-md bg-success-soft px-1.5 py-0.5">
                    <Ionicons name="checkmark" size={10} color={colors.success} />
                    <T className="font-lao-medium text-success" style={SMALL}>
                      {t('profile.verified')}
                    </T>
                  </View>
                }
              />
              <ListRow
                icon="mail-outline"
                tone={user?.email ? 'primary' : 'warning'}
                label={t('auth.email')}
                value={user?.email ?? t('profile.notAdded')}
                onPress={() => setEditOpen(true)}
              />
              <ListRow
                icon="key-outline"
                label={t('profile.password')}
                value="••••••••"
                last
                onPress={() => setPwOpen(true)}
              />
            </Card>
          </View>
        </AnimatedEntrance>

        {/* ລາງວັນ */}
        <AnimatedEntrance index={4}>
          <View className="gap-2">
            <SectionHeader title={t('profile.rewards')} hint={t('profile.rewardsHint')} />
            <Card className="overflow-hidden">
              <ListRow
                icon="diamond-outline"
                label={t('profile.loyaltyRow')}
                value={t('profile.loyaltyRowValue', { points: points.toLocaleString('en-US') })}
                onPress={() => navigation.navigate('Loyalty')}
              />
              <ListRow
                icon="layers-outline"
                label={t('profile.packagesRow')}
                value={t('profile.packagesRowValue')}
                onPress={() => navigation.navigate('MyPackages')}
              />
              <ListRow
                icon="gift-outline"
                tone="accent"
                label={t('profile.giftCardsRow')}
                value={t('profile.giftCardsRowValue')}
                onPress={() => navigation.navigate('GiftCards')}
              />
              <ListRow
                icon="people-outline"
                label={t('profile.referralRow')}
                value={t('profile.referralRowValue')}
                onPress={() => navigation.navigate('Referral')}
              />
              <ListRow
                icon="scan-outline"
                label={t('profile.skinAnalysisRow')}
                value={t('profile.skinAnalysisRowValue')}
                last
                onPress={() => navigation.navigate('SkinAnalysis')}
              />
            </Card>
          </View>
        </AnimatedEntrance>

        {/* ການເຊື່ອມຕໍ່ & ຂໍ້ຄວາມ */}
        <AnimatedEntrance index={5}>
          <View className="gap-2">
            <SectionHeader title={t('profile.connections')} />
            <Card className="overflow-hidden">
              <ListRow
                icon="paper-plane-outline"
                label={t('profile.telegramRow')}
                value={t('profile.telegramRowValue')}
                onPress={() => setTelegramOpen(true)}
              />
              <ListRow
                icon="chatbubbles-outline"
                label={t('profile.directMessagesRow')}
                value={t('profile.directMessagesRowValue')}
                onPress={() => navigation.navigate('DirectMessages')}
              />
              <ListRow
                icon="notifications-outline"
                label={t('profile.notificationsRow')}
                value={t('profile.notificationsRowValue')}
                badge={unread.data ?? 0}
                last
                onPress={() => navigation.navigate('Notifications')}
              />
            </Card>
          </View>
        </AnimatedEntrance>

        <ProfileEditSheet open={editOpen} onClose={() => setEditOpen(false)} />
        <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
        <TelegramLinkSheet open={telegramOpen} onClose={() => setTelegramOpen(false)} />

        {/* ພາສາ */}
        <AnimatedEntrance index={6}>
          <View className="gap-2">
            <SectionHeader title={t('profile.language')} />
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

        {/* ຮູບລັກສະນະ — ໂໝດສະຫວ່າງ/ມືດ + ໂທນສີ (ຊຸດດຽວກັນກັບ web-admin) */}
        <AnimatedEntrance index={7}>
          <View className="gap-2">
            <SectionHeader title={t('appearance.title')} hint={t('appearance.deviceOnly')} />
            <AppearanceSection />
          </View>
        </AnimatedEntrance>

        {/* ຄວາມເປັນສ່ວນຕົວ & ການຊ່ວຍເຫຼືອ */}
        <AnimatedEntrance index={8}>
          <View className="gap-2">
            <SectionHeader title={t('profile.preferences')} />
            <Card className="overflow-hidden">
              <ToggleRow
                icon="finger-print-outline"
                label={t('profile.faceId')}
                desc={t('profile.faceIdDesc')}
                value={biometricLock}
                onChange={(v) => {
                  haptics.select();
                  setBiometricLock(v);
                }}
              />
              <ToggleRow
                icon="chatbubbles-outline"
                label={t('profile.allowDirectMessages')}
                desc={t('profile.allowDirectMessagesDesc')}
                value={allowDirectMessages}
                disabled={directMessagesMutation.isPending}
                onChange={(v) => directMessagesMutation.mutate(v)}
              />
              <ListRow
                icon="headset-outline"
                tone="accent"
                label={t('profile.concierge')}
                value={t('profile.conciergeDesc', { phone: CONCIERGE_LABEL })}
                last
                onPress={() => void Linking.openURL(`tel:${CONCIERGE_TEL}`)}
              />
            </Card>
            {biometricLock ? (
              <Notice tone="muted" icon="information-circle-outline" body={t('profile.faceIdPending')} />
            ) : null}
          </View>
        </AnimatedEntrance>

        {/* ອອກຈາກລະບົບ + ເວີຊັນ */}
        <AnimatedEntrance index={9}>
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
              <Ionicons name="log-out-outline" size={16} color={colors.destructive} />
              <T className="font-lao-medium text-destructive">{t('auth.logout')}</T>
            </Touchable>
            <T className="font-sans text-muted-foreground" style={SMALL}>
              {t('profile.version', { version })} · Aura Sanctuary · {vientiane().format('YYYY')}
            </T>
          </View>
        </AnimatedEntrance>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---- toggle row ------------------------------------------------------------

function ToggleRow({
  icon,
  label,
  desc,
  value,
  disabled,
  onChange,
}: {
  icon: IconName;
  label: string;
  desc: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  return (
    <View className="min-h-[52px] flex-row items-center gap-2.5 border-b border-border px-3.5 py-2.5">
      <IconTile icon={icon} tone="muted" />
      <View className="min-w-0 flex-1">
        <T className="font-lao-medium text-foreground">{label}</T>
        <T numberOfLines={2} className="font-lao text-muted-foreground" style={SMALL}>
          {desc}
        </T>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: colors.input, true: colors.primary }}
        thumbColor={colors.card}
        ios_backgroundColor={colors.input}
        style={{ transform: [{ scale: 0.85 }] }}
      />
    </View>
  );
}
