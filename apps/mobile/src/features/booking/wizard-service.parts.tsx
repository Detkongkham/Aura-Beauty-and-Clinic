import type { StaffListItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Image, Switch, View } from 'react-native';
import { Avatar } from '../../components/ui/Avatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { formatLAK } from '../../lib/format';
import { colors, shadow } from '../../theme';
import { Card, IconTile, NUM, Pill, Radio, SMALL, T } from './booking-kit';

/** ລະດັບຊ່າງ — ມາຈາກຄະແນນ + ຈຳນວນຣີວິວ. */
export function seniorityTier(staff: { rating: number; totalReviews: number }): 'master' | 'pro' | null {
  if (staff.rating >= 4.95 && staff.totalReviews >= 100) return 'master';
  if (staff.rating >= 4.7 && staff.totalReviews >= 20) return 'pro';
  return null;
}

/** ບັດບໍລິການທີ່ເລືອກ — ຮູບ 56 + ຊື່ + chip (ເວລາ/ມັດຈຳ) + ລາຄາ. */
export function SelectedServiceCard({
  name,
  subtitle,
  imageUrl,
  price,
  compareAtPrice,
  durationMinutes,
  depositAmount,
  onChange,
}: {
  name: string;
  subtitle: string | null;
  imageUrl: string | null;
  price: number;
  compareAtPrice: number | null;
  durationMinutes: number;
  depositAmount: number | null;
  onChange: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const discountPct =
    compareAtPrice && compareAtPrice > price ? Math.round((1 - price / compareAtPrice) * 100) : 0;

  return (
    <Card className="p-3.5">
      <View className="flex-row items-center gap-3">
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            className="h-14 w-14 rounded-xl bg-muted"
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View className="h-14 w-14 items-center justify-center rounded-xl bg-primary-subtle">
            <Ionicons name="sparkles" size={20} color={colors.primary} />
          </View>
        )}

        <View className="flex-1">
          <T numberOfLines={1} className="font-lao-semibold text-foreground">
            {name}
          </T>
          {subtitle ? (
            <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
              {subtitle}
            </T>
          ) : null}
          <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
            <Pill tone="muted" icon="time-outline" label={t('common.minutesShort', { count: durationMinutes })} />
            {depositAmount != null && depositAmount > 0 ? (
              <Pill
                tone="accent"
                icon="wallet-outline"
                label={t('wizard.depositChip', { amount: formatLAK(depositAmount) })}
              />
            ) : null}
          </View>
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-between border-t border-border/70 pt-3">
        <Touchable
          onPress={onChange}
          hitSlop={10}
          pressScale={0.95}
          accessibilityRole="button"
          accessibilityLabel={t('wizard.changeService')}
          className="h-8 flex-row items-center gap-1 rounded-full bg-muted px-3"
        >
          <Ionicons name="swap-horizontal" size={13} color={colors.primaryStrong} />
          <T className="font-lao-medium text-primary-strong" style={SMALL}>
            {t('wizard.changeService')}
          </T>
        </Touchable>

        <View className="items-end">
          <View className="flex-row items-center gap-1.5">
            {discountPct > 0 && compareAtPrice ? (
              <>
                <Pill tone="success" label={`-${discountPct}%`} />
                <T className="font-lao text-muted-foreground line-through" style={SMALL}>
                  {formatLAK(compareAtPrice)}
                </T>
              </>
            ) : null}
          </View>
          <T className="font-lao-semibold text-foreground" style={NUM}>
            {formatLAK(price)}
          </T>
        </View>
      </View>
    </Card>
  );
}

