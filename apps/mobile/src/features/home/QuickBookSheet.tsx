import type { ServiceListItem } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, ScrollView, TextInput, View } from 'react-native';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { DEFAULT_BRANCH_ID } from '../../config/env';
import { useDebounced } from '../../hooks/useDebounced';
import { cn } from '../../lib/cn';
import { formatLAK } from '../../lib/format';
import { useBookingDraft } from '../../store/booking-draft.store';
import { colors } from '../../theme';
import { useCategories, useServices } from '../catalog/catalog.api';
import { T } from './home.parts';

/** ເລີ່ມ booking draft ຈາກ ServiceListItem — parity ກັບ ServiceDetailScreen.onBook (ບໍ່ລະບຸຊ່າງ). */
export function useStartBooking(): (s: ServiceListItem) => void {
  const start = useBookingDraft((st) => st.start);
  return (s) =>
    start({
      mode: 'create',
      branchId: DEFAULT_BRANCH_ID,
      serviceId: s.id,
      serviceName: s.name,
      serviceSubtitle: s.description,
      serviceImageUrl: s.imageUrl,
      price: s.price,
      compareAtPrice: s.compareAtPrice,
      depositAmount: s.requireDeposit ? s.depositAmount : null,
      durationMinutes: s.durationMinutes,
      staffProfileId: null,
      staffName: null,
    });
}

function ServicePickRow({
  s,
  onPress,
}: {
  s: ServiceListItem;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const discounted = s.compareAtPrice != null && s.compareAtPrice > s.price;
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${s.name} · ${formatLAK(s.price)}`}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-2.5"
    >
      <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-muted">
        {s.imageUrl ? (
          <Image source={{ uri: s.imageUrl }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <Ionicons name="sparkles-outline" size={18} color={colors.mutedForeground} />
        )}
      </View>
      <View className="flex-1">
        <T numberOfLines={1} className="font-lao-semibold text-foreground">
          {s.name}
        </T>
        <View className="flex-row items-center gap-1">
          <T numberOfLines={1} className="shrink font-lao text-muted-foreground">
            {s.categoryName}
          </T>
          <View className="h-0.5 w-0.5 rounded-full bg-border" />
          <T className="font-lao text-muted-foreground">
            {t('common.minutesShort', { count: s.durationMinutes })}
          </T>
          {s.rating > 0 ? (
            <>
              <View className="h-0.5 w-0.5 rounded-full bg-border" />
              <Ionicons name="star" size={10} color="#F59E0B" />
              <T className="font-sans text-muted-foreground">{s.rating.toFixed(1)}</T>
            </>
          ) : null}
        </View>
      </View>
      <View className="items-end">
        <T className="font-sans-semibold text-primary-strong">{formatLAK(s.price)}</T>
        {discounted ? (
          <T
            className="font-sans text-muted-foreground"
            style={{ textDecorationLine: 'line-through' }}
          >
            {formatLAK(s.compareAtPrice!)}
          </T>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.mutedForeground} />
    </Touchable>
  );
}

/**
 * "ຈອງຄິວ" ດ່ວນຈາກ Home — ເລືອກບໍລິການໃນ sheet ແລ້ວເຂົ້າ WizardService ທັນທີ
 * (ຂ້າມໜ້າຄົ້ນຫາ + ໜ້າລາຍລະອຽດ). ຄົ້ນຫາຕາມຊື່ + ກອງຕາມໝວດ, ຍອດນິຍົມກ່ອນ.
 */
export function QuickBookSheet({
  open,
  onClose,
  onPicked,
  onBrowseAll,
}: {
  open: boolean;
  onClose: () => void;
  onPicked: () => void;
  onBrowseAll: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const q = useDebounced(query.trim(), 300);
  const categories = useCategories();
  const services = useServices({
    branchId: DEFAULT_BRANCH_ID,
    sort: 'popular',
    ...(q ? { q } : {}),
    ...(categoryId ? { categoryId } : {}),
  });
  const startBooking = useStartBooking();
  const items = services.data?.pages.flatMap((p) => p.items) ?? [];

  const pick = (s: ServiceListItem): void => {
    startBooking(s);
    onClose();
    onPicked();
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <T className="font-lao-semibold text-foreground">{t('home.quickBookTitle')}</T>
          <T className="font-lao text-muted-foreground">{t('home.quickBookHint')}</T>
        </View>
        <Touchable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          className="h-9 w-9 items-center justify-center rounded-full bg-muted"
        >
          <Ionicons name="close" size={17} color={colors.mutedForeground} />
        </Touchable>
      </View>

      <View className="h-11 flex-row items-center gap-2 rounded-xl border border-border bg-background px-3.5">
        <Ionicons name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('home.quickBookSearch')}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={t('common.search')}
          className="flex-1 font-lao text-foreground"
          style={{ fontSize: 12 }}
        />
        {services.isFetching && !services.isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : query ? (
          <Touchable
            onPress={() => setQuery('')}
            haptic="none"
            hitSlop={8}
            accessibilityLabel={t('common.clear')}
          >
            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
          </Touchable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingVertical: 10 }}
      >
        {[{ id: undefined, name: t('category.all') }, ...(categories.data ?? [])].map((c) => {
          const active = c.id === categoryId;
          return (
            <Touchable
              key={c.id ?? 'all'}
              onPress={() => setCategoryId(c.id)}
              pressScale={0.95}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className={cn(
                'h-8 justify-center rounded-full border px-3',
                active ? 'border-primary bg-primary' : 'border-border bg-card',
              )}
            >
              <T
                className={cn(
                  'font-lao-medium',
                  active ? 'text-primary-foreground' : 'text-foreground',
                )}
              >
                {c.name}
              </T>
            </Touchable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={{ maxHeight: 360 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
      >
        {services.isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[70px] rounded-2xl" />)
        ) : items.length === 0 ? (
          <View className="items-center gap-1 py-8">
            <Ionicons name="search-outline" size={20} color={colors.mutedForeground} />
            <T className="font-lao text-muted-foreground">
              {q ? t('home.quickBookNoResult', { q }) : t('service.empty')}
            </T>
          </View>
        ) : (
          items.map((s) => <ServicePickRow key={s.id} s={s} onPress={() => pick(s)} />)
        )}
      </ScrollView>

      <Touchable
        onPress={() => {
          onClose();
          onBrowseAll();
        }}
        accessibilityRole="button"
        className="mt-3 h-10 flex-row items-center justify-center gap-1 rounded-xl bg-primary-subtle"
      >
        <T className="font-lao-semibold text-primary-strong">{t('home.quickBookBrowse')}</T>
        <Ionicons name="arrow-forward" size={13} color={colors.primaryStrong} />
      </Touchable>
    </Sheet>
  );
}
