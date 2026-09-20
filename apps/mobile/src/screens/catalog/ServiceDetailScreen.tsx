import type { StaffSummary } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Image, Share, View, type LayoutChangeEvent, type ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorView } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { GlassView, glassBorder } from '../../components/ui/GlassView';
import { Gradient } from '../../components/ui/Gradient';
import { Touchable } from '../../components/ui/Touchable';
import { DEFAULT_BRANCH_ADDRESS, DEFAULT_BRANCH_ID, DEFAULT_BRANCH_NAME } from '../../config/env';
import { useService } from '../../features/catalog/catalog.api';
import { findRedeemable, useMyPackages } from '../../features/packages/packages.api';
import {
  CheckList,
  EMPH,
  ExpandableText,
  FactGrid,
  LocationCard,
  PackageRow,
  ProcessTimeline,
  RatingSummary,
  RelatedRail,
  ReviewCard,
  RoundBtn,
  SMALL,
  SectionHeader,
  ServiceDetailSkeleton,
  StaffPicker,
  Surface,
  T,
  TipList,
  type FactItem,
} from '../../features/catalog/service-detail.parts';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { formatLAK } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import type { AppScreenProps } from '../../navigation/types';
import { useBookingDraft } from '../../store/booking-draft.store';
import { useSearchStore } from '../../store/search.store';
import { colors } from '../../theme';

const HERO_H = 300;
const REVIEWS_PREVIEW = 2;

/** Section ທີ່ມີໄລຍະຫ່າງມາດຕະຖານ + entrance. */
function Section({
  index,
  children,
  onLayout,
}: {
  index: number;
  children: React.ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
}): React.JSX.Element {
  return (
    <View className="mt-6" onLayout={onLayout}>
      <AnimatedEntrance index={index}>{children}</AnimatedEntrance>
    </View>
  );
}

