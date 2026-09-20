import type { ServiceListItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { formatLAK } from '../../lib/format';
import { colors, shadow } from '../../theme';

/** ຂໍ້ຄວາມ catalog = 12px ຄົງທີ່ (typography-appointments.md). className ຄຸມ weight/ສີ ເທົ່ານັ້ນ. */
function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}
const SMALL = { fontSize: 10, lineHeight: 14 } as const;

export type ServiceResultCardProps = {
  service: ServiceListItem;
  saved?: boolean;
  onPress: () => void;
  onBook: () => void;
  onToggleSave: () => void;
};

function discountPct(s: ServiceListItem): number {
  return s.compareAtPrice && s.compareAtPrice > s.price
    ? Math.round((1 - s.price / s.compareAtPrice) * 100)
    : 0;
}

/* ---------------------------------------------------------------- atoms */

function Thumb({ uri, className }: { uri: string | null; className?: string }): React.JSX.Element {
  return (
    <View className={cn('overflow-hidden bg-muted', className)}>
      {uri ? (
        <Image source={{ uri }} className="h-full w-full" resizeMode="cover" />
      ) : (
        <View className="h-full w-full items-center justify-center bg-primary-subtle">
          <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
        </View>
      )}
    </View>
  );
}

function SaveButton({
  saved,
  onPress,
}: {
  saved: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      haptic="select"
      pressScale={0.85}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? t('search.saved') : t('search.save')}
      className="h-7 w-7 items-center justify-center rounded-full bg-card/95"
      style={shadow.xs}
    >
      <Ionicons
        name={saved ? 'heart' : 'heart-outline'}
        size={14}
        color={saved ? colors.destructive : colors.foreground}
      />
    </Touchable>
  );
}

function DiscountTag({ pct }: { pct: number }): React.JSX.Element {
  return (
    <View className="rounded-md bg-destructive px-1.5 py-px">
      <T className="font-sans-semibold text-white" style={SMALL}>
        -{pct}%
      </T>
    </View>
  );
}

/** ★ 4.8 (32) · 60 ນາທີ */
function MetaLine({ service }: { service: ServiceListItem }): React.JSX.Element {
  const { t } = useTranslation();
  const hasRating = service.reviewCount > 0;
  return (
    <View className="flex-row items-center gap-1.5">
      {hasRating ? (
        <View className="flex-row items-center gap-0.5">
          <Ionicons name="star" size={10} color={colors.accent} />
          <T className="font-sans-medium text-foreground" style={SMALL}>
            {service.rating.toFixed(1)}
          </T>
          <T className="font-sans text-muted-foreground" style={SMALL}>
            ({service.reviewCount})
          </T>
        </View>
      ) : null}
      {hasRating ? <View className="h-0.5 w-0.5 rounded-full bg-muted-foreground" /> : null}
      <View className="flex-row items-center gap-0.5">
        <Ionicons name="time-outline" size={10} color={colors.mutedForeground} />
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {t('common.minutesShort', { count: service.durationMinutes })}
        </T>
      </View>
    </View>
  );
}

function PriceBlock({ service }: { service: ServiceListItem }): React.JSX.Element {
  const pct = discountPct(service);
  return (
    <View className="min-w-0 shrink">
      {pct > 0 && service.compareAtPrice ? (
        <T numberOfLines={1} className="font-sans text-muted-foreground line-through" style={SMALL}>
          {formatLAK(service.compareAtPrice)}
        </T>
      ) : null}
      <T numberOfLines={1} className="font-sans-semibold text-primary-strong">
        {formatLAK(service.price)}
      </T>
    </View>
  );
}

