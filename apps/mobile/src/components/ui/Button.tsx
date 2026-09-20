import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, type PressableProps, View } from 'react-native';
import { cn } from '../../lib/cn';
import { colors, shadow } from '../../theme';
import { Gradient } from './Gradient';
import { Text } from './Text';
import { Touchable } from './Touchable';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type Size = 'xs' | 'sm' | 'md' | 'lg';

const BASE = 'flex-row items-center justify-center rounded-2xl';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary-strong',
  secondary: 'bg-primary-subtle',
  outline: 'border border-input bg-card',
  ghost: 'bg-transparent',
  destructive: 'bg-destructive',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-primary-foreground',
  secondary: 'text-primary-strong',
  outline: 'text-foreground',
  ghost: 'text-primary',
  destructive: 'text-destructive-foreground',
};

const SIZE: Record<Size, string> = {
  xs: 'h-8 px-3 rounded-full',
  sm: 'h-10 px-3.5 rounded-xl',
  md: 'h-12 px-5',
  lg: 'h-[54px] px-6',
};

const iconColor = (): Record<Variant, string> => ({
  primary: colors.primaryForeground,
  secondary: colors.primaryStrong,
  outline: colors.foreground,
  ghost: colors.primary,
  destructive: colors.destructiveForeground,
});

export type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  className?: string;
  /** override style/ຂະໜາດຂອງ label (ເຊັ່ນ 'text-[14px]' ໃນ CTA bar ແຄບ). */
  labelClassName?: string;
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = true,
  icon,
  disabled,
  className,
  labelClassName,
  ...rest
}: ButtonProps): React.JSX.Element {
  const isDisabled = disabled || loading;
  const spinnerLight = variant === 'primary' || variant === 'destructive';
  const labelSize =
    size === 'lg' ? 'text-[17px]' : size === 'xs' ? 'text-[12px]' : 'text-base';
  const cornerRadius = size === 'xs' ? 999 : size === 'sm' ? 20 : 24;

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      haptic={isDisabled ? 'none' : 'primary'}
      pressScale={isDisabled ? 1 : undefined}
      dim={!isDisabled}
      style={variant === 'primary' && !isDisabled ? shadow.primary : undefined}
      className={cn(
        BASE,
        VARIANT[variant],
        SIZE[size],
        fullWidth && 'w-full',
        isDisabled && 'opacity-50',
        className,
      )}
      {...rest}
    >
      {variant === 'primary' ? (
        <Gradient preset="brand" fill radius={cornerRadius} pointerEvents="none" />
      ) : null}

      {loading ? (
        <ActivityIndicator color={spinnerLight ? colors.primaryForeground : colors.primary} />
      ) : (
        <View className="max-w-full flex-row items-center justify-center gap-2">
          {icon ? (
            <Ionicons
              name={icon}
              size={size === 'lg' ? 20 : size === 'xs' ? 14 : 18}
              color={iconColor()[variant]}
            />
          ) : null}
          <Text
            variant="label"
            numberOfLines={1}
            style={size === 'xs' ? { fontSize: 12, lineHeight: 16 } : undefined}
            className={cn(
              'shrink font-lao-semibold',
              labelSize,
              LABEL[variant],
              labelClassName,
            )}
          >
            {label}
          </Text>
        </View>
      )}
    </Touchable>
  );
}
