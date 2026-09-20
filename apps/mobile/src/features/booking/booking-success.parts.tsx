import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, View } from 'react-native';
import { Avatar } from '../../components/ui/Avatar';
import { Touchable } from '../../components/ui/Touchable';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cn } from '../../lib/cn';
import { haptics } from '../../lib/haptics';
import { colors, shadow } from '../../theme';
import { Card, IconTile, NUM, Pill, SMALL, T, TOTAL, type IconName, type Tone } from './booking-kit';

/** ໄອຄອນສຳເລັດ — pop-in + ວົງແຫວນ pulse 1 ຄັ້ງ (ຂ້າມເມື່ອ Reduce Motion). */
export function SuccessMark(): React.JSX.Element {
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    const anim = Animated.parallel([
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 10 }),
      Animated.loop(
        Animated.timing(ring, {
          toValue: 1,
          duration: 2400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        { iterations: 3 },
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [reduced, pop, ring]);

  return (
    <View className="h-20 w-20 items-center justify-center" importantForAccessibility="no-hide-descendants">
      {!reduced ? (
        <Animated.View
          className="absolute h-20 w-20 rounded-full bg-success-soft"
          style={{
            opacity: ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.8, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.5] }) }],
          }}
        />
      ) : null}
      <View className="absolute h-[72px] w-[72px] rounded-full bg-success-soft" />
      <Animated.View
        className="h-14 w-14 items-center justify-center rounded-full bg-success"
        style={[shadow.card, { transform: [{ scale: pop }] }]}
      >
        <Ionicons name="checkmark" size={28} color={colors.successForeground} />
      </Animated.View>
      <Ionicons
        name="sparkles"
        size={14}
        color={colors.accent}
        style={{ position: 'absolute', top: 2, right: 2 }}
      />
    </View>
  );
}

type StepState = 'done' | 'current' | 'todo';

/** ຄວາມຄືບໜ້າຂອງນັດ: ຈອງແລ້ວ → ຮ້ານຢືນຢັນ → ມາຮັບບໍລິການ. */
export function StatusTracker({
  confirmed,
  paid,
}: {
  confirmed: boolean;
  paid: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const steps: { label: string; state: StepState; icon: IconName }[] = [
    { label: t('success.stepBooked'), state: 'done', icon: 'checkmark' },
    {
      label: confirmed ? t('success.stepConfirmed') : t('success.stepAwaiting'),
      state: confirmed ? 'done' : 'current',
      icon: confirmed ? 'checkmark' : 'hourglass-outline',
    },
    {
      label: paid ? t('success.stepPaid') : t('success.stepVisit'),
      state: paid ? 'done' : 'todo',
      icon: paid ? 'checkmark' : 'sparkles-outline',
    },
  ];

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={steps.map((s) => s.label).join(', ')}
      className="flex-row items-start"
    >
      {steps.map((s, i) => (
        <View key={i} className="flex-1 items-center">
          <View className="w-full flex-row items-center">
            <View
              className={cn(
                'h-0.5 flex-1 rounded-full',
                i === 0 ? 'bg-transparent' : s.state === 'todo' ? 'bg-border' : 'bg-success',
              )}
            />
            <View
              className={cn(
                'h-7 w-7 items-center justify-center rounded-full',
                s.state === 'done' && 'bg-success',
                s.state === 'current' && 'border-2 border-warning bg-warning-soft',
                s.state === 'todo' && 'border border-border bg-card',
              )}
            >
              <Ionicons
                name={s.icon}
                size={13}
                color={
                  s.state === 'done' ? '#fff' : s.state === 'current' ? colors.warning : colors.mutedForeground
                }
              />
            </View>
            <View
              className={cn(
                'h-0.5 flex-1 rounded-full',
                i === steps.length - 1
                  ? 'bg-transparent'
                  : steps[i + 1]!.state === 'todo'
                    ? 'bg-border'
                    : 'bg-success',
              )}
            />
          </View>
          <T
            numberOfLines={2}
            className={cn(
              'mt-1.5 px-1 text-center',
              s.state === 'todo' ? 'font-lao text-muted-foreground' : 'font-lao-medium text-foreground',
            )}
            style={SMALL}
          >
            {s.label}
          </T>
        </View>
      ))}
    </View>
  );
}

/** ລະຫັດການຈອງ — ແຕະເພື່ອຄັດລອກ (ມີ feedback). */
function RefCode({ code }: { code: string }): React.JSX.Element {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async (): Promise<void> => {
    try {
      await Clipboard.setStringAsync(code);
      haptics.select();
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard ບໍ່ພ້ອມ */
    }
  };

  return (
    <Touchable
      onPress={copy}
      hitSlop={6}
      pressScale={0.96}
      accessibilityRole="button"
      accessibilityLabel={`${t('success.copyRef')} ${code}`}
      className="h-8 flex-row items-center gap-1.5 rounded-full bg-muted px-3"
    >
      <T className="font-sans-semibold text-foreground" style={SMALL}>
        {code}
      </T>
      <Ionicons
        name={copied ? 'checkmark-circle' : 'copy-outline'}
        size={12}
        color={copied ? colors.success : colors.mutedForeground}
      />
      {copied ? (
        <T className="font-lao-medium text-success" style={SMALL}>
          {t('success.copied')}
        </T>
      ) : null}
    </Touchable>
  );
}

export type PassPayment = { label: string; value: string; tone: Tone } | null;