function BookButton({
  name,
  onPress,
  compact = false,
}: {
  name: string;
  onPress: () => void;
  compact?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      haptic="primary"
      pressScale={0.94}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${t('search.bookNow')} ${name}`}
      className={cn(
        'h-8 flex-row items-center justify-center rounded-full bg-primary',
        compact ? 'w-8' : 'gap-1 px-3',
      )}
      style={shadow.primary}
    >
      {compact ? (
        <Ionicons name="add" size={16} color={colors.primaryForeground} />
      ) : (
        <T className="font-lao-medium text-primary-foreground">{t('search.bookNow')}</T>
      )}
    </Touchable>
  );
}

/* ---------------------------------------------------------------- list card */

/**
 * ບັດຜົນຄົ້ນຫາແບບແຖວ — ຮູບ 96px (ປ້າຍ -% + ຫົວໃຈ), ໝວດ, ຊື່ 2 ແຖວ, ★/ນາທີ,
 * footer ລາຄາ (ຂີດຄ້ຽນ) + ປຸ່ມຈອງ. Popular = ປ້າຍ flame ນ້ອຍ (ບໍ່ໃຊ້ ribbon ຂວາງ).
 */
export function ServiceResultCard({
  service,
  saved = false,
  onPress,
  onBook,
  onToggleSave,
}: ServiceResultCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const pct = discountPct(service);

  return (
    <Touchable
      onPress={onPress}
      accessibilityLabel={`${service.name}, ${formatLAK(service.price)}`}
      accessibilityRole="button"
      pressScale={0.98}
      className="flex-row gap-3 rounded-2xl border border-border bg-card p-2.5"
      style={shadow.xs}
    >
      <View>
        <Thumb uri={service.imageUrl} className="h-[96px] w-[96px] rounded-xl" />
        {pct > 0 ? (
          <View className="absolute left-1.5 top-1.5">
            <DiscountTag pct={pct} />
          </View>
        ) : null}
        <View className="absolute bottom-1.5 right-1.5">
          <SaveButton saved={saved} onPress={onToggleSave} />
        </View>
      </View>

      <View className="min-w-0 flex-1 justify-between py-0.5">
        <View className="gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <T numberOfLines={1} className="shrink font-lao-medium text-primary" style={SMALL}>
              {service.categoryName}
            </T>
            {service.popular ? (
              <View className="flex-row items-center gap-0.5 rounded-full bg-primary-subtle px-1.5">
                <Ionicons name="flame" size={9} color={colors.primary} />
                <T className="font-lao-medium text-primary-strong" style={SMALL}>
                  {t('service.popular')}
                </T>
              </View>
            ) : null}
          </View>
          <T numberOfLines={2} className="font-lao-semibold text-foreground">
            {service.name}
          </T>
          <MetaLine service={service} />
        </View>

        <View className="mt-1.5 flex-row items-end justify-between gap-2">
          <PriceBlock service={service} />
          <BookButton name={service.name} onPress={onBook} />
        </View>
      </View>
    </Touchable>
  );
}

/* ---------------------------------------------------------------- grid card */

/** ບັດ 2 ຖັນ — ຮູບ 4:3 ເທິງ, ຂໍ້ມູນລຸ່ມ, ປຸ່ມ + ມົນ. ໃຊ້ໃນມຸມມອງຕາຕະລາງ + rail. */
export function ServiceGridCard({
  service,
  saved = false,
  onPress,
  onBook,
  onToggleSave,
  style,
}: ServiceResultCardProps & { style?: React.ComponentProps<typeof View>['style'] }): React.JSX.Element {
  const pct = discountPct(service);
  return (
    <Touchable
      onPress={onPress}
      accessibilityLabel={`${service.name}, ${formatLAK(service.price)}`}
      accessibilityRole="button"
      pressScale={0.97}
      className="rounded-2xl border border-border bg-card"
      style={[shadow.xs, style]}
    >
      <View>
        <Thumb uri={service.imageUrl} className="aspect-[4/3] w-full rounded-t-2xl" />
        {pct > 0 ? (
          <View className="absolute left-2 top-2">
            <DiscountTag pct={pct} />
          </View>
        ) : null}
        <View className="absolute right-2 top-2">
          <SaveButton saved={saved} onPress={onToggleSave} />
        </View>
      </View>
      <View className="gap-0.5 p-2.5">
        <T numberOfLines={1} className="font-lao-medium text-primary" style={SMALL}>
          {service.categoryName}
        </T>
        <T numberOfLines={2} className="min-h-[34px] font-lao-semibold text-foreground">
          {service.name}
        </T>
        <MetaLine service={service} />
        <View className="mt-1 flex-row items-end justify-between gap-1">
          <PriceBlock service={service} />
          <BookButton name={service.name} onPress={onBook} compact />
        </View>
      </View>
    </Touchable>
  );
}
