import type { PaymentBankAccountView, PaymentSlipView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { formatDate, formatLAK, formatTime } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { colors } from '../../theme';
import {
  Card,
  IconTile,
  Notice,
  Pill,
  SMALL,
  T,
  TOTAL,
  type IconName,
  type Tone,
} from '../booking/booking-kit';
import { OPEN_VERDICTS, useUploadSlip, usePaymentBankAccounts, usePaymentSlips } from './transfer.api';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
type SlipMime = (typeof ALLOWED_MIME)[number];
const mimeOf = (m: string | null | undefined): SlipMime =>
  (ALLOWED_MIME as readonly string[]).includes(m ?? '') ? (m as SlipMime) : 'image/jpeg';

type Picked = { uri: string; base64: string; mime: SlipMime };

/** ສະຖານະສະລິບ (ມຸມມອງລູກຄ້າ) → ສີ + ໄອຄອນ + ຄີແປ. */
export function slipStatusMeta(s: PaymentSlipView): { tone: Tone; icon: IconName; key: string } {
  switch (s.verdict) {
    case 'APPROVED':
      return { tone: 'success', icon: 'checkmark-circle', key: 'approved' };
    case 'REJECTED':
      return { tone: 'destructive', icon: 'close-circle', key: 'rejected' };
    case 'DUPLICATE':
      return { tone: 'destructive', icon: 'copy-outline', key: 'duplicate' };
    case 'REVERSED':
      return { tone: 'destructive', icon: 'arrow-undo-outline', key: 'reversed' };
    case 'PENDING':
      return { tone: 'primary', icon: 'scan-outline', key: 'checking' };
    default:
      return { tone: 'warning', icon: 'hourglass-outline', key: 'review' };
  }
}

/** ແຖວສະລິບທີ່ເຄີຍຍື່ນ — ຮູບຫຍໍ້ + ສະຖານະ + ເຫດຜົນທີ່ຖືກປະຕິເສດ. */
export function SlipStatusList({ slips }: { slips: PaymentSlipView[] }): React.JSX.Element | null {
  const { t } = useTranslation();
  if (slips.length === 0) return null;
  return (
    <Card flat className="px-3.5 py-1">
      {slips.map((s, i) => {
        const meta = slipStatusMeta(s);
        const shown = s.amount ?? s.declaredAmount;
        return (
          <View
            key={s.id}
            className={cn(
              'flex-row items-center gap-3 py-2.5',
              i < slips.length - 1 && 'border-b border-border/70',
            )}
          >
            <Image
              source={{ uri: s.imageUrl }}
              accessibilityIgnoresInvertColors
              className="h-11 w-11 rounded-lg bg-muted"
              resizeMode="cover"
            />
            <View className="min-w-0 flex-1 gap-0.5">
              <View className="flex-row items-center justify-between gap-2">
                <T className="font-lao-semibold text-foreground">
                  {shown != null ? formatLAK(shown) : t('payment.slip.amountUnknown')}
                </T>
                <Pill tone={meta.tone} icon={meta.icon} label={t(`payment.slip.status_${meta.key}`)} />
              </View>
              <T className="font-lao text-muted-foreground" style={SMALL}>
                {`${formatDate(s.createdAt)} · ${formatTime(s.createdAt)}`}
              </T>
              {s.verdict === 'REJECTED' && s.rejectReason ? (
                <T className="font-lao text-destructive" style={SMALL}>
                  {s.rejectReason}
                </T>
              ) : null}
              {s.verdict === 'REVERSED' && s.reverseReason ? (
                <T className="font-lao text-destructive" style={SMALL}>
                  {s.reverseReason}
                </T>
              ) : null}
              {s.infoRequestedAt && s.infoRequestNote ? (
                <T className="font-lao text-warning" style={SMALL}>
                  {t('payment.slip.infoRequested', { note: s.infoRequestNote })}
                </T>
              ) : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function BankChip({
  account,
  active,
  onPress,
}: {
  account: PaymentBankAccountView;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { i18n } = useTranslation();
  const name = i18n.language === 'lo' ? account.bank.nameLo : account.bank.nameEn;
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.96}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      className={cn(
        'min-h-[44px] flex-row items-center gap-2 rounded-xl border px-3 py-1.5',
        active ? 'border-primary bg-primary-subtle' : 'border-border bg-card',
      )}
    >
      <View className="h-7 w-7 items-center justify-center rounded-lg bg-card">
        <T className="font-sans-semibold text-primary-strong" style={{ fontSize: 9, lineHeight: 12 }}>
          {account.bank.code.slice(0, 4)}
        </T>
      </View>
      <T numberOfLines={1} className={cn('font-lao-semibold', active ? 'text-primary-strong' : 'text-foreground')}>
        {name}
      </T>
    </Touchable>
  );
}

function CopyRow({
  label,
  value,
  copyValue,
  strong,
}: {
  label: string;
  value: string;
  copyValue?: string;
  strong?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = async (): Promise<void> => {
    await Clipboard.setStringAsync(copyValue ?? value);
    haptics.select();
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };
  return (
    <View className="min-h-[44px] flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1">
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {label}
        </T>
        <T
          numberOfLines={1}
          className={cn('text-foreground', strong ? 'font-lao-semibold' : 'font-lao-medium')}
          style={strong ? TOTAL : undefined}
        >
          {value}
        </T>
      </View>
      <Touchable
        onPress={() => void copy()}
        pressScale={0.94}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`${t('payment.transfer.copy')}: ${label}`}
        className="h-8 flex-row items-center gap-1 rounded-full bg-muted px-2.5"
      >
        <Ionicons
          name={copied ? 'checkmark-circle' : 'copy-outline'}
          size={13}
          color={copied ? colors.success : colors.primaryStrong}
        />
        <T className={cn('font-lao-semibold', copied ? 'text-success' : 'text-primary-strong')} style={SMALL}>
          {copied ? t('payment.transfer.copied') : t('payment.transfer.copy')}
        </T>
      </Touchable>
    </View>
  );
}

/**
 * ໂອນເງິນຜ່ານທະນາຄານ + ອັບສະລິບ (Module 39 W6). ລູກຄ້າເລືອກທະນາຄານ → ເຫັນເລກບັນຊີ/QR/ຈຳນວນ (ສຳເນົາໄດ້)
 * → ໂອນໃນແອັບທະນາຄານ → ຖ່າຍ/ເລືອກສະລິບ → ລໍພະນັກງານກວດ. ການຕັດຍອດເກີດຝັ່ງ server ເມື່ອສະລິບຖືກອະນຸມັດ
 * ເທົ່ານັ້ນ — ລູກຄ້າບໍ່ໄດ້ຕັດຍອດເອງ. ໃຊ້ຮ່ວມກັນທັງ 3 ໜ້າຈ່າຍເງິນ (ນັດ / ບັດຂອງຂວັນ / ແພັກເກັດ).
 *
 * @param balance ຍອດຄ້າງທັງໝົດຂອງບິນ
 * @param deposit ຍອດມັດຈຳທີ່ຍັງຄ້າງ (ຖ້າມີ ແລະ < balance ຈະໃຫ້ເລືອກ ມັດຈຳ/ຈ່າຍເຕັມ)
 * @param onApproved ເອີ້ນເມື່ອມີສະລິບປ່ຽນເປັນ APPROVED ຫຼັງເປີດໜ້າ — parent ໃຊ້ refresh ບິນ
 */
export function BankTransferPanel({
  paymentId,
  balance,
  deposit = 0,
  onApproved,
}: {
  paymentId: string;
  balance: number;
  deposit?: number;
  onApproved?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const accounts = usePaymentBankAccounts(paymentId);
  const slips = usePaymentSlips(paymentId);
  const upload = useUploadSlip(paymentId);

  const [pickedId, setPickedId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [payFull, setPayFull] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list = useMemo(() => accounts.data ?? [], [accounts.data]);
  const account = list.find((a) => a.id === pickedId) ?? list[0] ?? null;

  const hasDepositChoice = deposit > 0 && deposit < balance;
  const amount = hasDepositChoice && !payFull ? deposit : balance;

  // ສະລິບປ່ຽນເປັນ APPROVED/REJECTED ຫຼັງເປີດໜ້າ → haptic + ແຈ້ງ parent (ບໍ່ຍິງຕອນ load ຄັ້ງທຳອິດ).
  const seen = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!slips.data) return;
    const now = new Map(slips.data.map((s) => [s.id, s.verdict]));
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    const changed = (v: string): boolean => slips.data.some((s) => s.verdict === v && before.get(s.id) !== v);
    if (changed('APPROVED')) {
      haptics.success();
      onApproved?.();
    } else if (changed('REJECTED')) {
      haptics.error();
    }
  }, [slips.data, onApproved]);

  const pick = async (fromCamera: boolean): Promise<void> => {
    setErr(null);
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErr(t('payment.slip.permissionDenied'));
        return;
      }
      const launch = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      // quality ສູງກວ່າແຊັດ — OCR ຕ້ອງການຕົວເລກຄົມ; backend ຍ່ອ ≤2000px ເອງ
      const res = await launch({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true });
      if (res.canceled) return;
      const asset = res.assets[0];
      if (!asset?.base64) return;
      setPicked({ uri: asset.uri, base64: asset.base64, mime: mimeOf(asset.mimeType) });
    } catch (e) {
      setErr(normalizeError(e).message);
    }
  };

  const send = (): void => {
    if (!picked || !account) return;
    setErr(null);
    upload.mutate(
      { contentType: picked.mime, dataBase64: picked.base64, bankAccountId: account.id, amount },
      {
        onSuccess: () => {
          setPicked(null);
          haptics.success();
        },
        onError: (e) => {
          haptics.error();
          setErr(normalizeError(e).message);
        },
      },
    );
  };

  if (accounts.isPending) {
    return (
      <View className="gap-3">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-52 rounded-2xl" />
      </View>
    );
  }

  if (accounts.isError || !account) {
    return (
      <Notice
        tone="warning"
        icon="information-circle-outline"
        title={t('payment.transfer.unavailableTitle')}
        body={t('payment.transfer.unavailableBody')}
      />
    );
  }

  const openSlips = (slips.data ?? []).filter((s) => OPEN_VERDICTS.includes(s.verdict));

  return (
    <View className="gap-3">
      {/* 1 · ເລືອກທະນາຄານ */}
      {list.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {list.map((a) => (
            <BankChip key={a.id} account={a} active={a.id === account.id} onPress={() => setPickedId(a.id)} />
          ))}
        </ScrollView>
      ) : null}

      {hasDepositChoice ? (
        <Segmented
          value={payFull ? 'full' : 'deposit'}
          onChange={(v) => setPayFull(v === 'full')}
          options={[
            { value: 'deposit', label: t('payment.transfer.optDeposit', { amount: formatLAK(deposit) }) },
            { value: 'full', label: t('payment.transfer.optFull', { amount: formatLAK(balance) }) },
          ]}
        />
      ) : null}

      {/* 2 · ຂໍ້ມູນບັນຊີ + ຈຳນວນ */}
      <Card className="gap-1 p-3.5">
        <View className="flex-row items-center gap-2">
          <IconTile icon="swap-horizontal-outline" size={32} />
          <T className="flex-1 font-lao-semibold text-foreground">{t('payment.transfer.step1')}</T>
        </View>

        {account.qrImageUrl ? (
          <View className="items-center py-2">
            <View className="rounded-2xl border border-border bg-white p-2.5">
              <Image
                source={{ uri: account.qrImageUrl }}
                accessibilityLabel={t('payment.transfer.qrLabel')}
                accessibilityIgnoresInvertColors
                style={{ width: 172, height: 172 }}
                resizeMode="contain"
              />
            </View>
            <T className="mt-1.5 text-center font-lao text-muted-foreground" style={SMALL}>
              {t('payment.transfer.qrHint')}
            </T>
          </View>
        ) : null}

        <View className="border-t border-border/70">
          <CopyRow label={t('payment.transfer.accountName')} value={account.accountName} />
          <CopyRow label={t('payment.transfer.accountNumber')} value={account.accountNumber} />
          <CopyRow
            label={t('payment.transfer.amount')}
            value={formatLAK(amount)}
            copyValue={String(Math.round(amount))}
            strong
          />
        </View>
      </Card>

      {/* 3 · ອັບສະລິບ */}
      <Card className="gap-3 p-3.5">
        <View className="flex-row items-center gap-2">
          <IconTile icon="receipt-outline" size={32} tone="accent" />
          <View className="min-w-0 flex-1">
            <T className="font-lao-semibold text-foreground">{t('payment.transfer.step2')}</T>
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {t('payment.transfer.step2Hint')}
            </T>
          </View>
        </View>

        {picked ? (
          <View className="gap-2.5">
            <Image
              source={{ uri: picked.uri }}
              accessibilityLabel={t('payment.slip.preview')}
              accessibilityIgnoresInvertColors
              className="h-56 w-full rounded-xl bg-muted"
              resizeMode="contain"
            />
            <Button
              label={t('payment.slip.send', { amount: formatLAK(amount) })}
              size="md"
              icon="paper-plane-outline"
              loading={upload.isPending}
              labelClassName="text-[13px] text-center"
              onPress={send}
            />
            <Button
              label={t('payment.slip.change')}
              variant="ghost"
              size="sm"
              labelClassName="text-[12px]"
              disabled={upload.isPending}
              onPress={() => setPicked(null)}
            />
          </View>
        ) : (
          <View className="flex-row gap-2.5">
            {(
              [
                { camera: true, icon: 'camera-outline', label: t('payment.slip.camera') },
                { camera: false, icon: 'images-outline', label: t('payment.slip.library') },
              ] as const
            ).map((o) => (
              <Touchable
                key={o.label}
                onPress={() => void pick(o.camera)}
                pressScale={0.96}
                accessibilityRole="button"
                accessibilityLabel={o.label}
                className="min-h-[76px] flex-1 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-primary bg-primary-subtle px-2 py-3"
              >
                <Ionicons name={o.icon} size={22} color={colors.primaryStrong} />
                <T className="font-lao-semibold text-primary-strong">{o.label}</T>
              </Touchable>
            ))}
          </View>
        )}

        {err ? <Notice tone="destructive" icon="alert-circle-outline" body={err} /> : null}
      </Card>

      {openSlips.length > 0 ? (
        <Notice tone="primary" icon="hourglass-outline" body={t('payment.slip.waitingBody')} />
      ) : null}

      {/* ປະຫວັດສະລິບ */}
      {slips.data && slips.data.length > 0 ? (
        <View className="gap-2">
          <T accessibilityRole="header" className="px-1 font-lao-semibold text-foreground">
            {t('payment.slip.historyTitle')}
          </T>
          <SlipStatusList slips={slips.data} />
        </View>
      ) : null}
    </View>
  );
}
