import type { GiftCardView, PaymentTransactionView, PaymentView } from '@abcp/shared-types';
import { useTranslation } from 'react-i18next';
import { ScrollView, Switch, View } from 'react-native';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { formatLAK, formatTime, formatDate } from '../../lib/format';
import { colors } from '../../theme';
import {
  Card,
  IconTile,
  MoneyRow,
  Pill,
  SMALL,
  T,
  TOTAL,
  type IconName,
} from '../booking/booking-kit';

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
  BANK_TRANSFER: 'swap-horizontal-outline',
  BANK_QR: 'qr-code-outline',
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
