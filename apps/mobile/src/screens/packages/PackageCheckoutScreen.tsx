import type { DepositIntentView } from '@abcp/shared-types';
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
import {
  Card,
  IconTile,
  MoneyRow,
  Notice,
  SMALL,
  SectionHeader,
  T,
  TOTAL,
} from '../../features/booking/booking-kit';
import { PackageThumb } from '../../features/packages/packages.parts';
import { DepositIntro, QrCard } from '../../features/payments/payment.parts';
import { useDepositIntent, useSettleMock } from '../../features/payments/payments.api';
import { formatLAK } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import type { AppScreenProps } from '../../navigation/types';
import { normalizeError } from '../../services/apiError';
import { qk } from '../../services/queryKeys';
import { colors, shadow } from '../../theme';

/**
 * ຈ່າຍບິນຊື້ແພັກເກັດຜ່ານ BCEL One QR (deposit-intent → settle). ເງິນສົດ = ພະນັກງານບັນທຶກ
 * ທີ່ໜ້າຮ້ານເທົ່ານັ້ນ. ແພັກເກັດ activate ຝັ່ງ server ເມື່ອບິນ FULLY_PAID.
 *
 * 3 ສະຖານະຂອງໜ້າ: (1) ກ່ອນສ້າງ QR = ອະທິບາຍ 3 ຂັ້ນ + ທາງເລືອກຈ່າຍທີ່ຮ້ານ,
 * (2) ມີ QR = ບັດ QR ພ້ອມໂມງນັບຖອຍຫຼັງ/ສ້າງໃໝ່/ຄັດລອກເລກອ້າງອີງ, (3) ຈ່າຍສຳເລັດ = ບັດຢືນຢັນ
 * ພ້ອມທາງໄປຈອງຕໍ່. ປຸ່ມຫຼັກຢູ່ FooterBar ບ່ອນດຽວທຸກສະຖານະ.
 */
export function PackageCheckoutScreen({
  navigation,
  route,
}: AppScreenProps<'PackageCheckout'>): React.JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { paymentId, amount, packageName } = route.params;

  const depositIntent = useDepositIntent();
  const settle = useSettleMock(paymentId);

  const [intent, setIntent] = useState<DepositIntentView | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFail = (e: unknown): void => setErr(normalizeError(e).message);
  const onPaid = (): void => {
    setDone(true);
    haptics.success();
    void qc.invalidateQueries({ queryKey: qk.myPackages });
  };

  const startQr = (): void => {
    setErr(null);
    depositIntent.mutate(paymentId, { onSuccess: setIntent, onError: onFail });
  };
  const confirmQr = (): void => {
    if (!intent) return;
    setErr(null);
    settle.mutate(
      { paymentId, qrReference: intent.qrReference },
      { onSuccess: onPaid, onError: onFail },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader
        title={t('packages.checkoutTitle')}
        titleStyle={{ fontSize: 14, lineHeight: 19 }}
        onBack={done ? undefined : () => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── ລາຍການສັ່ງຊື້ ─────────────────────────────────────── */}
        <AnimatedEntrance index={0}>
          <View className="gap-2">
            <SectionHeader title={t('packages.orderSummary')} />
            <Card className="p-3.5">
              <View className="flex-row items-center gap-3">
                <PackageThumb uri={null} size={44} />
                <View className="min-w-0 flex-1">
                  <T numberOfLines={2} className="font-lao-semibold text-foreground">
                    {packageName}
                  </T>
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('packages.oneTimePayment')}
                  </T>
                </View>
              </View>
              <View className="mt-2.5 border-t border-border/70 pt-1.5">
                <MoneyRow label={t('packages.checkoutTotal')} value={formatLAK(amount)} strong />
              </View>
            </Card>
          </View>
        </AnimatedEntrance>

        {/* ── ສະຖານະການຈ່າຍ ────────────────────────────────────── */}
        {done ? (
          <AnimatedEntrance index={1}>
            <View className="overflow-hidden rounded-2xl" style={shadow.card}>
              <Gradient preset="hero" fill pointerEvents="none" />
              <View className="items-center gap-2 p-5" accessibilityLiveRegion="polite">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-white/15">
                  <Ionicons name="checkmark-circle" size={30} color="#fff" />
                </View>
                <T className="text-center font-lao-semibold text-white" style={TOTAL}>
                  {t('packages.doneTitle')}
                </T>
                <T className="text-center font-lao text-white/75" style={SMALL}>
                  {t('packages.doneBody')}
                </T>
                <View className="mt-1 flex-row items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1">
                  <Ionicons name="hourglass-outline" size={11} color="rgba(255,255,255,0.8)" />
                  <T className="font-lao text-white/80" style={SMALL}>
                    {t('packages.validityStartsNow')}
                  </T>
                </View>
              </View>
            </View>
          </AnimatedEntrance>
        ) : intent ? (
          <AnimatedEntrance index={1}>
            <QrCard
              payload={intent.qrPayload}
              amount={intent.amount}
              reference={intent.qrReference}
              expiresAt={intent.expiresAt}
              onRegenerate={startQr}
            />
          </AnimatedEntrance>
        ) : (
          <AnimatedEntrance index={1}>
            <View className="gap-3">
              <DepositIntro amount={amount} />

              {/* ທາງເລືອກ: ຈ່າຍເງິນສົດທີ່ໜ້າຮ້ານ */}
              <Card flat className="flex-row items-center gap-3 p-3.5">
                <IconTile icon="cash-outline" tone="accent" size={40} />
                <View className="min-w-0 flex-1">
                  <T className="font-lao-semibold text-foreground">{t('packages.cashOption')}</T>
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('payment.cashAtStoreHint')}
                  </T>
                </View>
              </Card>

              <View className="flex-row items-center justify-center gap-1.5">
                <Ionicons name="lock-closed-outline" size={11} color={colors.mutedForeground} />
                <T className="font-lao text-muted-foreground" style={SMALL}>
                  {t('payment.secureNote')}
                </T>
              </View>
            </View>
          </AnimatedEntrance>
        )}

        {err ? (
          <Notice tone="destructive" icon="alert-circle-outline" body={err} />
        ) : null}
      </ScrollView>

      <FooterBar>
        {done ? (
          <>
            <Button
              label={t('packages.goToMine')}
              size="sm"
              icon="wallet-outline"
              labelClassName="text-[12px]"
              onPress={() => navigation.replace('MyPackages')}
            />
            <Touchable
              onPress={() => navigation.navigate('ServiceList')}
              haptic="none"
              hitSlop={8}
              accessibilityRole="button"
              className="min-h-[28px] items-center justify-center"
            >
              <T className="font-lao-medium text-primary underline" style={SMALL}>
                {t('packages.doneBookNow')}
              </T>
            </Touchable>
          </>
        ) : (
          <>
            <Button
              label={intent ? t('payment.confirmPaid') : t('packages.createQrCta')}
              size="sm"
              icon={intent ? 'checkmark' : 'qr-code-outline'}
              loading={intent ? settle.isPending : depositIntent.isPending}
              labelClassName="text-[12px]"
              onPress={intent ? confirmQr : startQr}
            />
            <T className="text-center font-lao text-muted-foreground" style={SMALL}>
              {t('packages.payAtStoreHint')}
            </T>
          </>
        )}
      </FooterBar>
    </SafeAreaView>
  );
}
