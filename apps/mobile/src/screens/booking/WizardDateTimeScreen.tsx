import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FooterBar } from '../../components/shared/FooterBar';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Button } from '../../components/ui/Button';
import { FooterSummary, Notice } from '../../features/booking/booking-kit';
import { longDate, ymd } from '../../features/booking/booking-dates';
import { useAvailability } from '../../features/booking/booking.api';
import { WizardProgress } from '../../features/booking/WizardProgress';
import { useWizardNav } from '../../features/booking/useWizardNav';
import {
  BUCKETS,
  BucketTabs,
  ContextStrip,
  DateStrip,
  NoSlots,
  SelectedSlotCard,
  SlotGroup,
  SlotSkeleton,
  type Filter,
} from '../../features/booking/wizard-datetime.parts';
import { formatLAK, formatTime, isoDateInDays, slotBucket } from '../../lib/format';
import { useBookingDraft, type BookingSlot } from '../../store/booking-draft.store';
import type { AppScreenProps } from '../../navigation/types';

const DAYS = Array.from({ length: 14 }, (_, i) => isoDateInDays(i));

export function WizardDateTimeScreen({
  navigation,
}: AppScreenProps<'WizardDateTime'>): React.JSX.Element {
  const { t } = useTranslation();
  const { goToStep, confirmExit } = useWizardNav(navigation);
  const draft = useBookingDraft();
  const patch = useBookingDraft((s) => s.patch);

  const initialDate = draft.date && DAYS.includes(draft.date) ? draft.date : DAYS[0]!;
  const [date, setDate] = useState<string>(initialDate);
  const [selected, setSelected] = useState<BookingSlot | null>(
    draft.date === initialDate ? draft.slot : null,
  );
  const [filter, setFilter] = useState<Filter>('all');

  const availability = useAvailability(
    {
      branchId: draft.branchId,
      serviceId: draft.serviceId ?? '',
      date,
      staffProfileId: draft.staffProfileId ?? undefined,
    },
    !!draft.serviceId,
  );

  // ລົບ startAt ຊ້ຳ (ຊ່າງໃດກໍໄດ້ → ຫຼາຍຊ່າງວ່າງເວລາດຽວກັນ) ແລ້ວແບ່ງຕາມຊ່ວງ.
  const grouped = useMemo(() => {
    const seen = new Set<string>();
    const unique: BookingSlot[] = [];
    for (const s of availability.data?.slots ?? []) {
      if (seen.has(s.startAt)) continue;
      seen.add(s.startAt);
      unique.push(s);
    }
    return BUCKETS.map((b) => ({
      bucket: b,
      slots: unique.filter((s) => slotBucket(s.startAt) === b),
    })).filter((g) => g.slots.length > 0);
  }, [availability.data]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, morning: 0, afternoon: 0, evening: 0 };
    for (const g of grouped) {
      c[g.bucket] = g.slots.length;
      c.all += g.slots.length;
    }
    return c;
  }, [grouped]);

  // ຖ້າຊ່ວງທີ່ກັ່ນຕອງໄວ້ບໍ່ມີຄິວໃນມື້ໃໝ່ → ສະແດງທັງໝົດ (ກັນໜ້າວ່າງເປົ່າ).
  const effectiveFilter: Filter = filter !== 'all' && counts[filter] === 0 ? 'all' : filter;
  const visible =
    effectiveFilter === 'all' ? grouped : grouped.filter((g) => g.bucket === effectiveFilter);

  const selectDate = (d: string): void => {
    setDate(d);
    setSelected(draft.slot && draft.date === d ? draft.slot : null);
  };

  const goNext = (): void => {
    if (!selected) return;
    patch({ date, slot: selected });
    navigation.navigate('WizardConfirm');
  };

  const idx = DAYS.indexOf(date);
  const nextDay = idx >= 0 && idx < DAYS.length - 1 ? DAYS[idx + 1]! : null;
  const dateLabel = longDate(ymd(date));
  const durationLabel = t('common.minutesShort', {
    count: draft.durationMinutes ?? availability.data?.durationMinutes ?? 0,
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <WizardProgress
        step={2}
        title={t('wizard.stepDateTime')}
        onBack={() => navigation.goBack()}
        onStepPress={goToStep}
        onClose={confirmExit}
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <AnimatedEntrance index={0}>
          <ContextStrip
            service={draft.serviceName ?? '-'}
            meta={[draft.staffName ?? t('staff.any'), durationLabel, formatLAK(draft.price ?? 0)].join('  ·  ')}
            onEdit={() => navigation.goBack()}
          />
        </AnimatedEntrance>

        <AnimatedEntrance index={1}>
          <DateStrip days={DAYS} value={date} onChange={selectDate} />
        </AnimatedEntrance>

        {availability.isLoading ? (
          <SlotSkeleton />
        ) : availability.isError ? (
          <Notice tone="destructive" icon="cloud-offline-outline" title={t('errors.generic')}>
            <Button
              label={t('common.retry')}
              variant="outline"
              size="xs"
              fullWidth={false}
              className="mt-2 self-start"
              onPress={() => void availability.refetch()}
            />
          </Notice>
        ) : grouped.length === 0 ? (
          <AnimatedEntrance index={2}>
            <NoSlots
              branchId={draft.branchId}
              serviceId={draft.serviceId ?? ''}
              date={date}
              onNextDay={nextDay ? () => selectDate(nextDay) : null}
            />
          </AnimatedEntrance>
        ) : (
          <View className="gap-3">
            <AnimatedEntrance index={2}>
              <BucketTabs value={effectiveFilter} counts={counts} onChange={setFilter} />
            </AnimatedEntrance>

            {visible.map((group, gi) => (
              <AnimatedEntrance key={`${date}-${group.bucket}`} index={3 + gi}>
                <SlotGroup
                  bucket={group.bucket}
                  slots={group.slots}
                  selected={selected}
                  onSelect={setSelected}
                />
              </AnimatedEntrance>
            ))}

            {selected ? (
              <SelectedSlotCard dateLabel={dateLabel} slot={selected} durationLabel={durationLabel} />
            ) : (
              <Notice tone="accent" icon="bulb-outline" title={t('availability.tipLabel')} body={t('availability.tip')} />
            )}
          </View>
        )}
      </ScrollView>

      <FooterBar>
        <FooterSummary
          label={t('availability.selectedTime')}
          value={selected ? `${dateLabel} · ${formatTime(selected.startAt)}` : dateLabel}
          sub={selected ? null : t('availability.chooseSlot')}
          totalLabel={t('wizard.total')}
          total={formatLAK(draft.price ?? 0)}
        />
        <Button
          label={t('wizard.nextConfirm')}
          size="md"
          icon="arrow-forward"
          labelClassName="text-[13px] text-center"
          disabled={!selected}
          onPress={goNext}
        />
      </FooterBar>
    </SafeAreaView>
  );
}
