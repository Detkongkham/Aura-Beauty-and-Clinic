import type { ServiceListItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorView } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { GlassView } from '../../components/ui/GlassView';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { DEFAULT_BRANCH_ID } from '../../config/env';
import {
  useCategories,
  useSavedServices,
  useServices,
} from '../../features/catalog/catalog.api';
import { categoryIcon } from '../../features/catalog/CategoryTile';
import {
  DEFAULT_FILTERS,
  pricePresetToRange,
  type SearchFilterValue,
  SearchFilterSheet,
  usePriceLabel,
  useSortLabel,
} from '../../features/catalog/SearchFilterSheet';
import { SearchLanding } from '../../features/catalog/SearchLanding';
import {
  type ActiveFilter,
  ActiveFilterBar,
  GridCardSkeleton,
  NoResults,
  ResultCardSkeleton,
  ResultMetaRow,
  ScrollTopFab,
  SearchField,
} from '../../features/catalog/search.parts';
import { ServiceGridCard, ServiceResultCard } from '../../features/catalog/ServiceResultCard';
import { useDebounced } from '../../hooks/useDebounced';
import { cn } from '../../lib/cn';
import type { AppScreenProps } from '../../navigation/types';
import { useBookingDraft } from '../../store/booking-draft.store';
import { useSearchStore } from '../../store/search.store';
import { colors, shadow } from '../../theme';

const PAGE_SIZE = 12;

/** ຂໍ້ຄວາມ catalog = 12px ຄົງທີ່ (typography-appointments.md). className ຄຸມ weight/ສີ ເທົ່ານັ້ນ. */
function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}
const SMALL = { fontSize: 10, lineHeight: 14 } as const;

/** ຊິບໝວດໝູ່ — h-8, active = ພື້ນ primary ທຶບ, idle = card ຂອບບາງ. ໄອຄອນ/ຮູບ + ຊື່ + ຈຳນວນ. */
function CategoryPill({
  label,
  count,
  active,
  imageUrl,
  icon,
  onPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  imageUrl?: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.95}
      haptic="select"
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={count != null ? `${label} (${count})` : label}
      className={cn(
        'h-8 flex-row items-center gap-1.5 rounded-full pl-1 pr-3',
        active ? 'bg-primary' : 'border border-border bg-card',
      )}
      style={active ? shadow.primary : undefined}
    >
      <View
        className={cn(
          'h-6 w-6 items-center justify-center overflow-hidden rounded-full',
          active ? 'bg-white/20' : 'bg-primary-subtle',
        )}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} className="h-full w-full" />
        ) : (
          <Ionicons name={icon} size={12} color={active ? colors.primaryForeground : colors.primary} />
        )}
      </View>
      <T
        numberOfLines={1}
        className={cn('font-lao-medium', active ? 'text-primary-foreground' : 'text-foreground')}
      >
        {label}
      </T>
      {count != null ? (
        <T
          className={cn('font-sans', active ? 'text-white/80' : 'text-muted-foreground')}
          style={SMALL}
        >
          {count}
        </T>
      ) : null}
    </Touchable>
  );
}

