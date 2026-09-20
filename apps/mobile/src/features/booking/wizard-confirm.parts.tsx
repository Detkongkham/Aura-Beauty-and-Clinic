import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';
import { Input } from '../../components/ui/Input';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { formatLAK } from '../../lib/format';
import { colors, shadow } from '../../theme';
import type { BookingPayMethod } from '../../store/booking-draft.store';
import { Card, IconTile, InfoRow, MoneyRow, Pill, Radio, SMALL, T, TOTAL } from './booking-kit';

/** ບັດກວດຄືນ — ຫົວບໍລິການ + ແຖວ ຊ່າງ / ວັນ-ເວລາ / ສາຂາ (ແຕະແກ້ໄຂໄດ້). */
export function ReviewCard({
  serviceName,
  serviceSubtitle,
  serviceImageUrl,
  durationLabel,
  staffValue,
  staffSub,
  dateValue,
  timeValue,
  branchValue,
  branchSub,
  quiet,
  onEditStaff,
  onEditDateTime,
}: {
  serviceName: string;
  serviceSubtitle: string | null;
  serviceImageUrl: string | null;
  durationLabel: string;
  staffValue: string;
  staffSub?: string | null;
  dateValue: string;
  timeValue: string;
  branchValue: string;
  branchSub?: string | null;
  quiet: boolean;
  onEditStaff?: () => void;
  onEditDateTime?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Card className="px-3.5 pt-3.5">
      <View className="flex-row items-center gap-3 pb-3">
        {serviceImageUrl ? (
          <Image
            source={{ uri: serviceImageUrl }}
            className="h-14 w-14 rounded-xl bg-muted"
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View className="h-14 w-14 items-center justify-center rounded-xl bg-primary-subtle">
            <Ionicons name="sparkles" size={20} color={colors.primary} />
          </View>
        )}
        <View className="flex-1">
          <T numberOfLines={2} className="font-lao-semibold text-foreground">
            {serviceName}
          </T>
          {serviceSubtitle ? (
            <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
              {serviceSubtitle}
            </T>
          ) : null}
          <View className="mt-1.5 flex-row flex-wrap gap-1.5">
            <Pill tone="muted" icon="time-outline" label={durationLabel} />
            {quiet ? <Pill tone="primary" icon="volume-mute-outline" label={t('wizard.quietTitle')} /> : null}
          </View>
        </View>
      </View>

      <View className="border-t border-border/70">
        <InfoRow
          icon="person-outline"
          label={t('confirm.staff')}
          value={staffValue}
          sub={staffSub}
          onEdit={onEditStaff}
          editLabel={t('confirm.edit')}
        />
        <InfoRow
          icon="calendar-outline"
          label={t('confirm.dateTime')}
          value={timeValue}
          sub={dateValue}
          onEdit={onEditDateTime}
          editLabel={t('confirm.edit')}
        />
        <InfoRow
          icon="location-outline"
          label={t('confirm.branch')}
          value={branchValue}
          sub={branchSub}
          divider={false}
        />
      </View>
    </Card>
  );
}

