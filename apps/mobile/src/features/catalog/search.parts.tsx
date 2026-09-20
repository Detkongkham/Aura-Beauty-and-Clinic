import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  ScrollView,
  type TextInput as RNTextInput,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cn } from '../../lib/cn';
import { colors, shadow } from '../../theme';

/** ຂໍ້ຄວາມ catalog = 12px ຄົງທີ່ (typography-appointments.md). className ຄຸມ weight/ສີ ເທົ່ານັ້ນ. */
function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

/* ------------------------------------------------------------------ SearchField */

export type SearchFieldProps = {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  focused: boolean;
  onFocusChange: (v: boolean) => void;
  autoFocus?: boolean;
};

export const SearchField = forwardRef<RNTextInput, SearchFieldProps>(function SearchField(
  { value, onChangeText, onSubmit, onClear, focused, onFocusChange, autoFocus },
  ref,
) {
  const { t } = useTranslation();
  return (
    <View
      className={cn(
        'h-11 flex-row items-center gap-2 rounded-xl border bg-card px-3.5',
        focused ? 'border-primary' : 'border-border',
      )}
      style={shadow.xs}
    >
      <Ionicons name="search" size={17} color={focused ? colors.primary : colors.mutedForeground} />
      <TextInput
        ref={ref}
        className="flex-1 font-lao text-foreground"
        placeholder={t('home.searchPlaceholder')}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
        onSubmitEditing={onSubmit}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="search"
        accessibilityLabel={t('common.search')}
      />
      {value.length > 0 ? (
        <Touchable
          onPress={onClear}
          haptic="none"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
        </Touchable>
      ) : null}
    </View>
  );
});

/* -------------------------------------------------------------------- CountPill */

/** ຈຳນວນຜົນ — entrance + interaction motion (cardcount-animation-convention). */
export function CountPill({ count }: { count: number }): React.JSX.Element {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(1)).current;
  const prev = useRef(count);

  useEffect(() => {
    if (prev.current === count) return;
    prev.current = count;
    AccessibilityInfo.announceForAccessibility(t('search.found', { count }));
    if (reduced) return;
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [count, reduced, a, t]);

  return (
    <Animated.View
      className="rounded-full bg-primary-subtle px-2 py-0.5"
      style={{
        opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
        transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) }],
      }}
    >
      <T className="font-lao-medium text-primary-strong">
        {t('search.found', { count })}
      </T>
    </Animated.View>
  );
}

/* ----------------------------------------------------------------- ResultMetaRow */

export type ResultLayout = 'list' | 'grid';

