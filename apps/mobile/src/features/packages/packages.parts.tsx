import type { PackageItemView, PackageView, UserPackageStatus } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Gradient } from '../../components/ui/Gradient';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { formatLAK } from '../../lib/format';
import { colors, shadow } from '../../theme';
import {
  Card,
  IconTile,
  MoneyRow,
  NUM,
  Pill,
  SMALL,
  T,
  toneColor,
  TOTAL,
  type IconName,
  type Tone,
} from '../booking/booking-kit';

/**
 * Packages kit — ໜ້າຮ້ານ / ລາຍລະອຽດ / ຈ່າຍເງິນ / ແພັກເກັດຂອງຂ້ອຍ.
 *
 * ສືບທອດ booking-kit ທັງໝົດ (ພື້ນຜິວ, pill, ໄອຄອນ tile, ແຖວເງິນ) ເພື່ອໃຫ້ 4 ໜ້ານີ້
 * ຢູ່ໃນພາສາອອກແບບດຽວກັນກັບ flow ຈອງ — "Soft UI Evolution": ບັດຂາວ, ຂອບ hairline,
 * ເງົານຸ່ມເຢັນ, ໄອຄອນໃນກ່ອງ tint ອ່ອນ.
 *
 * Type scale ຄົງທີ່ 12px (mobile-flat-type-scale): T = 12/17, SMALL = 10/14 (ຄຳໃບ້/ປ້າຍ),
 * NUM = 14/18 (ຕົວເລກເດັ່ນ), TOTAL = 15/19 (ຍອດລວມ) — ບໍ່ມີຂະໜາດອື່ນ.
 * ຂະໜາດ UI ທີ່ເຂົ້າກັບ 12px: ໄອຄອນ 10/12/14/16, tile 32/40, ຮູບ 44/56/72/88,
 * ແຖວແຕະ ≥ 44pt, padding ບັດ 12–14, gap 8/12, radius 12/16/999.
 */

export { NUM, SMALL, T, TOTAL };
/** ຊື່ເກົ່າຂອງຂັ້ນເນັ້ນ — ຄົງໄວ້ໃຫ້ import ເດີມບໍ່ແຕກ. */
export const EMPH = NUM;

/** ອາຍຸແພັກເກັດ → "6 ເດືອນ" / "1 ປີ" / "45 ມື້". */
export function useValidityLabel(): (days: number) => string {
  const { t } = useTranslation();
  return (days) =>
    days % 365 === 0
      ? t('packages.years', { count: days / 365 })
      : days % 30 === 0
        ? t('packages.months', { count: days / 30 })
        : t('packages.days', { count: days });
}

/* ------------------------------------------------------------------ atoms */

/** ປຸ່ມໄອຄອນມົນ 36px (+hitSlop = 44pt) — ລອຍເທິງ hero ຫຼື ຢູ່ໃນ header ແກ້ວ. */
export function RoundBtn({
  icon,
  label,
  onPress,
  variant = 'glass',
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  variant?: 'glass' | 'plain';
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.88}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'h-9 w-9 items-center justify-center rounded-full',
        variant === 'glass' ? 'bg-card/95' : 'bg-muted',
      )}
      style={variant === 'glass' ? shadow.card : undefined}
    >
      <Ionicons name={icon} size={17} color={colors.foreground} />
    </Touchable>
  );
}

export function PackageThumb({
  uri,
  size,
  className,
}: {
  uri: string | null;
  size: number;
  className?: string;
}): React.JSX.Element {
  return (
    <View
      className={cn('overflow-hidden rounded-xl bg-accent-soft', className)}
      style={{ width: size, height: size }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          className="h-full w-full"
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View className="h-full w-full items-center justify-center">
          <Ionicons
            name="gift-outline"
            size={Math.round(size * 0.34)}
            color={colors.accentForeground}
          />
        </View>
      )}
    </View>
  );
}