/** ໃບຜ່ານນັດໝາຍ — ລະຫັດ + ສະຖານະ, ບໍລິການ, ວັນ/ເວລາ ໃຫຍ່, ຊ່າງ, ສາຂາ, ການຊຳລະ. */
export function AppointmentPass({
  refCode,
  statusLabel,
  statusTone,
  service,
  duration,
  price,
  dateLabel,
  timeRange,
  relativeDay,
  staffName,
  staffSub,
  staffAvatarUrl,
  branch,
  branchSub,
  payment,
}: {
  refCode: string | null;
  statusLabel: string;
  statusTone: Tone;
  service: string;
  duration: string | null;
  price: string | null;
  dateLabel: string;
  timeRange: string;
  relativeDay: string | null;
  staffName: string;
  staffSub: string | null;
  staffAvatarUrl: string | null;
  branch: string;
  branchSub: string | null;
  payment: PassPayment;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Card className="overflow-hidden">
      {/* ຫົວ */}
      <View className="flex-row items-center justify-between gap-2 px-3.5 pt-3.5">
        <Pill tone={statusTone} icon="ellipse" label={statusLabel} />
        {refCode ? <RefCode code={refCode} /> : null}
      </View>

      {/* ບໍລິການ + ລາຄາ */}
      <View className="flex-row items-start justify-between gap-3 px-3.5 pt-3">
        <View className="flex-1">
          <T className="font-lao text-muted-foreground" style={SMALL}>
            {t('success.serviceLabel')}
          </T>
          <T numberOfLines={2} className="font-lao-semibold text-foreground" style={NUM}>
            {service}
          </T>
          {duration ? (
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {duration}
            </T>
          ) : null}
        </View>
        {price ? (
          <View className="items-end">
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {t('success.priceLabel')}
            </T>
            <T className="font-lao-semibold text-foreground" style={NUM}>
              {price}
            </T>
          </View>
        ) : null}
      </View>

      {/* ວັນ-ເວລາ */}
      <View className="mx-3.5 mt-3 flex-row items-center gap-3 rounded-xl bg-primary-subtle/70 p-3">
        <IconTile icon="calendar" tone="primary" size={40} />
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <T className="font-sans-semibold text-primary-strong" style={TOTAL}>
              {timeRange}
            </T>
            {relativeDay ? <Pill tone="primary" label={relativeDay} /> : null}
          </View>
          <T numberOfLines={1} className="font-lao-medium text-foreground">
            {dateLabel}
          </T>
        </View>
      </View>

      {/* ເສັ້ນຈີກ */}
      <View className="relative my-3 h-4 justify-center">
        <View className="absolute -left-2 top-0 h-4 w-4 rounded-full border border-border bg-background" />
        <View className="absolute -right-2 top-0 h-4 w-4 rounded-full border border-border bg-background" />
        <View className="mx-4 border-t border-dashed border-border" />
      </View>

      {/* ຊ່າງ / ສາຂາ / ການຊຳລະ */}
      <View className="gap-3 px-3.5 pb-3.5">
        <View className="flex-row items-center gap-3">
          <Avatar uri={staffAvatarUrl} name={staffName} size={32} mode="cartoon" />
          <View className="flex-1">
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {t('confirm.staff')}
            </T>
            <T numberOfLines={1} className="font-lao-semibold text-foreground">
              {staffName}
            </T>
          </View>
          {staffSub ? (
            <T numberOfLines={1} className="max-w-[45%] text-right font-lao text-muted-foreground" style={SMALL}>
              {staffSub}
            </T>
          ) : null}
        </View>

        <View className="flex-row items-center gap-3">
          <IconTile icon="location-outline" tone="muted" />
          <View className="flex-1">
            <T numberOfLines={1} className="font-lao-semibold text-foreground">
              {branch}
            </T>
            {branchSub ? (
              <T numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
                {branchSub}
              </T>
            ) : null}
          </View>
        </View>

        {payment ? (
          <View className="flex-row items-center gap-3">
            <IconTile icon="wallet-outline" tone={payment.tone} />
            <View className="flex-1">
              <T className="font-lao text-muted-foreground" style={SMALL}>
                {t('success.paymentLabel')}
              </T>
              <T numberOfLines={1} className="font-lao-semibold text-foreground">
                {payment.label}
              </T>
            </View>
            <T className="font-lao-semibold text-foreground">{payment.value}</T>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export type QuickAction = {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
};

/** ແຖວປຸ່ມລັດ (ແບ່ງປັນ / ເສັ້ນທາງ / ໂທ / ແຊັດ) — tile ສູງ 64. */
export function QuickActions({ actions }: { actions: QuickAction[] }): React.JSX.Element {
  return (
    <View className="flex-row gap-2">
      {actions.map((a) => (
        <Touchable
          key={a.key}
          onPress={a.onPress}
          pressScale={0.95}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          className="h-16 flex-1 items-center justify-center gap-1 rounded-2xl border border-border bg-card"
          style={shadow.xs}
        >
          <Ionicons name={a.icon} size={18} color={colors.primaryStrong} />
          <T numberOfLines={1} className="font-lao-medium text-foreground" style={SMALL}>
            {a.label}
          </T>
        </Touchable>
      ))}
    </View>
  );
}

/** ຂໍ້ແນະນຳກ່ອນເຂົ້າຮັບບໍລິການ — ລາຍການ checklist ດ້ວຍ vector icon. */
export function ArrivalGuide({ items }: { items: { icon: IconName; text: string }[] }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Card flat className="gap-2.5 p-3.5">
      <T accessibilityRole="header" className="font-lao-semibold text-foreground">
        {t('success.guideTitle')}
      </T>
      {items.map((it, i) => (
        <View key={i} className="flex-row items-start gap-2.5">
          <View className="mt-px h-6 w-6 items-center justify-center rounded-full bg-accent-soft">
            <Ionicons name={it.icon} size={12} color={colors.accentForeground} />
          </View>
          <T className="flex-1 font-lao text-muted-foreground">{it.text}</T>
        </View>
      ))}
    </Card>
  );
}
