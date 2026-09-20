import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { forwardRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { Gradient } from '../../components/ui/Gradient';
import { Text as UIText, type AppTextProps } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import i18n from '../../i18n';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../store/ui.store';
import { colors, shadow } from '../../theme';
import brandLogo from '../../../assets/brand-logo.png';
import heroImage from '../../../assets/welcome-hero.png';

/* ------------------------------------------------------------------ */
/* Type scale — flat 12px base (mobile-flat-type-scale)                */
/* ------------------------------------------------------------------ */

export const BASE: TextStyle = { fontSize: 12, lineHeight: 17 };
export const SMALL: TextStyle = { fontSize: 10, lineHeight: 14 };
/** ຫົວຂໍ້ໜ້າຈໍ — ຈຸດເນັ້ນດຽວຂອງແຕ່ລະໜ້າ. */
export const TITLE: TextStyle = { fontSize: 20, lineHeight: 28 };

/** Text ທີ່ກຳນົດຂະໜາດ 12px ແບບ inline (ຊະນະ class ຂອງ variant). className = ນ້ຳໜັກ + ສີ. */
export function T({ style, ...rest }: AppTextProps): React.JSX.Element {
  return <UIText {...rest} style={[BASE, style]} />;
}

/* ------------------------------------------------------------------ */
/* Phone helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * ແປງເບີທີ່ຜູ້ໃຊ້ພິມ (ມີ +856 prefix ສະແດງຢູ່) → ຮູບແບບທີ່ເກັບໃນ DB (`020XXXXXXXX`).
 * ຮັບ: "20 5555 5555", "02055555555", "+856 20 5555 5555", "85620…". ເບີຕ່າງປະເທດ (+66…) ຄົງ "+".
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+') && !digits.startsWith('856')) return `+${digits}`;
  const local = digits.startsWith('856') ? digits.slice(3) : digits;
  return local.startsWith('0') ? local : `0${local}`;
}

export function isValidPhone(raw: string): boolean {
  const p = normalizePhone(raw);
  return p.startsWith('+') ? /^\+[0-9]{8,15}$/.test(p) : /^0[0-9]{8,10}$/.test(p);
}

const LAST_PHONE_KEY = 'aura.lastPhone';

export async function loadLastPhone(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(LAST_PHONE_KEY);
  } catch {
    return null;
  }
}

export function rememberPhone(phone: string | null): void {
  const op = phone
    ? SecureStore.setItemAsync(LAST_PHONE_KEY, phone)
    : SecureStore.deleteItemAsync(LAST_PHONE_KEY);
  op.catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

/** ພື້ນຫຼັງອ່ອນໆ ດ້ານເທິງ — ຮູບ hero ທ້ອງຖິ່ນ (ບໍ່ຕ້ອງໃຊ້ເນັດ) ມົວ + ຈາງລົງສູ່ພື້ນ. */
export function AuthBackdrop(): React.JSX.Element {
  return (
    <View pointerEvents="none" className="absolute inset-x-0 top-0 h-[260px] overflow-hidden">
      <Image
        source={heroImage}
        resizeMode="cover"
        blurRadius={14}
        accessible={false}
        accessibilityIgnoresInvertColors
        className="absolute inset-0 h-full w-full opacity-30"
      />
      <Gradient preset="fadeDown" fill pointerEvents="none" />
    </View>
  );
}

export function LanguageToggle({ glass }: { glass?: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const lang = useUiStore((s) => s.language) ?? (i18n.language as 'lo' | 'en');
  const setLanguagePref = useUiStore((s) => s.setLanguagePref);

  const seg = (code: 'lo' | 'en', label: string, font: string): React.JSX.Element => {
    const active = lang === code;
    return (
      <View className={cn('h-7 min-w-[36px] items-center justify-center rounded-full px-2', active && 'bg-card')} style={active ? shadow.xs : undefined}>
        <T style={SMALL} className={cn(font, active ? 'text-primary-strong' : 'text-muted-foreground')}>
          {label}
        </T>
      </View>
    );
  };

  return (
    <Touchable
      haptic="select"
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('auth.languageToggle')}
      accessibilityValue={{ text: lang === 'lo' ? 'ລາວ' : 'English' }}
      onPress={() => setLanguagePref(lang === 'lo' ? 'en' : 'lo')}
      className={cn(
        'flex-row items-center rounded-full border p-0.5',
        glass ? 'border-white/80 bg-white/70' : 'border-border bg-muted/80',
      )}
    >
      {seg('lo', 'ລາວ', 'font-lao-semibold')}
      {seg('en', 'EN', 'font-sans-semibold')}
    </Touchable>
  );
}

/** ແຖບນຳທາງ — ປຸ່ມກັບຄືນ (44pt) + ປ່ຽນພາສາ. */
export function AuthNavBar({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center justify-between px-4 pb-1 pt-1">
      <Touchable
        onPress={onBack}
        pressScale={0.92}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        className="h-11 w-11 items-center justify-center"
      >
        <View className="h-9 w-9 items-center justify-center rounded-full border border-border bg-card/90" style={shadow.xs}>
          <Ionicons name="chevron-back" size={18} color={colors.foreground} />
        </View>
      </Touchable>
      <LanguageToggle />
    </View>
  );
}

/** ບລັອກຫົວໜ້າ — tile ໂລໂກ້/icon, ຫົວຂໍ້, ຄຳອະທິບາຍ. */
export function AuthHero({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon?: keyof typeof Ionicons.glyphMap;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className="gap-1.5">
      <View className="mb-2.5 h-12 w-12 rounded-2xl bg-card" style={shadow.card}>
        <View className="h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-border">
          {icon ? (
            <View className="h-full w-full items-center justify-center bg-primary-subtle">
              <Ionicons name={icon} size={22} color={colors.primary} />
            </View>
          ) : (
            <Image
              source={brandLogo}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessibilityLabel={t('common.appName')}
              className="h-full w-full"
            />
          )}
        </View>
      </View>
      <T accessibilityRole="header" style={TITLE} className="font-lao-semibold">
        {title}
      </T>
      <T className="text-muted-foreground">{subtitle}</T>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

export type AuthFieldProps = TextInputProps & {
  label: string;
  optionalLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  error?: string;
  hint?: string;
  /** ສະແດງ ✓ ເມື່ອຄ່າຖືກຕ້ອງ. */
  valid?: boolean;
};

export const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField(
  { label, optionalLabel, icon, leftSlot, rightSlot, error, hint, valid, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const tone = error ? colors.destructive : focused ? colors.primary : colors.mutedForeground;

  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <T className="font-lao-medium">{label}</T>
        {optionalLabel ? <T style={SMALL} className="text-muted-foreground">{optionalLabel}</T> : null}
      </View>

      <View
        className={cn(
          'h-11 flex-row items-center gap-2 rounded-xl border bg-card px-3',
          error ? 'border-destructive bg-destructive-soft/30' : focused ? 'border-primary' : 'border-border',
        )}
        style={focused && !error ? shadow.xs : undefined}
      >
        {leftSlot}
        {icon ? <Ionicons name={icon} size={16} color={tone} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          className="h-full flex-1 font-lao text-foreground"
          style={{ fontSize: 12, paddingVertical: 0 }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {valid && !error ? <Ionicons name="checkmark-circle" size={16} color={colors.success} /> : null}
        {rightSlot}
      </View>

      {error ? (
        <View className="flex-row items-center gap-1" accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={12} color={colors.destructive} />
          <T style={SMALL} className="flex-1 text-destructive">{error}</T>
        </View>
      ) : hint ? (
        <T style={SMALL} className="text-muted-foreground">{hint}</T>
      ) : null}
    </View>
  );
});

export const PhoneField = forwardRef<TextInput, Omit<AuthFieldProps, 'leftSlot' | 'icon'>>(
  function PhoneField(props, ref) {
    return (
      <AuthField
        ref={ref}
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={18}
        leftSlot={
          <View className="flex-row items-center gap-1 border-r border-border pr-2">
            <T>🇱🇦</T>
            <T className="font-sans-semibold">+856</T>
          </View>
        }
        {...props}
      />
    );
  },
);

export const PasswordField = forwardRef<TextInput, Omit<AuthFieldProps, 'secureTextEntry' | 'rightSlot'>>(
  function PasswordField(props, ref) {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);
    return (
      <AuthField
        ref={ref}
        icon="lock-closed-outline"
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        rightSlot={
          <Touchable
            onPress={() => setVisible((v) => !v)}
            haptic="select"
            pressScale={0.9}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={visible ? t('auth.hidePassword') : t('auth.showPassword')}
            className="h-8 w-8 items-center justify-center"
          >
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.mutedForeground} />
          </Touchable>
        }
        {...props}
      />
    );
  },
);

/** ປະເມີນຄວາມແຂງແຮງ 0–4 — ຄວາມຍາວ, ຕົວເລກ, ຕົວອັກສອນ, ປະສົມໃຫຍ່/ນ້ອຍ ຫຼື ສັນຍາລັກ. */
export function passwordScore(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/\d/.test(pw) && /[A-Za-z຀-໿]/.test(pw)) s++;
  if ((/[a-z]/.test(pw) && /[A-Z]/.test(pw)) || /[^A-Za-z0-9຀-໿]/.test(pw)) s++;
  if (pw.length >= 12) s++;
  return pw.length < 8 ? Math.min(s, 1) : Math.max(s, 1);
}

const strengthLevels = (): { key: string; color: string; text: string }[] => [
  { key: 'weak', color: colors.destructive, text: 'text-destructive' },
  { key: 'weak', color: colors.destructive, text: 'text-destructive' },
  { key: 'fair', color: colors.warning, text: 'text-warning' },
  { key: 'good', color: colors.primary, text: 'text-primary' },
  { key: 'strong', color: colors.success, text: 'text-success' },
];

export function PasswordStrength({ value }: { value: string }): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!value) return null;
  const score = passwordScore(value);
  const levels = strengthLevels();
  const level = (levels[score] ?? levels[0]) as { key: string; color: string; text: string };
  const rules = [
    { ok: value.length >= 8, label: t('auth.ruleLength') },
    { ok: /[A-Za-z຀-໿]/.test(value), label: t('auth.ruleLetter') },
    { ok: /\d/.test(value), label: t('auth.ruleNumber') },
  ];
  return (
    <View className="gap-2 rounded-xl bg-muted/70 px-3 py-2.5">
      <View className="flex-row items-center gap-2.5">
        <View className="flex-1 flex-row gap-1">
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{ backgroundColor: i <= score ? level.color : colors.border }}
            />
          ))}
        </View>
        <T style={SMALL} className={cn('font-lao-semibold', level.text)}>
          {t(`auth.strength.${level.key}`)}
        </T>
      </View>
      <View className="flex-row flex-wrap gap-x-3 gap-y-1">
        {rules.map((r) => (
          <View key={r.label} className="flex-row items-center gap-1">
            <Ionicons
              name={r.ok ? 'checkmark-circle' : 'ellipse-outline'}
              size={12}
              color={r.ok ? colors.success : colors.mutedForeground}
            />
            <T style={SMALL} className={r.ok ? 'text-foreground' : 'text-muted-foreground'}>
              {r.label}
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}

export function Checkbox({
  checked,
  onToggle,
  children,
  error,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
  error?: boolean;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onToggle}
      haptic="select"
      pressScale={1}
      dim={false}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="min-h-[32px] shrink flex-row items-center gap-2"
    >
      <View
        className={cn(
          'h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border',
          checked ? 'border-primary bg-primary' : error ? 'border-destructive bg-card' : 'border-input bg-card',
        )}
      >
        {checked ? <Ionicons name="checkmark" size={12} color={colors.primaryForeground} /> : null}
      </View>
      <View className="flex-1">{children}</View>
    </Touchable>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons & feedback                                                  */
/* ------------------------------------------------------------------ */

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}): React.JSX.Element {
  const off = disabled || loading;
  return (
    <Touchable
      onPress={onPress}
      disabled={off}
      haptic={off ? 'none' : 'primary'}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={off ? undefined : shadow.primary}
      className={cn('h-11 w-full flex-row items-center justify-center gap-2 rounded-xl', disabled && !loading && 'opacity-50')}
    >
      <Gradient preset="brand" fill radius={12} pointerEvents="none" />
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          <T className="font-lao-semibold text-white">{label}</T>
          {icon ? <Ionicons name={icon} size={15} color="#fff" /> : null}
        </>
      )}
    </Touchable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon,
  glass,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  glass?: boolean;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'h-11 w-full flex-row items-center justify-center gap-2 rounded-xl border',
        glass ? 'border-aura-200 bg-white/80' : 'border-border bg-card',
      )}
    >
      {icon ? <Ionicons name={icon} size={15} color={colors.primaryStrong} /> : null}
      <T className="font-lao-semibold text-primary-strong">{label}</T>
    </Touchable>
  );
}

