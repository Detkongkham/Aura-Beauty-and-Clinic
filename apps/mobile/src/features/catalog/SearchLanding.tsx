import type { ServiceCategoryView, ServiceListItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Skeleton } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { colors } from '../../theme';
import { CategoryTile } from './CategoryTile';
import { ServiceGridCard } from './ServiceResultCard';

/** ຂໍ້ຄວາມ catalog = 12px ຄົງທີ່ (typography-appointments.md). className ຄຸມ weight/ສີ ເທົ່ານັ້ນ. */
function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}
const SMALL = { fontSize: 10, lineHeight: 14 } as const;
const RAIL_CARD_W = 156;

export type SearchLandingProps = {
  recent: string[];
  categories: ServiceCategoryView[];
  /** ບໍລິການທີ່ບັນທຶກໄວ້ (ໂຫລດແລ້ວ). */
  saved: ServiceListItem[];
  popular: ServiceListItem[];
  popularLoading: boolean;
  favorites: string[];
  onPickTerm: (term: string) => void;
  onPickCategory: (id: string) => void;
  onRemoveRecent: (term: string) => void;
  onClearRecent: () => void;
  onOpenService: (id: string) => void;
  onBook: (s: ServiceListItem) => void;
  onToggleSave: (id: string) => void;
};

function SectionLabel({
  title,
  icon,
  action,
  onAction,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <View className="mb-2.5 flex-row items-center justify-between">
      <View className="flex-row items-center gap-1.5">
        {icon ? <Ionicons name={icon} size={13} color={colors.primary} /> : null}
        <T accessibilityRole="header" className="font-lao-semibold text-foreground">
          {title}
        </T>
      </View>
      {action && onAction ? (
        <Touchable onPress={onAction} haptic="none" hitSlop={10} accessibilityRole="button">
          <T className="font-lao-medium text-primary" style={SMALL}>
            {action}
          </T>
        </Touchable>
      ) : null}
    </View>
  );
}

/** ໜ້າຕັ້ງຕົ້ນຂອງໜ້າຄົ້ນຫາ (query ຫວ່າງ) — ລ່າສຸດ · ທີ່ບັນທຶກ · ຍອດນິຍົມ · ແນະນຳ · ໝວດໝູ່. */
export function SearchLanding({
  recent,
  categories,
  saved,
  popular,
  popularLoading,
  favorites,
  onPickTerm,
  onPickCategory,
  onRemoveRecent,
  onClearRecent,
  onOpenService,
  onBook,
  onToggleSave,
}: SearchLandingProps): React.JSX.Element {
  const { t } = useTranslation();
  const suggested = categories.filter((c) => c.serviceCount > 0).slice(0, 5);

  const rail = (items: ServiceListItem[]): React.JSX.Element => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-4"
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
    >
      {items.map((s, i) => (
        <AnimatedEntrance key={s.id} index={i}>
          <ServiceGridCard
            service={s}
            saved={favorites.includes(s.id)}
            onPress={() => onOpenService(s.id)}
            onBook={() => onBook(s)}
            onToggleSave={() => onToggleSave(s.id)}
            style={{ width: RAIL_CARD_W }}
          />
        </AnimatedEntrance>
      ))}
    </ScrollView>
  );

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 24 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      {recent.length > 0 ? (
        <View>
          <SectionLabel
            title={t('search.recent')}
            action={t('search.clearAll')}
            onAction={onClearRecent}
          />
          <View className="flex-row flex-wrap gap-2">
            {recent.map((term) => (
              <View
                key={term}
                className="h-8 flex-row items-center rounded-full border border-border bg-card pl-2.5"
              >
                <Touchable
                  onPress={() => onPickTerm(term)}
                  haptic="none"
                  pressScale={0.95}
                  accessibilityRole="button"
                  accessibilityLabel={term}
                  className="h-full flex-row items-center gap-1"
                >
                  <Ionicons name="time-outline" size={11} color={colors.mutedForeground} />
                  <T numberOfLines={1} className="max-w-[160px] font-lao text-foreground">
                    {term}
                  </T>
                </Touchable>
                <Touchable
                  onPress={() => onRemoveRecent(term)}
                  haptic="none"
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('search.removeFilter', { label: term })}
                  className="h-full justify-center pl-1 pr-2"
                >
                  <Ionicons name="close" size={12} color={colors.mutedForeground} />
                </Touchable>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {saved.length > 0 ? (
        <View>
          <SectionLabel title={t('search.savedTitle')} icon="heart" />
          {rail(saved)}
        </View>
      ) : null}

      {popularLoading || popular.length > 0 ? (
        <View>
          <SectionLabel title={t('search.popularNow')} icon="flame" />
          {popularLoading ? (
            <View className="flex-row gap-2.5">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-[210px] w-[156px] rounded-2xl" />
              ))}
            </View>
          ) : (
            rail(popular)
          )}
        </View>
      ) : null}

      {suggested.length > 0 ? (
        <View>
          <SectionLabel title={t('search.trending')} icon="trending-up" />
          <View className="flex-row flex-wrap gap-2">
            {suggested.map((c) => (
              <Touchable
                key={c.id}
                onPress={() => onPickTerm(c.name)}
                pressScale={0.95}
                accessibilityRole="button"
                accessibilityLabel={c.name}
                className="h-8 flex-row items-center gap-1 rounded-full bg-primary-subtle px-3"
              >
                <Ionicons name="search" size={11} color={colors.primary} />
                <T numberOfLines={1} className="font-lao-medium text-primary-strong">
                  {c.name}
                </T>
              </Touchable>
            ))}
          </View>
        </View>
      ) : null}

      {categories.length > 0 ? (
        <View>
          <SectionLabel title={t('search.byCategory')} icon="grid-outline" />
          <View className="flex-row flex-wrap justify-between" style={{ rowGap: 14 }}>
            {categories.map((c, i) => (
              <AnimatedEntrance key={c.id} index={i} style={{ width: '22%' }}>
                <CategoryTile category={c} onPress={() => onPickCategory(c.id)} />
              </AnimatedEntrance>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
