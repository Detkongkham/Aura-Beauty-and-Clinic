import type { AppointmentStatus, StaffScheduleItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { PressableCard } from '../../components/ui/Card';
import { Gradient } from '../../components/ui/Gradient';
import { Text as UIText } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { colors, shadow } from '../../theme';
import { formatTime } from '../../lib/format';

/**
 * Staff portal design kit — ຊິ້ນສ່ວນຮ່ວມຂອງທຸກໜ້າໃນ portal ຂອງພະນັກງານ.
 *
 * Flat type scale (house convention — [[mobile-flat-type-scale]]):
 *  - `T`     = 12/17, the single base size. `className` controls weight + colour only.
 *  - `SMALL` = 10/14, for captions / pills / secondary meta lines.
 *  - `EMPH`  = 14/19, the ONE emphasis step — screen title + a key metric value.
 * inline style is required because <Text variant> classes beat `text-[Npx]` in NativeWind 4.
 *
 * ຂະໜາດ control ຜູກກັບ type scale: ແຖວແຕະໄດ້ ≥ 44pt (ຫຼື hitSlop ຊ່ວຍ), ໄອຄອນ 12–16,
 * icon tile 28–36, radius 12–20, ຊ່ອງໄຟ 8/10/14.
 */
export const SMALL = { fontSize: 10, lineHeight: 14 } as const;
export const EMPH = { fontSize: 14, lineHeight: 19 } as const;

export function T({ style, ...rest }: React.ComponentProps<typeof UIText>): React.JSX.Element {
  return <UIText {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

export type IconName = keyof typeof Ionicons.glyphMap;

/**
 * ໂຕນສີຂອງ tile/ໄອຄອນ — cosmetic ເທົ່ານັ້ນ, ອີງ token ປັດຈຸບັນ (getter ຈຶ່ງປ່ຽນຕາມ
 * ໂທນ/ໂໝດມືດ). ໃຊ້ຄືເກົ່າ: `TINT.time`.
 */
export const TINT = Object.defineProperties({} as Record<TintKey, Tint>, {
  time: { enumerable: true, get: (): Tint => ({ bg: colors.primarySubtle, fg: brandInk() }) },
  service: { enumerable: true, get: (): Tint => ({ bg: colors.accentSoft, fg: colors.accentForeground }) },
  client: {
    enumerable: true,
    get: (): Tint =>
      colors.scheme === 'dark'
        ? { bg: '#3A2230', fg: colors.chart5 }
        : { bg: '#FCE7F3', fg: colors.chart5 },
  },
  place: { enumerable: true, get: (): Tint => ({ bg: colors.infoSoft, fg: colors.info }) },
  money: { enumerable: true, get: (): Tint => ({ bg: colors.successSoft, fg: colors.success }) },
  note: { enumerable: true, get: (): Tint => ({ bg: colors.destructiveSoft, fg: colors.destructive }) },
  neutral: { enumerable: true, get: (): Tint => ({ bg: colors.muted, fg: colors.mutedForeground }) },
}) as Record<TintKey, Tint>;

/** ໝຶກແບຣນເທິງພື້ນ subtle — ໂໝດມືດຕ້ອງໃຊ້ຂັ້ນສະຫວ່າງກວ່າ ຈຶ່ງອ່ານອອກ. */
function brandInk(): string {
  return colors.scheme === 'dark' ? colors.primary : colors.primaryStrong;
}

export type TintKey = 'time' | 'service' | 'client' | 'place' | 'money' | 'note' | 'neutral';
export type Tint = { bg: string; fg: string };

// ---- ໂຄງໜ້າ (header / section) -------------------------------------------

/** ກອບຫົວໜ້າ tab — ພື້ນທຶບ + hairline ລຸ່ມ ເພື່ອໃຫ້ເນື້ອຫາເລື່ອນຜ່ານໄດ້ຢ່າງສະອາດ. */
export function StaffHeader({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <View className="gap-2.5 border-b border-border/70 bg-background px-4 pb-2.5 pt-2">
      {children}
    </View>
  );
}

/** ຫົວຂໍ້ໜ້າ (tab root) — champagne foil eyebrow + title 14px semibold + actions ຂວາ. */
export function StaffScreenTitle({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow: string;
  title: string;
  /** ແຖວ meta ນ້ອຍໃຕ້ title (ຈຳນວນ / ສະຖານະ / ວັນທີ). */
  subtitle?: ReactNode;
  right?: ReactNode;
}): React.JSX.Element {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-1.5">
        <View className="h-1 w-1 rotate-45 bg-champagne" />
        <T
          className="font-sans-medium text-muted-foreground"
          style={{ ...SMALL, letterSpacing: 0.5, textTransform: 'uppercase' }}
        >
          {eyebrow}
        </T>
      </View>
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1">
          <T numberOfLines={1} className="font-lao-semibold text-foreground" style={EMPH}>
            {title}
          </T>
          {subtitle ? (
            typeof subtitle === 'string' ? (
              <T numberOfLines={1} className="mt-0.5 font-lao text-muted-foreground" style={SMALL}>
                {subtitle}
              </T>
            ) : (
              <View className="mt-0.5">{subtitle}</View>
            )
          ) : null}
        </View>
        {right ? <View className="flex-row items-center gap-1.5">{right}</View> : null}
      </View>
    </View>
  );
}

/** ຫົວຂໍ້ພາກ — ແຖບ accent + label 12px semibold + trailing ທາງຂວາ. */
export function SectionHeading({
  label,
  hint,
  trailing,
}: {
  label: string;
  /** ຄຳອະທິບາຍນ້ອຍໃຕ້ label. */
  hint?: string;
  trailing?: ReactNode;
}): React.JSX.Element {
  return (
    <View className="flex-row items-start justify-between px-1">
      <View className="flex-1 flex-row items-start gap-1.5">
        <View className="mt-[3px] h-3 w-[3px] rounded-full bg-primary" />
        <View className="flex-1">
          <T className="font-lao-semibold text-foreground">{label}</T>
          {hint ? (
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {hint}
            </T>
          ) : null}
        </View>
      </View>
      {trailing}
    </View>
  );
}

// ---- ປຸ່ມ / tile ນ້ອຍ -----------------------------------------------------

/** ປຸ່ມໄອຄອນວົງມົນ 32pt (hitSlop ໃຫ້ຄົບ 44pt) — ໃຊ້ໃນຫົວໜ້າ. */
export function HeaderIconButton({
  icon,
  label,
  onPress,
  tone = 'soft',
  badge,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'soft' | 'solid' | 'plain';
  /** ຈຸດແດງ/ຕົວເລກມຸມຂວາເທິງ. */
  badge?: string;
  disabled?: boolean;
}): React.JSX.Element {
  const fg =
    tone === 'solid' ? colors.primaryForeground : tone === 'soft' ? colors.primary : colors.foreground;
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      pressScale={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'h-9 w-9 items-center justify-center rounded-full',
        tone === 'soft' && 'border border-border bg-card',
        tone === 'solid' && 'bg-primary',
        disabled && 'opacity-40',
      )}
      style={tone === 'soft' ? shadow.xs : undefined}
    >
      <Ionicons name={icon} size={16} color={fg} />
      {badge ? (
        <View
          className="absolute -right-1 -top-1 h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1"
          style={{ borderWidth: 1.5, borderColor: colors.background }}
        >
          <T className="font-sans-semibold text-white" style={{ fontSize: 9, lineHeight: 12 }}>
            {badge}
          </T>
        </View>
      ) : null}
    </Touchable>
  );
}

