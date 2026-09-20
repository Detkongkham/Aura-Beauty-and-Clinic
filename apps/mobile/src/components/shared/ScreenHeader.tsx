import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, TextStyle } from 'react-native';
import { View } from 'react-native';
import { cn } from '../../lib/cn';
import { colors } from '../../theme';
import { Text } from '../ui/Text';
import { Touchable } from '../ui/Touchable';

export type ScreenHeaderProps = {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  /** ຕັດເສັ້ນຂອບລຸ່ມ (ໃຊ້ເມື່ອ header ລອຍຢູ່ເທິງເນື້ອຫາສີພື້ນ). */
  borderless?: boolean;
  /** override ຂະໜາດ/ສະໄຕລ໌ຂອງ title (className). */
  titleClassName?: string;
  /** override ຂະໜາດ/ສະໄຕລ໌ຂອງ title ດ້ວຍ inline style — ໃຊ້ເມື່ອຕ້ອງໃຫ້ຊະນະ variant. */
  titleStyle?: StyleProp<TextStyle>;
};

/** iOS nav bar — 44pt, back chevron ໃນ target ວົງມົນ, title ກາງ. */
export function ScreenHeader({
  title,
  onBack,
  right,
  borderless,
  titleClassName,
  titleStyle,
}: ScreenHeaderProps): React.JSX.Element {
  return (
    <View
      className={cn(
        'h-12 flex-row items-center bg-background px-2',
        !borderless && 'border-b border-border',
      )}
    >
      <View className="w-11 items-start">
        {onBack ? (
          <Touchable
            onPress={onBack}
            hitSlop={8}
            pressScale={0.9}
            accessibilityRole="button"
            accessibilityLabel="back"
            className="h-9 w-9 items-center justify-center rounded-full"
          >
            <Ionicons name="chevron-back" size={26} color={colors.primary} />
          </Touchable>
        ) : null}
      </View>

      <Text
        variant="heading"
        numberOfLines={1}
        className={cn('flex-1 text-center', titleClassName)}
        style={titleStyle}
      >
        {title}
      </Text>

      <View className="min-w-[44px] flex-row items-center justify-end">{right}</View>
    </View>
  );
}
