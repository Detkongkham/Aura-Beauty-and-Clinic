import type { SlipMismatchField } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FooterBar } from '../../components/shared/FooterBar';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { ErrorView } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { Card, Notice, Pill, SectionHeader } from '../../features/booking/booking-kit';
import { useReviewSlip, useSlip } from '../../features/payments/transfer.api';
import { cn } from '../../lib/cn';
import { formatDate, formatLAK, formatTime } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { colors } from '../../theme';
import type { StaffAppScreenProps } from '../../navigation/types';
import { SMALL, T } from './staff-portal.parts';
import { staffSlipMeta } from './StaffSlipInboxScreen';

const REJECT_REASONS = ['amount', 'account', 'unclear', 'old'] as const;

/** ແຖວປຽບທຽບ: ສິ່ງທີ່ຄາດໝາຍ ↔ ສິ່ງທີ່ OCR ອ່ານໄດ້ (ໄຮໄລ້ເຫຼືອງ/ແດງຖ້າບໍ່ກົງ). */
function CompareRow({
  label,
  expected,
  read,
  bad,
}: {
  label: string;
  expected?: string | null;
  read: string | null;
  bad?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className={cn('gap-0.5 border-b border-border/70 py-2.5', bad && 'rounded-lg bg-warning-soft px-2')}>
      <View className="flex-row items-center gap-1.5">
        {bad ? <Ionicons name="alert-circle" size={12} color={colors.warning} /> : null}
        <T className={cn('font-lao-semibold', bad ? 'text-warning' : 'text-muted-foreground')} style={SMALL}>
          {label}
        </T>
      </View>
      <T className="font-lao-medium text-foreground">{read ?? t('staffPortal.slips.notRead')}</T>
      {expected ? (
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {t('staffPortal.slips.expected', { value: expected })}
        </T>
      ) : null}
    </View>
  );
}

