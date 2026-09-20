import type { ServiceListItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';
import { PressableCard } from '../../components/ui/Card';
import { PriceText } from '../../components/ui/PriceText';
import { Text } from '../../components/ui/Text';
import { colors } from '../../theme';

export function ServiceCard({
  service,
  onPress,
}: {
  service: ServiceListItem;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <PressableCard
      onPress={onPress}
      accessibilityLabel={service.name}
      className="flex-row gap-3.5 p-3"
    >
      {service.imageUrl ? (
        <Image
          source={{ uri: service.imageUrl }}
          className="h-[76px] w-[76px] rounded-xl bg-muted"
          resizeMode="cover"
        />
      ) : (
        <View className="h-[76px] w-[76px] items-center justify-center rounded-xl bg-muted">
          <Ionicons name="cut-outline" size={22} color={colors.mutedForeground} />
        </View>
      )}
      <View className="flex-1 justify-between py-0.5">
        <View className="gap-1">
          <Text variant="label" numberOfLines={1} className="font-lao-semibold text-[15px]">
            {service.name}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Text variant="caption" numberOfLines={1}>
              {service.categoryName}
            </Text>
            <View className="h-1 w-1 rounded-full bg-border" />
            <Text variant="caption">
              {t('common.minutesShort', { count: service.durationMinutes })}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center justify-between">
          <PriceText amount={service.price} className="text-[15px]" />
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </View>
      </View>
    </PressableCard>
  );
}
