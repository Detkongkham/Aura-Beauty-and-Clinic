import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { useJoinWaitlist, useMyWaitlist } from '../waitlist/waitlist.api';
import { cn } from '../../lib/cn';
import { formatTime } from '../../lib/format';
import { colors, shadow } from '../../theme';
import type { BookingSlot } from '../../store/booking-draft.store';
import { Card, IconTile, NUM, Notice, Pill, SMALL, T } from './booking-kit';
import { dowShort, monthName, ymd } from './booking-dates';

export const BUCKETS = ['morning', 'afternoon', 'evening'] as const;
export type Bucket = (typeof BUCKETS)[number];
export type Filter = 'all' | Bucket;

const BUCKET_ICON: Record<Bucket, React.ComponentProps<typeof Ionicons>['name']> = {
  morning: 'sunny-outline',
  afternoon: 'partly-sunny-outline',
  evening: 'moon-outline',
};

/** ແຖບບໍລິບົດ: ບໍລິການ · ຊ່າງ · ເວລາ — ແຕະເພື່ອກັບໄປແກ້ໄຂ. */
export function ContextStrip({
  service,
  meta,
  onEdit,
}: {
  service: string;
  meta: string;
  onEdit: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onEdit}
      pressScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${t('wizard.changeService')}: ${service}`}
      className="min-h-[52px] flex-row items-center gap-3 rounded-2xl border border-border bg-card p-2.5"
      style={shadow.xs}
    >
      <IconTile icon="sparkles" />
      <View className="flex-1">
        <T numberOfLines={1} className="font-lao-semibold text-foreground">
          {service}
        </T>
        <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
          {meta}
        </T>
      </View>
      <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
        <Ionicons name="create-outline" size={14} color={colors.primaryStrong} />
      </View>
    </Touchable>
  );
}

const DAY_W = 52;
const DAY_GAP = 8;

/** ແຖບວັນທີ 14 ມື້ — ຫົວເດືອນ + ລູກສອນ + ເລື່ອນອັດຕະໂນມັດໄປວັນທີເລືອກ. */
export function DateStrip({
  days,
  value,
  onChange,
}: {
  days: readonly string[];
  value: string;
  onChange: (d: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const ref = useRef<ScrollView>(null);
  const idx = Math.max(0, days.indexOf(value));
  const sel = ymd(value);
  const canPrev = idx > 0;
  const canNext = idx < days.length - 1;

  useEffect(() => {
    ref.current?.scrollTo({ x: Math.max(0, idx * (DAY_W + DAY_GAP) - DAY_W), animated: true });
  }, [idx]);

  const arrow = (dir: -1 | 1): React.JSX.Element => {
    const enabled = dir === -1 ? canPrev : canNext;
    return (
      <Touchable
        key={dir}
        onPress={() => enabled && onChange(days[idx + dir]!)}
        disabled={!enabled}
        hitSlop={8}
        pressScale={0.9}
        accessibilityRole="button"
        accessibilityLabel={dir === -1 ? t('availability.prevDay') : t('availability.nextDay')}
        accessibilityState={{ disabled: !enabled }}
        className={cn(
          'h-8 w-8 items-center justify-center rounded-full border border-border bg-card',
          !enabled && 'opacity-40',
        )}
      >
        <Ionicons name={dir === -1 ? 'chevron-back' : 'chevron-forward'} size={14} color={colors.foreground} />
      </Touchable>
    );
  };

  return (
    <View className="gap-2.5">
      <View className="flex-row items-center justify-between px-1">
        <View className="flex-row items-center gap-2">
          <T className="font-lao-semibold text-foreground">{`${monthName(sel)} ${sel.format('YYYY')}`}</T>
          {idx !== 0 ? (
            <Touchable
              onPress={() => onChange(days[0]!)}
              hitSlop={8}
              pressScale={0.94}
              accessibilityRole="button"
              className="h-6 justify-center rounded-full bg-primary-subtle px-2"
            >
              <T className="font-lao-medium text-primary-strong" style={SMALL}>
                {t('availability.today')}
              </T>
            </Touchable>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          {arrow(-1)}
          {arrow(1)}
        </View>
      </View>

      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 2, paddingVertical: 4, gap: DAY_GAP }}
      >
        {days.map((d, i) => {
          const dj = ymd(d);
          const isSel = d === value;
          const isToday = i === 0;
          const weekend = dj.day() === 0 || dj.day() === 6;
          return (
            <Touchable
              key={d}
              onPress={() => onChange(d)}
              pressScale={0.94}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`${dowShort(dj)} ${dj.format('D')} ${monthName(dj)}${isToday ? `, ${t('availability.today')}` : ''}`}
              className={cn(
                'h-[66px] items-center justify-center gap-0.5 rounded-2xl border',
                isSel ? 'border-primary bg-primary' : 'border-border bg-card',
              )}
              style={[{ width: DAY_W }, isSel ? shadow.primary : undefined]}
            >
              <T
                className={cn(
                  'font-lao-medium',
                  isSel ? 'text-primary-foreground' : weekend ? 'text-primary-strong' : 'text-muted-foreground',
                )}
                style={SMALL}
              >
                {dowShort(dj)}
              </T>
              <T
                className={cn('font-sans-semibold', isSel ? 'text-primary-foreground' : 'text-foreground')}
                style={NUM}
              >
                {dj.format('D')}
              </T>
              <View
                className={cn(
                  'h-1 w-1 rounded-full',
                  isToday ? (isSel ? 'bg-primary-foreground' : 'bg-primary') : 'bg-transparent',
                )}
              />
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** ແຖບກັ່ນຕອງຊ່ວງເວລາ — ມີຈຳນວນຄິວວ່າງຂອງແຕ່ລະຊ່ວງ. */
export function BucketTabs({
  value,
  counts,
  onChange,
}: {
  value: Filter;
  counts: Record<Filter, number>;
  onChange: (f: Filter) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const items: Filter[] = ['all', ...BUCKETS];
  return (
    <View accessibilityRole="tablist" className="flex-row gap-1 rounded-2xl bg-muted p-1">
      {items.map((f) => {
        const active = f === value;
        const disabled = counts[f] === 0;
        return (
          <Touchable
            key={f}
            onPress={() => onChange(f)}
            disabled={disabled}
            pressScale={0.97}
            dim={false}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled }}
            className={cn(
              'h-9 flex-1 flex-row items-center justify-center gap-1 rounded-xl',
              active && 'bg-card',
              disabled && 'opacity-40',
            )}
            style={active ? shadow.xs : undefined}
          >
            <T
              numberOfLines={1}
              className={cn('font-lao-medium', active ? 'text-foreground' : 'text-muted-foreground')}
              style={SMALL}
            >
              {f === 'all' ? t('availability.all') : t(`availability.${f}`)}
            </T>
            <T
              className={cn('font-sans-semibold', active ? 'text-primary-strong' : 'text-muted-foreground')}
              style={SMALL}
            >
              {counts[f]}
            </T>
          </Touchable>
        );
      })}
    </View>
  );
}

/** ກຸ່ມຄິວ 1 ຊ່ວງ — ຫົວ (ໄອຄອນ + ຊ່ວງເວລາ) + grid 4 ຖັນ (ປຸ່ມສູງ 44). */
export function SlotGroup({
  bucket,
  slots,
  selected,
  onSelect,
}: {
  bucket: Bucket;
  slots: BookingSlot[];
  selected: BookingSlot | null;
  onSelect: (s: BookingSlot) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const first = slots[0]!;
  const last = slots[slots.length - 1]!;

  return (
    <Card flat className="p-3">
      <View className="mb-2.5 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name={BUCKET_ICON[bucket]} size={14} color={colors.primaryStrong} />
          <T accessibilityRole="header" className="font-lao-semibold text-foreground">
            {t(`availability.${bucket}`)}
          </T>
          <T className="font-lao text-muted-foreground" style={SMALL}>
            {`${formatTime(first.startAt)} – ${formatTime(last.startAt)}`}
          </T>
        </View>
        <Pill tone="primary" label={t('availability.slotsOpen', { count: slots.length })} />
      </View>

      <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
        {slots.map((s) => {
          const isSel = selected?.startAt === s.startAt;
          return (
            <View key={s.startAt} style={{ width: '25%', padding: 3 }}>
              <Touchable
                onPress={() => onSelect(s)}
                pressScale={0.94}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={formatTime(s.startAt)}
                className={cn(
                  'h-11 flex-row items-center justify-center gap-1 rounded-xl border',
                  isSel ? 'border-primary bg-primary' : 'border-border bg-background',
                )}
                style={isSel ? shadow.primary : undefined}
              >
                {isSel ? (
                  <Ionicons name="checkmark-circle" size={12} color={colors.primaryForeground} />
                ) : null}
                <T
                  className={cn('font-sans-semibold', isSel ? 'text-primary-foreground' : 'text-foreground')}
                >
                  {formatTime(s.startAt)}
                </T>
              </Touchable>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export function SlotSkeleton(): React.JSX.Element {
  return (
    <View className="gap-3">
      {[8, 4].map((n, gi) => (
        <View key={gi} className="rounded-2xl border border-border bg-card p-3">
          <Skeleton className="mb-3 h-3 w-1/3 rounded-md" />
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
            {Array.from({ length: n }).map((_, i) => (
              <View key={i} style={{ width: '25%', padding: 3 }}>
                <Skeleton className="h-11 rounded-xl" />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** ບັດສະຫຼຸບເວລາທີ່ເລືອກ — ຊ່ວງ ເລີ່ມ–ຈົບ + ໄລຍະ. */
export function SelectedSlotCard({
  dateLabel,
  slot,
  durationLabel,
}: {
  dateLabel: string;
  slot: BookingSlot;
  durationLabel: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-3 rounded-2xl border border-primary/20 bg-primary-subtle/60 p-3"
    >
      <IconTile icon="calendar" tone="primary" />
      <View className="flex-1">
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {t('availability.yourSlot')}
        </T>
        <T numberOfLines={1} className="font-lao-semibold text-foreground">
          {dateLabel}
        </T>
      </View>
      <View className="items-end">
        <T className="font-sans-semibold text-primary-strong" style={NUM}>
          {`${formatTime(slot.startAt)}–${formatTime(slot.endAt)}`}
        </T>
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {durationLabel}
        </T>
      </View>
    </View>
  );
}

/** ບໍ່ມີຄິວວ່າງ → ມື້ຕໍ່ໄປ + Smart Waitlist (Module 20). */
export function NoSlots({
  branchId,
  serviceId,
  date,
  onNextDay,
}: {
  branchId: string;
  serviceId: string;
  date: string;
  onNextDay: (() => void) | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const mine = useMyWaitlist();
  const join = useJoinWaitlist();
  const canJoin = !!branchId && !!serviceId;
  const already =
    join.isSuccess ||
    (mine.data ?? []).some(
      (e) => e.branchId === branchId && e.serviceId === serviceId && e.preferredDate === date,
    );

  return (
    <Card flat className="items-center gap-3 px-5 py-6">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Ionicons name="calendar-clear-outline" size={20} color={colors.mutedForeground} />
      </View>
      <View className="items-center gap-0.5">
        <T className="text-center font-lao-semibold text-foreground">{t('availability.empty')}</T>
        <T className="text-center font-lao text-muted-foreground" style={SMALL}>
          {t('waitlist.prompt')}
        </T>
      </View>

      <View className="w-full flex-row gap-2">
        {onNextDay ? (
          <Button
            label={t('availability.tryNextDay')}
            variant="outline"
            size="sm"
            icon="arrow-forward"
            labelClassName="text-[12px]"
            className="flex-1"
            fullWidth={false}
            onPress={onNextDay}
          />
        ) : null}
        {canJoin ? (
          already ? (
            <View className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-success-soft">
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <T className="font-lao-medium text-success">{t('waitlist.joined')}</T>
            </View>
          ) : (
            <Button
              label={t('waitlist.join')}
              variant="secondary"
              size="sm"
              icon="notifications-outline"
              labelClassName="text-[12px]"
              className="flex-1"
              fullWidth={false}
              loading={join.isPending}
              onPress={() => join.mutate({ branchId, serviceId, preferredDate: date })}
            />
          )
        ) : null}
      </View>
      {join.isError ? (
        <Notice tone="destructive" icon="alert-circle" body={t('errors.generic')} />
      ) : null}
    </Card>
  );
}