/** ກວດສະລິບໜຶ່ງໃບ — ຮູບ + ຄ່າ OCR ທຽບກັບບິນ, ອະນຸມັດ (ແກ້ຈຳນວນ/ເລກອ້າງອີງໄດ້) ຫຼື ປະຕິເສດພ້ອມເຫດຜົນ. */
export function StaffSlipReviewScreen({
  navigation,
  route,
}: StaffAppScreenProps<'StaffSlipReview'>): React.JSX.Element {
  const { t } = useTranslation();
  const { slipId } = route.params;
  const query = useSlip(slipId);
  const review = useReviewSlip(slipId);
  const slip = query.data;

  const [zoom, setZoom] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState('');
  // ຄ່າທີ່ແກ້ດ້ວຍມື — undefined = ໃຊ້ຄ່າ OCR
  const [amountEdit, setAmountEdit] = useState<string | undefined>();
  const [refEdit, setRefEdit] = useState<string | undefined>();

  if (query.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScreenHeader title={t('staffPortal.slips.reviewTitle')} onBack={() => navigation.goBack()} />
        <ErrorView message={normalizeError(query.error).message} onRetry={() => void query.refetch()} />
      </SafeAreaView>
    );
  }

  const meta = slip ? staffSlipMeta(slip) : null;
  const reviewable = slip?.verdict === 'AUTO_MATCHED' || slip?.verdict === 'NEEDS_REVIEW';
  const ocrRunning = slip?.verdict === 'PENDING';
  const mismatch = (f: SlipMismatchField): boolean => slip?.mismatchFields.includes(f) ?? false;

  const amountValue = amountEdit ?? (slip?.amount != null ? String(Math.round(slip.amount)) : '');
  const refValue = refEdit ?? slip?.txnRef ?? '';
  const amountNum = Number(amountValue.replace(/[^0-9]/g, '')) || 0;

  const onFail = (e: unknown): void => {
    haptics.error();
    Alert.alert('', normalizeError(e).message);
  };

  const approve = (): void => {
    if (!slip) return;
    if (amountNum <= 0 || refValue.trim().length < 4) {
      Alert.alert('', t('staffPortal.slips.needFields'));
      return;
    }
    const corrected: { amount?: number; txnRef?: string } = {};
    if (amountNum !== (slip.amount != null ? Math.round(slip.amount) : 0)) corrected.amount = amountNum;
    if (refValue.trim().toUpperCase() !== (slip.txnRef ?? '').toUpperCase()) corrected.txnRef = refValue.trim();

    Alert.alert(
      t('staffPortal.slips.approveConfirmTitle'),
      t('staffPortal.slips.approveConfirmBody', { amount: formatLAK(amountNum) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('staffPortal.slips.approve'),
          onPress: () =>
            review.mutate(
              { action: 'APPROVE', ...(Object.keys(corrected).length ? { correctedFields: corrected } : {}) },
              {
                onSuccess: () => {
                  haptics.success();
                  navigation.goBack();
                },
                onError: onFail,
              },
            ),
        },
      ],
    );
  };

  const reject = (): void => {
    const reason = note.trim();
    if (!reason) return;
    review.mutate(
      { action: 'REJECT', note: reason },
      {
        onSuccess: () => {
          setRejectOpen(false);
          haptics.success();
          navigation.goBack();
        },
        onError: onFail,
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title={t('staffPortal.slips.reviewTitle')} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {!slip || !meta ? (
          <>
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </>
        ) : (
          <>
            <AnimatedEntrance index={0}>
              <Card className="gap-3 p-3.5">
                <View className="flex-row items-start justify-between gap-2">
                  <View className="min-w-0 flex-1">
                    <T numberOfLines={1} className="font-lao-semibold text-foreground">
                      {slip.customerName ?? slip.uploadedByName}
                    </T>
                    <T className="font-lao text-muted-foreground" style={SMALL}>
                      {`${slip.branchName} · ${formatDate(slip.createdAt)} ${formatTime(slip.createdAt)}`}
                    </T>
                  </View>
                  <Pill tone={meta.tone} icon={meta.icon} label={t(`staffPortal.slips.verdict_${meta.key}`)} />
                </View>

                <Touchable
                  onPress={() => setZoom(true)}
                  pressScale={0.99}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={t('staffPortal.slips.zoom')}
                >
                  <Image
                    source={{ uri: slip.imageUrl }}
                    accessibilityIgnoresInvertColors
                    className="h-72 w-full rounded-xl bg-muted"
                    resizeMode="contain"
                  />
                  <View className="absolute bottom-2 right-2 flex-row items-center gap-1 rounded-full bg-black/55 px-2 py-1">
                    <Ionicons name="expand-outline" size={11} color="#fff" />
                    <T className="font-lao text-white" style={SMALL}>
                      {t('staffPortal.slips.zoom')}
                    </T>
                  </View>
                </Touchable>
              </Card>
            </AnimatedEntrance>

            {ocrRunning ? (
              <Notice tone="primary" icon="scan-outline" body={t('staffPortal.slips.ocrRunning')} />
            ) : null}
            {slip.verdict === 'DUPLICATE' ? (
              <Notice tone="destructive" icon="copy-outline" body={t('staffPortal.slips.duplicateNote')} />
            ) : null}
            {slip.ocrStatus === 'FAILED' ? (
              <Notice tone="warning" icon="alert-circle-outline" body={t('staffPortal.slips.ocrFailed')} />
            ) : null}

            <AnimatedEntrance index={1}>
              <View className="gap-2">
                <SectionHeader
                  title={t('staffPortal.slips.compareTitle')}
                  hint={t('staffPortal.slips.score', { score: slip.matchScore })}
                />
                <Card flat className="px-3.5 py-1">
                  <CompareRow
                    label={t('staffPortal.slips.fAmount')}
                    read={slip.amount != null ? formatLAK(slip.amount) : null}
                    expected={formatLAK(slip.declaredAmount ?? slip.payment.balanceAmount)}
                    bad={mismatch('amount')}
                  />
                  <CompareRow
                    label={t('staffPortal.slips.fAccount')}
                    read={slip.receiverAccount}
                    expected={slip.bankAccount ? `${slip.bankAccount.accountNumber} (${slip.bankAccount.bankCode})` : null}
                    bad={mismatch('receiverAccount')}
                  />
                  <CompareRow
                    label={t('staffPortal.slips.fTime')}
                    read={slip.transferredAt ? `${formatDate(slip.transferredAt)} ${formatTime(slip.transferredAt)}` : null}
                    bad={mismatch('transferredAt')}
                  />
                  <CompareRow label={t('staffPortal.slips.fRef')} read={slip.txnRef} bad={mismatch('txnRef')} />
                  <CompareRow label={t('staffPortal.slips.fBank')} read={slip.bankCode} />
                </Card>
              </View>
            </AnimatedEntrance>

            {reviewable ? (
              <AnimatedEntrance index={2}>
                <View className="gap-2">
                  <SectionHeader
                    title={t('staffPortal.slips.editTitle')}
                    hint={t('staffPortal.slips.editHint')}
                  />
                  <Card flat className="gap-3 p-3.5">
                    <Input
                      dense
                      label={t('staffPortal.slips.fAmount')}
                      keyboardType="number-pad"
                      value={amountValue}
                      onChangeText={setAmountEdit}
                      icon="cash-outline"
                      style={{ fontSize: 12 }}
                    />
                    <Input
                      dense
                      label={t('staffPortal.slips.fRef')}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      value={refValue}
                      onChangeText={setRefEdit}
                      icon="pricetag-outline"
                      style={{ fontSize: 12 }}
                    />
                  </Card>
                </View>
              </AnimatedEntrance>
            ) : null}

            {slip.verdict === 'APPROVED' || slip.verdict === 'REJECTED' ? (
              <Notice
                tone={slip.verdict === 'APPROVED' ? 'success' : 'destructive'}
                icon={slip.verdict === 'APPROVED' ? 'checkmark-circle' : 'close-circle'}
                title={t(`staffPortal.slips.verdict_${slip.verdict}`)}
                body={[slip.reviewedByName, slip.rejectReason ?? slip.reviewNote].filter(Boolean).join(' · ') || null}
              />
            ) : null}
          </>
        )}
      </ScrollView>

      {slip && (reviewable || slip.verdict === 'DUPLICATE') ? (
        <FooterBar>
          {reviewable ? (
            <Button
              label={t('staffPortal.slips.approve')}
              size="md"
              icon="checkmark-circle-outline"
              loading={review.isPending && !rejectOpen}
              labelClassName="text-[13px] text-center"
              onPress={approve}
            />
          ) : null}
          <Button
            label={t('staffPortal.slips.reject')}
            size="md"
            variant="outline"
            icon="close-circle-outline"
            disabled={review.isPending}
            labelClassName="text-[13px] text-center"
            onPress={() => setRejectOpen(true)}
          />
        </FooterBar>
      ) : null}

      {/* ປະຕິເສດ — ຕ້ອງມີເຫດຜົນ (ລູກຄ້າຈະເຫັນໃນ push + ໜ້າຈ່າຍເງິນ) */}
      <Sheet
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={t('staffPortal.slips.rejectTitle')}
        description={t('staffPortal.slips.rejectHint')}
      >
        <View className="gap-3">
          <View className="flex-row flex-wrap gap-2">
            {REJECT_REASONS.map((r) => {
              const text = t(`staffPortal.slips.reason_${r}`);
              const active = note === text;
              return (
                <Touchable
                  key={r}
                  onPress={() => setNote(text)}
                  pressScale={0.96}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={cn(
                    'min-h-[36px] justify-center rounded-full border px-3',
                    active ? 'border-primary bg-primary-subtle' : 'border-border bg-card',
                  )}
                >
                  <T className={cn('font-lao-medium', active ? 'text-primary-strong' : 'text-foreground')} style={SMALL}>
                    {text}
                  </T>
                </Touchable>
              );
            })}
          </View>
          <Input
            dense
            multiline
            value={note}
            onChangeText={setNote}
            placeholder={t('staffPortal.slips.rejectPlaceholder')}
            maxLength={500}
            style={{ fontSize: 12 }}
          />
          <Button
            label={t('staffPortal.slips.rejectConfirm')}
            size="md"
            variant="destructive"
            loading={review.isPending}
            disabled={!note.trim()}
            labelClassName="text-[13px] text-center"
            onPress={reject}
          />
        </View>
      </Sheet>

      {/* ເບິ່ງຮູບເຕັມຈໍ */}
      <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)} statusBarTranslucent>
        <Pressable
          className="flex-1 items-center justify-center bg-black/95"
          onPress={() => setZoom(false)}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          {slip ? (
            <Image
              source={{ uri: slip.imageUrl }}
              accessibilityIgnoresInvertColors
              style={{ width: '100%', height: '85%' }}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
