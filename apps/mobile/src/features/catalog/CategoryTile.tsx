import type { ServiceCategoryView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Gradient } from '../../components/ui/Gradient';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { colors, shadow } from '../../theme';

/** ຂໍ້ຄວາມ catalog = 12px ຄົງທີ່ (typography-appointments.md). className ຄຸມ weight/ສີ ເທົ່ານັ້ນ. */
function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

type IoniconName = keyof typeof Ionicons.glyphMap;

/** ຈັບຄູ່ຊື່ໝວດ (ລາວ/ອັງກິດ) ກັບ icon — fallback = sparkles. ລຳດັບສຳຄັນ: ແຕ່ງໜ້າ ກ່ອນ ຜິວໜ້າ. */
const CATEGORY_ICONS: { re: RegExp; icon: IoniconName }[] = [
  { re: /ຜົມ|ຕັດຜົມ|hair|barber/i, icon: 'cut' },
  { re: /ເລັບ|nail|manicure|pedicure/i, icon: 'hand-left' },
  { re: /ແຕ່ງໜ້າ|makeup|make-up|cosmetic/i, icon: 'brush' },
  { re: /ຄິ້ວ|ຂົນຕາ|brow|lash|eyelash/i, icon: 'eye' },
  { re: /ນວດ|massage|ສະປາ|\bspa\b/i, icon: 'body' },
  { re: /ໜ້າ|ຜິວ|face|skin|facial/i, icon: 'happy' },
  { re: /ຂົນ|ແວັກ|wax/i, icon: 'color-wand' },
  { re: /ຜ່ອນຄາຍ|ນ້ຳມັນ|relax|aroma|therap/i, icon: 'flower' },
  { re: /ຜົມນອນ|hair.?spa|treatment|ບຳລຸງ/i, icon: 'water' },
];

export function categoryIcon(name: string): IoniconName {
  return CATEGORY_ICONS.find((c) => c.re.test(name))?.icon ?? 'sparkles';
}

/**
 * ບັດໝວດໝູ່ຮູບສີ່ຫຼ່ຽມ (aspect 1) — icon ວົງ frosted ເທິງພື້ນ wash + ວົງຕົກແຕ່ງ,
 * ຊື່ + ຈຳນວນບໍລິການ. ໃຊ້ຮ່ວມກັນ Home (§ໝວດໝູ່) ແລະ SearchLanding (ຕາມໝວດ).
 * ຫໍ່ດ້ວຍ <AnimatedEntrance style={{ width: '22%' }}> ຢູ່ຈຸດເອີ້ນໃຊ້.
 */
export function CategoryTile({
  category,
  onPress,
}: {
  category: ServiceCategoryView;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.95}
      accessibilityRole="button"
      accessibilityLabel={`${category.name} · ${t('category.servicesCount', {
        count: category.serviceCount,
      })}`}
      className="items-center gap-1"
    >
      <View
        className="h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-xl border border-aura-200"
        style={shadow.xs}
      >
        <Gradient preset="wash" fill pointerEvents="none" />
        <View className="absolute -right-3 -top-3 h-8 w-8 rounded-full bg-white/40" />
        <View className="absolute -bottom-3 -left-2 h-7 w-7 rounded-full bg-primary/5" />
        <View
          className="h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-white/70"
          style={shadow.xs}
        >
          <Ionicons name={categoryIcon(category.name)} size={16} color={colors.primary} />
        </View>
      </View>
      <T variant="label" numberOfLines={1} className="text-center">
        {category.name}
      </T>
      <T variant="caption" numberOfLines={1}>
        {t('category.servicesCount', { count: category.serviceCount })}
      </T>
    </Touchable>
  );
}
