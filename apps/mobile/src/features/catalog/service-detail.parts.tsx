import type {
  ServiceBranchInfo,
  ServiceListItem,
  ServicePackageOffer,
  ServiceReviewItem,
  ServiceStep,
  StaffSummary,
} from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, ScrollView, View } from 'react-native';
import { Avatar } from '../../components/ui/Avatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { formatDate, formatLAK, vientiane } from '../../lib/format';
import { colors, shadow } from '../../theme';

/** ຂໍ້ຄວາມ catalog = 12px ຄົງທີ່ (typography-appointments.md). className ຄຸມ weight/ສີ ເທົ່ານັ້ນ.
 * SMALL (10px) = ຄຳໃບ້/ປ້າຍນ້ອຍ/caption ຮອງ. */
export function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}
export const SMALL = { fontSize: 10, lineHeight: 14 } as const;
/** ຂັ້ນເນັ້ນດຽວ (ລາຄາ CTA / ຄະແນນສະຫຼຸບ). */
export const EMPH = { fontSize: 14, lineHeight: 19 } as const;

type IconName = keyof typeof Ionicons.glyphMap;

/* ─────────────────────────────────────────────────────────────────────────────
 * Service detail — "Soft UI Evolution" (ui-ux-pro-max): ພື້ນ card ຂາວ, ຂອບ hairline,
 * ເງົາ xs, ໄອຄອນໃນວົງ tint ອ່ອນ. ບໍ່ມີເຄື່ອງປະດັບ skeuomorphic. Type ແປ 12/10.
 * ───────────────────────────────────────────────────────────────────────────── */

/** ປຸ່ມໄອຄອນມົນ 36px (+hitSlop = 44pt) — ລອຍເທິງ hero ຫຼື ໃນ header. */
export function RoundBtn({
  icon,
  label,
  onPress,
  active = false,
  variant = 'glass',
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  variant?: 'glass' | 'plain';
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.88}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={6}
      className={cn(
        'h-9 w-9 items-center justify-center rounded-full',
        variant === 'glass' ? 'bg-card/95' : 'bg-muted',
      )}
      style={variant === 'glass' ? shadow.card : undefined}
    >
      <Ionicons name={icon} size={17} color={active ? colors.destructive : colors.foreground} />
    </Touchable>
  );
}

/** ຫົວຂໍ້ section — ຊື່ (semibold) + ຂໍ້ຄວາມຂ້າງ ຫຼື ລິ້ງ action. */
export function SectionHeader({
  title,
  trailing,
  action,
  onAction,
}: {
  title: string;
  trailing?: string;
  action?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <View className="mb-2.5 flex-row items-center justify-between gap-2">
      <T accessibilityRole="header" className="shrink font-lao-semibold text-foreground">
        {title}
      </T>
      {action && onAction ? (
        <Touchable onPress={onAction} haptic="none" hitSlop={10} accessibilityRole="button">
          <T className="font-lao-medium text-primary" style={SMALL}>
            {action}
          </T>
        </Touchable>
      ) : trailing ? (
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {trailing}
        </T>
      ) : null}
    </View>
  );
}

/** ພື້ນຜິວ card ມາດຕະຖານຂອງໜ້ານີ້. */
export function Surface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <View className={cn('rounded-2xl border border-border bg-card', className)} style={shadow.xs}>
      {children}
    </View>
  );
}

/** ໄອຄອນໃນວົງ tint — ໃຊ້ຊ້ຳທົ່ວໜ້າ. */
function IconBubble({
  icon,
  tone = 'primary',
  size = 28,
}: {
  icon: IconName;
  tone?: 'primary' | 'accent' | 'success' | 'muted';
  size?: number;
}): React.JSX.Element {
  const bg = {
    primary: 'bg-primary-subtle',
    accent: 'bg-accent-soft',
    success: 'bg-success-soft',
    muted: 'bg-muted',
  }[tone];
  const fg = {
    primary: colors.primary,
    accent: colors.accentForeground,
    success: colors.success,
    muted: colors.mutedForeground,
  }[tone];
  return (
    <View
      className={cn('items-center justify-center rounded-full', bg)}
      style={{ width: size, height: size }}
    >
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

/* ------------------------------------------------------------------ ratings */

export function Stars({ value, size = 10 }: { value: number; size?: number }): React.JSX.Element {
  return (
    <View className="flex-row" accessibilityElementsHidden importantForAccessibility="no">
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={value >= n ? 'star' : value >= n - 0.5 ? 'star-half' : 'star-outline'}
          size={size}
          color={colors.accent}
        />
      ))}
    </View>
  );
}

