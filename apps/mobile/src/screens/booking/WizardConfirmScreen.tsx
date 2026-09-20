import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FooterBar } from '../../components/shared/FooterBar';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useCreateAppointment, useRescheduleAppointment } from '../../features/booking/booking.api';
import { useCancelPolicyText } from '../../features/booking/useCancelPolicyText';
import { useBranch } from '../../features/catalog/catalog.api';
import { Card, FooterSummary, Notice, SMALL, SectionHeader, T } from '../../features/booking/booking-kit';
import { longDate, vt } from '../../features/booking/booking-dates';
import { usePriceQuote } from '../../features/referral/referral.api';
import { WizardProgress } from '../../features/booking/WizardProgress';
import { useWizardNav } from '../../features/booking/useWizardNav';
import {
  NoteChips,
  PaymentPicker,
  PriceBreakdown,
  ReferralField,
  ReviewCard,
} from '../../features/booking/wizard-confirm.parts';
import { formatLAK, formatTime } from '../../lib/format';
import { normalizeError } from '../../services/apiError';
import { useBookingDraft } from '../../store/booking-draft.store';
import type { AppScreenProps } from '../../navigation/types';

const NOTES_MAX = 150;
const SLOT_CONFLICT_CODES = ['DOUBLE_BOOKING', 'SLOT_UNAVAILABLE'];

/** ເພີ່ມ/ຖອດວະລີ preset ອອກຈາກຂໍ້ຄວາມໝາຍເຫດ (ຂັ້ນດ້ວຍ ", "). */
function toggleNoteChip(notes: string, phrase: string): string {
  const parts = notes
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const idx = parts.indexOf(phrase);
  if (idx >= 0) parts.splice(idx, 1);
  else parts.push(phrase);
  return parts.join(', ').slice(0, NOTES_MAX);
}

