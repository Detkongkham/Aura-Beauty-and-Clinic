import { LOYALTY_POINT_VALUE_LAK, type AddTendersInput, type PaymentView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FooterBar } from '../../components/shared/FooterBar';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { ErrorView } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Segmented } from '../../components/ui/Segmented';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { useAppointment } from '../../features/appointments/appointments.api';
import { Card, MoneyRow, Notice, SMALL, SectionHeader, T } from '../../features/booking/booking-kit';
import { useMyGiftCards } from '../../features/giftcards/giftcards.api';
import { useMyLoyalty } from '../../features/loyalty/loyalty.api';
import {
  AppointmentContext,
  BillSummary,
  GiftCardChips,
  Receipt,
  TenderToggle,
} from '../../features/payments/payment.parts';
import { useAddTenders, useOpenBill } from '../../features/payments/payments.api';
import { BankTransferPanel } from '../../features/payments/transfer.parts';
import { formatLAK } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { colors } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

type Mode = 'transfer' | 'wallet';

const digits = (v: string): number => Number(v.replace(/[^0-9]/g, '')) || 0;

export function PaymentScreen({ navigation, route }: AppScreenProps<'Payment'>): React.JSX.Element {
  const { t } = useTranslation();
  const { appointmentId } = route.params;

  const appt = useAppointment(appointmentId).data;
  const openBill = useOpenBill(appointmentId);
  const addTenders = useAddTenders(appointmentId);
  const loyalty = useMyLoyalty();
  const giftCards = useMyGiftCards();

  const [bill, setBill] = useState<PaymentView | null>(null);
  const [mode, setMode] = useState<Mode>('transfer');
  const [err, setErr] = useState<string | null>(null);

  // wallet tenders (ຄະແນນ + ບັດຂອງຂວັນ)
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [points, setPoints] = useState(0);
  const [useGift, setUseGift] = useState(false);
  const [giftCode, setGiftCode] = useState('');
  const [giftAmount, setGiftAmount] = useState(0);

  const loadBill = (): void => {
    setErr(null);
    openBill.mutate(undefined, {
      onSuccess: (b) => {
        setBill(b);
        if (b.depositAmount <= 0 || b.paidAmount >= b.depositAmount) setMode('wallet');
      },
      onError: (e) => setErr(normalizeError(e).message),
    });
  };

  useEffect(loadBill, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** ສະລິບຖືກອະນຸມັດ → ດຶງບິນໃໝ່ (ບໍ່ປ່ຽນໂໝດ ເພື່ອໃຫ້ລູກຄ້າເຫັນສະຖານະສະລິບຕໍ່). */
  const refreshBill = (): void => {
    openBill.mutate(undefined, { onSuccess: setBill });
  };

  const status = bill?.paymentStatus;
  const settled = status === 'FULLY_PAID';
  const depositDone = status === 'DEPOSIT_PAID' || settled;
  const balance = bill?.balanceAmount ?? 0;
  const depositDue = bill ? Math.max(0, Math.min(bill.depositAmount - bill.paidAmount, balance)) : 0;

  const availablePoints = loyalty.data?.points ?? 0;
  const maxPoints = useMemo(
    () => Math.max(0, Math.min(availablePoints, Math.floor(balance / LOYALTY_POINT_VALUE_LAK))),
    [availablePoints, balance],
  );
  const usablePoints = useLoyalty ? Math.min(points, maxPoints) : 0;
  const loyaltyValue = usablePoints * LOYALTY_POINT_VALUE_LAK;

  const myCards = useMemo(
    () =>
      (giftCards.data ?? []).filter((c) => c.status === 'ACTIVE' && !c.isExpired && c.currentBalance > 0),
    [giftCards.data],
  );
  const pickedCard = myCards.find((c) => c.code === giftCode.trim().toUpperCase()) ?? null;
  const giftCap = Math.max(0, balance - loyaltyValue);
  const giftValue =
    useGift && giftCode.trim()
      ? Math.min(giftAmount, giftCap, pickedCard ? pickedCard.currentBalance : Number.MAX_SAFE_INTEGER)
      : 0;
  const walletTotal = loyaltyValue + giftValue;
  const remainingAtStore = Math.max(0, balance - walletTotal);

  // ---- actions ---------------------------------------------------------------
  /** ໃຊ້ຄະແນນ/ບັດຂອງຂວັນ. ເງິນສົດທີ່ເຫຼືອ ພະນັກງານບັນທຶກທີ່ໜ້າຮ້ານ — ລູກຄ້າບໍ່ສາມາດບັນທຶກເອງ. */
  function applyWallet(): void {
    if (!bill || walletTotal <= 0) return;
    setErr(null);
    const tenders: AddTendersInput['tenders'] = [];
    if (loyaltyValue > 0) {
      tenders.push({ method: 'LOYALTY_POINTS', amount: loyaltyValue, loyaltyPoints: usablePoints });
    }
    if (giftValue > 0) {
      tenders.push({ method: 'GIFT_CARD', amount: giftValue, giftCardCode: giftCode.trim().toUpperCase() });
    }
    addTenders.mutate(
      { paymentId: bill.id, tenders },
      {
        onSuccess: (p) => {
          setBill(p);
          setUseLoyalty(false);
          setUseGift(false);
          setPoints(0);
          setGiftCode('');
          setGiftAmount(0);
          haptics.success();
        },
        onError: (e) => setErr(normalizeError(e).message),
      },
    );
  }

  // ---- render ----------------------------------------------------------------
  if (err && !bill && !openBill.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScreenHeader title={t('payment.title')} onBack={() => navigation.goBack()} />
        <ErrorView message={err} onRetry={loadBill} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title={t('payment.title')} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {appt ? (
          <AnimatedEntrance index={0}>
            <AppointmentContext service={appt.serviceName} startAt={appt.startAt} branch={appt.branchName} />
          </AnimatedEntrance>
        ) : null}

        {!bill ? (
          <View className="gap-3">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-10 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </View>
        ) : (
          <>
            <AnimatedEntrance index={1}>
              <BillSummary bill={bill} />
            </AnimatedEntrance>

            {depositDone ? (
              <AnimatedEntrance index={2}>
                <Notice
                  tone="success"
                  icon="checkmark-circle"
                  title={settled ? t('payment.fullyPaidTitle') : t('payment.paidTitle')}
                  body={settled ? t('payment.paidBody') : t('payment.depositPaidBody', { amount: formatLAK(balance) })}
                />
              </AnimatedEntrance>
            ) : null}

            {!settled ? (
              <>
                <AnimatedEntrance index={3}>
                  <Segmented
                    value={mode}
                    onChange={(v) => {
                      setMode(v);
                      setErr(null);
                    }}
                    options={[
                      { value: 'transfer', label: t('payment.modeTransfer') },
                      { value: 'wallet', label: t('payment.modeWallet') },
                    ]}
                  />
                </AnimatedEntrance>

                {mode === 'transfer' ? (
                  <AnimatedEntrance index={4}>
                    <BankTransferPanel
                      paymentId={bill.id}
                      balance={balance}
                      deposit={depositDue}
                      onApproved={refreshBill}
                    />
                  </AnimatedEntrance>
                ) : (
                  <AnimatedEntrance index={4}>
                    <View className="gap-2.5">
                      <SectionHeader title={t('payment.walletTitle')} hint={t('payment.walletHint')} />
                      <Card flat className="px-3.5">
                        <TenderToggle
                          icon="star-outline"
                          title={t('payment.loyaltyTitle')}
                          desc={
                            maxPoints > 0
                              ? t('payment.loyaltyDesc', {
                                  points: availablePoints.toLocaleString('en-US'),
                                  value: formatLAK(availablePoints * LOYALTY_POINT_VALUE_LAK),
                                })
                              : t('payment.loyaltyNone')
                          }
                          value={useLoyalty}
                          onValueChange={(v) => {
                            setUseLoyalty(v);
                            if (v && points === 0) setPoints(maxPoints);
                          }}
                          deduct={loyaltyValue}
                          disabled={maxPoints === 0}
                        >
                          <Input
                            dense
                            keyboardType="number-pad"
                            value={points ? String(points) : ''}
                            onChangeText={(v) => setPoints(Math.min(maxPoints, digits(v)))}
                            placeholder="0"
                            accessibilityLabel={t('payment.loyaltyTitle')}
                            style={{ fontSize: 12 }}
                            rightSlot={
                              <Touchable
                                onPress={() => setPoints(maxPoints)}
                                hitSlop={8}
                                accessibilityRole="button"
                                className="h-7 justify-center rounded-full bg-primary-subtle px-2.5"
                              >
                                <T className="font-lao-semibold text-primary-strong" style={SMALL}>
                                  {t('payment.useMax')}
                                </T>
                              </Touchable>
                            }
                          />
                          <T className="font-lao text-muted-foreground" style={SMALL}>
                            {t('payment.maxPoints', { points: maxPoints.toLocaleString('en-US') })}
                          </T>
                        </TenderToggle>

                        <View className="h-px bg-border/70" />

                        <TenderToggle
                          icon="gift-outline"
                          title={t('payment.giftTitle')}
                          desc={
                            myCards.length > 0
                              ? t('payment.giftDescMine', { count: myCards.length })
                              : t('payment.giftDesc')
                          }
                          value={useGift}
                          onValueChange={setUseGift}
                          deduct={giftValue}
                        >
                          <GiftCardChips
                            cards={myCards}
                            selectedCode={giftCode.trim().toUpperCase()}
                            onSelect={(c) => {
                              setGiftCode(c.code);
                              setGiftAmount(Math.min(c.currentBalance, giftCap));
                            }}
                          />
                          <Input
                            dense
                            autoCapitalize="characters"
                            autoCorrect={false}
                            value={giftCode}
                            onChangeText={setGiftCode}
                            placeholder="GC-XXXX-XXXX-XXXX"
                            icon="pricetag-outline"
                            accessibilityLabel={t('payment.giftCode')}
                            style={{ fontSize: 12 }}
                          />
                          {giftCode.trim() ? (
                            <Input
                              dense
                              keyboardType="number-pad"
                              value={giftAmount ? String(giftAmount) : ''}
                              onChangeText={(v) => setGiftAmount(digits(v))}
                              placeholder={t('payment.giftAmount')}
                              icon="cash-outline"
                              accessibilityLabel={t('payment.giftAmount')}
                              style={{ fontSize: 12 }}
                            />
                          ) : null}
                          {pickedCard ? (
                            <T className="font-lao text-muted-foreground" style={SMALL}>
                              {t('payment.giftBalance', { amount: formatLAK(pickedCard.currentBalance) })}
                            </T>
                          ) : null}
                        </TenderToggle>
                      </Card>

                      <Card flat className="p-3.5">
                        <MoneyRow label={t('payment.balance')} value={formatLAK(balance)} />
                        {loyaltyValue > 0 ? (
                          <MoneyRow label={t('payment.loyaltyTitle')} value={`−${formatLAK(loyaltyValue)}`} tone="success" />
                        ) : null}
                        {giftValue > 0 ? (
                          <MoneyRow label={t('payment.giftTitle')} value={`−${formatLAK(giftValue)}`} tone="success" />
                        ) : null}
                        <View className="my-1.5 border-t border-dashed border-border" />
                        <MoneyRow
                          label={t('payment.cashAtStore')}
                          hint={t('payment.cashAtStoreHint')}
                          value={formatLAK(remainingAtStore)}
                          strong
                        />
                      </Card>
                    </View>
                  </AnimatedEntrance>
                )}
              </>
            ) : null}

            {bill.transactions.length > 0 ? (
              <AnimatedEntrance index={5}>
                <View className="gap-2.5">
                  <SectionHeader title={t('payment.receiptTitle')} />
                  <Receipt transactions={bill.transactions} />
                </View>
              </AnimatedEntrance>
            ) : null}

            <View className="flex-row items-center justify-center gap-1.5">
              <Ionicons name="lock-closed-outline" size={11} color={colors.mutedForeground} />
              <T className="font-lao text-muted-foreground" style={SMALL}>
                {t('payment.secureNote')}
              </T>
            </View>
          </>
        )}
      </ScrollView>

      <FooterBar>
        {err && bill ? <Notice tone="destructive" icon="alert-circle" body={err} /> : null}

        {!bill ? (
          <Button label={t('payment.title')} size="md" disabled loading={openBill.isPending} />
        ) : settled ? (
          <Button
            label={t('payment.done')}
            size="md"
            icon="checkmark"
            labelClassName="text-[13px] text-center"
            onPress={() => navigation.goBack()}
          />
        ) : mode === 'transfer' ? (
          <Button
            label={depositDone ? t('payment.later') : t('payment.payAtStore')}
            variant="secondary"
            size="md"
            labelClassName="text-[13px] text-center"
            onPress={() => navigation.goBack()}
          />
        ) : walletTotal <= 0 && depositDone ? (
          <Button
            label={t('payment.done')}
            size="md"
            icon="checkmark"
            labelClassName="text-[13px] text-center"
            onPress={() => navigation.goBack()}
          />
        ) : (
          <Button
            label={
              walletTotal > 0
                ? t('payment.applyWallet', { amount: formatLAK(walletTotal) })
                : t('payment.applyWalletEmpty')
            }
            size="md"
            icon="checkmark-circle-outline"
            loading={addTenders.isPending}
            disabled={walletTotal <= 0}
            labelClassName="text-[13px] text-center"
            onPress={applyWallet}
          />
        )}

        {bill && !settled && mode === 'wallet' && !(walletTotal <= 0 && depositDone) ? (
          <Button
            label={depositDone ? t('payment.later') : t('payment.payAtStore')}
            variant="ghost"
            size="sm"
            labelClassName="text-[12px]"
            onPress={() => navigation.goBack()}
          />
        ) : null}
      </FooterBar>
    </SafeAreaView>
  );
}