export function ServiceDetailScreen({
  navigation,
  route,
}: AppScreenProps<'ServiceDetail'>): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { serviceId } = route.params;
  const service = useService(serviceId, DEFAULT_BRANCH_ID);
  const startDraft = useBookingDraft((s) => s.start);

  const isFavorite = useSearchStore((s) => s.favorites.includes(serviceId));
  const toggleFavorite = useSearchStore((s) => s.toggleFavorite);

  const myPackages = useMyPackages();
  const [staffPick, setStaffPick] = useState<StaffSummary | null>(null);
  const [allReviews, setAllReviews] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const reviewsY = useRef(0);
  const sheetY = useRef(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
  });

  if (service.isLoading) return <ServiceDetailSkeleton heroHeight={HERO_H} />;
  if (service.isError || !service.data) {
    return <ErrorView message={t('errors.generic')} onRetry={() => service.refetch()} />;
  }

  const s = service.data;
  const hasReviews = s.reviewCount > 0;
  const staffCount = s.staff.length;
  const discount =
    s.compareAtPrice && s.compareAtPrice > s.price ? s.compareAtPrice - s.price : 0;
  const discountPct = discount > 0 && s.compareAtPrice ? Math.round((discount / s.compareAtPrice) * 100) : 0;
  const deposit = s.requireDeposit && s.depositAmount ? s.depositAmount : null;
  const credit = findRedeemable(myPackages.data, s.id);

  const facts: FactItem[] = [
    {
      icon: 'time-outline',
      label: t('service.duration'),
      value: t('common.minutesShort', { count: s.durationMinutes }),
    },
    {
      icon: 'pricetag-outline',
      label: t('service.price'),
      value: formatLAK(s.price),
      sub: discount > 0 ? t('service.saveAmount', { amount: formatLAK(discount) }) : undefined,
    },
    {
      icon: 'wallet-outline',
      tone: deposit ? 'accent' : 'success',
      label: t('service.depositShort'),
      value: deposit ? formatLAK(deposit) : t('service.noDeposit'),
    },
    {
      icon: 'people-outline',
      label: t('service.staffCount'),
      value: t('service.peopleCount', { count: staffCount }),
    },
  ];

  const tips = [
    ...(deposit
      ? [{ icon: 'wallet-outline' as const, text: t('service.depositNote', { amount: formatLAK(deposit) }) }]
      : []),
    { icon: 'alarm-outline' as const, text: t('service.tipArrive') },
    { icon: 'medkit-outline' as const, text: t('service.tipHealth') },
    { icon: 'calendar-clear-outline' as const, text: t('service.tipReschedule') },
  ];

  const fade = HERO_H - insets.top - 100;
  const fadeRange = [fade, fade + (reduced ? 1 : 50)];
  const headerOpacity = scrollY.interpolate({
    inputRange: fadeRange,
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const floatOpacity = scrollY.interpolate({
    inputRange: fadeRange,
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const heroTransform = reduced
    ? []
    : [
        {
          translateY: scrollY.interpolate({
            inputRange: [-160, 0, HERO_H],
            outputRange: [-80, 0, HERO_H * 0.3],
            extrapolateLeft: 'extend',
            extrapolateRight: 'clamp',
          }),
        },
        {
          scale: scrollY.interpolate({
            inputRange: [-160, 0],
            outputRange: [1.3, 1],
            extrapolateRight: 'clamp',
          }),
        },
      ];

  const onBook = (withCredit = false): void => {
    const pkgCredit = withCredit ? credit : null;
    startDraft({
      mode: 'create',
      branchId: DEFAULT_BRANCH_ID,
      serviceId: s.id,
      serviceName: s.name,
      serviceSubtitle: s.description,
      serviceImageUrl: s.imageUrl,
      price: s.price,
      compareAtPrice: s.compareAtPrice,
      depositAmount: deposit,
      durationMinutes: s.durationMinutes,
      staffProfileId: staffPick?.id ?? null,
      staffName: staffPick?.name ?? null,
      userPackageItemId: pkgCredit?.item.id ?? null,
      packageName: pkgCredit?.userPackage.packageName ?? null,
      packageRemaining: pkgCredit?.item.remainingUnits ?? null,
    });
    navigation.navigate('WizardService');
  };

  const onShare = (): void => {
    void Share.share({ message: `${s.name} — ${formatLAK(s.price)}` });
  };

  const onToggleFavorite = (): void => {
    haptics.select();
    toggleFavorite(serviceId);
  };

  const scrollToReviews = (): void => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, sheetY.current + reviewsY.current - insets.top - 56),
      animated: !reduced,
    });
  };

  const shownReviews = allReviews ? s.reviews : s.reviews.slice(0, REVIEWS_PREVIEW);

  return (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
      >
        {/* ── hero ─────────────────────────────────────────────── */}
        <View className="w-full overflow-hidden bg-muted" style={{ height: HERO_H }}>
          <Animated.View style={{ flex: 1, transform: heroTransform }}>
            {s.imageUrl ? (
              <Image
                source={{ uri: s.imageUrl }}
                className="h-full w-full"
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View className="h-full w-full items-center justify-center bg-primary-subtle">
                <Ionicons name="sparkles-outline" size={40} color={colors.primary} />
              </View>
            )}
          </Animated.View>
          <Gradient
            preset="imageScrim"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: HERO_H * 0.5 }}
            pointerEvents="none"
          />
          <View className="absolute bottom-8 left-4 flex-row gap-1.5">
            {s.popular ? (
              <View className="flex-row items-center gap-1 rounded-full bg-card/95 px-2 py-0.5">
                <Ionicons name="flame" size={10} color={colors.primary} />
                <T className="font-lao-medium text-primary-strong" style={SMALL}>
                  {t('service.popular')}
                </T>
              </View>
            ) : null}
            {discountPct > 0 ? (
              <View className="rounded-full bg-destructive px-2 py-0.5">
                <T className="font-sans-semibold text-white" style={SMALL}>
                  -{discountPct}%
                </T>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── content sheet ────────────────────────────────────── */}
        <View
          className="-mt-5 rounded-t-3xl bg-background px-4 pt-5"
          onLayout={(e) => {
            sheetY.current = e.nativeEvent.layout.y;
          }}
        >
          {/* title block */}
          <View className="gap-1.5">
            <View className="flex-row items-center gap-1.5">
              <View className="rounded-md bg-primary-subtle px-2 py-0.5">
                <T className="font-lao-medium text-primary-strong" style={SMALL}>
                  {s.categoryName}
                </T>
              </View>
              <T className="font-lao text-muted-foreground" style={SMALL}>
                {t('common.minutesShort', { count: s.durationMinutes })}
              </T>
            </View>

            <T accessibilityRole="header" className="font-lao-serif text-foreground">
              {s.name}
            </T>

            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
              {hasReviews ? (
                <Touchable
                  onPress={scrollToReviews}
                  haptic="none"
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.rating.toFixed(1)}, ${t('staff.reviews', { count: s.reviewCount })}`}
                  className="flex-row items-center gap-1"
                >
                  <Ionicons name="star" size={11} color={colors.accent} />
                  <T className="font-sans-semibold text-foreground">{s.rating.toFixed(1)}</T>
                  <T className="font-lao text-primary underline">
                    {t('staff.reviews', { count: s.reviewCount })}
                  </T>
                </Touchable>
              ) : null}
              {hasReviews && s.completedCount > 0 ? <View className="h-0.5 w-0.5 rounded-full bg-muted-foreground" /> : null}
              {s.completedCount > 0 ? (
                <View className="flex-row items-center gap-1">
                  <Ionicons name="checkmark-done" size={12} color={colors.success} />
                  <T className="font-lao text-muted-foreground">
                    {t('service.completedCount', { count: s.completedCount })}
                  </T>
                </View>
              ) : null}
            </View>
          </View>

          {/* key facts */}
          <View className="mt-4">
            <FactGrid items={facts} />
          </View>

          {credit ? (
            <Touchable
              onPress={() => navigation.navigate('MyPackages')}
              accessibilityRole="button"
              className="mt-3 flex-row items-center gap-2.5 rounded-2xl bg-success-soft p-3"
            >
              <Ionicons name="gift" size={16} color={colors.success} />
              <View className="min-w-0 flex-1">
                <T numberOfLines={1} className="font-lao-semibold text-success">
                  {t('packages.creditTitle', { count: credit.item.remainingUnits })}
                </T>
                <T numberOfLines={1} className="font-lao text-foreground/80" style={SMALL}>
                  {credit.userPackage.packageName}
                </T>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.success} />
            </Touchable>
          ) : null}

          {/* about */}
          {s.description || s.highlights.length > 0 ? (
            <Section index={1}>
              <SectionHeader title={t('service.aboutTitle')} />
              {s.description ? <ExpandableText text={s.description} /> : null}
              {s.highlights.length > 0 ? (
                <Surface className="mt-3 p-3">
                  <T className="mb-2 font-lao-medium text-foreground">{t('service.highlightsTitle')}</T>
                  <CheckList items={s.highlights} />
                </Surface>
              ) : null}
            </Section>
          ) : null}

          {/* specialists */}
          <Section index={2}>
            <SectionHeader
              title={t('service.pickStaffTitle')}
              trailing={staffCount > 0 ? t('service.peopleCount', { count: staffCount }) : undefined}
            />
            {staffCount === 0 ? (
              <Surface className="flex-row items-center gap-2 p-3">
                <Ionicons name="information-circle-outline" size={14} color={colors.mutedForeground} />
                <T className="flex-1 font-lao text-muted-foreground">{t('staff.empty')}</T>
              </Surface>
            ) : (
              <StaffPicker
                staff={s.staff}
                selectedId={staffPick?.id ?? null}
                onSelect={setStaffPick}
              />
            )}
          </Section>

          {/* process */}
          {s.steps.length > 0 ? (
            <Section index={3}>
              <SectionHeader
                title={t('service.process')}
                trailing={t('service.stepCount', { count: s.steps.length })}
              />
              <ProcessTimeline steps={s.steps} />
            </Section>
          ) : null}

          {/* reviews */}
          <Section
            index={4}
            onLayout={(e) => {
              reviewsY.current = e.nativeEvent.layout.y;
            }}
          >
            <SectionHeader
              title={t('service.reviewsTitle')}
              action={
                s.reviews.length > REVIEWS_PREVIEW
                  ? allReviews
                    ? t('service.showFewer')
                    : t('service.showAllReviews')
                  : undefined
              }
              onAction={() => setAllReviews((v) => !v)}
            />
            {hasReviews ? (
              <View className="gap-2">
                <RatingSummary rating={s.rating} count={s.reviewCount} breakdown={s.ratingBreakdown} />
                {shownReviews.map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}
              </View>
            ) : (
              <Surface className="flex-row items-center gap-2 p-3">
                <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.mutedForeground} />
                <T className="flex-1 font-lao text-muted-foreground">{t('service.noReviews')}</T>
              </Surface>
            )}
          </Section>

          {/* packages */}
          {s.packages.length > 0 ? (
            <Section index={5}>
              <SectionHeader
                title={t('service.packagesTitle')}
                action={t('common.seeAll')}
                onAction={() => navigation.navigate('Packages', { serviceId: s.id })}
              />
              <Surface className="px-3 py-0.5">
                {s.packages.map((p, i) => (
                  <View key={p.id} className={i > 0 ? 'border-t border-border' : undefined}>
                    <PackageRow
                      pkg={p}
                      onPress={() => navigation.navigate('PackageDetail', { packageId: p.id })}
                    />
                  </View>
                ))}
              </Surface>
              <T className="mt-1.5 px-1 font-lao text-muted-foreground" style={SMALL}>
                {t('service.packageHint')}
              </T>
            </Section>
          ) : null}

          {/* location */}
          <Section index={6}>
            <SectionHeader title={t('service.locationTitle')} />
            <LocationCard
              branch={s.branch}
              fallbackName={DEFAULT_BRANCH_NAME}
              fallbackAddress={DEFAULT_BRANCH_ADDRESS}
              amenities={s.amenities}
            />
          </Section>

          {/* good to know */}
          <Section index={7}>
            <SectionHeader title={t('service.goodToKnowTitle')} />
            <TipList tips={tips} />
          </Section>

          {/* related */}
          {s.related.length > 0 ? (
            <Section index={8}>
              <SectionHeader title={t('service.relatedTitle')} />
              <RelatedRail
                items={s.related}
                onOpen={(id) => navigation.push('ServiceDetail', { serviceId: id })}
              />
            </Section>
          ) : null}
        </View>
      </Animated.ScrollView>

      {/* ── floating hero controls ───────────────────────────── */}
      <Animated.View
        pointerEvents="box-none"
        className="absolute inset-x-4 flex-row items-center justify-between"
        style={{ top: insets.top + 6, opacity: floatOpacity }}
      >
        <RoundBtn icon="chevron-back" label={t('common.back')} onPress={() => navigation.goBack()} />
        <View className="flex-row gap-2">
          <RoundBtn icon="share-outline" label={t('service.share')} onPress={onShare} />
          <RoundBtn
            icon={isFavorite ? 'heart' : 'heart-outline'}
            label={isFavorite ? t('search.saved') : t('search.save')}
            onPress={onToggleFavorite}
            active={isFavorite}
          />
        </View>
      </Animated.View>

      {/* ── sticky glass header ──────────────────────────────── */}
      <Animated.View
        pointerEvents="box-none"
        className="absolute inset-x-0 top-0"
        style={{ opacity: headerOpacity }}
      >
        <GlassView style={[glassBorder.bottom, { paddingTop: insets.top + 4 }]}>
          <View className="h-12 flex-row items-center gap-2.5 px-4">
            <RoundBtn
              icon="chevron-back"
              label={t('common.back')}
              onPress={() => navigation.goBack()}
              variant="plain"
            />
            <T numberOfLines={1} className="flex-1 font-lao-medium text-foreground">
              {s.name}
            </T>
            <RoundBtn
              icon={isFavorite ? 'heart' : 'heart-outline'}
              label={isFavorite ? t('search.saved') : t('search.save')}
              onPress={onToggleFavorite}
              active={isFavorite}
              variant="plain"
            />
          </View>
        </GlassView>
      </Animated.View>

      {/* ── sticky CTA ───────────────────────────────────────── */}
      <GlassView
        style={[
          glassBorder.top,
          { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <View className="flex-row items-center gap-3 px-4 pt-2.5">
          <View className="min-w-0 flex-1 gap-0.5">
            <View className="flex-row items-baseline gap-1.5">
              <T className="font-sans-semibold text-foreground" style={EMPH}>
                {formatLAK(s.price)}
              </T>
              {discount > 0 && s.compareAtPrice ? (
                <T className="font-sans text-muted-foreground line-through" style={SMALL}>
                  {formatLAK(s.compareAtPrice)}
                </T>
              ) : null}
            </View>
            {credit ? (
              <Touchable onPress={() => onBook(false)} haptic="none" hitSlop={8} accessibilityRole="button">
                <T numberOfLines={1} className="font-lao-medium text-primary underline" style={SMALL}>
                  {t('packages.payNormally')}
                </T>
              </Touchable>
            ) : staffPick ? (
              <View className="flex-row items-center gap-1">
                <Avatar uri={staffPick.avatarUrl} name={staffPick.name} size={14} mode="cartoon" />
                <T numberOfLines={1} className="shrink font-lao-medium text-primary" style={SMALL}>
                  {t('service.bookingWith', { name: staffPick.name })}
                </T>
              </View>
            ) : deposit ? (
              <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
                {t('service.depositAmount', { amount: formatLAK(deposit) })}
              </T>
            ) : (
              <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
                {t('common.minutesShort', { count: s.durationMinutes })} · {t('service.noDeposit')}
              </T>
            )}
          </View>
          <View className="w-[46%]">
            <Button
              label={credit ? t('packages.useSession') : t('service.bookCta')}
              size="sm"
              icon={credit ? 'gift-outline' : 'calendar-outline'}
              labelClassName="text-[12px]"
              onPress={() => onBook(Boolean(credit))}
              disabled={staffCount === 0}
            />
          </View>
        </View>
      </GlassView>
    </View>
  );
}
