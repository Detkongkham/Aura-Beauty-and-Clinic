import {
  checkInWindow,
  type AppointmentListItem,
  type LoyaltyAccountView,
  type MyReferralView,
  type ServiceListItem,
} from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';
import { Avatar } from '../../components/ui/Avatar';
import { Gradient } from '../../components/ui/Gradient';
import { Skeleton } from '../../components/ui/Skeleton';
import { Text as UIText } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { formatLAK, formatTime, vientiane } from '../../lib/format';
import { colors, shadow } from '../../theme';

/** Home = 12px ຄົງທີ່ທຸກໂຕ (mobile-flat-type-scale). ລຳດັບຊັ້ນໃຊ້ weight/ສີ ເທົ່ານັ້ນ. */
export function T({ style, ...rest }: React.ComponentProps<typeof UIText>): React.JSX.Element {
  return <UIText {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

type IoniconName = keyof typeof Ionicons.glyphMap;

// ---- helpers ---------------------------------------------------------------

export function greetingKey(): 'home.greetMorning' | 'home.greetAfternoon' | 'home.greetEvening' {
  const h = vientiane().hour();
  if (h < 12) return 'home.greetMorning';
  if (h < 17) return 'home.greetAfternoon';
  return 'home.greetEvening';
}

/** ປ້າຍນັບຖອຍຫຼັງສັ້ນ — "ອີກ 2 ຊມ" / "ມື້ນີ້ 14:30". */
function countdownLabel(t: TFunction, startAt: string): string {
  const mins = vientiane(startAt).diff(vientiane(), 'minute');
  if (mins <= 0) return t('home.now');
  if (mins < 60) return t('home.inMinutes', { count: mins });
  if (mins < 24 * 60) return t('home.inHours', { count: Math.round(mins / 60) });
  return t('home.inDays', { count: Math.ceil(mins / (24 * 60)) });
}

// ---- section header --------------------------------------------------------

export function SectionHeader({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <View className="mb-2.5 flex-row items-end justify-between px-5">
      <View className="flex-1 pr-3">
        <T className="font-lao-semibold text-foreground">{title}</T>
        {hint ? (
          <T numberOfLines={1} className="font-lao text-muted-foreground">
            {hint}
          </T>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Touchable
          onPress={onAction}
          hitSlop={10}
          pressScale={0.94}
          accessibilityRole="button"
          className="flex-row items-center gap-0.5 rounded-full bg-primary-subtle px-2.5 py-1"
        >
          <T className="font-lao-medium text-primary-strong">{actionLabel}</T>
          <Ionicons name="chevron-forward" size={12} color={colors.primaryStrong} />
        </Touchable>
      ) : null}
    </View>
  );
}

// ---- header icon button ----------------------------------------------------

export function HeaderIconButton({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  badge?: number;
  onPress: () => void;
}): React.JSX.Element {
  const hasBadge = (badge ?? 0) > 0;
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hasBadge ? `${label} · ${badge}` : label}
      className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
      style={shadow.xs}
    >
      <Ionicons name={icon} size={18} color={colors.foreground} />
      {hasBadge ? (
        <View className="absolute -right-1 -top-1 h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-card bg-destructive px-1">
          <T className="font-sans-semibold text-white" style={{ lineHeight: 14 }}>
            {badge! > 9 ? '9+' : badge}
          </T>
        </View>
      ) : null}
    </Touchable>
  );
}

// ---- next appointment pass -------------------------------------------------

function PassAction({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.96}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl',
        primary ? 'bg-white' : 'border border-white/15 bg-white/10',
      )}
    >
      <Ionicons name={icon} size={15} color={primary ? colors.aura900 : '#FFFFFF'} />
      <T
        numberOfLines={1}
        className={cn('font-lao-semibold', primary ? 'text-aura-900' : 'text-white')}
      >
        {label}
      </T>
    </Touchable>
  );
}

