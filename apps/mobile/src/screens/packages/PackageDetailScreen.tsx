import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Image, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorView } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Button } from '../../components/ui/Button';
import { GlassView, glassBorder } from '../../components/ui/GlassView';
import { Gradient } from '../../components/ui/Gradient';
import { Skeleton } from '../../components/ui/Skeleton';
import { DEFAULT_BRANCH_NAME } from '../../config/env';
import { Notice, SMALL, SectionHeader, T, TOTAL } from '../../features/booking/booking-kit';
import { useMyPackages, usePackage, usePurchasePackage } from '../../features/packages/packages.api';
import {
  BulletList,
  DiscountBadge,
  FactRow,
  IncludedList,
  RoundBtn,
  StepList,
  ValueBreakdown,
  useValidityLabel,
} from '../../features/packages/packages.parts';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { formatLAK } from '../../lib/format';
import type { AppScreenProps } from '../../navigation/types';
import { normalizeError } from '../../services/apiError';
import { colors } from '../../theme';

const HERO_H = 252;

/** Section ມາດຕະຖານ — ຫົວຂໍ້ນອກບັດ + ເນື້ອໃນ + entrance. */
function Section({
  index,
  title,
  hint,
  children,
}: {
  index: number;
  title?: string;
  hint?: string | null;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <AnimatedEntrance index={index} style={{ marginTop: 20 }}>
      <View className="gap-2">
        {title ? <SectionHeader title={title} hint={hint} /> : null}
        {children}
      </View>
    </AnimatedEntrance>
  );
}

function DetailSkeleton(): React.JSX.Element {
  return (
    <View className="flex-1 bg-background">
      <View style={{ height: HERO_H }} className="bg-muted" />
      <View className="-mt-5 gap-3 rounded-t-3xl bg-background px-4 pt-5">
        <Skeleton className="h-3.5 w-2/3 rounded-full" />
        <Skeleton className="h-2.5 w-1/3 rounded-full" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </View>
    </View>
  );
}

/**
 * ລາຍລະອຽດແພັກເກັດ — hero ຮູບ (parallax) + header ແກ້ວທີ່ຄ່ອຍໆ ປາກົດຕອນເລື່ອນ,
 * ແລ້ວຕາມດ້ວຍ: ຄຸ້ມແນວໃດ (ທຽບລາຄາ) → ບໍລິການທີ່ລວມ → ຂັ້ນຕອນໃຊ້ → ເງື່ອນໄຂ.
 * CTA ຕິດລຸ່ມສະເໝີ ພ້ອມລາຄາ ແລະ ຄຳໃບ້ຈ່າຍເງິນສົດທີ່ຮ້ານ.
 */
