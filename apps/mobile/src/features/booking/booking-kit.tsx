import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { Text as UIText } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { colors, shadow } from '../../theme';

/**
 * Booking-flow kit — ໃຊ້ຮ່ວມກັນໃນ 5 ໜ້າ (WizardService / DateTime / Confirm / Success / Payment).
 *
 * Type scale ຄົງທີ່ (mobile-flat-type-scale): body = 12/17, SMALL = 10/14 (ຄຳໃບ້/ປ້າຍ),
 * NUM = 14/18 (ຕົວເລກເດັ່ນ), TOTAL = 15/19 (ຍອດລວມ). ບໍ່ມີຂະໜາດອື່ນ.
 * Size rhythm ທີ່ເຂົ້າກັບ 12px: icon 14 (inline) / 16 (tile), tile 32, row ≥ 44 (touch target),
 * card padding 14, gap 8/12. inline style ຈຳເປັນ ເພາະ variant "body" ຂອງ <UIText>
 * ຊະນະ class text-[Npx] ໃນ NativeWind 4.
 */
export function T({ style, ...rest }: React.ComponentProps<typeof UIText>): React.JSX.Element {
  return <UIText {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}
export const SMALL = { fontSize: 10, lineHeight: 14 } as const;
export const NUM = { fontSize: 14, lineHeight: 18 } as const;
export const TOTAL = { fontSize: 15, lineHeight: 19 } as const;

export type IconName = keyof typeof Ionicons.glyphMap;
export type Tone = 'primary' | 'success' | 'warning' | 'destructive' | 'muted' | 'accent';

const TONE_BG: Record<Tone, string> = {
  primary: 'bg-primary-subtle',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  destructive: 'bg-destructive-soft',
  muted: 'bg-muted',
  accent: 'bg-accent-soft',
};
const TONE_TEXT: Record<Tone, string> = {
  primary: 'text-primary-strong',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  muted: 'text-muted-foreground',
  accent: 'text-accent-foreground',
};
/** ສີ tone ດິບ — function ເພື່ອໃຫ້ອ່ານ token ປັດຈຸບັນທຸກຄັ້ງທີ່ render. */
export const toneColor = (): Record<Tone, string> => ({
  primary: colors.primaryStrong,
  success: colors.success,
  warning: colors.warning,
  destructive: colors.destructive,
  muted: colors.mutedForeground,
  accent: colors.accentForeground,
});

/** ພື້ນຜິວບັດມາດຕະຖານ — ຂາວ, ເສັ້ນຂອບບາງ, ເງົານຸ່ມ. */
export function Card({
  className,
  flat,
  style,
  ...rest
}: ViewProps & { className?: string; flat?: boolean }): React.JSX.Element {
  return (
    <View
      {...rest}
      className={cn('rounded-2xl border border-border bg-card', className)}
      style={[flat ? undefined : shadow.card, style]}
    />
  );
}

/** ຫົວຂໍ້ section ນອກບັດ — ຊື່ + ຄຳອະທິບາຍ + slot ຂວາ (ເຊັ່ນ ນັບຈຳນວນ / ລິ້ງ). */
export function SectionHeader({
  title,
  hint,
  right,
  className,
}: {
  title: string;
  hint?: string | null;
  right?: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <View className={cn('flex-row items-end justify-between gap-3 px-1', className)}>
      <View className="flex-1">
        <T accessibilityRole="header" className="font-lao-semibold text-foreground">
          {title}
        </T>
        {hint ? (
          <T className="mt-0.5 font-lao text-muted-foreground" style={SMALL}>
            {hint}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** ປ້າຍນ້ອຍ (10px) — ສະຖານະ / ຈຳນວນ / ສ່ວນຫຼຸດ. */
export function Pill({
  label,
  tone = 'primary',
  icon,
  className,
}: {
  label: string;
  tone?: Tone;
  icon?: IconName;
  className?: string;
}): React.JSX.Element {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1 self-start rounded-full px-2 py-0.5',
        TONE_BG[tone],
        className,
      )}
    >
      {icon ? <Ionicons name={icon} size={10} color={toneColor()[tone]} /> : null}
      <T numberOfLines={1} className={cn('font-lao-semibold', TONE_TEXT[tone])} style={SMALL}>
        {label}
      </T>
    </View>
  );
}

/** ກ່ອງໄອຄອນ 32px (ຫຼື 40px) ສີອ່ອນ. */
export function IconTile({
  icon,
  tone = 'primary',
  size = 32,
}: {
  icon: IconName;
  tone?: Tone;
  size?: 32 | 40;
}): React.JSX.Element {
  return (
    <View
      className={cn('items-center justify-center rounded-xl', TONE_BG[tone])}
      style={{ width: size, height: size }}
    >
      <Ionicons name={icon} size={size === 40 ? 18 : 16} color={toneColor()[tone]} />
    </View>
  );
}

/** Radio 20px ຂວາມືຂອງ option. */
export function Radio({ selected }: { selected: boolean }): React.JSX.Element {
  return (
    <View
      className={cn(
        'h-5 w-5 items-center justify-center rounded-full border-2',
        selected ? 'border-primary bg-primary' : 'border-input bg-card',
      )}
    >
      {selected ? <Ionicons name="checkmark" size={11} color={colors.primaryForeground} /> : null}
    </View>
  );
}

/** ແຖວ label–value ໃນບັດ (ໃບບິນ / ສະຫຼຸບ). `onEdit` → ສະແດງລິ້ງ "ແກ້ໄຂ" ຂວາສຸດ. */
export function InfoRow({
  icon,
  label,
  value,
  sub,
  valueClassName,
  onEdit,
  editLabel,
  divider = true,
}: {
  icon?: IconName;
  label: string;
  value: string;
  sub?: string | null;
  valueClassName?: string;
  onEdit?: () => void;
  editLabel?: string;
  divider?: boolean;
}): React.JSX.Element {
  return (
    <View
      className={cn(
        'min-h-[44px] flex-row items-center gap-3 py-2.5',
        divider && 'border-b border-border/70',
      )}
    >
      {icon ? <IconTile icon={icon} /> : null}
      <View className="flex-1">
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {label}
        </T>
        <T numberOfLines={2} className={cn('font-lao-semibold text-foreground', valueClassName)}>
          {value}
        </T>
        {sub ? (
          <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
            {sub}
          </T>
        ) : null}
      </View>
      {onEdit ? (
        <Touchable
          onPress={onEdit}
          hitSlop={10}
          pressScale={0.94}
          accessibilityRole="button"
          accessibilityLabel={`${editLabel ?? ''} ${label}`}
          className="h-8 flex-row items-center gap-1 rounded-full bg-muted px-2.5"
        >
          <Ionicons name="create-outline" size={12} color={colors.primaryStrong} />
          <T className="font-lao-medium text-primary-strong" style={SMALL}>
            {editLabel}
          </T>
        </Touchable>
      ) : null}
    </View>
  );
}

/** ແຖວເງິນ ຊ້າຍ label / ຂວາ ຈຳນວນ (ບໍ່ມີໄອຄອນ) — ໃຊ້ໃນ breakdown. */
export function MoneyRow({
  label,
  value,
  tone,
  strong,
  hint,
}: {
  label: string;
  value: string;
  tone?: Tone;
  strong?: boolean;
  hint?: string | null;
}): React.JSX.Element {
  return (
    <View className="flex-row items-start justify-between gap-3 py-1">
      <View className="flex-1">
        <T className={cn(strong ? 'font-lao-semibold text-foreground' : 'font-lao text-muted-foreground')}>
          {label}
        </T>
        {hint ? (
          <T className="font-lao text-muted-foreground" style={SMALL}>
            {hint}
          </T>
        ) : null}
      </View>
      <T
        className={cn(
          strong ? 'font-lao-semibold' : 'font-lao-medium',
          tone ? TONE_TEXT[tone] : 'text-foreground',
        )}
        style={strong ? NUM : undefined}
      >
        {value}
      </T>
    </View>
  );
}

/** ກ່ອງແຈ້ງເຕືອນ inline — ຂໍ້ຜິດພາດ / ຄຳແນະນຳ / ນະໂຍບາຍ. */
export function Notice({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: Tone;
  icon: IconName;
  title?: string;
  body?: string | null;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <View
      accessibilityRole={tone === 'destructive' ? 'alert' : undefined}
      className={cn('flex-row items-start gap-2.5 rounded-2xl p-3', TONE_BG[tone])}
    >
      <Ionicons name={icon} size={16} color={toneColor()[tone]} style={{ marginTop: 1 }} />
      <View className="flex-1 gap-0.5">
        {title ? <T className={cn('font-lao-semibold', TONE_TEXT[tone])}>{title}</T> : null}
        {body ? (
          <T className={cn('font-lao', tone === 'destructive' ? TONE_TEXT[tone] : 'text-foreground/80')} style={SMALL}>
            {body}
          </T>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/** ແຖວສະຫຼຸບເທິງປຸ່ມຂອງ FooterBar — ຊ້າຍ: ສິ່ງທີ່ເລືອກ, ຂວາ: ຍອດລວມ. */
export function FooterSummary({
  label,
  value,
  sub,
  totalLabel,
  total,
  strike,
}: {
  label: string;
  value: ReactNode;
  sub?: string | null;
  totalLabel: string;
  total: string;
  strike?: string | null;
}): React.JSX.Element {
  return (
    <View className="flex-row items-end justify-between gap-3 px-0.5">
      <View className="flex-1">
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {label}
        </T>
        {typeof value === 'string' ? (
          <T numberOfLines={1} className="font-lao-semibold text-foreground">
            {value}
          </T>
        ) : (
          value
        )}
        {sub ? (
          <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
            {sub}
          </T>
        ) : null}
      </View>
      <View className="items-end">
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {totalLabel}
        </T>
        <View className="flex-row items-baseline gap-1.5">
          {strike ? (
            <T className="font-lao text-muted-foreground line-through" style={SMALL}>
              {strike}
            </T>
          ) : null}
          <T className="font-lao-semibold text-foreground" style={TOTAL}>
            {total}
          </T>
        </View>
      </View>
    </View>
  );
}