/** ກ່ອງໄອຄອນສີ — ຫົວແຖວຂໍ້ມູນ / ແຖວລາຍການ. */
export function IconTile({
  icon,
  tint = TINT.neutral,
  size = 34,
}: {
  icon: IconName;
  tint?: Tint;
  size?: number;
}): React.JSX.Element {
  return (
    <View
      className="items-center justify-center rounded-xl border"
      style={{
        width: size,
        height: size,
        backgroundColor: tint.bg,
        borderColor: `${tint.fg}26`,
      }}
    >
      <Ionicons name={icon} size={Math.round(size * 0.44)} color={tint.fg} />
    </View>
  );
}

/** ແຖວຂໍ້ມູນ: tile ສີ + label ນ້ອຍ + ເນື້ອຫາ. */
export function InfoRow({
  icon,
  tint,
  label,
  trailing,
  children,
}: {
  icon: IconName;
  tint: Tint;
  label: string;
  trailing?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <View className="flex-row items-start gap-3">
      <IconTile icon={icon} tint={tint} />
      <View className="flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <T className="font-lao-semibold text-muted-foreground" style={SMALL}>
            {label}
          </T>
          {trailing}
        </View>
        {children}
      </View>
    </View>
  );
}

/** ບັດ action ຂະໜານ (ໂທ / ຂໍ້ຄວາມ / ແຜນທີ່) — ໃຊ້ເປັນແຖວ 2–3 ອັນ. */
export function ActionTile({
  icon,
  tint = TINT.neutral,
  label,
  hint,
  onPress,
  disabled,
}: {
  icon: IconName;
  tint?: Tint;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      pressScale={0.97}
      style={shadow.xs}
      className={cn(
        'min-h-[52px] flex-1 flex-row items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5',
        disabled && 'opacity-40',
      )}
    >
      <View
        className="h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: tint.bg }}
      >
        <Ionicons name={icon} size={15} color={tint.fg} />
      </View>
      <View className="flex-1">
        <T numberOfLines={1} className="font-lao-semibold text-foreground">
          {label}
        </T>
        {hint ? (
          <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
            {hint}
          </T>
        ) : null}
      </View>
    </Touchable>
  );
}

