import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FooterBar } from '../../components/shared/FooterBar';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Button } from '../../components/ui/Button';
import { Gradient } from '../../components/ui/Gradient';
import { Touchable } from '../../components/ui/Touchable';
import { usePaymentById } from '../../features/payments/transfer.api';
import { BankTransferPanel } from '../../features/payments/transfer.parts';
import { Radio } from '../../features/booking/booking-kit';
import {
  Card,
  CopyPill,
  DISPLAY,
  IconTile,
  KeyValue,
  Notice,
  SectionHeader,
  SMALL,
  T,
  type IconName,
} from '../../features/profile/profile-kit';
import { cn } from '../../lib/cn';
import { formatLAK } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { qk } from '../../services/queryKeys';
import { colors, shadow } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';
import * as Clipboard from 'expo-clipboard';

/**
 * Wave 10A (ອຸດ C1) — ໜ້າຈ່າຍເງິນສະເພາະການຊື້ບັດຂອງຂວັນ (self-purchase). ໃຊ້ payments flow ດຽວກັບ
 * booking (deposit-intent/tenders) ແຕ່ບໍ່ຜູກ appointment — ບັດຈະ activate ອັດຕະໂນມັດຝັ່ງ server
 * ເມື່ອ Payment ນີ້ຮອດ FULLY_PAID (ເບິ່ງ payments.service.recomputeAndSettle).
 *
 * UI = 3 ຂັ້ນຕອນຊັດເຈນ (ເລືອກວິທີ → ໂອນ+ອັບສະລິບ → ສຳເລັດ) ໂດຍໃຊ້ <BankTransferPanel> ອັນດຽວກັນກັບ
 * ໜ້າຈ່າຍເງິນຂອງການຈອງ. "ສຳເລັດ" = ບິນ FULLY_PAID (ພະນັກງານອະນຸມັດສະລິບແລ້ວ), ບໍ່ແມ່ນແຕ່ລູກຄ້າກົດເອງ.
 */

type Method = 'TRANSFER' | 'CASH';
type Step = 0 | 1 | 2;

const METHODS: readonly { id: Method; icon: IconName; titleKey: string; descKey: string }[] = [
  { id: 'TRANSFER', icon: 'swap-horizontal-outline', titleKey: 'payment.transfer.methodTitle', descKey: 'payment.transfer.methodDesc' },
  { id: 'CASH', icon: 'storefront-outline', titleKey: 'giftCards.checkoutCash', descKey: 'giftCards.methodCashDesc' },
];

