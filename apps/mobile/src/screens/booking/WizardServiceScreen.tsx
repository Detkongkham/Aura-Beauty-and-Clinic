import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FooterBar } from '../../components/shared/FooterBar';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { FooterSummary, Notice, Pill, SectionHeader, T } from '../../features/booking/booking-kit';
import { WizardProgress } from '../../features/booking/WizardProgress';
import { useWizardNav } from '../../features/booking/useWizardNav';
import {
  AnyStaffOption,
  PreferenceToggle,
  SelectedServiceCard,
  StaffOption,
  StaffSkeleton,
} from '../../features/booking/wizard-service.parts';
import { useStaff } from '../../features/catalog/catalog.api';
import { formatLAK } from '../../lib/format';
import { useBookingDraft } from '../../store/booking-draft.store';
import type { AppScreenProps } from '../../navigation/types';

export function WizardServiceScreen({
  navigation,
}: AppScreenProps<'WizardService'>): React.JSX.Element {
  const { t } = useTranslation();
  const { confirmExit } = useWizardNav(navigation);
  const draft = useBookingDraft();
  const patch = useBookingDraft((s) => s.patch);
  const staff = useStaff(
    { branchId: draft.branchId, serviceId: draft.serviceId ?? undefined },
    !!draft.serviceId,
  );

  // ຄະແນນສູງກ່ອນ (stable) — ຊ່າງທີ່ຍັງບໍ່ມີຣີວິວໄປທ້າຍ.
  const options = useMemo(
    () =>
      [...(staff.data ?? [])].sort(
        (a, b) => (b.totalReviews > 0 ? b.rating : 0) - (a.totalReviews > 0 ? a.rating : 0),
      ),
    [staff.data],
  );

  const selectedStaff = options.find((s) => s.id === draft.staffProfileId) ?? null;
  const staffLabel = selectedStaff?.name ?? t('staff.any');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <WizardProgress
        step={1}
        title={t('wizard.stepService')}
        onBack={() => navigation.goBack()}
        onClose={confirmExit}
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <AnimatedEntrance index={0}>
          <SelectedServiceCard
            name={draft.serviceName ?? '-'}
            subtitle={draft.serviceSubtitle}
            imageUrl={draft.serviceImageUrl}
            price={draft.price ?? 0}
            compareAtPrice={draft.compareAtPrice}
            durationMinutes={draft.durationMinutes ?? 0}
            depositAmount={draft.depositAmount}
            onChange={() => navigation.goBack()}
          />
        </AnimatedEntrance>

        {/* ຊ່າງ */}
        <View className="gap-2.5">
          <AnimatedEntrance index={1}>
            <SectionHeader
              title={t('wizard.chooseStaffTitle')}
              hint={t('wizard.chooseStaffHint')}
              right={
                staff.isSuccess ? (
                  <Pill tone="primary" label={t('wizard.staffAvailable', { count: options.length })} />
                ) : null
              }
            />
          </AnimatedEntrance>

          {staff.isLoading ? (
            <StaffSkeleton />
          ) : staff.isError ? (
            <Notice tone="destructive" icon="cloud-offline-outline" title={t('errors.generic')}>
              <Button
                label={t('common.retry')}
                variant="outline"
                size="xs"
                fullWidth={false}
                className="mt-2 self-start"
                onPress={() => void staff.refetch()}
              />
            </Notice>
          ) : (
            <View accessibilityRole="radiogroup" className="gap-2">
              <AnimatedEntrance index={2}>
                <AnyStaffOption
                  selected={draft.staffProfileId === null}
                  onPress={() => patch({ staffProfileId: null, staffName: null })}
                />
              </AnimatedEntrance>

              {options.map((st, i) => (
                <AnimatedEntrance key={st.id} index={3 + Math.min(i, 5)}>
                  <StaffOption
                    staff={st}
                    selected={draft.staffProfileId === st.id}
                    onPress={() => patch({ staffProfileId: st.id, staffName: st.name })}
                  />
                </AnimatedEntrance>
              ))}

              {options.length === 0 ? (
                <Notice tone="muted" icon="information-circle-outline" body={t('staff.empty')} />
              ) : null}
            </View>
          )}
        </View>

        {/* Preferences */}
        <AnimatedEntrance index={8}>
          <View className="gap-2.5">
            <SectionHeader title={t('wizard.preferencesTitle')} />
            <PreferenceToggle
              icon="volume-mute-outline"
              title={t('wizard.quietTitle')}
              desc={t('wizard.quietDesc')}
              value={draft.quietAppointment}
              onValueChange={(v) => patch({ quietAppointment: v })}
            />
          </View>
        </AnimatedEntrance>
      </ScrollView>

      <FooterBar>
        <FooterSummary
          label={t('wizard.selectedStaff')}
          value={
            <View className="flex-row items-center gap-1.5">
              {selectedStaff ? (
                <Avatar uri={selectedStaff.avatarUrl} name={selectedStaff.name} size={18} mode="cartoon" />
              ) : null}
              <T numberOfLines={1} className="shrink font-lao-semibold text-foreground">
                {staffLabel}
              </T>
            </View>
          }
          sub={
            draft.depositAmount != null && draft.depositAmount > 0
              ? t('wizard.depositLine', { amount: formatLAK(draft.depositAmount) })
              : null
          }
          totalLabel={t('wizard.total')}
          total={formatLAK(draft.price ?? 0)}
        />
        <Button
          label={t('wizard.nextDateTime')}
          size="md"
          icon="arrow-forward"
          labelClassName="text-[13px] text-center"
          disabled={staff.isLoading}
          onPress={() => navigation.navigate('WizardDateTime')}
        />
      </FooterBar>
    </SafeAreaView>
  );
}