export function NextAppointmentPass({
  appt,
  moreCount,
  onOpen,
  onCheckIn,
  onChat,
  onTrack,
}: {
  appt: AppointmentListItem;
  moreCount: number;
  onOpen: () => void;
  onCheckIn: () => void;
  onChat: () => void;
  onTrack: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const start = vientiane(appt.startAt);
  const isHome = appt.deliveryType === 'HOME_SERVICE';
  const isActive = appt.status === 'PENDING' || appt.status === 'CONFIRMED';
  const canTrack = isHome && (isActive || appt.status === 'IN_PROGRESS');
  const canCheckIn = !isHome && isActive && checkInWindow(appt.startAt) === 'open';
  const pending = appt.status === 'PENDING';

  return (
    <Touchable
      onPress={onOpen}
      pressScale={0.985}
      haptic="none"
      accessibilityRole="button"
      accessibilityLabel={`${t('home.nextTitle')} · ${appt.serviceName} · ${start.format('D MMM')} ${formatTime(appt.startAt)}`}
      className="overflow-hidden rounded-3xl"
      style={shadow.card}
    >
      <Gradient preset="hero" fill pointerEvents="none" />
      <View className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/5" />
      <View className="absolute -bottom-16 left-16 h-32 w-32 rounded-full bg-aura-400/10" />

      <View className="p-4">
        {/* eyebrow: title + countdown */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-champagne" />
            <T className="font-lao-medium text-white/70">{t('home.nextTitle')}</T>
          </View>
          <View className="flex-row items-center gap-1 rounded-full bg-champagne/20 px-2 py-0.5">
            <Ionicons name="hourglass-outline" size={11} color={colors.champagne} />
            <T className="font-lao-semibold text-champagne">{countdownLabel(t, appt.startAt)}</T>
          </View>
        </View>

        {/* service + date block */}
        <View className="mt-3 flex-row items-center gap-3">
          <View className="h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <T className="font-sans-semibold text-white/60">{start.format('MMM')}</T>
            <T className="font-display-bold text-white" style={{ lineHeight: 18 }}>
              {start.format('D')}
            </T>
          </View>
          <View className="flex-1">
            <T numberOfLines={1} className="font-lao-semibold text-white">
              {appt.serviceName}
            </T>
            <View className="mt-0.5 flex-row items-center gap-1.5">
              <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.7)" />
              <T className="font-sans-medium text-white/80">
                {start.format('ddd')} · {formatTime(appt.startAt)}–{formatTime(appt.endAt)}
              </T>
            </View>
            <View className="mt-0.5 flex-row items-center gap-1.5">
              <Ionicons
                name={isHome ? 'home-outline' : 'location-outline'}
                size={12}
                color="rgba(255,255,255,0.7)"
              />
              <T numberOfLines={1} className="flex-1 font-lao text-white/70">
                {isHome ? t('appointments.homeService') : appt.branchName}
              </T>
            </View>
          </View>
        </View>

        {/* staff + status */}
        <View className="mt-3 flex-row items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
          <Avatar uri={appt.staffAvatarUrl} name={appt.staffName} size={30} tint="muted" />
          <View className="flex-1">
            <T numberOfLines={1} className="font-lao-medium text-white">
              {appt.staffName}
            </T>
            <View className="flex-row items-center gap-1">
              {appt.staffRating > 0 ? (
                <>
                  <Ionicons name="star" size={10} color={colors.champagne} />
                  <T className="font-sans-medium text-white/70">{appt.staffRating.toFixed(1)}</T>
                  <View className="mx-0.5 h-0.5 w-0.5 rounded-full bg-white/40" />
                </>
              ) : null}
              <T numberOfLines={1} className="flex-1 font-lao text-white/60">
                {appt.staffTitle}
              </T>
            </View>
          </View>
          <View
            className={cn(
              'flex-row items-center gap-1 rounded-full px-2 py-0.5',
              pending ? 'bg-warning-soft' : 'bg-success-soft',
            )}
          >
            <Ionicons
              name={pending ? 'time' : 'checkmark-circle'}
              size={11}
              color={pending ? colors.warning : colors.success}
            />
            <T className={cn('font-lao-medium', pending ? 'text-warning' : 'text-success')}>
              {t(`status.${appt.status}`)}
            </T>
          </View>
        </View>

        {/* quick actions — ສະເພາະທີ່ເຮັດໄດ້ແທ້ຕາມສະຖານະ */}
        <View className="mt-3 flex-row gap-2">
          {canCheckIn ? (
            <PassAction
              icon="qr-code-outline"
              label={t('home.actionCheckIn')}
              onPress={onCheckIn}
              primary
            />
          ) : canTrack ? (
            <PassAction
              icon="navigate-outline"
              label={t('home.actionTrack')}
              onPress={onTrack}
              primary
            />
          ) : (
            <PassAction
              icon="document-text-outline"
              label={t('home.actionDetails')}
              onPress={onOpen}
              primary
            />
          )}
          <PassAction
            icon="chatbubble-ellipses-outline"
            label={t('home.actionChat')}
            onPress={onChat}
          />
        </View>

        {moreCount > 0 ? (
          <T className="mt-2.5 text-center font-lao text-white/60">
            {t('home.moreUpcoming', { count: moreCount })}
          </T>
        ) : null}
      </View>
    </Touchable>
  );
}

export function NoAppointmentCard({ onBook }: { onBook: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View
      className="flex-row items-center gap-3 overflow-hidden rounded-3xl border border-aura-200 p-4"
      style={shadow.xs}
    >
      <Gradient preset="wash" fill pointerEvents="none" />
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-card" style={shadow.xs}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
      </View>
      <View className="flex-1">
        <T className="font-lao-semibold text-foreground">{t('home.emptyNextTitle')}</T>
        <T className="font-lao text-muted-foreground">{t('home.emptyNextBody')}</T>
      </View>
      <Touchable
        onPress={onBook}
        accessibilityRole="button"
        className="h-9 flex-row items-center gap-1 rounded-full bg-primary px-3.5"
        style={shadow.primary}
      >
        <T className="font-lao-semibold text-primary-foreground">{t('home.emptyNextCta')}</T>
      </Touchable>
    </View>
  );
}

// ---- quick actions ---------------------------------------------------------

export type QuickAction = {
  key: string;
  icon: IoniconName;
  label: string;
  tone: 'primary' | 'accent' | 'success' | 'info';
  onPress: () => void;
};

const TONE_BG: Record<QuickAction['tone'], string> = {
  primary: 'bg-primary-subtle',
  accent: 'bg-accent-soft',
  success: 'bg-success-soft',
  info: 'bg-aura-100',
};
/** ສີໄອຄອນ — ອ່ານ token ຕອນ render (ບໍ່ແມ່ນຕອນ import) ຈຶ່ງປ່ຽນຕາມໂໝດ/ໂທນ. */
const toneFg = (): Record<QuickAction['tone'], string> => ({
  primary: colors.primary,
  accent: colors.accentForeground,
  success: colors.success,
  info: colors.aura700,
});

export function QuickActions({ items }: { items: QuickAction[] }): React.JSX.Element {
  return (
    <View
      className="mx-5 flex-row rounded-3xl border border-border bg-card px-1.5 py-3"
      style={shadow.xs}
    >
      {items.map((a) => (
        <Touchable
          key={a.key}
          onPress={a.onPress}
          pressScale={0.94}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          className="flex-1 items-center gap-1.5"
        >
          <View
            className={cn('h-11 w-11 items-center justify-center rounded-2xl', TONE_BG[a.tone])}
          >
            <Ionicons name={a.icon} size={19} color={toneFg()[a.tone]} />
          </View>
          <T numberOfLines={1} className="font-lao-medium text-foreground">
            {a.label}
          </T>
        </Touchable>
      ))}
    </View>
  );
}

// ---- loyalty card ----------------------------------------------------------

export function LoyaltyCard({
  data,
  loading,
  onPress,
}: {
  data: LoyaltyAccountView | undefined;
  loading: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  if (loading && !data) return <Skeleton className="mx-5 h-[92px] rounded-3xl" />;
  if (!data) return <View />;

  const toNext = data.pointsToNextTier;
  // backend: toNext = threshold(next) − lifetime → progress = lifetime / threshold
  const progress =
    toNext == null
      ? 1
      : Math.min(1, data.lifetimePoints / Math.max(1, data.lifetimePoints + toNext));
  const worth = data.points * data.pointValueLak;

  return (
    <Touchable
      onPress={onPress}
      pressScale={0.985}
      accessibilityRole="button"
      className="mx-5 overflow-hidden rounded-3xl border border-border bg-card p-4"
      style={shadow.card}
    >
      <View className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-accent-soft/60" />
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-2xl">
          <Gradient preset="gold" fill pointerEvents="none" />
          <Ionicons name="diamond" size={19} color={colors.accentForeground} />
        </View>
        <View className="flex-1">
          <T className="font-lao text-muted-foreground">
            {t('home.memberTier', { tier: t(`loyalty.tier.${data.tierLevel}`) })}
          </T>
          <View className="flex-row items-baseline gap-1">
            <T className="font-display-bold text-foreground">
              {data.points.toLocaleString('en-US')}
            </T>
            <T className="font-lao text-muted-foreground">{t('home.pointsUnit')}</T>
          </View>
        </View>
        {worth > 0 ? (
          <View className="items-end">
            <T className="font-lao text-muted-foreground">{t('home.pointsWorth')}</T>
            <T className="font-sans-semibold text-primary-strong">{formatLAK(worth)}</T>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={15} color={colors.mutedForeground} />
      </View>

      <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <View
          className="h-full overflow-hidden rounded-full"
          style={{ width: `${Math.max(4, progress * 100)}%` }}
        >
          <Gradient preset="luxe" fill pointerEvents="none" />
        </View>
      </View>
      <T numberOfLines={1} className="mt-1.5 font-lao text-muted-foreground">
        {toNext != null && data.nextTier
          ? t('loyalty.toNext', {
              points: toNext.toLocaleString('en-US'),
              tier: t(`loyalty.tier.${data.nextTier}`),
            })
          : t('home.topTier')}
      </T>
    </Touchable>
  );
}

// ---- book again ------------------------------------------------------------

export function BookAgainRow({
  appt,
  onPress,
}: {
  appt: AppointmentListItem;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${t('home.bookAgain')} · ${appt.serviceName}`}
      className="w-[228px] flex-row items-center gap-2.5 rounded-2xl border border-border bg-card p-2.5"
      style={shadow.xs}
    >
      <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-muted">
        {appt.serviceImageUrl ? (
          <Image
            source={{ uri: appt.serviceImageUrl }}
            className="h-full w-full"
            resizeMode="cover"
          />
        ) : (
          <Ionicons name="sparkles-outline" size={17} color={colors.mutedForeground} />
        )}
      </View>
      <View className="flex-1">
        <T numberOfLines={1} className="font-lao-semibold text-foreground">
          {appt.serviceName}
        </T>
        <T numberOfLines={1} className="font-lao text-muted-foreground">
          {t('home.lastVisit', { date: vientiane(appt.startAt).format('D MMM') })} ·{' '}
          {appt.staffName}
        </T>
      </View>
      <View className="h-8 w-8 items-center justify-center rounded-full bg-primary-subtle">
        <Ionicons name="refresh" size={15} color={colors.primary} />
      </View>
    </Touchable>
  );
}

// ---- service rail card -----------------------------------------------------

export const RAIL_CARD_WIDTH = 164;

export function RailServiceCard({
  service,
  onPress,
}: {
  service: ServiceListItem;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const off =
    service.compareAtPrice && service.compareAtPrice > service.price
      ? Math.round((1 - service.price / service.compareAtPrice) * 100)
      : 0;

  return (
    <Touchable
      onPress={onPress}
      pressScale={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${service.name} · ${formatLAK(service.price)}`}
      className="overflow-hidden rounded-2xl border border-border bg-card"
      style={[shadow.card, { width: RAIL_CARD_WIDTH }]}
    >
      <View className="w-full bg-muted" style={{ aspectRatio: 5 / 4 }}>
        {service.imageUrl ? (
          <Image source={{ uri: service.imageUrl }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Ionicons name="sparkles-outline" size={24} color={colors.mutedForeground} />
          </View>
        )}
        <Gradient
          preset="imageScrim"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 56 }}
          pointerEvents="none"
        />
        {off > 0 ? (
          <View className="absolute left-2 top-2 rounded-full bg-destructive px-2 py-0.5">
            <T className="font-sans-semibold text-white">-{off}%</T>
          </View>
        ) : null}
        <View className="absolute bottom-2 left-2 flex-row items-center gap-1 rounded-full bg-black/35 px-2 py-0.5">
          <Ionicons name="time-outline" size={11} color="#FFFFFF" />
          <T className="font-lao-medium text-white">
            {t('common.minutesShort', { count: service.durationMinutes })}
          </T>
        </View>
      </View>

      <View className="gap-0.5 p-3">
        <T numberOfLines={1} className="font-lao text-muted-foreground">
          {service.categoryName}
        </T>
        <T numberOfLines={1} className="font-lao-semibold text-foreground">
          {service.name}
        </T>
        <View className="flex-row items-center gap-1">
          {service.rating > 0 ? (
            <>
              <Ionicons name="star" size={11} color="#F59E0B" />
              <T className="font-sans-semibold text-foreground">{service.rating.toFixed(1)}</T>
              <T className="font-sans text-muted-foreground">({service.reviewCount})</T>
            </>
          ) : (
            <T className="font-lao-medium text-primary">{t('home.newService')}</T>
          )}
        </View>
        <View className="mt-1.5 flex-row items-center justify-between">
          <View className="flex-1">
            <T numberOfLines={1} className="font-sans-semibold text-primary-strong">
              {formatLAK(service.price)}
            </T>
            {off > 0 ? (
              <T
                numberOfLines={1}
                className="font-sans text-muted-foreground"
                style={{ textDecorationLine: 'line-through' }}
              >
                {formatLAK(service.compareAtPrice!)}
              </T>
            ) : null}
          </View>
          <View
            className="h-8 w-8 items-center justify-center rounded-full bg-primary"
            style={shadow.primary}
          >
            <Ionicons name="add" size={17} color={colors.primaryForeground} />
          </View>
        </View>
      </View>
    </Touchable>
  );
}

// ---- referral banner -------------------------------------------------------

export function ReferralBanner({
  data,
  onPress,
}: {
  data: MyReferralView;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.985}
      accessibilityRole="button"
      className="mx-5 flex-row items-center gap-3 overflow-hidden rounded-3xl border border-accent-soft p-4"
      style={shadow.xs}
    >
      <Gradient preset="gold" fill pointerEvents="none" style={{ opacity: 0.35 }} />
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-card" style={shadow.xs}>
        <Ionicons name="gift-outline" size={20} color={colors.accentForeground} />
      </View>
      <View className="flex-1">
        <T className="font-lao-semibold text-foreground">{t('home.referTitle')}</T>
        <T numberOfLines={2} className="font-lao text-muted-foreground">
          {t('home.referBody', { amount: formatLAK(data.discountAmount) })}
        </T>
        <View className="mt-1.5 flex-row items-center gap-1.5">
          <View className="rounded-md border border-dashed border-accent bg-card px-2 py-0.5">
            <T className="font-sans-semibold text-accent-foreground">{data.code}</T>
          </View>
          {data.totalReferred > 0 ? (
            <T className="font-lao text-muted-foreground">
              {t('home.referCount', { count: data.totalReferred })}
            </T>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.accentForeground} />
    </Touchable>
  );
}