// ---- ສະຖິຕິ / ຄວາມຄືບໜ້າ --------------------------------------------------

type Tone = 'foreground' | 'primary' | 'accent' | 'success' | 'destructive' | 'warning';

const TONE_TEXT: Record<Tone, string> = {
  foreground: 'text-foreground',
  primary: 'text-primary-strong',
  accent: 'text-accent-foreground',
  success: 'text-success',
  destructive: 'text-destructive',
  warning: 'text-warning',
};

const toneHex = (): Record<Tone, string> => ({
  foreground: colors.foreground,
  primary: colors.primary,
  accent: colors.accent,
  success: colors.success,
  destructive: colors.destructive,
  warning: colors.warning,
});

/** ຊ່ອງສະຖິຕິໜຶ່ງ (value + unit + label) — ໃຊ້ໃນ StatRibbon. */
export function StatCell({
  value,
  unit,
  label,
  tone = 'foreground',
  border,
  icon,
}: {
  value: string;
  unit?: string;
  label: string;
  tone?: Tone;
  border?: boolean;
  /** ໄອຄອນນຳໜ້າ label (ຊ່ວຍອ່ານໄວ). */
  icon?: IconName;
}): React.JSX.Element {
  const c = TONE_TEXT[tone];
  return (
    <View className={cn('flex-1 items-center px-1.5', border && 'border-x border-border')}>
      <T numberOfLines={1} className={cn('font-lao-semibold', c)}>
        {value}
        {unit ? <T className={cn('font-lao', c)}> {unit}</T> : null}
      </T>
      <View className="mt-0.5 flex-row items-center gap-1">
        {icon ? <Ionicons name={icon} size={9} color={colors.mutedForeground} /> : null}
        <T numberOfLines={1} className="font-lao leading-[13px] text-muted-foreground">
          {label}
        </T>
      </View>
    </View>
  );
}

/** ແຖບສະຖິຕິ 2–4 ຊ່ອງ — ກ່ອງ rounded ມີຂອບ. */
export function StatRibbon({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <View
      className={cn('flex-row rounded-2xl border border-border bg-card py-2.5', className)}
      style={shadow.xs}
    >
      {children}
    </View>
  );
}

