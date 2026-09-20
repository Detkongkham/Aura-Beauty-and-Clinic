import type { UserPackageUsageView, UserPackageView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Gradient } from '../../components/ui/Gradient';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { cn } from '../../lib/cn';
import { formatDate, formatLAK, formatTime } from '../../lib/format';
import { colors, shadow } from '../../theme';
import { Pill, SMALL, T, TOTAL, type Tone } from '../booking/booking-kit';
import {
  ExpiryPill,
  MetaLine,
  PackageThumb,
  SessionBar,
  SessionRing,
  StatusPill,
  type PackageDisplayState,
} from './packages.parts';

/**
 * "ແພັກເກັດຂອງຂ້ອຍ" = ກະເປົ໋າສິດ. ບັດ 1 ໜ່ວຍ = 1 ແພັກເກັດ: ຫົວບັດບອກສິດທີ່ເຫຼືອ,
 * ກາງບັດແຍກຕາມບໍລິການ (ຈອງໄດ້ທັນທີ), ລຸ່ມບັດເປັນປະຫວັດການໃຊ້ທີ່ກາງອອກໄດ້.
 * ຂໍ້ຄວາມຄົງ 12px — ລຳດັບຊັ້ນມາຈາກນ້ຳໜັກ, ສີ ແລະ ໄລຍະຫ່າງ ບໍ່ແມ່ນຈາກຂະໜາດ.
 */

/** ໃກ້ໝົດອາຍຸ = ≤ 14 ມື້ ແລະ ຍັງມີສິດເຫຼືອ. */
export const EXPIRY_WARN_DAYS = 14;

export function displayState(u: UserPackageView): PackageDisplayState {
  if (u.status !== 'ACTIVE') return u.status;
  if (u.expired) return 'EXPIRED';
  if (u.remainingSessions <= 0) return 'USED_UP';
  return 'ACTIVE';
}

/* ------------------------------------------------------------- summary */

function SummaryCell({
  value,
  label,
  tone = 'default',
}: {
  value: string;
  label: string;
  tone?: 'default' | 'warning';
}): React.JSX.Element {
  return (
    <View className="flex-1 gap-0.5">
      <T
        numberOfLines={1}
        className={cn('font-sans-semibold', tone === 'warning' ? 'text-champagne' : 'text-white')}
        style={TOTAL}
      >
        {value}
      </T>
      <T numberOfLines={1} className="font-lao text-white/65" style={SMALL}>
        {label}
      </T>
    </View>
  );
}