/** ປ້າຍປະຢັດເປັນເງິນ. */
export function SavingsPill({ amount }: { amount: number }): React.JSX.Element | null {
  const { t } = useTranslation();
  if (amount <= 0) return null;
  return (
    <Pill tone="success" icon="pricetag" label={t('service.saveAmount', { amount: formatLAK(amount) })} />
  );
}

/** ປ້າຍ % ສ່ວນຫຼຸດ — ແປະມຸມຮູບ, ອ່ານງ່າຍກວ່າຕົວເລກເງິນຕອນກວາດເບິ່ງ. */
export function DiscountBadge({ pct }: { pct: number }): React.JSX.Element | null {
  if (pct <= 0) return null;
  return (
    <View className="overflow-hidden rounded-full" style={shadow.xs}>
      <Gradient preset="ribbon" fill radius={999} pointerEvents="none" />
      <View className="px-1.5 py-0.5">
        <T className="font-sans-semibold text-white" style={SMALL}>
          −{pct}%
        </T>
      </View>
    </View>
  );
}

/** ແຖວ meta ຈຸດຄັ່ນ — "5 ຄັ້ງ · 6 ເດືອນ · ຄັ້ງລະ ₭100,000". */
export function MetaLine({
  items,
  className,
}: {
  items: string[];
  className?: string;
}): React.JSX.Element {
  return (
    <T numberOfLines={1} className={cn('font-lao text-muted-foreground', className)} style={SMALL}>
      {items.filter(Boolean).join('  ·  ')}
    </T>
  );
}

/** ແຖບຄວາມຄືບໜ້າ ເຫຼືອ/ທັງໝົດ. */
export function SessionBar({
  remaining,
  total,
  tone = 'primary',
}: {
  remaining: number;
  total: number;
  tone?: 'primary' | 'muted' | 'warning';
}): React.JSX.Element {
  const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;
  const fill = { primary: 'bg-primary', muted: 'bg-muted-foreground/40', warning: 'bg-warning' }[tone];
  return (
    <View
      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: remaining }}
    >
      <View className={cn('h-full rounded-full', fill)} style={{ width: `${pct}%` }} />
    </View>
  );
}

/** ວົງແຫວນຄັ້ງທີ່ເຫຼືອ — ຕົວເລກໃຈກາງ, ອ່ານໄດ້ໄວກວ່າແຖບຕອນຢູ່ຫົວບັດ. */
export function SessionRing({
  remaining,
  total,
  size = 52,
  tone = 'primary',
}: {
  remaining: number;
  total: number;
  size?: number;
  tone?: Tone;
}): React.JSX.Element {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  const color = toneColor()[tone];
  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: remaining }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.muted} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference * (1 - pct)}
          fill="none"
        />
      </Svg>
      <T className="font-sans-semibold text-foreground" style={NUM}>
        {remaining}
      </T>
      <T className="font-sans text-muted-foreground" style={{ ...SMALL, lineHeight: 11 }}>
        /{total}
      </T>
    </View>
  );
}

export type PackageDisplayState = UserPackageStatus | 'EXPIRED' | 'USED_UP';

const STATE_TONE: Record<PackageDisplayState, Tone> = {
  ACTIVE: 'success',
  PENDING_PAYMENT: 'warning',
  EXPIRED: 'muted',
  USED_UP: 'muted',
  VOID: 'muted',
};
const STATE_ICON: Record<PackageDisplayState, IconName> = {
  ACTIVE: 'checkmark-circle',
  PENDING_PAYMENT: 'time',
  EXPIRED: 'hourglass',
  USED_UP: 'albums',
  VOID: 'close-circle',
};

export function StatusPill({ state }: { state: PackageDisplayState }): React.JSX.Element {
  const { t } = useTranslation();
  const label = {
    ACTIVE: t('packages.stateActive'),
    PENDING_PAYMENT: t('packages.statePending'),
    EXPIRED: t('packages.stateExpired'),
    USED_UP: t('packages.stateUsedUp'),
    VOID: t('packages.stateVoid'),
  }[state];
  return <Pill tone={STATE_TONE[state]} icon={STATE_ICON[state]} label={label} />;
}

