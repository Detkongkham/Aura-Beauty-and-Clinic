import type { ViewProps } from 'react-native';
import { View } from 'react-native';
import { cn } from '../../lib/cn';
import { shadow } from '../../theme';
import { Touchable, type TouchableProps } from './Touchable';

export type CardProps = ViewProps & {
  className?: string;
  /** ຍົກເງົາ (default true). false = flat surface ພາຍໃນ card ອື່ນ. */
  elevated?: boolean;
};

const BASE = 'rounded-2xl border border-border bg-card p-4';

export function Card({ className, elevated = true, style, ...rest }: CardProps): React.JSX.Element {
  return (
    <View
      className={cn(BASE, className)}
      style={[elevated ? shadow.card : undefined, style]}
      {...rest}
    />
  );
}

export type PressableCardProps = Omit<TouchableProps, 'style'> & {
  className?: string;
  elevated?: boolean;
};

/** Card ທີ່ແຕະໄດ້ — ໃຊ້ແທນ <Pressable><Card/></Pressable> ໃນ list. */
export function PressableCard({
  className,
  elevated = true,
  ...rest
}: PressableCardProps): React.JSX.Element {
  return (
    <Touchable
      accessibilityRole="button"
      className={cn(BASE, className)}
      style={elevated ? shadow.card : undefined}
      {...rest}
    />
  );
}