/* ---------------------------------------------------------------- fact grid */

export type FactItem = {
  icon: IconName;
  label: string;
  value: string;
  sub?: string;
  tone?: 'primary' | 'accent' | 'success';
};

/** ຂໍ້ມູນຫຼັກ 2×2 — ໄລຍະເວລາ / ລາຄາ / ມັດຈຳ / ຊ່າງ. */
export function FactGrid({ items }: { items: FactItem[] }): React.JSX.Element {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {items.map((f) => (
        <View
          key={f.label}
          accessible
          accessibilityLabel={`${f.label}: ${f.value}${f.sub ? `, ${f.sub}` : ''}`}
          className="flex-row items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2"
          style={{ width: '48.5%' }}
        >
          <IconBubble icon={f.icon} tone={f.tone} />
          <View className="min-w-0 flex-1">
            <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
              {f.label}
            </T>
            <T numberOfLines={1} className="font-lao-semibold text-foreground">
              {f.value}
            </T>
            {f.sub ? (
              <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
                {f.sub}
              </T>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------- description */

/** ຄຳອະທິບາຍ 3 ແຖວ + "ອ່ານເພີ່ມ" ເມື່ອຍາວເກີນ. */
export function ExpandableText({ text }: { text: string }): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  return (
    <View>
      <T
        className="font-lao text-muted-foreground"
        numberOfLines={open ? undefined : 3}
        onTextLayout={(e) => {
          if (!open && e.nativeEvent.lines.length >= 3) setOverflow(true);
        }}
      >
        {text}
      </T>
      {overflow ? (
        <Touchable
          onPress={() => setOpen((v) => !v)}
          haptic="none"
          hitSlop={10}
          accessibilityRole="button"
          className="mt-1 self-start"
        >
          <T className="font-lao-medium text-primary">{open ? t('service.readLess') : t('service.readMore')}</T>
        </Touchable>
      ) : null}
    </View>
  );
}

/** ລາຍການ "ສິ່ງທີ່ທ່ານຈະໄດ້ຮັບ" — checkmark + ຂໍ້ຄວາມ. */
export function CheckList({ items }: { items: string[] }): React.JSX.Element {
  return (
    <View className="gap-2">
      {items.map((h) => (
        <View key={h} className="flex-row items-start gap-2">
          <View className="mt-0.5 h-4 w-4 items-center justify-center rounded-full bg-success-soft">
            <Ionicons name="checkmark" size={10} color={colors.success} />
          </View>
          <T className="flex-1 font-lao text-foreground">{h}</T>
        </View>
      ))}
    </View>
  );
}

/* ---------------------------------------------------------------- staff */

/** ບັດເລືອກຊ່າງ (horizontal) — `null` = ຊ່າງໃດກໍ່ໄດ້. selected = ຂອບ primary + ເຄື່ອງໝາຍຖືກ. */
export function StaffPicker({
  staff,
  selectedId,
  onSelect,
}: {
  staff: StaffSummary[];
  selectedId: string | null;
  onSelect: (s: StaffSummary | null) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-4"
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      <StaffTile
        selected={selectedId === null}
        onPress={() => onSelect(null)}
        label={t('staff.any')}
        sub={t('staff.anyFast')}
        media={<IconBubble icon="people" size={44} />}
      />
      {staff.map((s) => (
        <StaffTile
          key={s.id}
          selected={selectedId === s.id}
          onPress={() => onSelect(s)}
          label={s.name}
          sub={s.title}
          rating={s.totalReviews > 0 ? s.rating : undefined}
          media={<Avatar uri={s.avatarUrl} name={s.name} size={44} mode="cartoon" />}
        />
      ))}
    </ScrollView>
  );
}

function StaffTile({
  selected,
  onPress,
  label,
  sub,
  rating,
  media,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  sub: string;
  rating?: number;
  media: React.ReactNode;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      haptic="select"
      pressScale={0.96}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${sub}`}
      className={cn(
        'w-[104px] items-center rounded-2xl border bg-card px-2 pb-2.5 pt-3',
        selected ? 'border-primary bg-primary-subtle' : 'border-border',
      )}
    >
      {selected ? (
        <View className="absolute right-1.5 top-1.5 h-4 w-4 items-center justify-center rounded-full bg-primary">
          <Ionicons name="checkmark" size={10} color={colors.primaryForeground} />
        </View>
      ) : null}
      {media}
      <T numberOfLines={1} className="mt-1.5 font-lao-medium text-foreground">
        {label}
      </T>
      <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
        {sub}
      </T>
      {rating != null ? (
        <View className="mt-0.5 flex-row items-center gap-0.5">
          <Ionicons name="star" size={9} color={colors.accent} />
          <T className="font-sans-medium text-foreground" style={SMALL}>
            {rating.toFixed(1)}
          </T>
        </View>
      ) : null}
    </Touchable>
  );
}

/* ---------------------------------------------------------------- process */

/** ຂັ້ນຕອນ — timeline ແນວຕັ້ງ (ຈຸດເລກ + ເສັ້ນເຊື່ອມ). */
export function ProcessTimeline({ steps }: { steps: ServiceStep[] }): React.JSX.Element {
  return (
    <Surface className="px-3 py-3">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={`${i}-${step.title}`} className="flex-row gap-2.5">
            <View className="items-center">
              <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
                <T className="font-sans-medium text-primary-foreground" style={SMALL}>
                  {i + 1}
                </T>
              </View>
              {!last ? <View className="my-1 w-px flex-1 bg-aura-200" /> : null}
            </View>
            <View className={cn('flex-1', !last && 'pb-3')}>
              <T className="font-lao-medium text-foreground">{step.title}</T>
              {step.body ? (
                <T className="mt-0.5 font-lao text-muted-foreground" style={SMALL}>
                  {step.body}
                </T>
              ) : null}
            </View>
          </View>
        );
      })}
    </Surface>
  );
}

/* ---------------------------------------------------------------- reviews */

/** ສະຫຼຸບຄະແນນ — ຕົວເລກ + ດາວ ຊ້າຍ, ແທ່ງ 5→1 ຂວາ. */
export function RatingSummary({
  rating,
  count,
  breakdown,
}: {
  rating: number;
  count: number;
  breakdown: number[];
}): React.JSX.Element {
  const { t } = useTranslation();
  const max = Math.max(1, ...breakdown);
  return (
    <Surface className="flex-row items-center gap-4 p-3">
      <View
        className="items-center gap-1 pr-1"
        accessible
        accessibilityLabel={`${rating.toFixed(1)} / 5, ${t('service.ratingFrom', { count })}`}
      >
        <T className="font-sans-semibold text-foreground" style={EMPH}>
          {rating.toFixed(1)}
        </T>
        <Stars value={rating} />
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {t('service.ratingFrom', { count })}
        </T>
      </View>
      <View className="w-px self-stretch bg-border" />
      <View className="flex-1 gap-1">
        {breakdown.map((n, i) => (
          <View key={i} className="flex-row items-center gap-1.5">
            <T className="w-2.5 font-sans text-muted-foreground" style={SMALL}>
              {5 - i}
            </T>
            <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <View
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.round((n / max) * 100)}%` }}
              />
            </View>
            <T className="w-5 text-right font-sans text-muted-foreground" style={SMALL}>
              {n}
            </T>
          </View>
        ))}
      </View>
    </Surface>
  );
}

