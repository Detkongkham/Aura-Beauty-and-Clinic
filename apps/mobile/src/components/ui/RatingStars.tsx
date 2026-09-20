import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { colors } from '../../theme';

export type RatingStarsProps = {
  value: number;
  size?: number;
  onChange?: (value: number) => void;
};

export function RatingStars({ value, size = 16, onChange }: RatingStarsProps): React.JSX.Element {
  return (
    <View className="flex-row" accessibilityRole={onChange ? 'adjustable' : 'image'}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const icon = (
          <Ionicons
            name={filled ? 'star' : 'star-outline'}
            size={size}
            color={filled ? colors.accent : colors.mutedForeground}
            style={{ marginRight: 2 }}
          />
        );
        return onChange ? (
          <Pressable key={n} hitSlop={6} onPress={() => onChange(n)} accessibilityLabel={`${n}`}>
            {icon}
          </Pressable>
        ) : (
          <View key={n}>{icon}</View>
        );
      })}
    </View>
  );
}
