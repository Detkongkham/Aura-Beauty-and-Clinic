import type { ServiceListItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';
import { Gradient } from '../../components/ui/Gradient';
import { PriceText } from '../../components/ui/PriceText';
import { Text as UIText } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { colors, shadow } from '../../theme';

/** front ມາດຕະຖານ = 12px ຄົງທີ່ (ທຸກໂຕ) — parity ກັບ docs/typography-appointments.md.
 * className ຄຸມ weight/ສີ ເທົ່ານັ້ນ; inline style ຊະນະ class text-* ຂອງ variant. */
function T({ style, ...rest }: React.ComponentProps<typeof UIText>): React.JSX.Element {
  return <UIText {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

/**
 * 2-column"luxury" service card ສຳລັບ Home · ບໍລິການຍອດນິຍົມ (docs/design-mobile.md §6).
 * ຮູບ 4:3 + scrim, badge ຢອດນິຍົມ, overline (ໝວດ · ນາທີ), title, desc, footer ລາຄາ + ຈອງ.
 * List ແນວຕັ້ງແບບແຖວ (ServiceList) ຍັງໃຊ້ <ServiceCard/>.
 */
export function PopularServiceCard({
  service,
  onPress,
}: {
  service: ServiceListItem;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      accessibilityLabel={service.name}
      pressScale={0.97}
      className="overflow-hidden rounded-2xl border border-border bg-card"
      style={shadow.card}
    >
      {/* image */}
      <View className="w-full bg-muted" style={{ aspectRatio: 4 / 3 }}>
        {service.imageUrl ? (
          <Image source={{ uri: service.imageUrl }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Ionicons name="sparkles-outline" size={26} color={colors.mutedForeground} />
          </View>
        )}
        <Gradient
          preset="imageScrim"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 72 }}
          pointerEvents="none"
        />
        <View className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5">
          <T className="font-lao-bold text-primary-foreground">{t('service.sortPopular')}</T>
        </View>
      </View>

      {/* body */}
      <View className="gap-1 p-3">
        <View className="flex-row items-center gap-1.5">
          <T variant="caption" numberOfLines={1}>
            {service.categoryName}
          </T>
          <View className="h-0.5 w-0.5 rounded-full bg-border" />
          <T variant="caption">{t('common.minutesShort', { count: service.durationMinutes })}</T>
        </View>
        <T numberOfLines={1} className="font-lao-bold leading-5 text-foreground">
          {service.name}
        </T>
        {service.description ? (
          <T variant="caption" numberOfLines={2} className="leading-[14px]">
            {service.description}
          </T>
        ) : null}
      </View>

      {/* footer */}
      <View className="mx-3 mb-3 flex-row items-center justify-between border-t border-border pt-2">
        <View>
          <T variant="caption" className="leading-none">
            {t('service.price')}
          </T>
          <PriceText amount={service.price} />
        </View>
        <View className="flex-row items-center gap-1 rounded-lg bg-primary-subtle px-2.5 py-1">
          <T className="font-lao-semibold text-primary">{t('service.bookShort')}</T>
          <Ionicons name="chevron-forward" size={12} color={colors.primary} />
        </View>
      </View>
    </Touchable>
  );
}
