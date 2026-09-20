import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { colors } from '../../theme';
import { cn } from '../../lib/cn';
import { Gradient } from './Gradient';
import { Text } from './Text';
import { Touchable } from './Touchable';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
  /** ໄອຄອນນຳໜ້າ label. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** node ນຳໜ້າ label (emoji / dot) — ໃຊ້ແທນ `icon`. */
  leading?: ReactNode;
  /** `sm` = compact (12px, ໃຊ້ໃນ filter row); `md` = default (14px). */
  size?: 'sm' | 'md';
};

const SHELL: Record<'sm' | 'md', string> = {
  sm: 'min-h-[28px] px-2.5 py-1',
  md: 'min-h-[36px] px-3.5 py-1.5',
};
/** inline style ຊະນະ class text-* ຂອງ variant "label" (typography-appointments.md). */
const TEXT_SIZE: Record<'sm' | 'md', { fontSize: number; lineHeight: number }> = {
  sm: { fontSize: 12, lineHeight: 17 },
  md: { fontSize: 13, lineHeight: 18 },
};

/** Filter / choice pill — grey when idle, gradient azure when active. */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled,
  className,
  icon,
  leading,
  size = 'md',
}: ChipProps): React.JSX.Element {
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      pressScale={0.95}
      className={cn(
        'flex-row items-center justify-center gap-1 overflow-hidden rounded-full',
        SHELL[size],
        selected ? 'bg-primary' : 'bg-muted',
        disabled && 'opacity-40',
        className,
      )}
    >
      {selected ? <Gradient preset="brand" fill pointerEvents="none" /> : null}
      {leading ??
        (icon ? (
          <Ionicons
            name={icon}
            size={size === 'sm' ? 12 : 14}
            color={selected ? colors.primaryForeground : colors.mutedForeground}
          />
        ) : null)}
      <Text
        variant="label"
        numberOfLines={1}
        style={TEXT_SIZE[size]}
        className={
          selected ? 'font-lao-semibold text-primary-foreground' : 'text-muted-foreground'
        }
      >
        {label}
      </Text>
    </Touchable>
  );
}