export function ReviewCard({ review }: { review: ServiceReviewItem }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Surface className="p-3">
      <View className="flex-row items-center gap-2">
        <Avatar uri={review.authorAvatarUrl} name={review.authorName} size={28} mode="cartoon" />
        <View className="min-w-0 flex-1">
          <T numberOfLines={1} className="font-lao-medium text-foreground">
            {review.authorName}
          </T>
          <View className="flex-row items-center gap-1">
            <Ionicons name="checkmark-circle" size={10} color={colors.success} />
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {t('service.realCustomer')} · {formatDate(review.createdAt)}
            </T>
          </View>
        </View>
        <Stars value={review.rating} />
      </View>
      <T className="mt-2 font-lao text-foreground">{review.comment}</T>
    </Surface>
  );
}

/* ---------------------------------------------------------------- packages */

export function PackageRow({
  pkg,
  onPress,
}: {
  pkg: ServicePackageOffer;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${pkg.name}, ${formatLAK(pkg.totalPrice)}`}
      className="flex-row items-center gap-2.5 py-2.5"
    >
      <IconBubble icon="gift-outline" tone="accent" />
      <View className="min-w-0 flex-1">
        <T numberOfLines={1} className="font-lao-medium text-foreground">
          {pkg.name}
        </T>
        <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
          {t('service.packageMeta', { units: pkg.units, items: pkg.itemCount })}
        </T>
      </View>
      <View className="items-end">
        <T className="font-sans-semibold text-primary-strong">{formatLAK(pkg.totalPrice)}</T>
        {pkg.savings > 0 ? (
          <T className="font-lao-medium text-success" style={SMALL}>
            {t('service.saveAmount', { amount: formatLAK(pkg.savings) })}
          </T>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
    </Touchable>
  );
}

/* ---------------------------------------------------------------- location */

const AMENITY: Record<string, IconName> = {
  wifi: 'wifi',
  parking: 'car-outline',
  drink: 'cafe-outline',
  lounge: 'bed-outline',
  kids: 'happy-outline',
  card: 'card-outline',
};

/** ເປີດຢູ່ບໍ ຕາມເວລາວຽງຈັນ (HH:mm). */
export function isOpenNow(openTime: string, closeTime: string): boolean {
  const toMin = (hm: string): number => {
    const [h, m] = hm.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const now = vientiane();
  const cur = now.hour() * 60 + now.minute();
  const o = toMin(openTime);
  const c = toMin(closeTime);
  return c > o ? cur >= o && cur < c : cur >= o || cur < c;
}

/** ບັດສາຂາ — ຊື່/ທີ່ຢູ່ + ສະຖານະເປີດ + ເວລາ + ສິ່ງອຳນວຍຄວາມສະດວກ + ປຸ່ມເສັ້ນທາງ/ໂທ. */
export function LocationCard({
  branch,
  fallbackName,
  fallbackAddress,
  amenities,
}: {
  branch: ServiceBranchInfo | null;
  fallbackName: string;
  fallbackAddress: string;
  amenities: string[];
}): React.JSX.Element {
  const { t } = useTranslation();
  const name = branch?.name ?? fallbackName;
  const address = branch?.address ?? fallbackAddress;
  const open = branch ? isOpenNow(branch.openTime, branch.closeTime) : null;
  const known = amenities.filter((a) => AMENITY[a]);

  const onDirections = (): void => {
    const q =
      branch?.latitude != null && branch.longitude != null
        ? `${branch.latitude},${branch.longitude}`
        : encodeURIComponent(`${name} ${address}`);
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };
  const onCall = (): void => {
    if (branch?.phone) void Linking.openURL(`tel:${branch.phone.replace(/[^\d+]/g, '')}`);
  };

  return (
    <Surface className="p-3">
      <View className="flex-row items-start gap-2.5">
        <IconBubble icon="location" />
        <View className="min-w-0 flex-1">
          <T numberOfLines={1} className="font-lao-medium text-foreground">
            {name}
          </T>
          <T numberOfLines={2} className="font-lao text-muted-foreground" style={SMALL}>
            {address}
          </T>
          {branch ? (
            <View className="mt-1 flex-row items-center gap-1.5">
              <View
                className={cn(
                  'flex-row items-center gap-1 rounded-full px-1.5 py-px',
                  open ? 'bg-success-soft' : 'bg-destructive-soft',
                )}
              >
                <View
                  className={cn('h-1.5 w-1.5 rounded-full', open ? 'bg-success' : 'bg-destructive')}
                />
                <T
                  className={cn('font-lao-medium', open ? 'text-success' : 'text-destructive')}
                  style={SMALL}
                >
                  {open ? t('service.openNow') : t('service.closedNow')}
                </T>
              </View>
              <T className="font-lao text-muted-foreground" style={SMALL}>
                {t('service.hoursDaily', { open: branch.openTime, close: branch.closeTime })}
              </T>
            </View>
          ) : null}
        </View>
      </View>

      {known.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-1.5">
          {known.map((a) => (
            <View key={a} className="flex-row items-center gap-1 rounded-full bg-muted px-2 py-1">
              <Ionicons name={AMENITY[a]!} size={11} color={colors.mutedForeground} />
              <T className="font-lao text-muted-foreground" style={SMALL}>
                {t(`service.amenity.${a}`)}
              </T>
            </View>
          ))}
        </View>
      ) : null}

      <View className="mt-3 flex-row gap-2 border-t border-border pt-3">
        <ActionPill icon="navigate-outline" label={t('service.directions')} onPress={onDirections} />
        {branch?.phone ? (
          <ActionPill icon="call-outline" label={t('service.call')} onPress={onCall} />
        ) : null}
      </View>
    </Surface>
  );
}

function ActionPill({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-9 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-primary-subtle"
    >
      <Ionicons name={icon} size={14} color={colors.primary} />
      <T className="font-lao-medium text-primary">{label}</T>
    </Touchable>
  );
}

/* ---------------------------------------------------------------- tips */

export function TipList({ tips }: { tips: { icon: IconName; text: string }[] }): React.JSX.Element {
  return (
    <Surface className="gap-2.5 p-3">
      {tips.map((tip) => (
        <View key={tip.text} className="flex-row items-start gap-2.5">
          <IconBubble icon={tip.icon} tone="muted" size={24} />
          <T className="flex-1 pt-0.5 font-lao text-foreground">{tip.text}</T>
        </View>
      ))}
    </Surface>
  );
}

/* ---------------------------------------------------------------- related */

export function RelatedRail({
  items,
  onOpen,
}: {
  items: ServiceListItem[];
  onOpen: (id: string) => void;
}): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-4"
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
    >
      {items.map((s) => (
        <Touchable
          key={s.id}
          onPress={() => onOpen(s.id)}
          pressScale={0.97}
          accessibilityRole="button"
          accessibilityLabel={`${s.name}, ${formatLAK(s.price)}`}
          className="w-[148px] rounded-2xl border border-border bg-card"
        >
          <View className="h-[92px] overflow-hidden rounded-t-2xl bg-muted">
            {s.imageUrl ? (
              <Image source={{ uri: s.imageUrl }} className="h-full w-full" resizeMode="cover" />
            ) : (
              <View className="h-full w-full items-center justify-center bg-primary-subtle">
                <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
              </View>
            )}
          </View>
          <View className="gap-0.5 p-2">
            <T numberOfLines={1} className="font-lao-medium text-foreground">
              {s.name}
            </T>
            <View className="flex-row items-center gap-1">
              {s.reviewCount > 0 ? (
                <>
                  <Ionicons name="star" size={9} color={colors.accent} />
                  <T className="font-sans-medium text-foreground" style={SMALL}>
                    {s.rating.toFixed(1)}
                  </T>
                  <T className="text-muted-foreground" style={SMALL}>
                    ·
                  </T>
                </>
              ) : null}
              <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
                {s.durationMinutes}′
              </T>
            </View>
            <T className="font-sans-semibold text-primary-strong">{formatLAK(s.price)}</T>
          </View>
        </Touchable>
      ))}
    </ScrollView>
  );
}

/* ---------------------------------------------------------------- skeleton */

export function ServiceDetailSkeleton({ heroHeight }: { heroHeight: number }): React.JSX.Element {
  return (
    <View className="flex-1 bg-background">
      <View style={{ height: heroHeight }} className="bg-muted" />
      <View className="-mt-5 gap-3 rounded-t-3xl bg-background px-4 pt-5">
        <Skeleton className="h-3 w-28 rounded-md" />
        <Skeleton className="h-4 w-52 rounded-md" />
        <Skeleton className="h-3 w-40 rounded-md" />
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-[48.5%] rounded-xl" />
          ))}
        </View>
        <Skeleton className="h-3 w-full rounded-md" />
        <Skeleton className="h-3 w-4/5 rounded-md" />
        <View className="mt-2 flex-row gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-[104px] rounded-2xl" />
          ))}
        </View>
      </View>
    </View>
  );
}