export function PackageDetailScreen({
  navigation,
  route,
}: AppScreenProps<'PackageDetail'>): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const validity = useValidityLabel();
  const { packageId } = route.params;

  const pkg = usePackage(packageId);
  const mine = useMyPackages();
  const purchase = usePurchasePackage();
  const [error, setError] = useState<string | null>(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
  });

  if (pkg.isLoading) return <DetailSkeleton />;
  if (pkg.isError || !pkg.data) {
    return <ErrorView message={t('errors.generic')} onRetry={() => pkg.refetch()} />;
  }

  const p = pkg.data;
  const pending = (mine.data ?? []).find(
    (u) => u.packageId === p.id && u.status === 'PENDING_PAYMENT',
  );
  const mineActive = (mine.data ?? []).find(
    (u) => u.packageId === p.id && u.status === 'ACTIVE' && !u.expired,
  );

  const fade = HERO_H - insets.top - 96;
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

  const onBuy = (): void => {
    setError(null);
    purchase.mutate(p.id, {
      onSuccess: (r) =>
        navigation.navigate('PackageCheckout', {
          paymentId: r.paymentId,
          amount: r.amount,
          packageName: r.packageName,
        }),
      onError: (e) => setError(normalizeError(e).message),
    });
  };

  const onShare = (): void => {
    void Share.share({ message: `${p.name} — ${formatLAK(p.totalPrice)}` });
  };

  return (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 104 }}
      >
        {/* ── hero ─────────────────────────────────────────────── */}
        <View className="w-full overflow-hidden bg-muted" style={{ height: HERO_H }}>
          <Animated.View style={{ flex: 1, transform: heroTransform }}>
            {p.imageUrl ? (
              <Image
                source={{ uri: p.imageUrl }}
                className="h-full w-full"
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View className="h-full w-full items-center justify-center">
                <Gradient preset="hero" fill pointerEvents="none" />
                <Ionicons name="gift" size={44} color="rgba(255,255,255,0.75)" />
              </View>
            )}
          </Animated.View>
          <Gradient
            preset="imageScrim"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: HERO_H * 0.6 }}
            pointerEvents="none"
          />

          <View className="absolute bottom-8 left-4 right-4 flex-row items-end justify-between gap-2">
            <View className="flex-row items-center gap-1.5">
              {p.savingsPct > 0 ? <DiscountBadge pct={p.savingsPct} /> : null}
              {p.activeHolders > 0 ? (
                <View className="flex-row items-center gap-1 rounded-full bg-card/95 px-2 py-0.5">
                  <Ionicons name="people" size={10} color={colors.primaryStrong} />
                  <T className="font-lao-medium text-primary-strong" style={SMALL}>
                    {t('packages.holders', { count: p.activeHolders })}
                  </T>
                </View>
              ) : null}
            </View>
            {!p.isActive ? (
              <View className="rounded-full bg-card/95 px-2 py-0.5">
                <T className="font-lao-medium text-muted-foreground" style={SMALL}>
                  {t('packages.closedForSale')}
                </T>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── content sheet ────────────────────────────────────── */}
        <View className="-mt-5 rounded-t-3xl bg-background px-4 pt-5">
          <AnimatedEntrance index={0}>
            <View className="gap-1.5">
              <View className="flex-row items-center gap-1.5">
                <View className="rounded-md bg-primary-subtle px-2 py-0.5">
                  <T className="font-lao-medium text-primary-strong" style={SMALL}>
                    {t('packages.sessions', { count: p.totalSessions })}
                  </T>
                </View>
                <T className="font-lao text-muted-foreground" style={SMALL}>
                  {DEFAULT_BRANCH_NAME}
                </T>
              </View>

              <T accessibilityRole="header" className="font-lao-serif text-foreground" style={TOTAL}>
                {p.name}
              </T>

              {p.description ? (
                <T className="font-lao text-muted-foreground">{p.description}</T>
              ) : null}
            </View>
          </AnimatedEntrance>

          {/* ຂໍ້ມູນຫຼັກ */}
          <AnimatedEntrance index={1} style={{ marginTop: 14 }}>
            <View className="rounded-2xl border border-border bg-card p-3">
              <FactRow
                items={[
                  {
                    icon: 'layers-outline',
                    label: t('packages.sessionsLabel'),
                    value: String(p.totalSessions),
                  },
                  {
                    icon: 'hourglass-outline',
                    label: t('packages.validityLabel'),
                    value: validity(p.validityDays),
                  },
                  {
                    icon: 'pricetag-outline',
                    label: t('packages.perSession'),
                    value: formatLAK(p.perSessionPrice),
                  },
                ]}
              />
            </View>
          </AnimatedEntrance>

          {mineActive ? (
            <Section index={2}>
              <Notice
                tone="success"
                icon="checkmark-circle-outline"
                title={t('packages.alreadyOwnTitle')}
                body={t('packages.alreadyOwnBody', { count: mineActive.remainingSessions })}
              />
            </Section>
          ) : null}

          {pending ? (
            <Section index={2}>
              <Notice tone="warning" icon="time-outline" body={t('packages.pendingNotice')} />
            </Section>
          ) : null}

          {p.savings > 0 ? (
            <Section index={3} title={t('packages.valueTitle')} hint={t('packages.savePct', { pct: p.savingsPct })}>
              <ValueBreakdown pkg={p} />
            </Section>
          ) : null}

          <Section
            index={4}
            title={t('packages.includedTitle')}
            hint={t('packages.includedHint', { count: p.items.length, sessions: p.totalSessions })}
          >
            <IncludedList items={p.items} />
          </Section>

          <Section index={5} title={t('packages.howTitle')}>
            <StepList
              steps={[
                { icon: 'card-outline', title: t('packages.howBuyTitle'), body: t('packages.howBuy') },
                {
                  icon: 'checkmark-circle-outline',
                  title: t('packages.howActivateTitle'),
                  body: t('packages.howActivate'),
                },
                { icon: 'calendar-outline', title: t('packages.howBookTitle'), body: t('packages.howBook') },
              ]}
            />
          </Section>

          <Section index={6} title={t('packages.policyTitle')}>
            <BulletList
              items={[
                {
                  icon: 'hourglass-outline',
                  text: t('packages.terms', { validity: validity(p.validityDays) }),
                },
                { icon: 'person-outline', text: t('packages.policyOwner') },
                { icon: 'calendar-clear-outline', text: t('packages.policyCancel') },
                { icon: 'business-outline', text: t('packages.policyBranch', { branch: DEFAULT_BRANCH_NAME }) },
                { icon: 'card-outline', text: t('packages.policyRefund') },
              ]}
            />
          </Section>
        </View>
      </Animated.ScrollView>

      {/* ── floating hero controls ─────────────────────────────── */}
      <Animated.View
        pointerEvents="box-none"
        className="absolute inset-x-4 flex-row items-center justify-between"
        style={{ top: insets.top + 6, opacity: floatOpacity }}
      >
        <RoundBtn icon="chevron-back" label={t('common.back')} onPress={() => navigation.goBack()} />
        <RoundBtn icon="share-outline" label={t('service.share')} onPress={onShare} />
      </Animated.View>

      {/* ── sticky glass header ────────────────────────────────── */}
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
            <T numberOfLines={1} className="flex-1 font-lao-semibold text-foreground">
              {p.name}
            </T>
            <RoundBtn
              icon="share-outline"
              label={t('service.share')}
              onPress={onShare}
              variant="plain"
            />
          </View>
        </GlassView>
      </Animated.View>

      {/* ── sticky CTA ─────────────────────────────────────────── */}
      <GlassView
        style={[
          glassBorder.top,
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View className="gap-1.5 px-4 pt-2.5">
          {error ? (
            <T accessibilityRole="alert" className="text-center font-lao text-destructive" style={SMALL}>
              {error}
            </T>
          ) : null}

          <View className="flex-row items-center gap-3">
            <View className="min-w-0 flex-1">
              <View className="flex-row items-baseline gap-1.5">
                <T className="font-sans-semibold text-foreground" style={TOTAL}>
                  {formatLAK(p.totalPrice)}
                </T>
                {p.savings > 0 ? (
                  <T className="font-sans text-muted-foreground line-through" style={SMALL}>
                    {formatLAK(p.valuePrice)}
                  </T>
                ) : null}
              </View>
              <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
                {t('packages.perSessionShort', { amount: formatLAK(p.perSessionPrice) })}
              </T>
            </View>
            <View className="w-[52%]">
              <Button
                label={
                  !p.isActive
                    ? t('packages.closedForSale')
                    : pending
                      ? t('packages.continuePay')
                      : t('packages.buyCta')
                }
                size="sm"
                icon={pending ? 'arrow-forward' : 'bag-check-outline'}
                labelClassName="text-[12px]"
                loading={purchase.isPending}
                disabled={!p.isActive}
                onPress={onBuy}
              />
            </View>
          </View>

          <View className="flex-row items-center justify-center gap-1">
            <Ionicons name="shield-checkmark-outline" size={10} color={colors.mutedForeground} />
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {t('packages.payAtStoreHint')}
            </T>
          </View>
        </View>
      </GlassView>
    </View>
  );
}
