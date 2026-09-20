import type { ServiceCategoryView } from '@abcp/shared-types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Sheet } from '../../components/ui/Sheet';
import { Text } from '../../components/ui/Text';
import { formatLAK } from '../../lib/format';

/** ຂໍ້ຄວາມ catalog = 12px ຄົງທີ່ (typography-appointments.md). className ຄຸມ weight/ສີ ເທົ່ານັ້ນ. */
function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

export type PricePreset = 'any' | 'lt150' | '150_300' | '300_500' | 'gt500';
export type SortKey = 'popular' | 'name' | 'priceAsc' | 'priceDesc';

export type SearchFilterValue = {
  categoryId?: string;
  price: PricePreset;
  /** undefined = ໃດກໍ່ໄດ້ */
  durationMax?: number;
  depositOnly: boolean;
  sort: SortKey;
};

export const DEFAULT_FILTERS: SearchFilterValue = {
  categoryId: undefined,
  price: 'any',
  durationMax: undefined,
  depositOnly: false,
  sort: 'name',
};

const DURATIONS = [30, 60, 90] as const;
const SORTS: SortKey[] = ['popular', 'name', 'priceAsc', 'priceDesc'];

export function pricePresetToRange(p: PricePreset): { priceMin?: number; priceMax?: number } {
  switch (p) {
    case 'lt150':
      return { priceMax: 150_000 };
    case '150_300':
      return { priceMin: 150_000, priceMax: 300_000 };
    case '300_500':
      return { priceMin: 300_000, priceMax: 500_000 };
    case 'gt500':
      return { priceMin: 500_000 };
    default:
      return {};
  }
}

export function useSortLabel(): (k: SortKey) => string {
  const { t } = useTranslation();
  return (k) =>
    ({
      popular: t('search.sortPopular'),
      name: t('search.sortNameAsc'),
      priceAsc: t('search.sortPriceAsc'),
      priceDesc: t('search.sortPriceDesc'),
    })[k];
}

export function usePriceLabel(): (p: PricePreset) => string {
  const { t } = useTranslation();
  return (p) =>
    ({
      any: t('search.priceAny'),
      lt150: t('search.priceUnder', { amount: formatLAK(150_000) }),
      '150_300': `${formatLAK(150_000)}–${formatLAK(300_000)}`,
      '300_500': `${formatLAK(300_000)}–${formatLAK(500_000)}`,
      gt500: t('search.priceOver', { amount: formatLAK(500_000) }),
    })[p];
}

function Group({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View className="gap-2.5">
      <T className="font-lao-medium text-foreground">{title}</T>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

export function SearchFilterSheet({
  open,
  onClose,
  value,
  categories,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  value: SearchFilterValue;
  categories: ServiceCategoryView[];
  onApply: (v: SearchFilterValue) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const sortLabel = useSortLabel();
  const [draft, setDraft] = useState<SearchFilterValue>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const priceOptions: { key: PricePreset; label: string }[] = [
    { key: 'any', label: t('search.priceAny') },
    { key: 'lt150', label: t('search.priceUnder', { amount: formatLAK(150_000) }) },
    { key: '150_300', label: `${formatLAK(150_000)}–${formatLAK(300_000)}` },
    { key: '300_500', label: `${formatLAK(300_000)}–${formatLAK(500_000)}` },
    { key: 'gt500', label: t('search.priceOver', { amount: formatLAK(500_000) }) },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={t('search.filters')}>
      <ScrollView
        style={{ maxHeight: 460 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 20, paddingBottom: 8 }}
      >
        <Group title={t('search.category')}>
          <Chip
            label={t('category.all')}
            size="sm"
            selected={draft.categoryId === undefined}
            onPress={() => setDraft((d) => ({ ...d, categoryId: undefined }))}
          />
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              size="sm"
              selected={draft.categoryId === c.id}
              onPress={() => setDraft((d) => ({ ...d, categoryId: c.id }))}
            />
          ))}
        </Group>

        <Group title={t('search.priceRange')}>
          {priceOptions.map((o) => (
            <Chip
              key={o.key}
              label={o.label}
              size="sm"
              selected={draft.price === o.key}
              onPress={() => setDraft((d) => ({ ...d, price: o.key }))}
            />
          ))}
        </Group>

        <Group title={t('search.duration')}>
          <Chip
            label={t('search.durationAny')}
            size="sm"
            selected={draft.durationMax === undefined}
            onPress={() => setDraft((d) => ({ ...d, durationMax: undefined }))}
          />
          {DURATIONS.map((m) => (
            <Chip
              key={m}
              label={t('search.durationUnder', { count: m })}
              size="sm"
              selected={draft.durationMax === m}
              onPress={() => setDraft((d) => ({ ...d, durationMax: m }))}
            />
          ))}
        </Group>

        <Group title={t('service.deposit')}>
          <Chip
            label={t('search.depositOnly')}
            size="sm"
            icon={draft.depositOnly ? 'checkmark' : undefined}
            selected={draft.depositOnly}
            onPress={() => setDraft((d) => ({ ...d, depositOnly: !d.depositOnly }))}
          />
        </Group>

        <Group title={t('search.sortLabel')}>
          {SORTS.map((k) => (
            <Chip
              key={k}
              label={sortLabel(k)}
              size="sm"
              selected={draft.sort === k}
              onPress={() => setDraft((d) => ({ ...d, sort: k }))}
            />
          ))}
        </Group>
      </ScrollView>

      <View className="mt-4 flex-row gap-3">
        <View className="flex-1">
          <Button
            label={t('search.clearAll')}
            variant="outline"
            onPress={() => setDraft(DEFAULT_FILTERS)}
          />
        </View>
        <View className="flex-1">
          <Button
            label={t('search.apply')}
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          />
        </View>
      </View>
    </Sheet>
  );
}
