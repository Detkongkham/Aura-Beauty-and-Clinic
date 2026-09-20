import { View } from 'react-native';
import { cn } from '../../lib/cn';
import { colors, shadow } from '../../theme';
import { Text } from './Text';
import { Touchable } from './Touchable';

export type SegmentedOption<T extends string> = { value: T; label: string };

/** iOS segmented control — track ສີ muted, thumb ສີຂາວມີເງົາ. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}): React.JSX.Element {
  return (
    <View
      accessibilityRole="tablist"
      className={cn('flex-row gap-1 rounded-xl bg-muted p-1', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Touchable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.value)}
            pressScale={0.98}
            dim={false}
            className={cn('flex-1 items-center justify-center rounded-lg py-2')}
            style={active ? [{ backgroundColor: colors.card }, shadow.xs] : undefined}
          >
            <Text
              variant="label"
              style={{ fontSize: 12, lineHeight: 17 }}
              className={cn(active ? 'text-foreground' : 'text-muted-foreground')}
            >
              {opt.label}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}
