import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { GlassView } from '../../../components/ui/GlassView';
import { Touchable } from '../../../components/ui/Touchable';
import {
  daysBetweenIso,
  expiryTone,
  formatQty,
  isValidIsoDate,
  maskIsoDate,
  parseQty,
  type ExpiryTone,
} from '../../../features/inventory/inventory.logic';
import { cn } from '../../../lib/cn';
import { vientiane } from '../../../lib/format';
import { colors, shadow } from '../../../theme';
import { EMPH, EmptyBlock, SMALL, T, type IconName } from '../staff-portal.parts';

/**
 * M14 — ຊິ້ນສ່ວນຮ່ວມຂອງໜ້າສະຕັອກ (ສ້າງເທິງ staff-portal kit: T 12 / SMALL 10 / EMPH 14 ສະເພາະຊື່ໜ້າ).
 * ສີອ່ານ `colors.*` ຕອນ render ເທົ່ານັ້ນ (ບໍ່ snapshot ລະດັບ module) ເພື່ອປ່ຽນຕາມໂທນ/ໂໝດມືດ.
 */

// ---- ຫົວໜ້າລັອກ (GlassView + hairline/ເງົາເມື່ອເລື່ອນ) ---------------------

export function useScrolled(): {
  scrolled: boolean;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
} {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = e.nativeEvent.contentOffset.y > 4;
    setScrolled((prev) => (prev === next ? prev : next));
  }, []);
  return { scrolled, onScroll };
}

/** ຫົວໜ້າ stack ຂອງສະຕັອກ — ປຸ່ມກັບ + ຊື່ (14px) + meta + actions ຂວາ, ຄ້າງຢູ່ນອກ ScrollView. */
export function StockHeader({
  title,
  subtitle,
  onBack,
  right,
  scrolled,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  scrolled: boolean;
  /** ແຖວເພີ່ມໃຕ້ຫົວ (ຊ່ອງຄົ້ນຫາ / chip ກອງ). */
  children?: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <GlassView
      intensity={24}
      style={[
        {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: scrolled ? colors.border : 'transparent',
          zIndex: 2,
        },
        scrolled ? shadow.xs : null,
      ]}
    >
      <View className="gap-2.5 px-4 pb-2.5 pt-1.5">
        <View className="min-h-[40px] flex-row items-center gap-2">
          {onBack ? (
            <Touchable
              onPress={onBack}
              hitSlop={8}
              pressScale={0.9}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              className="-ml-1.5 h-9 w-9 items-center justify-center rounded-full"
            >
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
            </Touchable>
          ) : null}
          <View className="flex-1">
            <T numberOfLines={1} className="font-lao-semibold text-foreground" style={EMPH}>
              {title}
            </T>
            {subtitle ? (
              <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
                {subtitle}
              </T>
            ) : null}
          </View>
          {right ? <View className="flex-row items-center gap-1.5">{right}</View> : null}
        </View>
        {children}
      </View>
    </GlassView>
  );
}

// ---- ສະຖານະ ---------------------------------------------------------------

/** 403 — backend ຍັງບໍ່ເປີດ endpoint ນີ້ໃຫ້ບົດບາດຂອງຜູ້ໃຊ້. */
export function LockedBlock({ hint }: { hint?: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <EmptyBlock
      icon="lock-closed-outline"
      title={t('stock.locked.title')}
      hint={hint ?? t('stock.locked.hint')}
    />
  );
}

const TONE_CLASS: Record<ExpiryTone, { bg: string; fg: string }> = {
  destructive: { bg: 'bg-destructive-soft', fg: 'text-destructive' },
  warning: { bg: 'bg-warning-soft', fg: 'text-warning' },
  success: { bg: 'bg-success-soft', fg: 'text-success' },
  neutral: { bg: 'bg-muted', fg: 'text-muted-foreground' },
};