export function WizardConfirmScreen({
  navigation,
}: AppScreenProps<'WizardConfirm'>): React.JSX.Element {
  const { t } = useTranslation();
  const { goToStep, confirmExit } = useWizardNav(navigation);
  const draft = useBookingDraft();
  const patch = useBookingDraft((s) => s.patch);
  const branch = useBranch(draft.branchId).data;
  const policyText = useCancelPolicyText();
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  const create = useCreateAppointment();
  const reschedule = useRescheduleAppointment(draft.rescheduleId ?? '');
  const pending = create.isPending || reschedule.isPending;

  const slot = draft.slot;
  const isCreate = draft.mode === 'create';
  /** ຈອງດ້ວຍສິດແພັກເກັດ — ບໍ່ເກັບເງິນ, ຊ່ອນລາຄາ/ວິທີຈ່າຍ/ລະຫັດແນະນຳ. */
  const usingPackage = isCreate && draft.userPackageItemId != null;

  // ---- ລາຄາ -------------------------------------------------------------
  const price = draft.price ?? 0;
  const basePrice =
    draft.compareAtPrice != null && draft.compareAtPrice > price ? draft.compareAtPrice : price;
  const promoSavings = basePrice - price;

  // ໂມດູນ 28 — dynamic pricing / happy-hours ຕາມເວລານັດ (create ເທົ່ານັ້ນ).
  const quote = usePriceQuote(
    { branchId: draft.branchId, serviceId: draft.serviceId ?? '', at: slot?.startAt },
    isCreate && !usingPackage && Boolean(slot && draft.serviceId),
  );
  const dyn = quote.data && quote.data.savings > 0 ? quote.data : null;
  const total = usingPackage ? 0 : dyn ? dyn.finalPrice : price;
  const dynamicSavings = dyn ? Math.max(0, price - dyn.finalPrice) : 0;
  const dynamicLabel = dyn
    ? (dyn.appliedRule?.ruleName ?? t('confirm.dynamicBadge', { percent: dyn.discountPercent }))
    : null;
  const totalSavings = basePrice - total;

  const durationLabel = t('common.minutesShort', { count: draft.durationMinutes ?? 0 });
  const start = slot ? vt(slot.startAt) : null;

  // ---- submit ------------------------------------------------------------
  const onSubmit = async (): Promise<void> => {
    if (!slot || !draft.serviceId || pending) return;
    setError(null);
    try {
      let appointmentId: string | undefined;
      if (draft.mode === 'reschedule') {
        const res = await reschedule.mutateAsync({
          startAt: new Date(slot.startAt),
          staffProfileId: slot.staffProfileId,
        });
        appointmentId = res.id;
      } else {
        // "ນັດແບບງຽບ" ບໍ່ມີ field ໃນ API → ພັບເຂົ້າ customerNotes ໃຫ້ຊ່າງເຫັນ.
        const quietPhrase = t('confirm.quietNote');
        const notes = [
          draft.quietAppointment && !draft.customerNotes.includes(quietPhrase) ? quietPhrase : null,
          draft.customerNotes.trim() || null,
        ]
          .filter(Boolean)
          .join(', ');
        const res = await create.mutateAsync({
          branchId: draft.branchId,
          serviceId: draft.serviceId,
          staffProfileId: slot.staffProfileId,
          startAt: new Date(slot.startAt),
          deliveryType: 'IN_STORE',
          ...(notes ? { customerNotes: notes } : {}),
          ...(draft.userPackageItemId ? { userPackageItemId: draft.userPackageItemId } : {}),
          ...(!usingPackage && draft.referralCode.trim()
            ? { referralCode: draft.referralCode.trim().toUpperCase() }
            : {}),
        });
        appointmentId = res?.id;
      }
      navigation.navigate('BookingSuccess', { mode: draft.mode, appointmentId });
    } catch (err) {
      const norm = normalizeError(err);
      setError({ message: norm.message, conflict: SLOT_CONFLICT_CODES.includes(norm.code ?? '') });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <WizardProgress
        step={3}
        title={t('wizard.stepConfirm')}
        onBack={() => navigation.goBack()}
        onStepPress={goToStep}
        onClose={confirmExit}
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <AnimatedEntrance index={0}>
          <View className="gap-2.5">
            <SectionHeader title={t('confirm.title')} hint={t('confirm.subtitle')} />
            <ReviewCard
              serviceName={draft.serviceName ?? '-'}
              serviceSubtitle={draft.serviceSubtitle}
              serviceImageUrl={draft.serviceImageUrl}
              durationLabel={durationLabel}
              staffValue={draft.staffName ?? t('staff.any')}
              staffSub={draft.staffProfileId === null ? t('confirm.anyStaffNote') : null}
              timeValue={slot ? `${formatTime(slot.startAt)} – ${formatTime(slot.endAt)}` : '-'}
              dateValue={start ? longDate(start) : '-'}
              branchValue={branch?.name ?? '…'}
              branchSub={
                branch
                  ? `${branch.address} · ${t('confirm.branchHours', { open: branch.openTime, close: branch.closeTime })}`
                  : null
              }
              quiet={isCreate && draft.quietAppointment}
              onEditStaff={() => goToStep(1)}
              onEditDateTime={() => goToStep(2)}
            />
          </View>
        </AnimatedEntrance>

        {usingPackage ? (
          <AnimatedEntrance index={1}>
            <Notice
              tone="success"
              icon="gift-outline"
              title={t('packages.usingTitle', { name: draft.packageName ?? '' })}
              body={t('packages.usingBody', {
                remaining: Math.max(0, (draft.packageRemaining ?? 1) - 1),
              })}
            />
          </AnimatedEntrance>
        ) : null}

        {isCreate && !usingPackage ? (
          <AnimatedEntrance index={1}>
            <View className="gap-2.5">
              <SectionHeader title={t('confirm.priceTitle')} />
              <PriceBreakdown
                basePrice={basePrice}
                promoSavings={promoSavings}
                dynamicSavings={dynamicSavings}
                dynamicLabel={dynamicLabel}
                total={total}
                depositAmount={draft.depositAmount}
              />
            </View>
          </AnimatedEntrance>
        ) : null}

        {isCreate && !usingPackage ? (
          <AnimatedEntrance index={2}>
            <View className="gap-2.5">
              <SectionHeader title={t('confirm.payTitle')} hint={t('confirm.payHint')} />
              <PaymentPicker
                value={draft.payMethod}
                onChange={(v) => patch({ payMethod: v })}
                depositAmount={draft.depositAmount}
              />
            </View>
          </AnimatedEntrance>
        ) : null}

        {isCreate ? (
          <AnimatedEntrance index={3}>
            <View className="gap-2.5">
              <SectionHeader
                title={t('confirm.notes')}
                right={
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('common.optional')}
                  </T>
                }
              />
              <Card flat className="gap-3 p-3">
                <NoteChips
                  notes={draft.customerNotes}
                  onToggle={(phrase) =>
                    patch({ customerNotes: toggleNoteChip(draft.customerNotes, phrase) })
                  }
                />
                <View>
                  <Input
                    value={draft.customerNotes}
                    onChangeText={(v) => patch({ customerNotes: v })}
                    placeholder={t('confirm.notesPlaceholder')}
                    accessibilityLabel={t('confirm.notes')}
                    multiline
                    maxLength={NOTES_MAX}
                    style={{ fontSize: 12, lineHeight: 17, textAlignVertical: 'top' }}
                  />
                  <T className="mt-1 text-right font-lao text-muted-foreground" style={SMALL}>
                    {draft.customerNotes.length}/{NOTES_MAX}
                  </T>
                </View>
              </Card>
            </View>
          </AnimatedEntrance>
        ) : null}

        {isCreate && !usingPackage ? (
          <AnimatedEntrance index={4}>
            <ReferralField value={draft.referralCode} onChange={(v) => patch({ referralCode: v })} />
          </AnimatedEntrance>
        ) : null}

        <AnimatedEntrance index={5}>
          <Notice
            tone="success"
            icon="shield-checkmark-outline"
            title={t('confirm.cancelPolicyTitle')}
            body={policyText}
          />
        </AnimatedEntrance>
      </ScrollView>

      <FooterBar>
        {error ? (
          <Notice
            tone="destructive"
            icon="alert-circle"
            title={error.conflict ? t('confirm.slotTakenTitle') : t('confirm.submitFailed')}
            body={error.message}
          >
            {error.conflict ? (
              <Button
                variant="outline"
                size="xs"
                fullWidth={false}
                className="mt-2 self-start"
                icon="calendar-outline"
                label={t('confirm.pickAnotherTime')}
                onPress={() => navigation.navigate('WizardDateTime')}
              />
            ) : null}
          </Notice>
        ) : null}
        <FooterSummary
          label={start ? longDate(start) : t('availability.chooseSlot')}
          value={slot ? `${formatTime(slot.startAt)} · ${draft.serviceName ?? ''}` : '-'}
          sub={
            usingPackage
              ? t('packages.paidByPackage')
              : isCreate && totalSavings > 0
              ? t('confirm.savings', { amount: formatLAK(totalSavings) })
              : null
          }
          totalLabel={t('wizard.total')}
          total={formatLAK(isCreate ? total : price)}
          strike={isCreate && totalSavings > 0 ? formatLAK(basePrice) : null}
        />
        <Button
          label={isCreate ? t('confirm.submit') : t('confirm.rescheduleSubmit')}
          size="md"
          labelClassName="text-[13px] text-center"
          icon="checkmark-circle-outline"
          loading={pending}
          disabled={!slot}
          onPress={onSubmit}
        />
        <T className="text-center font-lao text-muted-foreground" style={SMALL}>
          {t('confirm.termsNote')}
        </T>
      </FooterBar>
    </SafeAreaView>
  );
}