/** ແຖບ progress ບາງໆ — value/max ເປັນ 0..1 ຫຼື ຕົວເລກ. */
export function MiniBar({
  value,
  max = 1,
  tone = 'primary',
  height = 6,
  gradient,
}: {
  value: number;
  max?: number;
  tone?: 'primary' | 'success' | 'accent' | 'warning';
  height?: number;
  /** ໃຊ້ brand gradient ແທນສີພື້ນ (ໃຊ້ກັບແຖບຫຼັກ). */
  gradient?: boolean;
}): React.JSX.Element {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill =
    tone === 'success'
      ? 'bg-success'
      : tone === 'accent'
        ? 'bg-accent'
        : tone === 'warning'
          ? 'bg-warning'
          : 'bg-primary';
  return (
    <View className="overflow-hidden rounded-full bg-muted" style={{ height }}>
      <View
        className={cn('h-full overflow-hidden rounded-full', !gradient && fill)}
        style={{ width: `${pct}%` }}
      >
        {gradient ? <Gradient preset="brand" fill pointerEvents="none" /> : null}
      </View>
    </View>
  );
}

/** ວົງແຫວນຄວາມຄືບໜ້າ — ໃຊ້ໃນ hero (ຄິວສຳເລັດ / ເປົ້າໝາຍລາຍຮັບ). */
export function Ring({
  value,
  max = 1,
  size = 56,
  stroke = 5,
  tone = 'primary',
  children,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  children?: ReactNode;
}): React.JSX.Element {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.muted} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={toneHex()[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * pct} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

/** ບັດ hero ຂອງ tab — ພື້ນ wash gradient ບາງໆ, ຂອບ + ເງົາ. */
export function HeroCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <View
      className={cn('overflow-hidden rounded-2xl border border-border bg-card p-4', className)}
      style={shadow.card}
    >
      <Gradient preset="wash" fill pointerEvents="none" />
      {children}
    </View>
  );
}

/** ກ່ອງວ່າງແບບຫຍໍ້ (12px) — ໃຊ້ແທນ EmptyState ໃຫຍ່ພາຍໃນພາກ. */
export function EmptyBlock({
  icon = 'sparkles-outline',
  title,
  hint,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <View className="items-center gap-2 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-7">
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary-subtle">
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <T className="text-center font-lao-semibold text-foreground">{title}</T>
      {hint ? (
        <T className="text-center font-lao text-muted-foreground" style={SMALL}>
          {hint}
        </T>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} size="xs" variant="secondary" fullWidth={false} onPress={onAction} />
      ) : null}
    </View>
  );
}

// ---- ຕົວເລືອກຊ່ວງເວລາ -----------------------------------------------------

/** ແຖບເລື່ອນຊ່ວງເວລາ (ມື້ / ເດືອນ) — ກົດກາງ = ກັບມາປັດຈຸບັນ. */
export function PeriodStepper({
  label,
  sublabel,
  onPrev,
  onNext,
  onReset,
  atNow,
  resetLabel,
  prevLabel,
  nextLabel,
}: {
  label: string;
  sublabel?: string;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  /** ຢູ່ຊ່ວງປັດຈຸບັນແລ້ວ — ເຊື່ອງປຸ່ມ "ກັບມາ". */
  atNow: boolean;
  resetLabel: string;
  prevLabel: string;
  nextLabel: string;
}): React.JSX.Element {
  return (
    <View
      className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-1.5 py-1.5"
      style={shadow.xs}
    >
      <Touchable
        onPress={onPrev}
        pressScale={0.9}
        hitSlop={8}
        className="h-8 w-8 items-center justify-center rounded-xl bg-primary-subtle"
        accessibilityRole="button"
        accessibilityLabel={prevLabel}
      >
        <Ionicons name="chevron-back" size={16} color={colors.primary} />
      </Touchable>

      <Touchable
        onPress={onReset}
        dim={false}
        pressScale={0.98}
        accessibilityRole="button"
        accessibilityLabel={resetLabel}
        className="flex-1 items-center gap-0.5 px-2"
      >
        <T numberOfLines={1} className="font-lao-semibold text-foreground">
          {label}
        </T>
        {sublabel ? (
          <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
            {sublabel}
          </T>
        ) : null}
        {!atNow ? (
          <View className="mt-0.5 flex-row items-center gap-1 rounded-full bg-primary-subtle px-2 py-0.5">
            <Ionicons name="return-up-back" size={9} color={colors.primaryStrong} />
            <T className="font-lao-medium text-primary-strong" style={SMALL}>
              {resetLabel}
            </T>
          </View>
        ) : null}
      </Touchable>

      <Touchable
        onPress={onNext}
        pressScale={0.9}
        hitSlop={8}
        className="h-8 w-8 items-center justify-center rounded-xl bg-primary-subtle"
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
      >
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </Touchable>
    </View>
  );
}