/** ປ້າຍວັນໝົດອາຍຸ — ສີຕາມຈຳນວນວັນເຫຼືອ. */
export function ExpiryPill({ daysLeft }: { daysLeft: number | null }): React.JSX.Element {
  const { t } = useTranslation();
  const tone = expiryTone(daysLeft);
  const label =
    daysLeft == null
      ? t('stock.lot.noExpiry')
      : daysLeft < 0
        ? t('stock.lot.expiredAgo', { count: -daysLeft })
        : daysLeft === 0
          ? t('stock.lot.expiresToday')
          : t('stock.lot.daysLeft', { count: daysLeft });
  return (
    <View className={cn('rounded-full px-2 py-0.5', TONE_CLASS[tone].bg)}>
      <T className={cn('font-lao-medium', TONE_CLASS[tone].fg)} style={SMALL}>
        {label}
      </T>
    </View>
  );
}

/** ແຖບບອກສະຖານະ (ຄຳເຕືອນ / ສຳເລັດ / ຂໍ້ມູນ) ພາຍໃນເນື້ອຫາ. */
export function Notice({
  tone = 'info',
  icon,
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'success' | 'destructive';
  icon?: IconName;
  children: ReactNode;
  action?: ReactNode;
}): React.JSX.Element {
  const bg = {
    info: 'bg-info-soft',
    warning: 'bg-warning-soft',
    success: 'bg-success-soft',
    destructive: 'bg-destructive-soft',
  }[tone];
  const fg = {
    info: colors.info,
    warning: colors.warning,
    success: colors.success,
    destructive: colors.destructive,
  }[tone];
  return (
    <View className={cn('flex-row items-center gap-2 rounded-xl px-3 py-2', bg)}>
      <Ionicons
        name={icon ?? (tone === 'success' ? 'checkmark-circle' : 'information-circle')}
        size={14}
        color={fg}
      />
      <View className="flex-1">
        {typeof children === 'string' ? (
          <T className="font-lao text-foreground">{children}</T>
        ) : (
          children
        )}
      </View>
      {action}
    </View>
  );
}

// ---- ຊ່ອງປ້ອນ ----------------------------------------------------------------

/**
 * ຊ່ອງຈຳນວນໃຫຍ່ (ນັບ / ຮັບ) — ປຸ່ມ −/+ 44pt ສອງຂ້າງ, ແປ້ນຕົວເລກ, ໜ່ວຍຢູ່ທ້າຍ.
 * ຄ່າເປັນຂໍ້ຄວາມ (ຮ່າງ) ເພື່ອໃຫ້ພິມ "1." ລະຫວ່າງທາງໄດ້.
 */