/** ປ້າຍອາຍຸທີ່ເຫຼືອ — ເປີດເປັນສີເຕືອນເມື່ອ ≤ 14 ມື້ ເພື່ອບໍ່ໃຫ້ສິດຄ້າງຈົນໝົດອາຍຸ. */
export function ExpiryPill({ daysLeft }: { daysLeft: number }): React.JSX.Element {
  const { t } = useTranslation();
  const tone: Tone = daysLeft <= 0 ? 'muted' : daysLeft <= 14 ? 'warning' : 'muted';
  return (
    <Pill
      tone={tone}
      icon={daysLeft <= 14 ? 'alert-circle' : 'calendar-outline'}
      label={daysLeft <= 0 ? t('packages.stateExpired') : t('packages.daysLeft', { count: daysLeft })}
    />
  );
}

/** ບັນທັດບໍລິການທີ່ລວມຢູ່ (ໃຊ້ໃນບັດຮ້ານ) — chip ຊື່ + ຈຳນວນຄັ້ງ. */
function ServiceChips({ items }: { items: PackageItemView[] }): React.JSX.Element {
  const shown = items.slice(0, 2);
  const rest = items.length - shown.length;
  return (
    <View className="flex-row flex-wrap items-center gap-1">
      {shown.map((i) => (
        <View key={i.serviceId} className="max-w-[150px] rounded-md bg-muted px-1.5 py-0.5">
          <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
            {`${i.serviceName} ×${i.totalUnits}`}
          </T>
        </View>
      ))}
      {rest > 0 ? (
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {`+${rest}`}
        </T>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------- store card */

/** ບັດແພັກເກັດໃນໜ້າຮ້ານ — ຮູບ + ຊື່ + ບໍລິການ + ລາຄາ/ປະຢັດ. `best` = ຄຸ້ມທີ່ສຸດ. */
export function PackageCard({
  pkg,
  onPress,
  best = false,
}: {
  pkg: PackageView;
  onPress: () => void;
  best?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const validity = useValidityLabel();
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${pkg.name}, ${formatLAK(pkg.totalPrice)}, ${t('packages.sessions', {
        count: pkg.totalSessions,
      })}`}
      className={cn(
        'overflow-hidden rounded-2xl border bg-card',
        best ? 'border-primary/40' : 'border-border',
      )}
      style={shadow.card}
    >
      {best ? (
        <View className="flex-row items-center gap-1 bg-primary-subtle px-3 py-1">
          <Ionicons name="sparkles" size={10} color={colors.primaryStrong} />
          <T className="font-lao-semibold text-primary-strong" style={SMALL}>
            {t('packages.bestValue')}
          </T>
        </View>
      ) : null}

      <View className="flex-row gap-3 p-3">
        <View>
          <PackageThumb uri={pkg.imageUrl} size={88} />
          {pkg.savingsPct > 0 ? (
            <View className="absolute -right-1 -top-1">
              <DiscountBadge pct={pkg.savingsPct} />
            </View>
          ) : null}
        </View>

        <View className="min-w-0 flex-1 justify-between">
          <View className="gap-1">
            <T numberOfLines={2} className="font-lao-semibold text-foreground">
              {pkg.name}
            </T>
            <ServiceChips items={pkg.items} />
            <MetaLine
              items={[
                t('packages.sessions', { count: pkg.totalSessions }),
                validity(pkg.validityDays),
              ]}
            />
          </View>

          <View className="mt-2 flex-row items-end justify-between gap-2">
            <View className="min-w-0 shrink">
              {pkg.savings > 0 ? (
                <T className="font-sans text-muted-foreground line-through" style={SMALL}>
                  {formatLAK(pkg.valuePrice)}
                </T>
              ) : null}
              <T className="font-sans-semibold text-foreground" style={NUM}>
                {formatLAK(pkg.totalPrice)}
              </T>
              <T className="font-lao text-primary-strong" style={SMALL}>
                {t('packages.perSessionShort', { amount: formatLAK(pkg.perSessionPrice) })}
              </T>
            </View>
            <View className="items-end gap-1">
              {pkg.activeHolders > 0 ? (
                <View className="flex-row items-center gap-1">
                  <Ionicons name="people" size={10} color={colors.mutedForeground} />
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('packages.holders', { count: pkg.activeHolders })}
                  </T>
                </View>
              ) : null}
              <View className="h-7 w-7 items-center justify-center rounded-full bg-primary-subtle">
                <Ionicons name="chevron-forward" size={14} color={colors.primaryStrong} />
              </View>
            </View>
          </View>
        </View>
      </View>
    </Touchable>
  );
}

/** ບັດເຂົ້າກະເປົ໋າ (ໜ້າຮ້ານ) — ສະຫຼຸບສິດທີ່ມີ + ທາງໄປ "ແພັກເກັດຂອງຂ້ອຍ". */
export function WalletEntry({
  activeCount,
  sessionsLeft,
  onPress,
}: {
  activeCount: number;
  sessionsLeft: number;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${t('packages.myTitle')}, ${t('packages.activeCount', { count: activeCount })}`}
      className="min-h-[56px] flex-row items-center gap-3 overflow-hidden rounded-2xl p-3"
      style={shadow.card}
    >
      <Gradient preset="hero" fill pointerEvents="none" />
      <View className="h-9 w-9 items-center justify-center rounded-full bg-white/15">
        <Ionicons name="wallet" size={16} color="#fff" />
      </View>
      <View className="min-w-0 flex-1">
        <T className="font-lao-semibold text-white">{t('packages.myTitle')}</T>
        <T className="font-lao text-white/70" style={SMALL}>
          {activeCount > 0
            ? `${t('packages.activeCount', { count: activeCount })}  ·  ${t('packages.sessionsLeft', { count: sessionsLeft })}`
            : t('packages.walletEmptyHint')}
        </T>
      </View>
      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.8)" />
    </Touchable>
  );
}

/* ---------------------------------------------------------- detail blocks */

/** ຕາຕະລາງຂໍ້ມູນຫຼັກ 3 ຊ່ອງ — ຈຳນວນຄັ້ງ / ອາຍຸ / ຄັ້ງລະ. */
export function FactRow({
  items,
}: {
  items: { icon: IconName; label: string; value: string }[];
}): React.JSX.Element {
  return (
    <View className="flex-row">
      {items.map((f, i) => (
        <View key={f.label} className="flex-1 flex-row">
          {i > 0 ? <View className="my-1 w-px bg-border" /> : null}
          <View
            accessible
            accessibilityLabel={`${f.label}: ${f.value}`}
            className="flex-1 items-center gap-1 px-1"
          >
            <IconTile icon={f.icon} />
            <T numberOfLines={1} className="font-sans-semibold text-foreground">
              {f.value}
            </T>
            <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
              {f.label}
            </T>
          </View>
        </View>
      ))}
    </View>
  );
}

/** ບັດ "ຄຸ້ມແນວໃດ" — ຖ້າຊື້ແຍກ vs ລາຄາແພັກເກັດ vs ປະຢັດ. */
export function ValueBreakdown({ pkg }: { pkg: PackageView }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Card flat className="px-3.5 py-2">
      <MoneyRow label={t('packages.valueNormal')} value={formatLAK(pkg.valuePrice)} />
      <MoneyRow label={t('packages.valuePackage')} value={formatLAK(pkg.totalPrice)} />
      <View className="mt-1 border-t border-border/70 pt-1">
        <MoneyRow
          strong
          tone="success"
          label={t('packages.valueSave')}
          hint={pkg.savingsPct > 0 ? t('packages.savePct', { pct: pkg.savingsPct }) : null}
          value={formatLAK(pkg.savings)}
        />
      </View>
    </Card>
  );
}

/** ລາຍການບໍລິການທີ່ລວມຢູ່ — ຮູບ, ຊື່, ເວລາ/ມູນຄ່າ, ຈຳນວນຄັ້ງ. */
export function IncludedList({ items }: { items: PackageItemView[] }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Card flat className="px-3.5">
      {items.map((it, i) => (
        <View
          key={it.serviceId}
          className={cn(
            'min-h-[56px] flex-row items-center gap-3 py-2.5',
            i > 0 && 'border-t border-border/70',
          )}
        >
          <PackageThumb uri={it.serviceImageUrl} size={44} />
          <View className="min-w-0 flex-1">
            <T numberOfLines={1} className="font-lao-semibold text-foreground">
              {it.serviceName}
            </T>
            <MetaLine
              items={[
                t('common.minutesShort', { count: it.durationMinutes }),
                t('packages.unitValue', { amount: formatLAK(it.unitPrice) }),
              ]}
            />
          </View>
          <View className="rounded-full bg-primary-subtle px-2 py-0.5">
            <T className="font-sans-semibold text-primary-strong">×{it.totalUnits}</T>
          </View>
        </View>
      ))}
    </Card>
  );
}

