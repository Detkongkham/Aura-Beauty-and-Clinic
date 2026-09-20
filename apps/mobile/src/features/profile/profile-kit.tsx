import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { Skeleton } from '../../components/ui/Skeleton';
import { Gradient } from '../../components/ui/Gradient';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { colors, shadow } from '../../theme';
import type { GradientPreset } from '../../theme/gradients';
import {
  Card,
  IconTile,
  InfoRow,
  MoneyRow,
  Notice,
  NUM,
  Pill,
  SectionHeader,
  SMALL,
  T,
  toneColor,
  TOTAL,
  type IconName,
  type Tone,
} from '../booking/booking-kit';

/**
 * Profile-kit — ຊຸດ primitive ຮ່ວມຂອງ 6 ໜ້າໃນແຖບໂປຣໄຟລ໌
 * (Profile / Loyalty / GiftCards / GiftCardCheckout / Referral / SkinAnalysis).
 *
 * ສືບທອດ type scale ຂອງ booking-kit ໂດຍກົງ ເພື່ອບໍ່ໃຫ້ມີສອງມາດຕະຖານໃນແອັບ:
 * body 12/17 · SMALL 10/14 · NUM 14/18 · TOTAL 15/19 — **ບໍ່ມີຂະໜາດອື່ນ** ນອກຈາກ
 * ຕົວເລກ hero (DISPLAY) ທີ່ໃຊ້ໄດ້ພຽງ 1 ບ່ອນຕໍ່ໜ້າ. Rhythm ທີ່ເຂົ້າກັບ 12px:
 * icon 12 (inline) / 14 (pill) / 16 (tile 32) / 18 (tile 40), row ≥ 44pt, card padding 14,
 * gap 8/12/14, radius 12 (ແຖວ) / 16 (ບັດ) / 24 (hero).
 */
export {
  Card,
  IconTile,
  InfoRow,
  MoneyRow,
  Notice,
  NUM,
  Pill,
  SectionHeader,
  SMALL,
  T,
  toneColor,
  TOTAL,
};
export type { IconName, Tone };

/** ຕົວເລກ hero ດຽວຂອງແຕ່ລະໜ້າ (ຍອດຄະແນນ / ຍອດບັດ / ລະຫັດແນະນຳ). */
export const DISPLAY = { fontSize: 30, lineHeight: 36 } as const;

// ---- hero ------------------------------------------------------------------

/**
 * ພື້ນຜິວ hero ຂອງໜ້າ — gradient ເຕັມບັດ + ວົງມົນຕົກແຕ່ງຈາງໆ ສອງໜ່ວຍ
 * (parity ກັບ NextAppointmentPass ໃນ home.parts).
 */
export function HeroCard({
  children,
  preset = 'hero',
  className,
  style,
  ...rest
}: ViewProps & {
  children: ReactNode;
  preset?: GradientPreset;
  className?: string;
}): React.JSX.Element {
  return (
    <View
      {...rest}
      className={cn('overflow-hidden rounded-3xl', className)}
      style={[shadow.card, style]}
    >
      <Gradient preset={preset} fill pointerEvents="none" />
      <View pointerEvents="none" className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/5" />
      <View pointerEvents="none" className="absolute -bottom-16 left-14 h-32 w-32 rounded-full bg-aura-400/10" />
      {children}
    </View>
  );
}

/** ປ້າຍ eyebrow ເທິງ hero — ຈຸດຊຳແປນ + ຂໍ້ຄວາມຈາງ. */
export function HeroEyebrow({ label }: { label: string }): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-1.5 w-1.5 rounded-full bg-champagne" />
      <T className="font-lao-medium text-white/70">{label}</T>
    </View>
  );
}

// ---- progress --------------------------------------------------------------

const RAIL_FILL: Record<Tone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  muted: 'bg-muted-foreground',
  accent: 'bg-accent',
};

