import type { AppointmentListItem, PromotionView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Avatar } from '../../components/ui/Avatar';
import { GlassView } from '../../components/ui/GlassView';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { DEFAULT_BRANCH_ID } from '../../config/env';
import { useMyAppointments } from '../../features/appointments/appointments.api';
import { useAuth } from '../../features/auth/useAuth';
import { useCategories, useServices } from '../../features/catalog/catalog.api';
import { CategoryTile } from '../../features/catalog/CategoryTile';
import {
  BookAgainRow,
  greetingKey,
  HeaderIconButton,
  LoyaltyCard,
  NextAppointmentPass,
  NoAppointmentCard,
  QuickActions,
  RAIL_CARD_WIDTH,
  RailServiceCard,
  ReferralBanner,
  SectionHeader,
  T,
} from '../../features/home/home.parts';
import { PromoCarousel } from '../../features/home/PromoCarousel';
import { QuickBookSheet } from '../../features/home/QuickBookSheet';
import { useMyLoyalty } from '../../features/loyalty/loyalty.api';
import { useDirectConversations } from '../../features/messaging/messaging.api';
import { useUnreadNotificationCount } from '../../features/notifications/notifications.api';
import { usePromotions } from '../../features/promotions/promotions.api';
import { useMyReferral } from '../../features/referral/referral.api';
import { colors, shadow } from '../../theme';
import type { TabScreenProps } from '../../navigation/types';

const RAIL_GAP = 12;

/** ບໍລິການທີ່ເຄີຍໃຊ້ (COMPLETED) — ບໍ່ຊ້ຳ serviceId, ລ່າສຸດກ່ອນ. */
function pastServices(items: AppointmentListItem[], limit = 6): AppointmentListItem[] {
  const seen = new Set<string>();
  const out: AppointmentListItem[] = [];
  for (const a of items) {
    if (a.status !== 'COMPLETED' || seen.has(a.serviceId)) continue;
    seen.add(a.serviceId);
    out.push(a);
    if (out.length === limit) break;
  }
  return out;
}