/** ບັດສະຫຼຸບກະເປົ໋າ — ສິດທີ່ໃຊ້ໄດ້ທັງໝົດ + ແພັກເກັດທີ່ເປີດ + ອາຍຸທີ່ໃກ້ໝົດສຸດ. */
export function WalletSummary({
  activeCount,
  sessionsLeft,
  nextExpiry,
  onBrowse,
}: {
  activeCount: number;
  sessionsLeft: number;
  nextExpiry: UserPackageView | null;
  onBrowse: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const soon = nextExpiry != null && nextExpiry.daysLeft <= EXPIRY_WARN_DAYS;
  return (
    <View className="overflow-hidden rounded-2xl p-3.5" style={shadow.card}>
      <Gradient preset="hero" fill pointerEvents="none" />

      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <T className="font-lao text-white/65" style={SMALL}>
            {t('packages.summaryAvailable')}
          </T>
          <T className="font-lao-semibold text-white" style={TOTAL}>
            {t('packages.sessions', { count: sessionsLeft })}
          </T>
        </View>
        <Touchable
          onPress={onBrowse}
          pressScale={0.96}
          accessibilityRole="button"
          accessibilityLabel={t('packages.browse')}
          className="h-8 flex-row items-center gap-1 rounded-full bg-white/15 px-3"
        >
          <Ionicons name="add" size={13} color="#fff" />
          <T className="font-lao-semibold text-white" style={SMALL}>
            {t('packages.addMore')}
          </T>
        </Touchable>
      </View>

      <View className="mt-3 flex-row gap-3 border-t border-white/15 pt-3">
        <SummaryCell value={String(activeCount)} label={t('packages.summaryActive')} />
        <View className="w-px bg-white/15" />
        <SummaryCell
          tone={soon ? 'warning' : 'default'}
          value={
            nextExpiry
              ? t('packages.daysLeft', { count: nextExpiry.daysLeft })
              : t('packages.noneShort')
          }
          label={t('packages.summaryNextExpiry')}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------- usage log */

function usageTone(row: UserPackageUsageView): Tone {
  if (row.returned) return 'muted';
  if (row.status === 'COMPLETED') return 'success';
  if (row.status === 'NO_SHOW') return 'destructive';
  return 'primary';
}

/** ປະຫວັດການໃຊ້ສິດ — ນັດທີ່ຕັດຄັ້ງໄປ (ຍົກເລີກແລ້ວ = ຄືນສິດ). */
export function UsageLog({
  rows,
  loading,
}: {
  rows: UserPackageUsageView[] | undefined;
  loading: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();

  if (loading) {
    return (
      <View className="gap-2 pt-2.5">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" />
        ))}
      </View>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <View className="flex-row items-center gap-2 pt-2.5">
        <Ionicons name="information-circle-outline" size={12} color={colors.mutedForeground} />
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {t('packages.usageEmpty')}
        </T>
      </View>
    );
  }

  return (
    <View className="pt-1.5">
      {rows.map((r) => (
        <View key={r.appointmentId} className="min-h-[36px] flex-row items-center gap-2.5 py-1.5">
          <View
            className={cn(
              'h-6 w-6 items-center justify-center rounded-full',
              r.returned ? 'bg-muted' : 'bg-primary-subtle',
            )}
          >
            <Ionicons
              name={r.returned ? 'arrow-undo' : 'checkmark'}
              size={11}
              color={r.returned ? colors.mutedForeground : colors.primaryStrong}
            />
          </View>
          <View className="min-w-0 flex-1">
            <T numberOfLines={1} className="font-lao-medium text-foreground" style={SMALL}>
              {r.serviceName}
            </T>
            <MetaLine
              items={[
                `${formatDate(r.startAt)} · ${formatTime(r.startAt)}`,
                r.staffName ?? '',
              ]}
            />
          </View>
          <Pill
            tone={usageTone(r)}
            label={r.returned ? t('packages.usageReturned') : t(`status.${r.status}`)}
          />
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------ main card */

/** ແຖວບໍລິການໃນບັດ — ສິດເຫຼືອ + ປຸ່ມຈອງ (ປິດເມື່ອໃຊ້ໝົດ). */
function ItemRow({
  name,
  remaining,
  total,
  canBook,
  onBook,
  bookLabel,
}: {
  name: string;
  remaining: number;
  total: number;
  canBook: boolean;
  onBook: () => void;
  bookLabel: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const out = remaining <= 0;
  return (
    <View className="min-h-[44px] flex-row items-center gap-3 py-2">
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <T numberOfLines={1} className="min-w-0 flex-1 font-lao-medium text-foreground">
            {name}
          </T>
          <T
            className={cn('font-sans-semibold', out ? 'text-muted-foreground' : 'text-primary-strong')}
            style={SMALL}
          >
            {`${remaining}/${total}`}
          </T>
        </View>
        <SessionBar remaining={remaining} total={total} tone={out ? 'muted' : 'primary'} />
      </View>

      {canBook ? (
        <Touchable
          onPress={onBook}
          haptic="primary"
          pressScale={0.94}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${bookLabel} ${name}`}
          className="h-8 flex-row items-center gap-1 rounded-full bg-primary px-3"
          style={shadow.primary}
        >
          <Ionicons name="calendar" size={11} color={colors.primaryForeground} />
          <T className="font-lao-semibold text-primary-foreground" style={SMALL}>
            {bookLabel}
          </T>
        </Touchable>
      ) : out ? (
        <View className="h-8 justify-center rounded-full bg-muted px-3">
          <T className="font-lao text-muted-foreground" style={SMALL}>
            {t('packages.stateUsedUp')}
          </T>
        </View>
      ) : null}
    </View>
  );
}

export type UserPackageCardProps = {
  u: UserPackageView;
  state: PackageDisplayState;
  usage: UserPackageUsageView[] | undefined;
  usageOpen: boolean;
  usageLoading: boolean;
  cancelling: boolean;
  onToggleUsage: () => void;
  onBook: (item: UserPackageView['items'][number]) => void;
  onPay: () => void;
  onCancel: () => void;
};

/** ບັດແພັກເກັດຂອງຂ້ອຍ. */
export function UserPackageCard({
  u,
  state,
  usage,
  usageOpen,
  usageLoading,
  cancelling,
  onToggleUsage,
  onBook,
  onPay,
  onCancel,
}: UserPackageCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const pending = state === 'PENDING_PAYMENT';
  const inactive = state === 'EXPIRED' || state === 'USED_UP' || state === 'VOID';
  const soon = state === 'ACTIVE' && u.daysLeft <= EXPIRY_WARN_DAYS;

  return (
    <View
      className={cn(
        'overflow-hidden rounded-2xl border bg-card',
        pending ? 'border-warning/40' : soon ? 'border-champagne/60' : 'border-border',
      )}
      style={[shadow.card, inactive ? { opacity: 0.72 } : null]}
    >
      {/* ແຖບເນັ້ນເທິງບັດ — ບອກສະຖານະດ້ວຍສີກ່ອນອ່ານຕົວໜັງສື */}
      {state === 'ACTIVE' ? (
        <Gradient preset={soon ? 'gold' : 'luxe'} style={{ height: 3 }} pointerEvents="none" />
      ) : (
        <View className={cn('h-[3px]', pending ? 'bg-warning' : 'bg-border')} />
      )}

      <View className="p-3.5">
        {/* head */}
        <View className="flex-row items-center gap-3">
          <PackageThumb uri={u.imageUrl} size={48} />
          <View className="min-w-0 flex-1 gap-1">
            <T numberOfLines={1} className="font-lao-semibold text-foreground">
              {u.packageName}
            </T>
            <View className="flex-row flex-wrap items-center gap-1">
              <StatusPill state={state} />
              {state === 'ACTIVE' ? <ExpiryPill daysLeft={u.daysLeft} /> : null}
            </View>
          </View>
          {pending ? (
            <T className="font-sans-semibold text-foreground">{formatLAK(u.totalPrice)}</T>
          ) : (
            <SessionRing
              remaining={u.remainingSessions}
              total={u.totalSessions}
              tone={inactive ? 'muted' : 'primary'}
            />
          )}
        </View>

        {/* meta */}
        <View className="mt-2.5">
          <MetaLine
            items={[
              pending
                ? t('packages.sessions', { count: u.totalSessions })
                : t('packages.usedOf', { used: u.usedSessions, total: u.totalSessions }),
              state === 'EXPIRED'
                ? t('packages.expiredOn', { date: formatDate(u.expireDate) })
                : t('packages.expiresOn', { date: formatDate(u.expireDate) }),
              t('packages.purchasedOn', { date: formatDate(u.purchasedAt) }),
            ]}
          />
        </View>

        {/* items */}
        {!pending ? (
          <View className="mt-1.5 border-t border-border/70">
            {u.items.map((it) => (
              <ItemRow
                key={it.id}
                name={it.serviceName}
                remaining={it.remainingUnits}
                total={it.totalUnits}
                canBook={state === 'ACTIVE' && it.remainingUnits > 0}
                bookLabel={t('packages.bookWith')}
                onBook={() => onBook(it)}
              />
            ))}
          </View>
        ) : null}

        {/* pending actions */}
        {pending && u.paymentId ? (
          <View className="mt-3 flex-row gap-2 border-t border-border/70 pt-3">
            <View className="flex-1">
              <Button
                label={t('packages.cancelConfirm')}
                variant="outline"
                size="xs"
                loading={cancelling}
                onPress={onCancel}
              />
            </View>
            <View className="flex-1">
              <Button label={t('packages.payNow')} size="xs" icon="qr-code-outline" onPress={onPay} />
            </View>
          </View>
        ) : null}

        {/* usage log */}
        {!pending ? (
          <View className="mt-1.5 border-t border-border/70 pt-1.5">
            <Touchable
              onPress={onToggleUsage}
              haptic="select"
              hitSlop={6}
              accessibilityRole="button"
              accessibilityState={{ expanded: usageOpen }}
              accessibilityLabel={t('packages.usageTitle')}
              className="min-h-[32px] flex-row items-center gap-1.5"
            >
              <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
              <T className="flex-1 font-lao-medium text-muted-foreground" style={SMALL}>
                {t('packages.usageTitle')}
              </T>
              <Ionicons
                name={usageOpen ? 'chevron-up' : 'chevron-down'}
                size={13}
                color={colors.mutedForeground}
              />
            </Touchable>
            {usageOpen ? <UsageLog rows={usage} loading={usageLoading} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Skeleton ບັດກະເປົ໋າ. */
export function UserPackageSkeleton(): React.JSX.Element {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-3.5" style={shadow.xs}>
      <View className="flex-row items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <View className="flex-1 gap-2">
          <Skeleton className="h-3 w-2/3 rounded-full" />
          <Skeleton className="h-2.5 w-1/3 rounded-full" />
        </View>
        <Skeleton className="h-[52px] w-[52px] rounded-full" />
      </View>
      <Skeleton className="h-2.5 w-full rounded-full" />
      <Skeleton className="h-8 w-full rounded-lg" />
    </View>
  );
}