export function QtyInput({
  value,
  onChange,
  onBlur,
  onFocus,
  unit,
  placeholder,
  invalid,
  accessibilityLabel,
  inputRef,
}: {
  value: string;
  onChange: (text: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  unit?: string | null;
  placeholder?: string;
  invalid?: boolean;
  accessibilityLabel: string;
  inputRef?: (el: TextInput | null) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const step = (d: number): void => {
    const cur = parseQty(value);
    const base = cur == null || Number.isNaN(cur) ? 0 : cur;
    const next = Math.max(0, Math.round((base + d) * 1000) / 1000);
    onChange(String(next));
  };
  return (
    <View
      className={cn(
        'h-12 flex-row items-center gap-1 rounded-xl border bg-card px-1',
        invalid ? 'border-destructive' : 'border-input',
      )}
    >
      <Touchable
        onPress={() => step(-1)}
        pressScale={0.9}
        accessibilityRole="button"
        accessibilityLabel={t('stock.qty.minus')}
        className="h-10 w-10 items-center justify-center rounded-lg bg-muted"
      >
        <Ionicons name="remove" size={18} color={colors.foreground} />
      </Touchable>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(s) => onChange(s.replace(/[^0-9.,]/g, ''))}
        onBlur={onBlur}
        onFocus={onFocus}
        keyboardType="decimal-pad"
        returnKeyType="done"
        selectTextOnFocus
        placeholder={placeholder ?? '—'}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        accessibilityLabel={accessibilityLabel}
        className="flex-1 text-center font-sans-semibold text-foreground"
        style={{ fontSize: 18, lineHeight: 22, paddingVertical: 0 }}
      />
      {unit ? (
        <T numberOfLines={1} className="max-w-[56px] font-lao text-muted-foreground" style={SMALL}>
          {unit}
        </T>
      ) : null}
      <Touchable
        onPress={() => step(1)}
        pressScale={0.9}
        accessibilityRole="button"
        accessibilityLabel={t('stock.qty.plus')}
        className="h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle"
      >
        <Ionicons name="add" size={18} color={colors.primary} />
      </Touchable>
    </View>
  );
}

/** ຊ່ອງຂໍ້ຄວາມນ້ອຍ (ເລກ lot / ເຫດຜົນ) — 12px ຕາມ flat scale. */
export function SmallField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  multiline,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  error?: string | null;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'characters';
}): React.JSX.Element {
  return (
    <View className="flex-1 gap-1">
      <T className="font-lao-medium text-muted-foreground" style={SMALL}>
        {label}
      </T>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        multiline={multiline}
        autoCapitalize={autoCapitalize ?? 'none'}
        autoCorrect={false}
        accessibilityLabel={label}
        className={cn(
          'rounded-xl border bg-card px-3 font-lao text-foreground',
          multiline ? 'min-h-[64px] py-2' : 'h-10',
          error ? 'border-destructive' : 'border-input',
        )}
        style={{ fontSize: 12, lineHeight: 17, textAlignVertical: multiline ? 'top' : 'center' }}
      />
      {error ? (
        <T className="font-lao text-destructive" style={SMALL}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

/**
 * ວັນໝົດອາຍຸ — ຊ່ອງ mask YYYY-MM-DD (ແປ້ນຕົວເລກ) ແທນ native date picker (ມືຖືບໍ່ມີ picker
 * ແລະ ຫ້າມເພີ່ມ native dep). ຄືກັບ DateField ຂອງ web-admin: ບໍ່ຂຶ້ນກັບ locale ຂອງເຄື່ອງ.
 * ສະແດງ "ອີກ N ວັນ" ຕາມວັນວຽງຈັນ.
 */
export function ExpiryDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const complete = value.length === 10;
  const valid = complete && isValidIsoDate(value);
  const today = vientiane().format('YYYY-MM-DD');
  const days = valid ? daysBetweenIso(today, value) : null;
  return (
    <View className="flex-1 gap-1">
      <T className="font-lao-medium text-muted-foreground" style={SMALL}>
        {label}
      </T>
      <TextInput
        value={value}
        onChangeText={(s) => onChange(maskIsoDate(s))}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        keyboardType="number-pad"
        maxLength={10}
        accessibilityLabel={label}
        className={cn(
          'h-10 rounded-xl border bg-card px-3 font-sans text-foreground',
          complete && !valid ? 'border-destructive' : 'border-input',
        )}
        style={{ fontSize: 12, lineHeight: 17 }}
      />
      {complete && !valid ? (
        <T className="font-lao text-destructive" style={SMALL}>
          {t('stock.date.invalid')}
        </T>
      ) : days != null ? (
        <ExpiryPillInline days={days} />
      ) : null}
    </View>
  );
}

function ExpiryPillInline({ days }: { days: number }): React.JSX.Element {
  return (
    <View className="flex-row">
      <ExpiryPill daysLeft={days} />
    </View>
  );
}

/** ຈຳນວນ + ໜ່ວຍ (ໃຊ້ໃນແຖວສະຖິຕິ/ລາຍການ). */
export function qtyWithUnit(n: number | null | undefined, unit?: string | null): string {
  return unit ? `${formatQty(n)} ${unit}` : formatQty(n);
}

/** ປຸ່ມ chip ເລືອກ (ໜ່ວຍ / ເຫດຜົນ) — ແຖວ wrap. */
export function ChoiceChips<K extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly { key: K; label: string }[];
  value: K | null;
  onChange: (k: K) => void;
}): React.JSX.Element {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Touchable
            key={it.key}
            onPress={() => onChange(it.key)}
            pressScale={0.95}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={it.label}
            className={cn(
              'min-h-[32px] justify-center rounded-full border px-3',
              active ? 'border-primary bg-primary-subtle' : 'border-border bg-card',
            )}
          >
            <T
              className={cn('font-lao', active ? 'font-lao-semibold text-primary-strong' : 'text-foreground')}
              style={SMALL}
            >
              {it.label}
            </T>
          </Touchable>
        );
      })}
    </View>
  );
}