export function HomeScreen({ navigation }: TabScreenProps<'HomeTab'>): React.JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();
  const categories = useCategories();
  const popular = useServices({ branchId: DEFAULT_BRANCH_ID, popular: true });
  const upcoming = useMyAppointments('upcoming');
  const history = useMyAppointments('history');
  const loyalty = useMyLoyalty();
  const referral = useMyReferral();
  const conversations = useDirectConversations();
  const unreadNotifications = useUnreadNotificationCount();
  const promotions = usePromotions(DEFAULT_BRANCH_ID);
  const [refreshing, setRefreshing] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [quickBookOpen, setQuickBookOpen] = useState(false);

  const categoryItems = categories.data ?? [];
  const popularItems = popular.data?.pages.flatMap((p) => p.items).slice(0, 8) ?? [];
  const upcomingItems = upcoming.data?.pages.flatMap((p) => p.items) ?? [];
  const nextAppt = upcomingItems[0];
  const upcomingTotal = upcoming.data?.pages[0]?.total ?? upcomingItems.length;
  const againItems = useMemo(
    () => pastServices(history.data?.pages.flatMap((p) => p.items) ?? []),
    [history.data],
  );
  const unread = (conversations.data ?? []).reduce((sum, c) => sum + c.unreadCount, 0);
  const name = user?.name ?? t('home.guest');

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await Promise.allSettled([
      categories.refetch(),
      popular.refetch(),
      upcoming.refetch(),
      history.refetch(),
      loyalty.refetch(),
      referral.refetch(),
      conversations.refetch(),
      unreadNotifications.refetch(),
      promotions.refetch(),
    ]);
    setRefreshing(false);
  };

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 4);
  }, []);

  const openSearch = (): void => navigation.navigate('ServiceList', {});
  const openQuickBook = (): void => setQuickBookOpen(true);
  const openPromotion = (p: PromotionView): void => {
    if (p.serviceId) navigation.navigate('ServiceDetail', { serviceId: p.serviceId });
    else openQuickBook();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* locked header — avatar + greeting · messages */}
      <GlassView
        intensity={28}
        sheen
        style={[
          {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: scrolled ? colors.border : 'transparent',
          },
          scrolled ? shadow.xs : null,
        ]}
      >
        <View className="flex-row items-center gap-3 px-5 pb-3 pt-1">
          <Touchable
            onPress={() => navigation.navigate('ProfileTab')}
            pressScale={0.94}
            accessibilityRole="button"
            accessibilityLabel={name}
            className="rounded-full border-2 border-card"
            style={shadow.xs}
          >
            <Avatar name={name} size={40} mode="cartoon" />
          </Touchable>
          <View className="flex-1">
            <T numberOfLines={1} className="font-lao text-muted-foreground">
              {t(greetingKey())}
            </T>
            <T numberOfLines={1} className="font-lao-semibold text-foreground">
              {name}
            </T>
          </View>
          <View className="flex-row items-center gap-2">
            <HeaderIconButton
              icon="chatbubbles-outline"
              label={t('home.messages')}
              badge={unread}
              onPress={() => navigation.navigate('DirectMessages')}
            />
            <HeaderIconButton
              icon="notifications-outline"
              label={t('home.notifications')}
              badge={unreadNotifications.data ?? 0}
              onPress={() => navigation.navigate('Notifications')}
            />
          </View>
        </View>
      </GlassView>

      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* search */}
        <AnimatedEntrance index={0} style={{ paddingHorizontal: 20 }}>
          <Touchable
            onPress={openSearch}
            haptic="none"
            pressScale={0.99}
            accessibilityRole="search"
            accessibilityLabel={t('home.searchPlaceholder')}
            className="h-11 flex-row items-center gap-2.5 rounded-2xl border border-border bg-card pl-3.5 pr-1.5"
            style={shadow.xs}
          >
            <Ionicons name="search" size={16} color={colors.mutedForeground} />
            <T numberOfLines={1} className="flex-1 font-lao text-muted-foreground">
              {t('home.searchPlaceholder')}
            </T>
            <View className="h-8 w-8 items-center justify-center rounded-xl bg-primary-subtle">
              <Ionicons name="options-outline" size={15} color={colors.primary} />
            </View>
          </Touchable>
        </AnimatedEntrance>

        {/* next appointment */}
        <AnimatedEntrance index={1} style={{ paddingHorizontal: 20, marginTop: 16 }}>
          {upcoming.isLoading ? (
            <Skeleton className="h-[212px] rounded-3xl" />
          ) : nextAppt ? (
            <NextAppointmentPass
              appt={nextAppt}
              moreCount={Math.max(0, upcomingTotal - 1)}
              onOpen={() => navigation.navigate('AppointmentDetail', { id: nextAppt.id })}
              onCheckIn={() => navigation.navigate('CheckIn', { appointmentId: nextAppt.id })}
              onChat={() => navigation.navigate('Chat', { appointmentId: nextAppt.id })}
              onTrack={() =>
                navigation.navigate('HomeServiceTracking', { appointmentId: nextAppt.id })
              }
            />
          ) : (
            <NoAppointmentCard onBook={openQuickBook} />
          )}
        </AnimatedEntrance>

        {/* quick actions */}
        <AnimatedEntrance index={2} style={{ marginTop: 16 }}>
          <QuickActions
            items={[
              {
                key: 'book',
                icon: 'calendar-outline',
                label: t('home.quickBook'),
                tone: 'primary',
                onPress: openQuickBook,
              },
              {
                key: 'appts',
                icon: 'receipt-outline',
                label: t('home.quickAppointments'),
                tone: 'info',
                onPress: () => navigation.navigate('AppointmentsTab'),
              },
              {
                key: 'gift',
                icon: 'gift-outline',
                label: t('home.quickGift'),
                tone: 'accent',
                onPress: () => navigation.navigate('GiftCards'),
              },
              {
                key: 'skin',
                icon: 'scan-outline',
                label: t('home.quickSkin'),
                tone: 'success',
                onPress: () => navigation.navigate('SkinAnalysis'),
              },
            ]}
          />
        </AnimatedEntrance>

        {/* loyalty */}
        <AnimatedEntrance index={3} style={{ marginTop: 12 }}>
          <LoyaltyCard
            data={loyalty.data}
            loading={loyalty.isLoading}
            onPress={() => navigation.navigate('Loyalty')}
          />
        </AnimatedEntrance>

        {/* promotions — ຂໍ້ມູນຈິງຈາກ pricing engine */}
        {promotions.isLoading || (promotions.data?.length ?? 0) > 0 ? (
          <View className="mt-7">
            <SectionHeader title={t('home.promoSection')} hint={t('home.promoSectionHint')} />
            <PromoCarousel
              items={promotions.data ?? []}
              loading={promotions.isLoading}
              onOpen={openPromotion}
            />
          </View>
        ) : null}

        {/* categories — horizontal rail */}
        <View className="mt-7">
          <SectionHeader
            title={t('home.categories')}
            actionLabel={categoryItems.length > 0 ? t('category.all') : undefined}
            onAction={categoryItems.length > 0 ? openSearch : undefined}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          >
            {categories.isLoading
              ? [0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-[88px] w-[72px] rounded-2xl" />
                ))
              : categoryItems.map((c, i) => (
                  <AnimatedEntrance key={c.id} index={i} style={{ width: 72 }}>
                    <CategoryTile
                      category={c}
                      onPress={() => navigation.navigate('ServiceList', { categoryId: c.id })}
                    />
                  </AnimatedEntrance>
                ))}
          </ScrollView>
        </View>

        {/* book again */}
        {againItems.length > 0 ? (
          <View className="mt-7">
            <SectionHeader title={t('home.bookAgain')} hint={t('home.bookAgainHint')} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 2 }}
            >
              {againItems.map((a, i) => (
                <AnimatedEntrance key={a.id} index={i}>
                  <BookAgainRow
                    appt={a}
                    onPress={() => navigation.navigate('ServiceDetail', { serviceId: a.serviceId })}
                  />
                </AnimatedEntrance>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* popular — horizontal snap rail */}
        <View className="mt-7">
          <SectionHeader
            title={t('home.popular')}
            hint={t('home.popularHint')}
            actionLabel={t('common.seeAll')}
            onAction={openSearch}
          />
          {popular.isError ? (
            <Touchable
              onPress={() => void popular.refetch()}
              className="mx-5 flex-row items-center justify-center gap-1.5 rounded-2xl border border-border bg-card py-4"
            >
              <Ionicons name="refresh" size={14} color={colors.primary} />
              <T className="font-lao-medium text-primary">{t('common.loadError')}</T>
            </Touchable>
          ) : !popular.isLoading && popularItems.length === 0 ? (
            <View className="mx-5 items-center rounded-2xl border border-dashed border-border py-6">
              <Ionicons name="sparkles-outline" size={20} color={colors.mutedForeground} />
              <T className="mt-1 font-lao text-muted-foreground">{t('service.empty')}</T>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={RAIL_CARD_WIDTH + RAIL_GAP}
              contentContainerStyle={{ paddingHorizontal: 20, gap: RAIL_GAP, paddingBottom: 8 }}
            >
              {popular.isLoading
                ? [0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-[250px] w-[164px] rounded-2xl" />
                  ))
                : popularItems.map((s, i) => (
                    <AnimatedEntrance key={s.id} index={i}>
                      <RailServiceCard
                        service={s}
                        onPress={() => navigation.navigate('ServiceDetail', { serviceId: s.id })}
                      />
                    </AnimatedEntrance>
                  ))}
            </ScrollView>
          )}
        </View>

        {/* referral */}
        {referral.data ? (
          <AnimatedEntrance index={5} style={{ marginTop: 12 }}>
            <ReferralBanner data={referral.data} onPress={() => navigation.navigate('Referral')} />
          </AnimatedEntrance>
        ) : null}
      </ScrollView>

      <QuickBookSheet
        open={quickBookOpen}
        onClose={() => setQuickBookOpen(false)}
        onPicked={() => navigation.navigate('WizardService')}
        onBrowseAll={openSearch}
      />
    </SafeAreaView>
  );
}