export function TextLink({
  label,
  onPress,
  muted,
}: {
  label: string;
  onPress: () => void;
  muted?: boolean;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      hitSlop={10}
      pressScale={0.97}
      accessibilityRole="link"
      className="min-h-[32px] shrink-0 justify-center"
    >
      <T numberOfLines={1} className={cn('font-lao-semibold', muted ? 'text-muted-foreground' : 'text-primary')}>
        {label}
      </T>
    </Touchable>
  );
}

type BannerTone = 'error' | 'info' | 'success';
const banner = (): Record<BannerTone, { box: string; icon: keyof typeof Ionicons.glyphMap; color: string; text: string }> => ({
  error: { box: 'border-destructive/30 bg-destructive-soft', icon: 'alert-circle', color: colors.destructive, text: 'text-destructive' },
  info: { box: 'border-aura-200 bg-aura-50', icon: 'information-circle', color: colors.primary, text: 'text-primary-strong' },
  success: { box: 'border-success/30 bg-success-soft', icon: 'checkmark-circle', color: colors.success, text: 'text-success' },
});

export function Banner({
  tone,
  message,
  icon,
  action,
}: {
  tone: BannerTone;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: { label: string; onPress: () => void };
}): React.JSX.Element {
  const s = banner()[tone];
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      className={cn('flex-row items-start gap-2 rounded-xl border px-3 py-2.5', s.box)}
    >
      <Ionicons name={icon ?? s.icon} size={15} color={s.color} style={{ marginTop: 1 }} />
      <View className="flex-1 gap-1">
        <T className={s.text}>{message}</T>
        {action ? (
          <Touchable onPress={action.onPress} hitSlop={8} pressScale={0.97} accessibilityRole="link" className="self-start">
            <T className={cn('font-lao-semibold underline', s.text)}>{action.label}</T>
          </Touchable>
        ) : null}
      </View>
    </View>
  );
}

export function Divider({ label }: { label: string }): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-px flex-1 bg-border" />
      <T style={SMALL} className="text-muted-foreground">{label}</T>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}

export function SectionLabel({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-1.5">
      <Ionicons name={icon} size={13} color={colors.primary} />
      <T className="font-lao-semibold text-primary-strong">{label}</T>
    </View>
  );
}