/** ຂັ້ນຕອນໃຊ້ງານ — ຕົວເລກໃນວົງ + ເສັ້ນຕໍ່ລົງລຸ່ມ. */
export function StepList({
  steps,
}: {
  steps: { icon: IconName; title: string; body?: string }[];
}): React.JSX.Element {
  return (
    <Card flat className="p-3.5">
      {steps.map((s, i) => (
        <View key={s.title} className="flex-row gap-3">
          <View className="items-center">
            <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
              <T className="font-sans-semibold text-primary-foreground" style={SMALL}>
                {i + 1}
              </T>
            </View>
            {i < steps.length - 1 ? <View className="w-px flex-1 bg-border" /> : null}
          </View>
          <View className={cn('flex-1', i < steps.length - 1 && 'pb-3')}>
            <T className="font-lao-semibold text-foreground">{s.title}</T>
            {s.body ? (
              <T className="font-lao text-muted-foreground" style={SMALL}>
                {s.body}
              </T>
            ) : null}
          </View>
        </View>
      ))}
    </Card>
  );
}

/** ລາຍການເງື່ອນໄຂ — ໄອຄອນ + ຂໍ້ຄວາມ. */
export function BulletList({
  items,
}: {
  items: { icon: IconName; text: string }[];
}): React.JSX.Element {
  return (
    <Card flat className="gap-2.5 p-3.5">
      {items.map((b) => (
        <View key={b.text} className="flex-row items-start gap-2.5">
          <Ionicons name={b.icon} size={14} color={colors.primary} style={{ marginTop: 1 }} />
          <T className="flex-1 font-lao text-foreground/80" style={SMALL}>
            {b.text}
          </T>
        </View>
      ))}
    </Card>
  );
}