export function GiftCardCheckoutScreen({
  navigation,
  route,
}: AppScreenProps<'GiftCardCheckout'>): React.JSX.Element {
  const { t } = useTranslation();
  const { paymentId, amount, code } = route.params;

  const qc = useQueryClient();
  const payment = usePaymentById(paymentId);

  const [method, setMethod] = useState<Method>('TRANSFER');
  const [paying, setPaying] = useState(false);
  const [copied, setCopied] = useState(false);

  const done = payment.data?.paymentStatus === 'FULLY_PAID';
  const step: Step = done ? 2 : paying ? 1 : 0;
  const balance = payment.data?.balanceAmount ?? amount;

  const onApproved = (): void => {
    void payment.refetch();
    void qc.invalidateQueries({ queryKey: qk.giftCards });
  };

  const copyCode = async (): Promise<void> => {
    await Clipboard.setStringAsync(code);
    haptics.select();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title={t('giftCards.checkoutTitle')} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <StepRail step={step} />

        {/* ບັດທີ່ກຳລັງຊື້ */}
        <AnimatedEntrance index={0}>
          <View className="overflow-hidden rounded-3xl" style={shadow.card}>
            <Gradient preset="hero" fill pointerEvents="none" />
            <View pointerEvents="none" className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-champagne/10" />
            <View className="p-4">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="gift" size={13} color={colors.champagne} />
                <T className="font-lao-medium text-white/75">{t('giftCards.cardLabel')}</T>
              </View>
              <T className="mt-1.5 font-sans-semibold text-white" style={DISPLAY}>
                {formatLAK(amount)}
              </T>
              <View className="mt-2">
                <CopyPill dark value={code} label={t('giftCards.cardLabel')} copied={copied} onPress={copyCode} />
              </View>
            </View>
          </View>
        </AnimatedEntrance>

        {done ? (
          <AnimatedEntrance index={1}>
            <Card className="items-center gap-2 p-5">
              <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-full">
                <Gradient preset="success" fill radius={999} pointerEvents="none" />
                <Ionicons name="checkmark" size={28} color="#fff" />
              </View>
              <T className="font-lao-semibold text-foreground">{t('giftCards.checkoutDoneTitle')}</T>
              <T className="text-center font-lao text-muted-foreground" style={SMALL}>
                {t('giftCards.checkoutDoneBody')}
              </T>
              <View className="mt-1.5 w-full rounded-2xl bg-muted p-3">
                <KeyValue label={t('giftCards.cardLabel')} value={code} mono />
                <KeyValue label={t('payment.total')} value={formatLAK(amount)} tone="success" divider={false} />
              </View>
            </Card>
          </AnimatedEntrance>
        ) : paying ? (
          <AnimatedEntrance index={1}>
            <BankTransferPanel paymentId={paymentId} balance={balance} onApproved={onApproved} />
          </AnimatedEntrance>
        ) : (
          <AnimatedEntrance index={1}>
            <View className="gap-2">
              <SectionHeader title={t('giftCards.methodTitle')} hint={t('giftCards.methodHint')} />
              <Card className="px-3.5">
                {METHODS.map((m, i) => (
                  <Touchable
                    key={m.id}
                    onPress={() => setMethod(m.id)}
                    pressScale={1}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: method === m.id }}
                    accessibilityLabel={t(m.titleKey)}
                    className={cn(
                      'min-h-[56px] flex-row items-center gap-3 py-3',
                      i < METHODS.length - 1 && 'border-b border-border/70',
                    )}
                  >
                    <IconTile icon={m.icon} tone={m.id === 'TRANSFER' ? 'primary' : 'accent'} />
                    <View className="min-w-0 flex-1">
                      <T className="font-lao-semibold text-foreground">{t(m.titleKey)}</T>
                      <T className="font-lao text-muted-foreground" style={SMALL}>
                        {t(m.descKey)}
                      </T>
                    </View>
                    <Radio selected={method === m.id} />
                  </Touchable>
                ))}
              </Card>
            </View>
          </AnimatedEntrance>
        )}

        {!done && method === 'CASH' && !paying ? (
          <Notice
            tone="accent"
            icon="storefront-outline"
            title={t('giftCards.checkoutCash')}
            body={t('giftCards.checkoutCashNote', { code })}
          />
        ) : null}

        {!done && !paying && method === 'TRANSFER' ? (
          <Notice tone="muted" icon="shield-checkmark-outline" body={t('payment.secureNote')} />
        ) : null}

      </ScrollView>

      <FooterBar>
        {done ? (
          <Button
            label={t('giftCards.viewMyCards')}
            size="md"
            icon="arrow-forward"
            labelClassName="text-[13px] text-center"
            onPress={() => navigation.navigate('GiftCards')}
          />
        ) : paying ? (
          <Button
            label={t('payment.later')}
            size="md"
            variant="secondary"
            labelClassName="text-[13px] text-center"
            onPress={() => navigation.navigate('GiftCards')}
          />
        ) : method === 'TRANSFER' ? (
          <Button
            label={t('giftCards.payAmount', { amount: formatLAK(amount) })}
            size="md"
            icon="swap-horizontal-outline"
            labelClassName="text-[13px] text-center"
            onPress={() => {
              haptics.select();
              setPaying(true);
            }}
          />
        ) : (
          <Button
            label={t('giftCards.cashUnderstood')}
            size="md"
            variant="secondary"
            icon="checkmark"
            labelClassName="text-[13px] text-center"
            onPress={() => navigation.navigate('GiftCards')}
          />
        )}
      </FooterBar>
    </SafeAreaView>
  );
}

// ---- step rail -------------------------------------------------------------

/** ຕົວຊີ້ຂັ້ນຕອນ 3 ຂັ້ນ — ເສັ້ນເຕັມ/ຈາງ + ປ້າຍ 10px (ບໍ່ກິນທີ່). */
function StepRail({ step }: { step: Step }): React.JSX.Element {
  const { t } = useTranslation();
  const labels = [t('giftCards.step1'), t('giftCards.step2'), t('giftCards.step3')];
  return (
    <View
      className="flex-row gap-1.5"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: 3, now: step + 1 }}
    >
      {labels.map((label, i) => {
        const reached = i <= step;
        return (
          <View key={label} className="flex-1 gap-1">
            <View className={cn('h-1 rounded-full', reached ? 'bg-primary' : 'bg-muted')} />
            <T
              numberOfLines={1}
              className={cn('font-lao-medium', reached ? 'text-primary-strong' : 'text-muted-foreground')}
              style={SMALL}
            >
              {i + 1}. {label}
            </T>
          </View>
        );
      })}
    </View>
  );
}