export type FilterChipItem<K extends string> = {
  key: K;
  label: string;
  count?: number;
  /** ປິດການໃຊ້ (ເຊັ່ນ ບໍ່ມີລາຍການ). */
  disabled?: boolean;
};

/** ແຖວ chip ກອງ — ກະຈາຍເຕັມແຖວ, ຕົວເລກນັບຢູ່ໃນ chip. */
export function FilterChipRow<K extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly FilterChipItem<K>[];
  value: K;
  onChange: (k: K) => void;
}): React.JSX.Element {
  return (
    <View className="flex-row gap-1.5">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Touchable
            key={it.key}
            disabled={it.disabled}
            onPress={() => onChange(it.key)}
            pressScale={0.94}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !!it.disabled }}
            accessibilityLabel={it.count != null ? `${it.label}, ${it.count}` : it.label}
            className={cn(
              'min-h-[32px] flex-1 flex-row items-center justify-center gap-1 overflow-hidden rounded-full border px-2',
              active ? 'border-primary' : 'border-border bg-card',
              it.disabled && 'opacity-40',
            )}
          >
            {active ? <Gradient preset="brand" fill pointerEvents="none" /> : null}
            <T
              numberOfLines={1}
              className={cn('font-lao', active ? 'text-primary-foreground' : 'text-muted-foreground')}
              style={SMALL}
            >
              {it.label}
            </T>
            {it.count != null && it.count > 0 ? (
              <View
                className={cn(
                  'min-w-[16px] items-center rounded-full px-1',
                  active ? 'bg-white/25' : 'bg-muted',
                )}
              >
                <T
                  className={cn(
                    'font-sans-semibold',
                    active ? 'text-primary-foreground' : 'text-muted-foreground',
                  )}
                  style={SMALL}
                >
                  {it.count}
                </T>
              </View>
            ) : null}
          </Touchable>
        );
      })}
    </View>
  );
}

// ---- ສະຖານະ / ບັດຄິວ ------------------------------------------------------

const STATUS_TONE: Record<AppointmentStatus, React.ComponentProps<typeof Badge>['tone']> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'destructive',
  NO_SHOW: 'neutral',
};

/** ປ້າຍສະຖານະ — leading dot + label, namespace `staffPortal.status.*`. */
export function StaffStatusPill({ status }: { status: AppointmentStatus }): React.JSX.Element {
  const { t } = useTranslation();
  return <Badge dot label={t(`staffPortal.status.${status}`)} tone={STATUS_TONE[status]} />;
}

/** ຮາງເວລາທາງຊ້າຍຂອງບັດຄິວ — ເວລາເລີ່ມ + ຈຸດ + ເສັ້ນຕໍ່ລົງລຸ່ມ. */
function TimeRail({
  startAt,
  endAt,
  active,
  dim,
  connector,
}: {
  startAt: string;
  endAt: string;
  active?: boolean;
  dim?: boolean;
  connector?: boolean;
}): React.JSX.Element {
  return (
    <View className="w-[46px] items-center">
      <T
        className={cn(
          'font-sans-semibold',
          dim ? 'text-muted-foreground' : active ? 'text-primary-strong' : 'text-foreground',
        )}
      >
        {formatTime(startAt)}
      </T>
      <T className="font-sans text-muted-foreground" style={SMALL}>
        {formatTime(endAt)}
      </T>
      <View
        className={cn(
          'mt-1.5 h-2 w-2 rounded-full',
          active ? 'bg-primary' : dim ? 'bg-muted-foreground/40' : 'bg-aura-300',
        )}
      />
      {connector ? <View className="mt-1 w-px flex-1 bg-border" /> : null}
    </View>
  );
}