/** ແຖບຄວາມຄືບໜ້າ — `value` 0..1. `dark` = ວາງເທິງ hero (ຮາງຂາວຈາງ). */
export function ProgressRail({
  value,
  tone = 'primary',
  dark,
  height = 6,
  className,
}: {
  value: number;
  tone?: Tone;
  dark?: boolean;
  height?: number;
  className?: string;
}): React.JSX.Element {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      className={cn('w-full overflow-hidden rounded-full', dark ? 'bg-white/20' : 'bg-muted', className)}
      style={{ height }}
    >
      <View
        className={cn('h-full rounded-full', dark ? 'bg-champagne' : RAIL_FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}

// ---- stats -----------------------------------------------------------------

/** ບັດສະຖິຕິນ້ອຍ — ໄອຄອນ + ຕົວເລກ + ປ້າຍ. ໃຊ້ໃນແຖວ 2–3 ຊ່ອງ. */
export function StatTile({
  icon,
  value,
  label,
  tone = 'primary',
  onPress,
}: {
  icon: IconName;
  value: string;
  label: string;
  tone?: Tone;
  onPress?: () => void;
}): React.JSX.Element {
  const Shell = onPress ? Touchable : View;
  return (
    <Shell
      {...(onPress ? { onPress, pressScale: 0.97, accessibilityRole: 'button' as const } : {})}
      accessibilityLabel={onPress ? `${label}: ${value}` : undefined}
      className="min-h-[72px] flex-1 justify-between rounded-2xl border border-border bg-card p-3"
      style={shadow.xs}
    >
      <View className="flex-row items-center justify-between">
        <Ionicons name={icon} size={14} color={toneColor()[tone]} />
        {onPress ? <Ionicons name="chevron-forward" size={12} color={colors.mutedForeground} /> : null}
      </View>
      <View className="mt-1.5">
        <T numberOfLines={1} className="font-sans-semibold text-foreground" style={NUM}>
          {value}
        </T>
        <T numberOfLines={2} className="font-lao text-muted-foreground" style={SMALL}>
          {label}
        </T>
      </View>
    </Shell>
  );
}

/** ຊ່ອງສະຖິຕິໃນແຖບດຽວ (ມີເສັ້ນຂັ້ນ) — ໃຊ້ໃນ ribbon ໃຕ້ hero. */
export function StatCell({
  value,
  label,
  tone = 'foreground',
  border,
  dark,
}: {
  value: string;
  label: string;
  tone?: 'foreground' | 'primary' | 'accent';
  border?: boolean;
  dark?: boolean;
}): React.JSX.Element {
  const toneClass = dark
    ? 'text-white'
    : tone === 'primary'
      ? 'text-primary-strong'
      : tone === 'accent'
        ? 'text-accent-foreground'
        : 'text-foreground';
  return (
    <View
      className={cn('flex-1 items-center px-1.5', border && (dark ? 'border-x border-white/15' : 'border-x border-border'))}
    >
      <T numberOfLines={1} className={cn('font-lao-semibold', toneClass)}>
        {value}
      </T>
      <T numberOfLines={1} className={cn('mt-0.5 font-lao', dark ? 'text-white/60' : 'text-muted-foreground')} style={SMALL}>
        {label}
      </T>
    </View>
  );
}

// ---- rows ------------------------------------------------------------------

/**
 * ແຖວລາຍການໃນບັດ group — ໄອຄອນ + label/ຄ່າ + slot ຂວາ. ສູງ ≥ 44pt ຕາມ HIG.
 * `value` ຢູ່ລຸ່ມ label ເມື່ອເປັນແຖວຂໍ້ມູນ; ໃສ່ `sub` ເມື່ອເປັນແຖວນຳທາງ.
 */
export function ListRow({
  icon,
  tone = 'primary',
  label,
  value,
  sub,
  right,
  badge,
  last,
  onPress,
}: {
  icon: IconName;
  tone?: Tone;
  label: string;
  value?: string;
  sub?: string | null;
  right?: ReactNode;
  badge?: number;
  last?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const Row = onPress ? Touchable : View;
  return (
    <Row
      {...(onPress
        ? { onPress, pressScale: 1, accessibilityRole: 'button' as const, accessibilityLabel: `${label} ${value ?? ''}`.trim() }
        : {})}
      className={cn('min-h-[52px] flex-row items-center gap-2.5 px-3.5 py-2.5', !last && 'border-b border-border')}
    >
      <View className="relative">
        <IconTile icon={icon} tone={tone} />
        {badge && badge > 0 ? (
          <View className="absolute -right-1.5 -top-1.5 h-4 min-w-[16px] items-center justify-center rounded-full border border-card bg-destructive px-1">
            <T className="font-sans-semibold text-white" style={{ fontSize: 9, lineHeight: 12 }}>
              {badge > 9 ? '9+' : badge}
            </T>
          </View>
        ) : null}
      </View>
      <View className="min-w-0 flex-1">
        <T numberOfLines={1} className="font-lao-medium text-foreground">
          {label}
        </T>
        {value ? (
          <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
            {value}
          </T>
        ) : null}
        {sub ? (
          <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
            {sub}
          </T>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} /> : null)}
    </Row>
  );
}

/** ແຖວ label ຊ້າຍ / ຄ່າຂວາ — ໃຊ້ໃນ sheet ລາຍລະອຽດ. */
export function KeyValue({
  label,
  value,
  tone,
  mono,
  divider = true,
}: {
  label: string;
  value: string;
  tone?: Tone;
  mono?: boolean;
  divider?: boolean;
}): React.JSX.Element {
  return (
    <View className={cn('flex-row items-center justify-between gap-3 py-2', divider && 'border-b border-border/70')}>
      <T className="font-lao text-muted-foreground">{label}</T>
      <T
        numberOfLines={1}
        className={cn('shrink font-lao-semibold', mono && 'font-mono')}
        style={tone ? { color: toneColor()[tone] } : undefined}
      >
        {value}
      </T>
    </View>
  );
}

// ---- actions ---------------------------------------------------------------

/** ປຸ່ມສຳເນົາລະຫັດ — ສະຫຼັບໄອຄອນເປັນ ✓ ຫຼັງກົດ. `dark` = ວາງເທິງ hero. */
export function CopyPill({
  value,
  label,
  copied,
  onPress,
  dark,
  mono = true,
}: {
  value: string;
  label: string;
  copied: boolean;
  onPress: () => void;
  dark?: boolean;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      hitSlop={8}
      pressScale={0.95}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      className={cn(
        'min-h-[32px] flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1',
        dark ? 'bg-white/15' : 'bg-muted',
      )}
    >
      <T
        numberOfLines={1}
        className={cn(mono ? 'font-mono' : 'font-lao-medium', dark ? 'text-white' : 'text-foreground')}
      >
        {value}
      </T>
      <Ionicons
        name={copied ? 'checkmark-circle' : 'copy-outline'}
        size={13}
        color={dark ? '#fff' : colors.primaryStrong}
      />
    </Touchable>
  );
}

/** ປຸ່ມກົມນ້ອຍໃນ header (44pt target ດ້ວຍ hitSlop). */
export function HeaderAction({
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
      hitSlop={10}
      pressScale={0.94}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
      style={shadow.xs}
    >
      <Ionicons name={icon} size={16} color={colors.primaryStrong} />
    </Touchable>
  );
}

/** ໄທລ໌ທາງລັດ 2–4 ຊ່ອງ ໃຕ້ hero. */
export function QuickAction({
  icon,
  label,
  tone = 'primary',
  badge,
  onPress,
}: {
  icon: IconName;
  label: string;
  tone?: Tone;
  badge?: number;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.96}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} · ${badge}` : label}
      className="min-h-[68px] flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-1.5 py-2.5"
      style={shadow.xs}
    >
      <View className="relative">
        <IconTile icon={icon} tone={tone} />
        {badge && badge > 0 ? (
          <View className="absolute -right-1.5 -top-1.5 h-4 min-w-[16px] items-center justify-center rounded-full border border-card bg-destructive px-1">
            <T className="font-sans-semibold text-white" style={{ fontSize: 9, lineHeight: 12 }}>
              {badge > 9 ? '9+' : badge}
            </T>
          </View>
        ) : null}
      </View>
      <T numberOfLines={1} className="font-lao-medium text-foreground" style={SMALL}>
        {label}
      </T>
    </Touchable>
  );
}

// ---- states ----------------------------------------------------------------

/** ສະຖານະຫວ່າງໃນບັດ — ໄອຄອນຈາງ + ຄຳອະທິບາຍ + ປຸ່ມ (ບໍ່ບັງຄັບ). */
export function EmptyBlock({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <View className="items-center rounded-2xl border border-dashed border-border bg-card px-4 py-7">
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-muted">
        <Ionicons name={icon} size={20} color={colors.mutedForeground} />
      </View>
      <T className="mt-2.5 text-center font-lao-semibold text-foreground">{title}</T>
      {body ? (
        <T className="mt-1 text-center font-lao text-muted-foreground" style={SMALL}>
          {body}
        </T>
      ) : null}
      {actionLabel && onAction ? (
        <Touchable
          onPress={onAction}
          pressScale={0.96}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          className="mt-3 h-9 flex-row items-center gap-1.5 rounded-full bg-primary-subtle px-3.5"
        >
          <Ionicons name="add" size={14} color={colors.primaryStrong} />
          <T className="font-lao-semibold text-primary-strong">{actionLabel}</T>
        </Touchable>
      ) : null}
    </View>
  );
}

/** Skeleton ຂອງບັດ hero + ລາຍການ — ໃຊ້ແທນ spinner ກາງຈໍ (ຫຼຸດ CLS). */
export function LoadingBlock({ rows = 3 }: { rows?: number }): React.JSX.Element {
  return (
    <View className="gap-3 p-4">
      <Skeleton className="h-[150px] w-full rounded-3xl" />
      <View className="flex-row gap-3">
        <Skeleton className="h-[72px] flex-1 rounded-2xl" />
        <Skeleton className="h-[72px] flex-1 rounded-2xl" />
      </View>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-2xl" />
      ))}
    </View>
  );
}