/** ບັດລາຄາ — ລາຄາ, ສ່ວນຫຼຸດ, ລວມ, ມັດຈຳຕອນນີ້ / ຈ່າຍທີ່ຮ້ານ. */
export function PriceBreakdown({
  basePrice,
  promoSavings,
  dynamicSavings,
  dynamicLabel,
  total,
  depositAmount,
}: {
  /** ລາຄາກ່ອນສ່ວນຫຼຸດ (compareAtPrice ຫຼື price). */
  basePrice: number;
  promoSavings: number;
  dynamicSavings: number;
  dynamicLabel: string | null;
  total: number;
  depositAmount: number | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const deposit = depositAmount != null && depositAmount > 0 ? Math.min(depositAmount, total) : 0;

  return (
    <Card flat className="p-3.5">
      <MoneyRow label={t('confirm.servicePrice')} value={formatLAK(basePrice)} />
      {promoSavings > 0 ? (
        <MoneyRow label={t('confirm.promoDiscount')} value={`−${formatLAK(promoSavings)}`} tone="success" />
      ) : null}
      {dynamicSavings > 0 ? (
        <MoneyRow
          label={dynamicLabel ?? t('confirm.happyHour')}
          value={`−${formatLAK(dynamicSavings)}`}
          tone="success"
        />
      ) : null}

      <View className="my-2 border-t border-dashed border-border" />

      <View className="flex-row items-end justify-between">
        <View>
          <T className="font-lao-semibold text-foreground">{t('confirm.totalLabel')}</T>
          <T className="font-lao text-muted-foreground" style={SMALL}>
            {t('confirm.taxIncluded')}
          </T>
        </View>
        <T className="font-lao-semibold text-primary-strong" style={TOTAL}>
          {formatLAK(total)}
        </T>
      </View>

      {deposit > 0 ? (
        <View className="mt-3 flex-row gap-2">
          <View className="flex-1 rounded-xl bg-accent-soft/70 p-2.5">
            <T className="font-lao text-accent-foreground" style={SMALL}>
              {t('confirm.depositNow')}
            </T>
            <T className="font-lao-semibold text-foreground">{formatLAK(deposit)}</T>
          </View>
          <View className="flex-1 rounded-xl bg-muted p-2.5">
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {t('confirm.payLater')}
            </T>
            <T className="font-lao-semibold text-foreground">{formatLAK(total - deposit)}</T>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

/** ຕົວເລືອກວິທີຊຳລະ — radio list ແນວຕັ້ງ (ແຖວສູງ 56). */
export function PaymentPicker({
  value,
  onChange,
  depositAmount,
}: {
  value: BookingPayMethod;
  onChange: (v: BookingPayMethod) => void;
  depositAmount: number | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const hasDeposit = depositAmount != null && depositAmount > 0;

  const options: {
    key: BookingPayMethod;
    icon: React.ComponentProps<typeof IconTile>['icon'];
    title: string;
    desc: string;
    badge?: string;
  }[] = [
    {
      key: 'bcel_qr',
      icon: 'qr-code-outline',
      title: t('confirm.payQr'),
      desc: hasDeposit
        ? t('confirm.payQrDepositDesc', { amount: formatLAK(depositAmount) })
        : t('confirm.payQrDesc'),
      badge: t('confirm.recommended'),
    },
    {
      key: 'at_store',
      icon: 'storefront-outline',
      title: t('confirm.payStore'),
      desc: t('confirm.payStoreDesc'),
    },
  ];

  return (
    <View accessibilityRole="radiogroup" className="gap-2">
      {options.map((o) => {
        const selected = value === o.key;
        return (
          <Touchable
            key={o.key}
            onPress={() => onChange(o.key)}
            pressScale={0.985}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${o.title}. ${o.desc}`}
            className={cn(
              'min-h-[56px] flex-row items-center gap-3 rounded-2xl border p-3',
              selected ? 'border-primary bg-primary-subtle/60' : 'border-border bg-card',
            )}
            style={selected ? undefined : shadow.xs}
          >
            <IconTile icon={o.icon} tone={selected ? 'primary' : 'muted'} />
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <T className="font-lao-semibold text-foreground">{o.title}</T>
                {o.badge ? <Pill tone="success" label={o.badge} /> : null}
              </View>
              <T numberOfLines={2} className="font-lao text-muted-foreground" style={SMALL}>
                {o.desc}
              </T>
            </View>
            <Radio selected={selected} />
          </Touchable>
        );
      })}
    </View>
  );
}

/** ແທັກ preset ໝາຍເຫດ — ແຕະເພື່ອເພີ່ມ/ຖອດຂໍ້ຄວາມ. */
export function NoteChips({
  notes,
  onToggle,
}: {
  notes: string;
  onToggle: (phrase: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const chips = [
    t('confirm.noteChipFragrance'),
    t('confirm.noteChipSensitive'),
    t('confirm.noteChipEarly'),
    t('confirm.noteChipTea'),
  ];
  const parts = notes.split(',').map((s) => s.trim());

  return (
    <View className="flex-row flex-wrap gap-2">
      {chips.map((phrase) => {
        const active = parts.includes(phrase);
        return (
          <Touchable
            key={phrase}
            onPress={() => onToggle(phrase)}
            pressScale={0.95}
            hitSlop={4}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            className={cn(
              'h-8 flex-row items-center gap-1 rounded-full border px-3',
              active ? 'border-primary bg-primary-subtle' : 'border-border bg-card',
            )}
          >
            <Ionicons
              name={active ? 'checkmark' : 'add'}
              size={12}
              color={active ? colors.primaryStrong : colors.mutedForeground}
            />
            <T
              className={cn('font-lao-medium', active ? 'text-primary-strong' : 'text-muted-foreground')}
              style={SMALL}
            >
              {phrase}
            </T>
          </Touchable>
        );
      })}
    </View>
  );
}

/** ລະຫັດແນະນຳໝູ່ — ຫຍໍ້ໄວ້ຈົນກວ່າຈະແຕະ (progressive disclosure). */
export function ReferralField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(value.length > 0);

  return (
    <Card flat className="overflow-hidden">
      <Touchable
        onPress={() => setOpen((v) => !v)}
        pressScale={1}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="min-h-[52px] flex-row items-center gap-3 px-3"
      >
        <IconTile icon="gift-outline" tone="accent" />
        <View className="flex-1">
          <T className="font-lao-semibold text-foreground">{t('confirm.referralTitle')}</T>
          <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
            {value ? value : t('confirm.referralCollapsed')}
          </T>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
      </Touchable>
      {open ? (
        <View className="gap-1.5 border-t border-border/70 p-3">
          <Input
            dense
            value={value}
            onChangeText={(v) => onChange(v.toUpperCase())}
            placeholder={t('confirm.referralPlaceholder')}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={32}
            icon="pricetag-outline"
            style={{ fontSize: 12 }}
            accessibilityLabel={t('confirm.referralTitle')}
          />
          <T className="font-lao text-muted-foreground" style={SMALL}>
            {t('confirm.referralHint')}
          </T>
        </View>
      ) : null}
    </Card>
  );
}