/** ບັດຄິວໜຶ່ງລາຍການໃນຕາຕະລາງງານປະຈຳວັນ — ຮາງເວລາຊ້າຍ + ເນື້ອຫາ + ແຖວ action. */
export function ScheduleCard({
  item,
  index,
  highlight,
  busy,
  onPress,
  onStart,
  onComplete,
  onCall,
  startLabel,
  connector,
}: {
  item: StaffScheduleItem;
  index: number;
  highlight?: boolean;
  busy?: boolean;
  onPress: () => void;
  onStart?: () => void;
  onComplete?: () => void;
  onCall?: () => void;
  /** ປ້າຍປຸ່ມ override ຕອນ onStart (ເຊັ່ນ HOME_SERVICE → "ຈັດການ" ແທນ "ເລີ່ມ"). */
  startLabel?: string;
  /** ແຕ້ມເສັ້ນຕໍ່ໄປຫາບັດລຸ່ມ (timeline). */
  connector?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const dim =
    item.status === 'COMPLETED' || item.status === 'CANCELLED' || item.status === 'NO_SHOW';
  return (
    <View className={cn('flex-row gap-2', index === 0 ? '' : 'mt-2')}>
      <TimeRail
        startAt={item.startAt}
        endAt={item.endAt}
        active={highlight}
        dim={dim}
        connector={connector}
      />

      <PressableCard
        onPress={onPress}
        elevated={!dim}
        accessibilityLabel={`${item.serviceName}, ${item.customerName}, ${formatTime(item.startAt)}`}
        className={cn(
          'mb-0.5 flex-1 gap-2 overflow-hidden rounded-2xl p-3',
          highlight && 'border-primary',
          dim && !highlight && 'border-border/70 bg-muted',
        )}
      >
        {highlight ? <Gradient preset="wash" fill pointerEvents="none" /> : null}

        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1 gap-0.5">
            <T
              numberOfLines={1}
              className={cn('font-lao-semibold', dim ? 'text-muted-foreground' : 'text-foreground')}
            >
              {item.serviceName}
            </T>
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="person-outline" size={11} color={colors.mutedForeground} />
              <T numberOfLines={1} className="flex-1 font-lao text-muted-foreground" style={SMALL}>
                {item.customerName} ·{' '}
                {t('staffPortal.detail.duration', { min: item.serviceDurationMin })}
              </T>
            </View>
          </View>
          <StaffStatusPill status={item.status} />
        </View>

        {item.customerNotes ? (
          <View className="flex-row items-start gap-1.5 rounded-xl bg-muted px-2 py-1.5">
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={11}
              color={colors.mutedForeground}
              style={{ marginTop: 1 }}
            />
            <T numberOfLines={2} className="flex-1 font-lao text-muted-foreground" style={SMALL}>
              {item.customerNotes}
            </T>
          </View>
        ) : null}

        {item.isWalkIn || item.deliveryType === 'HOME_SERVICE' || item.hasTreatmentRecord ? (
          <View className="flex-row flex-wrap gap-1.5">
            {item.isWalkIn ? <Badge label={t('staffPortal.today.walkIn')} tone="primary" /> : null}
            {item.deliveryType === 'HOME_SERVICE' ? (
              <Badge label={t('staffPortal.today.homeService')} tone="accent" />
            ) : null}
            {item.hasTreatmentRecord ? (
              <Badge label={t('staffPortal.today.recorded')} tone="success" />
            ) : null}
          </View>
        ) : null}

        {onStart || onComplete || onCall ? (
          <View className="flex-row items-center gap-1.5 border-t border-border pt-2">
            {onCall ? (
              <Touchable
                onPress={onCall}
                pressScale={0.92}
                accessibilityRole="button"
                accessibilityLabel={t('staffPortal.detail.callCustomer')}
                className="h-8 w-8 items-center justify-center rounded-full border border-border bg-card"
              >
                <Ionicons name="call-outline" size={13} color={colors.primary} />
              </Touchable>
            ) : null}
            {onStart || onComplete ? (
              <View className="flex-1">
                <Button
                  size="xs"
                  variant={onComplete ? 'primary' : 'secondary'}
                  label={
                    onComplete
                      ? t('staffPortal.today.complete')
                      : (startLabel ?? t('staffPortal.today.start'))
                  }
                  loading={busy}
                  onPress={onComplete ?? onStart}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </PressableCard>
    </View>
  );
}
