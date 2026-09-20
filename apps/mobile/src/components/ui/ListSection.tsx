import { Ionicons } from '@expo/vector-icons';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../lib/cn';
import { colors, shadow } from '../../theme';
import { Text } from './Text';
import { Touchable } from './Touchable';

/** iOS "inset grouped" list — card ດຽວ, ແຖວມີເສັ້ນຄັ່ນ, ຫົວຂໍ້ນ້ອຍຢູ່ເທິງ. */
export function ListSection({
  title,
  footer,
  children,
  className,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View className={cn('gap-2', className)}>
      {title ? (
        <Text variant="caption" className="px-1 font-lao-medium">
          {title}
        </Text>
      ) : null}
      <View className="rounded-2xl bg-card" style={shadow.card}>
        <View className="overflow-hidden rounded-2xl border border-border">
          {rows.map((row, i) => (
            <Fragment key={i}>
              {i > 0 ? <View className="ml-4 h-px bg-border" /> : null}
              {row}
            </Fragment>
          ))}
        </View>
      </View>
      {footer ? <Text variant="caption" className="px-1">{footer}</Text> : null}
    </View>
  );
}

export type ListRowProps = {
  label: string;
  value?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  right?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
};

export function ListRow({
  label,
  value,
  icon,
  iconBg = colors.primarySubtle,
  right,
  onPress,
  destructive,
}: ListRowProps): React.JSX.Element {
  const body = (
    <View className="min-h-[52px] flex-row items-center gap-3 px-4 py-2.5">
      {icon ? (
        <View
          className="h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: destructive ? colors.destructiveSoft : iconBg }}
        >
          <Ionicons
            name={icon}
            size={17}
            color={destructive ? colors.destructive : colors.primary}
          />
        </View>
      ) : null}
      <Text
        variant="label"
        className={cn('flex-1', destructive && 'text-destructive')}
        numberOfLines={1}
      >
        {label}
      </Text>
      {value ? (
        <Text variant="label" className="text-muted-foreground" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right}
      {onPress ? (
        <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Touchable onPress={onPress} accessibilityRole="button" pressScale={1}>
      {body}
    </Touchable>
  );
}