/** ແຖບເທິງຜົນ — ຈຳນວນ (ຊ້າຍ), ປຸ່ມຈັດລຽງ + ສະຫຼັບ list/grid (ຂວາ). */
export function ResultMetaRow({
  count,
  sortLabel,
  onOpenSort,
  layout,
  onLayoutChange,
}: {
  count: number;
  sortLabel: string;
  onOpenSort: () => void;
  layout: ResultLayout;
  onLayoutChange: (l: ResultLayout) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center justify-between gap-2 pb-1">
      <CountPill count={count} />
      <View className="flex-row items-center gap-1.5">
        <Touchable
          onPress={onOpenSort}
          haptic="none"
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${t('search.sortLabel')}: ${sortLabel}`}
          className="h-8 flex-row items-center gap-1 rounded-full border border-border bg-card px-2.5"
        >
          <Ionicons name="swap-vertical" size={12} color={colors.foreground} />
          <T numberOfLines={1} className="max-w-[130px] font-lao-medium text-foreground">
            {sortLabel}
          </T>
        </Touchable>
        <View className="h-8 flex-row items-center rounded-full border border-border bg-card p-0.5">
          {(['list', 'grid'] as const).map((l) => {
            const active = layout === l;
            return (
              <Touchable
                key={l}
                onPress={() => onLayoutChange(l)}
                haptic="select"
                pressScale={0.9}
                hitSlop={4}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={l === 'list' ? t('search.viewList') : t('search.viewGrid')}
                className={cn(
                  'h-7 w-8 items-center justify-center rounded-full',
                  active && 'bg-primary-subtle',
                )}
              >
                <Ionicons
                  name={l === 'list' ? 'list' : 'grid-outline'}
                  size={14}
                  color={active ? colors.primary : colors.mutedForeground}
                />
              </Touchable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- ActiveFilterBar */

export type ActiveFilter = { key: string; label: string; onRemove: () => void };

/** ຕົວກັ່ນຕອງທີ່ໃຊ້ຢູ່ — ເລື່ອນແນວນອນ, ກົດ chip = ລຶບ. */
export function ActiveFilterBar({
  filters,
  onClearAll,
}: {
  filters: ActiveFilter[];
  onClearAll: () => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (filters.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-4 pt-2"
      contentContainerStyle={{ paddingHorizontal: 16, gap: 6, alignItems: 'center' }}
    >
      {filters.map((f) => (
        <Touchable
          key={f.key}
          onPress={f.onRemove}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('search.removeFilter', { label: f.label })}
          className="h-7 flex-row items-center gap-1 rounded-full bg-primary-subtle pl-2.5 pr-2"
        >
          <T numberOfLines={1} className="font-lao-medium text-primary-strong">
            {f.label}
          </T>
          <Ionicons name="close" size={12} color={colors.primaryStrong} />
        </Touchable>
      ))}
      <Touchable onPress={onClearAll} haptic="none" hitSlop={8} accessibilityRole="button" className="px-1">
        <T className="font-lao-medium text-primary">{t('search.clearAll')}</T>
      </Touchable>
    </ScrollView>
  );
}

/* -------------------------------------------------------------------- NoResults */

export function NoResults({
  query,
  hasFilters,
  onClearFilters,
}: {
  query: string;
  hasFilters: boolean;
  onClearFilters: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className="items-center gap-3.5 px-10 py-12">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Ionicons name="search-outline" size={24} color={colors.mutedForeground} />
      </View>
      <View className="gap-1">
        <T className="text-center font-lao-medium text-foreground">
          {t('search.noResultsTitle', { q: query })}
        </T>
        <T className="text-center font-lao text-muted-foreground">
          {t('search.noResultsHint')}
        </T>
      </View>
      {hasFilters ? (
        <Button
          label={t('search.clearFilters')}
          variant="outline"
          fullWidth={false}
          onPress={onClearFilters}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ ScrollTopFab */

export function ScrollTopFab({
  visible,
  onPress,
}: {
  visible: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const a = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      a.setValue(visible ? 1 : 0);
      return;
    }
    Animated.timing(a, {
      toValue: visible ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [visible, reduced, a]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        right: 20,
        bottom: insets.bottom + 20,
        opacity: a,
        transform: [{ scale: a }],
      }}
    >
      <Touchable
        onPress={onPress}
        haptic="none"
        accessibilityRole="button"
        accessibilityLabel={t('search.scrollTop')}
        className="h-10 w-10 items-center justify-center rounded-full bg-card"
        style={shadow.card}
      >
        <Ionicons name="chevron-up" size={18} color={colors.primary} />
      </Touchable>
    </Animated.View>
  );
}

/* --------------------------------------------------------------- ResultCardSkeleton */

export function ResultCardSkeleton(): React.JSX.Element {
  return (
    <View className="flex-row gap-3 rounded-2xl border border-border bg-card p-2.5">
      <Skeleton className="h-[96px] w-[96px] rounded-xl" />
      <View className="flex-1 justify-between py-0.5">
        <View className="gap-2">
          <Skeleton className="h-2.5 w-16 rounded-md" />
          <Skeleton className="h-3.5 w-40 rounded-md" />
          <Skeleton className="h-2.5 w-24 rounded-md" />
        </View>
        <View className="flex-row items-center justify-between">
          <Skeleton className="h-3.5 w-20 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-full" />
        </View>
      </View>
    </View>
  );
}

export function GridCardSkeleton(): React.JSX.Element {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-card">
      <Skeleton className="aspect-[4/3] w-full rounded-b-none rounded-t-2xl" />
      <View className="gap-2 p-2.5">
        <Skeleton className="h-2.5 w-14 rounded-md" />
        <Skeleton className="h-3.5 w-full rounded-md" />
        <Skeleton className="h-2.5 w-20 rounded-md" />
        <Skeleton className="h-3.5 w-16 rounded-md" />
      </View>
    </View>
  );
}