/* ----------------------------------------------------------- state views */

export function EmptyBlock({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View className="items-center gap-2 px-8 py-14">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
        <Ionicons name={icon} size={24} color={colors.accentForeground} />
      </View>
      <T className="text-center font-lao-semibold text-foreground">{title}</T>
      {body ? (
        <T className="text-center font-lao text-muted-foreground" style={SMALL}>
          {body}
        </T>
      ) : null}
      {action ? <View className="mt-2">{action}</View> : null}
    </View>
  );
}

/** Skeleton ບັດຮ້ານ — ຮັກສາຄວາມສູງໃຫ້ຄືບັດຈິງ (ບໍ່ໃຫ້ layout ກະໂດດ). */
export function PackageCardSkeleton(): React.JSX.Element {
  return (
    <View className="flex-row gap-3 rounded-2xl border border-border bg-card p-3" style={shadow.xs}>
      <Skeleton className="h-[88px] w-[88px] rounded-xl" />
      <View className="flex-1 gap-2 py-0.5">
        <Skeleton className="h-3 w-3/4 rounded-full" />
        <Skeleton className="h-2.5 w-1/2 rounded-full" />
        <Skeleton className="h-2.5 w-2/5 rounded-full" />
        <View className="flex-1" />
        <Skeleton className="h-4 w-1/3 rounded-full" />
      </View>
    </View>
  );
}