export function ServiceListScreen({
  navigation,
  route,
}: AppScreenProps<'ServiceList'>): React.JSX.Element {
  const { t } = useTranslation();
  const sortLabel = useSortLabel();
  const priceLabel = usePriceLabel();

  const categories = useCategories();
  const startDraft = useBookingDraft((s) => s.start);
  const recent = useSearchStore((s) => s.recent);
  const favorites = useSearchStore((s) => s.favorites);
  const layout = useSearchStore((s) => s.resultLayout);
  const setLayout = useSearchStore((s) => s.setResultLayout);
  const addRecent = useSearchStore((s) => s.addRecent);
  const removeRecent = useSearchStore((s) => s.removeRecent);
  const clearRecent = useSearchStore((s) => s.clearRecent);
  const toggleFavorite = useSearchStore((s) => s.toggleFavorite);

  const [rawSearch, setRawSearch] = useState(route.params?.q ?? '');
  const search = useDebounced(rawSearch, 350);
  const [filters, setFilters] = useState<SearchFilterValue>({
    ...DEFAULT_FILTERS,
    categoryId: route.params?.categoryId,
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showFab, setShowFab] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlatList<ServiceListItem>>(null);

  const queryFilters = useMemo(() => {
    const trimmed = search.trim();
    return {
      branchId: DEFAULT_BRANCH_ID,
      categoryId: filters.categoryId,
      q: trimmed ? trimmed : undefined,
      sort: filters.sort,
      durationMax: filters.durationMax,
      requireDeposit: filters.depositOnly ? true : undefined,
      ...pricePresetToRange(filters.price),
    };
  }, [search, filters]);

  const isLanding =
    !search.trim() &&
    !filters.categoryId &&
    filters.price === 'any' &&
    filters.durationMax === undefined &&
    !filters.depositOnly;

  const services = useServices(queryFilters);
  const items = services.data?.pages.flatMap((p) => p.items) ?? [];
  const total = services.data?.pages[0]?.total ?? items.length;

  // landing rails
  const popular = useServices({ branchId: DEFAULT_BRANCH_ID, sort: 'popular' });
  const popularItems = (popular.data?.pages[0]?.items ?? []).slice(0, 8);
  const saved = useSavedServices(favorites, DEFAULT_BRANCH_ID);

  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const af: ActiveFilter[] = [];
    if (filters.price !== 'any') {
      af.push({
        key: 'price',
        label: priceLabel(filters.price),
        onRemove: () => setFilters((d) => ({ ...d, price: 'any' })),
      });
    }
    if (filters.durationMax) {
      af.push({
        key: 'dur',
        label: t('search.durationUnder', { count: filters.durationMax }),
        onRemove: () => setFilters((d) => ({ ...d, durationMax: undefined })),
      });
    }
    if (filters.depositOnly) {
      af.push({
        key: 'dep',
        label: t('search.depositOnly'),
        onRemove: () => setFilters((d) => ({ ...d, depositOnly: false })),
      });
    }
    if (filters.sort !== 'name') {
      af.push({
        key: 'sort',
        label: sortLabel(filters.sort),
        onRemove: () => setFilters((d) => ({ ...d, sort: 'name' })),
      });
    }
    return af;
  }, [filters, t, priceLabel, sortLabel]);

  /** ຈຳນວນຕົວກັ່ນຕອງໃນ sheet (ລວມໝວດ) — ສະແດງເທິງປຸ່ມ filter. */
  const filterCount = activeFilters.length + (filters.categoryId ? 1 : 0);

  const clearAllFilters = useCallback(() => setFilters({ ...DEFAULT_FILTERS }), []);

  const onSubmitSearch = useCallback(() => {
    addRecent(rawSearch);
    Keyboard.dismiss();
  }, [addRecent, rawSearch]);

  const openService = useCallback(
    (id: string) => navigation.navigate('ServiceDetail', { serviceId: id }),
    [navigation],
  );

  const quickBook = useCallback(
    (item: ServiceListItem) => {
      startDraft({
        mode: 'create',
        branchId: DEFAULT_BRANCH_ID,
        serviceId: item.id,
        serviceName: item.name,
        serviceSubtitle: item.description,
        serviceImageUrl: item.imageUrl,
        price: item.price,
        compareAtPrice: item.compareAtPrice,
        depositAmount: item.requireDeposit ? item.depositAmount : null,
        durationMinutes: item.durationMinutes,
      });
      navigation.navigate('WizardService');
    },
    [navigation, startDraft],
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const s = y > 4;
    const f = y > 600;
    setScrolled((p) => (p === s ? p : s));
    setShowFab((p) => (p === f ? p : f));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await services.refetch();
    setRefreshing(false);
  }, [services]);

  const categoryTabs = [
    {
      id: undefined as string | undefined,
      name: t('category.all'),
      imageUrl: null as string | null,
      serviceCount: undefined as number | undefined,
    },
    ...(categories.data ?? []),
  ];

  const isGrid = layout === 'grid';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* ── sticky glass header ─────────────────────────────── */}
      <GlassView
        intensity={24}
        style={[
          {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: scrolled ? colors.border : 'transparent',
          },
          scrolled ? shadow.xs : null,
        ]}
      >
        <View className="px-4 pb-2.5 pt-1.5">
          <View className="flex-row items-center gap-2">
            <Touchable
              onPress={() => navigation.goBack()}
              pressScale={0.9}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              className="h-11 w-9 items-center justify-center"
            >
              <Ionicons name="chevron-back" size={22} color={colors.foreground} />
            </Touchable>

            <View className="flex-1">
              <SearchField
                value={rawSearch}
                onChangeText={setRawSearch}
                onSubmit={onSubmitSearch}
                onClear={() => setRawSearch('')}
                focused={fieldFocused}
                onFocusChange={setFieldFocused}
                autoFocus={!route.params?.categoryId && !route.params?.q}
              />
            </View>

            <Touchable
              onPress={() => setSheetOpen(true)}
              pressScale={0.9}
              accessibilityRole="button"
              accessibilityLabel={
                filterCount > 0
                  ? `${t('search.filters')}, ${t('search.filtersApplied', { count: filterCount })}`
                  : t('search.filters')
              }
              className={cn(
                'h-11 w-11 items-center justify-center rounded-xl border',
                filterCount > 0 ? 'border-primary bg-primary-subtle' : 'border-border bg-card',
              )}
              style={shadow.xs}
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={filterCount > 0 ? colors.primary : colors.foreground}
              />
              {filterCount > 0 ? (
                <View className="absolute -right-1 -top-1 h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-background bg-primary px-0.5">
                  <T className="font-sans-semibold text-primary-foreground" style={{ fontSize: 9, lineHeight: 11 }}>
                    {filterCount}
                  </T>
                </View>
              ) : null}
            </Touchable>
          </View>

          <FlatList
            data={categoryTabs}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id ?? 'all'}
            className="-mx-4 mt-2.5"
            contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
            renderItem={({ item }) => (
              <CategoryPill
                label={item.name}
                count={item.serviceCount}
                active={filters.categoryId === item.id}
                icon={item.id === undefined ? 'apps' : categoryIcon(item.name)}
                imageUrl={item.imageUrl}
                onPress={() => setFilters((d) => ({ ...d, categoryId: item.id }))}
              />
            )}
          />

          <ActiveFilterBar filters={activeFilters} onClearAll={clearAllFilters} />
        </View>
      </GlassView>

      {/* ── body ────────────────────────────────────────────── */}
      {isLanding ? (
        <SearchLanding
          recent={recent}
          categories={categories.data ?? []}
          saved={saved}
          popular={popularItems}
          popularLoading={popular.isLoading}
          favorites={favorites}
          onPickTerm={(term) => {
            setRawSearch(term);
            addRecent(term);
          }}
          onPickCategory={(id) => setFilters((d) => ({ ...d, categoryId: id }))}
          onRemoveRecent={removeRecent}
          onClearRecent={clearRecent}
          onOpenService={openService}
          onBook={quickBook}
          onToggleSave={toggleFavorite}
        />
      ) : services.isError ? (
        <ErrorView message={t('errors.generic')} onRetry={() => services.refetch()} />
      ) : services.isLoading ? (
        <View className="gap-2.5 px-4 pt-3">
          {isGrid
            ? [0, 1].map((r) => (
                <View key={r} className="flex-row gap-2.5">
                  <GridCardSkeleton />
                  <GridCardSkeleton />
                </View>
              ))
            : [0, 1, 2, 3, 4].map((i) => <ResultCardSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          key={layout}
          ref={listRef}
          data={items}
          numColumns={isGrid ? 2 : 1}
          keyExtractor={(s) => s.id}
          columnWrapperStyle={isGrid ? { gap: 10 } : undefined}
          contentContainerStyle={{ padding: 16, paddingTop: 10, gap: 10, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
          onEndReached={() => services.hasNextPage && services.fetchNextPage()}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            items.length > 0 ? (
              <ResultMetaRow
                count={total}
                sortLabel={sortLabel(filters.sort)}
                onOpenSort={() => setSheetOpen(true)}
                layout={layout}
                onLayoutChange={setLayout}
              />
            ) : null
          }
          ListEmptyComponent={
            <NoResults
              query={search.trim()}
              hasFilters={filterCount > 0}
              onClearFilters={clearAllFilters}
            />
          }
          ListFooterComponent={
            services.isFetchingNextPage ? (
              <View className="py-6">
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : !services.hasNextPage && items.length > PAGE_SIZE ? (
              <T className="py-6 text-center font-lao text-muted-foreground">
                {t('search.endOfList')}
              </T>
            ) : null
          }
          renderItem={({ item, index }) => {
            const props = {
              service: item,
              saved: favorites.includes(item.id),
              onPress: () => openService(item.id),
              onBook: () => quickBook(item),
              onToggleSave: () => toggleFavorite(item.id),
            };
            return isGrid ? (
              <AnimatedEntrance index={index} style={{ flex: 1, maxWidth: '50%' }}>
                <ServiceGridCard {...props} />
              </AnimatedEntrance>
            ) : (
              <AnimatedEntrance index={index}>
                <ServiceResultCard {...props} />
              </AnimatedEntrance>
            );
          }}
        />
      )}

      <ScrollTopFab
        visible={showFab && !isLanding}
        onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
      />

      <SearchFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        value={filters}
        categories={categories.data ?? []}
        onApply={setFilters}
      />
    </SafeAreaView>
  );
}
