import type { PromotionView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gradient } from '../../components/ui/Gradient';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { formatLAK, vientiane } from '../../lib/format';
import { colors, shadow } from '../../theme';
import { T } from './home.parts';

const GUTTER = 20;
const GAP = 12;

/** [1,2,3,4] → "ຈ–ພຫ", [0..6] → "ທຸກວັນ", [1,3] → "ຈ, ພ". */
function daysLabel(t: TFunction, days: number[]): string {
  if (days.length === 7) return t('home.promoEveryDay');
  const names = t('home.dow', { returnObjects: true }) as string[];
  const runs: number[][] = [];
  for (const d of days) {
    const last = runs[runs.length - 1];
    if (last && d === last[last.length - 1]! + 1) last.push(d);
    else runs.push([d]);
  }
  return runs
    .map((r) =>
      r.length >= 3
        ? `${names[r[0]!]}–${names[r[r.length - 1]!]}`
        : r.map((d) => names[d]).join(', '),
    )
    .join(', ');
}

/** ສະຖານະເວລາ — ວັນ/ເວລາ rule ເປັນເວລາວຽງຈັນ (ກົງກັບ pricing engine). */
function statusLabel(t: TFunction, p: PromotionView): string {
  if (p.kind === 'SALE') return t('home.promoSale');
  if (p.liveNow && p.endsAt) {
    const mins = Math.max(1, Math.round((Date.parse(p.endsAt) - Date.now()) / 60_000));
    return mins < 60
      ? t('home.promoEndsMinutes', { count: mins })
      : t('home.promoEndsHours', { h: Math.floor(mins / 60), m: mins % 60 });
  }
  if (p.nextStartAt) {
    const next = vientiane(p.nextStartAt);
    const dayDiff = next.startOf('day').diff(vientiane().startOf('day'), 'day');
    const names = t('home.dow', { returnObjects: true }) as string[];
    const day =
      dayDiff === 0 ? t('home.today') : dayDiff === 1 ? t('home.tomorrow') : names[next.day()];
    return t('home.promoStarts', { day, time: next.format('HH:mm') });
  }
  return '';
}

function PromoCard({
  p,
  width,
  onPress,
}: {
  p: PromotionView;
  width: number;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const live = p.liveNow;
  const scope = p.serviceName ?? t('home.promoAllServices');

  return (
    <Touchable
      onPress={onPress}
      pressScale={0.985}
      haptic="none"
      accessibilityRole="button"
      accessibilityLabel={`${p.title} · -${p.discountPercent}% · ${scope}`}
      className="overflow-hidden rounded-3xl"
      style={[shadow.card, { width }]}
    >
      <Gradient preset={p.kind === 'SALE' ? 'brand' : 'hero'} fill pointerEvents="none" />
      <View className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
      <View className="absolute -bottom-14 right-20 h-24 w-24 rounded-full bg-white/5" />

      <View className="flex-row gap-3 p-4">
        <View className="flex-1">
          {/* status pill */}
          <View
            className={cn(
              'flex-row items-center gap-1 self-start rounded-full px-2 py-0.5',
              live ? 'bg-success' : 'bg-white/15',
            )}
          >
            {live && p.kind === 'HAPPY_HOUR' ? (
              <View className="h-1.5 w-1.5 rounded-full bg-white" />
            ) : (
              <Ionicons
                name={p.kind === 'SALE' ? 'pricetag' : 'time-outline'}
                size={11}
                color={colors.champagne}
              />
            )}
            <T numberOfLines={1} className="font-lao-medium text-white">
              {statusLabel(t, p)}
            </T>
          </View>

          <T numberOfLines={1} className="mt-2 font-lao-semibold text-white">
            {p.title}
          </T>
          <View className="flex-row items-baseline gap-1">
            <T className="font-display-bold text-champagne">
              {t('home.promoOff', { pct: p.discountPercent })}
            </T>
            <T numberOfLines={1} className="shrink font-lao text-white/80">
              · {scope}
            </T>
          </View>

          <View className="mt-0.5 flex-row items-center gap-1">
            {p.kind === 'HAPPY_HOUR' ? (
              <>
                <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.65)" />
                <T numberOfLines={1} className="shrink font-lao text-white/65">
                  {daysLabel(t, p.daysOfWeek)} · {p.startTime}–{p.endTime}
                </T>
              </>
            ) : null}
            {p.kind === 'SALE' && p.price != null ? (
              <T numberOfLines={1} className="font-sans text-white/65">
                {formatLAK(p.price)}{' '}
                <T
                  className="font-sans text-white/45"
                  style={{ textDecorationLine: 'line-through' }}
                >
                  {formatLAK(p.compareAtPrice ?? 0)}
                </T>
              </T>
            ) : null}
          </View>

          <View
            className="mt-3 h-9 flex-row items-center gap-1 self-start rounded-full bg-white px-3.5"
            style={shadow.xs}
          >
            <T className="font-lao-semibold text-aura-900">{t('home.promoCta')}</T>
            <Ionicons name="arrow-forward" size={13} color={colors.aura900} />
          </View>
        </View>

        {p.serviceImageUrl ? (
          <Image
            source={{ uri: p.serviceImageUrl }}
            className="h-[92px] w-[80px] self-center rounded-2xl border border-white/20"
            resizeMode="cover"
          />
        ) : (
          <View className="h-[64px] w-[64px] items-center justify-center self-center rounded-2xl border border-white/15 bg-white/10">
            <Ionicons
              name={p.kind === 'SALE' ? 'pricetags' : 'sparkles'}
              size={24}
              color={colors.champagne}
            />
          </View>
        )}
      </View>
    </Touchable>
  );
}

/** ໂປຣໂມຊັນຈິງຈາກ `/pricing/promotions` — ເລື່ອນຂ້າງແບບ paging + dots ຕາມຈຳນວນຈິງ. ບໍ່ມີ = ບໍ່ສະແດງ. */
export function PromoCarousel({
  items,
  loading,
  onOpen,
}: {
  items: PromotionView[];
  loading: boolean;
  onOpen: (p: PromotionView) => void;
}): React.JSX.Element | null {
  const { width: screen } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const single = items.length <= 1;
  const cardWidth = single ? screen - GUTTER * 2 : screen - GUTTER * 2 - 24;

  if (loading) return <Skeleton className="mx-5 h-[168px] rounded-3xl" />;
  if (items.length === 0) return null;

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): void =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / (cardWidth + GAP)));

  return (
    <View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth + GAP}
        scrollEnabled={!single}
        onMomentumScrollEnd={onEnd}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: GAP, paddingBottom: 6 }}
        renderItem={({ item }) => (
          <PromoCard p={item} width={cardWidth} onPress={() => onOpen(item)} />
        )}
      />
      {!single ? (
        <View className="mt-2 flex-row justify-center gap-1.5" accessibilityElementsHidden>
          {items.map((p, i) => (
            <View
              key={p.id}
              className={cn(
                'h-1.5 rounded-full',
                i === index ? 'w-4 bg-primary' : 'w-1.5 bg-border',
              )}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
