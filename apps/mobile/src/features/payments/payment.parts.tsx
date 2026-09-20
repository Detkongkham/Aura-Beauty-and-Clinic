import type { GiftCardView, PaymentTransactionView, PaymentView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Switch, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { formatLAK, formatTime, formatDate } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { colors } from '../../theme';
import {
  Card,
  IconTile,
  MoneyRow,
  NUM,
  Pill,
  SMALL,
  T,
  TOTAL,
  type IconName,
} from '../booking/booking-kit';

/** ໂມງນັບຖອຍຫຼັງ (ວິນາທີທີ່ເຫຼືອ) — tick ທຸກ 1 ວິ. */
export function useCountdown(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** ບັດບໍລິບົດນັດ — ບໍລິການ · ວັນ-ເວລາ · ສາຂາ. */
export function AppointmentContext({
  service,
  startAt,
  branch,
}: {
  service: string;
  startAt: string;
  branch: string;
}): React.JSX.Element {
  return (
    <Card flat className="flex-row items-center gap-3 p-3">
      <IconTile icon="sparkles" />
      <View className="flex-1">
        <T numberOfLines={1} className="font-lao-semibold text-foreground">
          {service}
        </T>
        <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
          {`${formatDate(startAt)} · ${formatTime(startAt)} · ${branch}`}
        </T>
      </View>
    </Card>
  );
}

/** ບັດຍອດບິນ — ຍອດຄ້າງຈ່າຍໃຫຍ່ + ແຖບຄວາມຄືບໜ້າ + ລາຍລະອຽດ. */
export function BillSummary({ bill }: { bill: PaymentView }): React.JSX.Element {
  const { t } = useTranslation();
  const pct = bill.totalAmount > 0 ? Math.min(1, bill.paidAmount / bill.totalAmount) : 0;
  const settled = bill.balanceAmount <= 0;

  return (
    <Card className="p-3.5">
      <View className="flex-row items-start justify-between">
        <View>
          <T className="font-lao text-muted-foreground" style={SMALL}>
            {settled ? t('payment.statusSettled') : t('payment.balance')}
          </T>
          <T
            className={cn('font-lao-semibold', settled ? 'text-success' : 'text-foreground')}
            style={TOTAL}
          >
            {formatLAK(settled ? bill.paidAmount : bill.balanceAmount)}
          </T>
        </View>
        <Pill
          tone={bill.paymentStatus === 'FULLY_PAID' ? 'success' : bill.paymentStatus === 'DEPOSIT_PAID' ? 'primary' : 'warning'}
          label={t(`payment.status_${bill.paymentStatus}`, { defaultValue: bill.paymentStatus })}
        />
      </View>

      <View
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      >
        <View
          className={cn('h-full rounded-full', settled ? 'bg-success' : 'bg-primary')}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </View>
      <T className="mt-1 font-lao text-muted-foreground" style={SMALL}>
        {t('payment.progress', { paid: formatLAK(bill.paidAmount), total: formatLAK(bill.totalAmount) })}
      </T>

      <View className="mt-3 border-t border-border/70 pt-2">
        <MoneyRow label={t('payment.total')} value={formatLAK(bill.totalAmount)} />
        {bill.depositAmount > 0 ? (
          <MoneyRow label={t('payment.deposit')} value={formatLAK(bill.depositAmount)} />
        ) : null}
        <MoneyRow label={t('payment.paid')} value={formatLAK(bill.paidAmount)} tone={bill.paidAmount > 0 ? 'success' : undefined} />
      </View>
    </Card>
  );
}

/** ກ່ອນສ້າງ QR — ອະທິບາຍ 3 ຂັ້ນ. */
export function DepositIntro({ amount }: { amount: number }): React.JSX.Element {
  const { t } = useTranslation();
  const steps = [t('payment.qrStep1'), t('payment.qrStep2'), t('payment.qrStep3')];
  return (
    <Card flat className="gap-3 p-3.5">
      <View className="flex-row items-center gap-3">
        <IconTile icon="qr-code-outline" size={40} />
        <View className="flex-1">
          <T className="font-lao-semibold text-foreground">{t('payment.bcelTitle')}</T>
          <T className="font-lao text-muted-foreground" style={SMALL}>
            {t('payment.bcelDesc')}
          </T>
        </View>
        <T className="font-lao-semibold text-primary-strong" style={NUM}>
          {formatLAK(amount)}
        </T>
      </View>
      <View className="gap-2 border-t border-border/70 pt-3">
        {steps.map((s, i) => (
          <View key={i} className="flex-row items-center gap-2.5">
            <View className="h-5 w-5 items-center justify-center rounded-full bg-primary-subtle">
              <T className="font-sans-semibold text-primary-strong" style={SMALL}>
                {i + 1}
              </T>
            </View>
            <T className="flex-1 font-lao text-foreground">{s}</T>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** ບັດ QR — ຈຳນວນ, ໂມງນັບຖອຍຫຼັງ, ຄັດລອກເລກອ້າງອີງ. */
export function QrCard({
  payload,
  amount,
  reference,
  expiresAt,
  onRegenerate,
}: {
  payload: string;
  amount: number;
  reference: string;
  expiresAt: string;
  onRegenerate: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const left = useCountdown(expiresAt) ?? 0;
  const expired = left === 0;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async (): Promise<void> => {
    await Clipboard.setStringAsync(reference);
    haptics.select();
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Card className="items-center gap-3 p-4">
      <View className="w-full flex-row items-center justify-between">
        <T className="font-lao-semibold text-foreground">{t('payment.scanTitle')}</T>
        <Pill
          tone={expired ? 'destructive' : left < 60 ? 'warning' : 'muted'}
          icon="timer-outline"
          label={expired ? t('payment.qrExpired') : t('payment.expiresIn', { time: mmss(left) })}
        />
      </View>

      <View
        className={cn('rounded-2xl border border-border bg-card p-3', expired && 'opacity-30')}
        accessibilityLabel={t('payment.scanTitle')}
      >
        <QRCode value={payload} size={176} />
      </View>

      <View className="items-center">
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {t('payment.amountToPay')}
        </T>
        <T className="font-lao-semibold text-foreground" style={TOTAL}>
          {formatLAK(amount)}
        </T>
      </View>

      {expired ? (
        <Touchable
          onPress={onRegenerate}
          pressScale={0.96}
          accessibilityRole="button"
          className="h-9 flex-row items-center gap-1.5 rounded-full bg-primary-subtle px-4"
        >
          <Ionicons name="refresh" size={14} color={colors.primaryStrong} />
          <T className="font-lao-semibold text-primary-strong">{t('payment.regenerate')}</T>
        </Touchable>
      ) : (
        <Touchable
          onPress={() => void copy()}
          pressScale={0.96}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('payment.copyRef', { ref: reference })}
          className="h-8 flex-row items-center gap-1.5 rounded-full bg-muted px-3"
        >
          <T className="font-lao text-muted-foreground" style={SMALL}>
            {t('payment.refLabel')}
          </T>
          <T className="font-sans-semibold text-foreground" style={SMALL}>
            {reference}
          </T>
          <Ionicons
            name={copied ? 'checkmark-circle' : 'copy-outline'}
            size={12}
            color={copied ? colors.success : colors.mutedForeground}
          />
        </Touchable>
      )}

      <View className="w-full flex-row items-center justify-center gap-1.5 rounded-xl bg-warning-soft px-3 py-2">
        <Ionicons name="flask-outline" size={12} color={colors.warning} />
        <T className="font-lao text-warning" style={SMALL}>
          {t('payment.mockHint')}
        </T>
      </View>
    </Card>
  );
}

/** ແຖວ tender ທີ່ເປີດ/ປິດໄດ້ — ໄອຄອນ, ຫົວ, ຄຳອະທິບາຍ, ຈຳນວນທີ່ຫັກ, switch. */
export function TenderToggle({
  icon,
  title,
  desc,
  value,
  onValueChange,
  deduct,
  disabled,
  children,
}: {
  icon: IconName;
  title: string;
  desc: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  deduct: number;
  disabled?: boolean;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View className={cn('gap-2.5 py-3', disabled && 'opacity-50')}>
      <View className="min-h-[40px] flex-row items-center gap-3">
        <IconTile icon={icon} tone={value ? 'primary' : 'muted'} />
        <View className="flex-1">
          <T className="font-lao-semibold text-foreground">{title}</T>
          <T numberOfLines={2} className="font-lao text-muted-foreground" style={SMALL}>
            {desc}
          </T>
        </View>
        {value && deduct > 0 ? (
          <T className="font-lao-semibold text-success">−{formatLAK(deduct)}</T>
        ) : null}
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          accessibilityLabel={title}
          trackColor={{ false: colors.input, true: colors.primary }}
          thumbColor={colors.card}
          ios_backgroundColor={colors.input}
          style={{ transform: [{ scale: 0.85 }] }}
        />
      </View>
      {value ? children : null}
    </View>
  );
}

/** chip ບັດຂອງຂວັນຂອງຂ້ອຍ (ACTIVE) — ແຕະເພື່ອໃຊ້. */
export function GiftCardChips({
  cards,
  selectedCode,
  onSelect,
}: {
  cards: GiftCardView[];
  selectedCode: string;
  onSelect: (card: GiftCardView) => void;
}): React.JSX.Element | null {
  if (cards.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {cards.map((c) => {
        const active = c.code === selectedCode;
        return (
          <Touchable
            key={c.id}
            onPress={() => onSelect(c)}
            pressScale={0.96}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            className={cn(
              'min-h-[44px] justify-center rounded-xl border px-3 py-1.5',
              active ? 'border-primary bg-primary-subtle' : 'border-border bg-card',
            )}
          >
            <T className="font-sans-semibold text-foreground" style={SMALL}>
              {`•••• ${c.code.slice(-4)}`}
            </T>
            <T className={cn('font-lao-medium', active ? 'text-primary-strong' : 'text-muted-foreground')} style={SMALL}>
              {formatLAK(c.currentBalance)}
            </T>
          </Touchable>
        );
      })}
    </ScrollView>
  );
}

const METHOD_ICON: Record<string, IconName> = {
  CASH: 'cash-outline',
  BCEL_ONE_QR: 'qr-code-outline',
  CREDIT_CARD: 'card-outline',
  GIFT_CARD: 'gift-outline',
  PACKAGE_CREDIT: 'albums-outline',
  LOYALTY_POINTS: 'star-outline',
};

/** ໃບຮັບເງິນ — ລາຍການທຸລະກຳທີ່ສຳເລັດແລ້ວ. */
export function Receipt({ transactions }: { transactions: PaymentTransactionView[] }): React.JSX.Element | null {
  const { t } = useTranslation();
  if (transactions.length === 0) return null;
  return (
    <Card flat className="px-3.5 py-1">
      {transactions.map((tx, i) => (
        <View
          key={tx.id}
          className={cn(
            'min-h-[48px] flex-row items-center gap-3 py-2',
            i < transactions.length - 1 && 'border-b border-border/70',
          )}
        >
          <IconTile icon={METHOD_ICON[tx.method] ?? 'receipt-outline'} tone={tx.status === 'SUCCESS' ? 'success' : 'muted'} />
          <View className="flex-1">
            <T className="font-lao-medium text-foreground">
              {t(`payment.method_${tx.method}`, { defaultValue: tx.method })}
            </T>
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {`${formatDate(tx.createdAt)} · ${formatTime(tx.createdAt)}`}
            </T>
          </View>
          <T className="font-lao-semibold text-foreground">{formatLAK(tx.amount)}</T>
        </View>
      ))}
    </Card>
  );
}