/** ຕົວເລືອກ "ຊ່າງໃດກໍໄດ້" — ຄິວໄວທີ່ສຸດ (ແນະນຳ). */
export function AnyStaffOption({
  selected,
  onPress,
}: {
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.985}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${t('staff.anyTitle')}. ${t('staff.anyDesc')}`}
      className={cn(
        'min-h-[64px] flex-row items-center gap-3 rounded-2xl border p-3',
        selected ? 'border-primary bg-primary-subtle/60' : 'border-border bg-card',
      )}
      style={selected ? undefined : shadow.xs}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary">
        <Ionicons name="people" size={18} color={colors.primaryForeground} />
      </View>
      <View className="flex-1">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <T className="font-lao-semibold text-foreground">{t('staff.any')}</T>
          <Pill tone="warning" icon="flash" label={t('staff.anyFast')} />
        </View>
        <T numberOfLines={2} className="mt-0.5 font-lao text-muted-foreground" style={SMALL}>
          {t('staff.anyDesc')}
        </T>
      </View>
      <Radio selected={selected} />
    </Touchable>
  );
}

const TIER_LABEL: Record<'master' | 'pro', string> = { master: 'MASTER', pro: 'PRO' };

/** ແຖວຊ່າງ 1 ຄົນ — avatar 40 + ຊື່/ລະດັບ + ຕຳແໜ່ງ + ຄະແນນ + bio (ເມື່ອເລືອກ). */
export function StaffOption({
  staff,
  selected,
  onPress,
}: {
  staff: StaffListItem;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const tier = seniorityTier(staff);
  const hasRating = staff.totalReviews > 0;

  return (
    <Touchable
      onPress={onPress}
      pressScale={0.985}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${staff.name}, ${staff.title}${hasRating ? `, ★ ${staff.rating.toFixed(1)}` : ''}`}
      className={cn(
        'rounded-2xl border p-3',
        selected ? 'border-primary bg-primary-subtle/60' : 'border-border bg-card',
      )}
      style={selected ? undefined : shadow.xs}
    >
      <View className="flex-row items-center gap-3">
        <Avatar uri={staff.avatarUrl} name={staff.name} size={40} shape="full" mode="cartoon" />

        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <T numberOfLines={1} className="shrink font-lao-semibold text-foreground">
              {staff.name}
            </T>
            {tier ? <Pill tone={tier === 'master' ? 'accent' : 'primary'} label={TIER_LABEL[tier]} /> : null}
          </View>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <T numberOfLines={1} className="shrink font-lao text-muted-foreground" style={SMALL}>
              {staff.title}
            </T>
            <View className="h-0.5 w-0.5 rounded-full bg-input" />
            {hasRating ? (
              <View className="flex-row items-center gap-0.5">
                <Ionicons name="star" size={10} color={colors.accent} />
                <T className="font-lao-semibold text-foreground" style={SMALL}>
                  {staff.rating.toFixed(1)}
                </T>
                <T className="font-lao text-muted-foreground" style={SMALL}>
                  ({t('staff.reviews', { count: staff.totalReviews })})
                </T>
              </View>
            ) : (
              <T className="font-lao text-muted-foreground" style={SMALL}>
                {t('staff.newStylist')}
              </T>
            )}
          </View>
        </View>

        <Radio selected={selected} />
      </View>

      {selected && staff.bio ? (
        <T numberOfLines={3} className="mt-2.5 border-t border-primary/15 pt-2.5 font-lao text-muted-foreground" style={SMALL}>
          {staff.bio}
        </T>
      ) : null}
    </Touchable>
  );
}

/** Skeleton ຂອງລາຍການຊ່າງ ລະຫວ່າງໂຫຼດ. */
export function StaffSkeleton(): React.JSX.Element {
  return (
    <View className="gap-2">
      {[0, 1, 2].map((i) => (
        <View key={i} className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-3 w-2/5 rounded-md" />
            <Skeleton className="h-2.5 w-3/5 rounded-md" />
          </View>
          <Skeleton className="h-5 w-5 rounded-full" />
        </View>
      ))}
    </View>
  );
}

/** ສະຫຼັບ preference (ນັດແບບງຽບ). */
export function PreferenceToggle({
  icon,
  title,
  desc,
  value,
  onValueChange,
}: {
  icon: React.ComponentProps<typeof IconTile>['icon'];
  title: string;
  desc: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <Card flat className="min-h-[56px] flex-row items-center gap-3 p-3">
      <IconTile icon={icon} />
      <View className="flex-1">
        <T className="font-lao-semibold text-foreground">{title}</T>
        <T className="mt-0.5 font-lao text-muted-foreground" style={SMALL}>
          {desc}
        </T>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={title}
        trackColor={{ false: colors.input, true: colors.primary }}
        thumbColor={colors.card}
        ios_backgroundColor={colors.input}
        style={{ transform: [{ scale: 0.85 }] }}
      />
    </Card>
  );
}
