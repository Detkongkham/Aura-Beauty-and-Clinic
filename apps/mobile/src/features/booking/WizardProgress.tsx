import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, View } from 'react-native';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { Text as UIText } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cn } from '../../lib/cn';
import { colors } from '../../theme';

/** front ມາດຕະຖານ = 10px ຄົງທີ່ (ອີງ AppointmentsScreen — ຂັ້ນ stepper ນ້ອຍກວ່າ body).
 * inline style ຈຳເປັນ ເພາະ variant "body" ຂອງ <UIText> ຊະນະ class text-[Npx] ໃນ NativeWind 4. */
function T({ style, ...rest }: React.ComponentProps<typeof UIText>): React.JSX.Element {
  return <UIText {...rest} style={[{ fontSize: 10, lineHeight: 14 }, style]} />;
}

const STEPS = [
  { n: 1, labelKey: 'wizard.tabService' },
  { n: 2, labelKey: 'wizard.tabDateTime' },
  { n: 3, labelKey: 'wizard.tabConfirm' },
] as const;

type StepNo = 1 | 2 | 3;
type StepState = 'done' | 'current' | 'todo';

/** ແຖບ segment ດຽວ — current ຈະ fill ຈາກ 0→100% ຕອນ mount (ເຄົາລົບ Reduce Motion). */
function Segment({ state }: { state: StepState }): React.JSX.Element {
  const reduced = useReducedMotion();
  const p = useRef(new Animated.Value(state === 'current' && !reduced ? 0 : 1)).current;

  useEffect(() => {
    if (state !== 'current') return;
    if (reduced) {
      p.setValue(1);
      return;
    }
    const anim = Animated.timing(p, {
      toValue: 1,
      duration: 440,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [state, reduced, p]);

  return (
    <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
      {state === 'todo' ? null : (
        <Animated.View
          className="h-full rounded-full bg-primary"
          style={{
            width:
              state === 'done'
                ? '100%'
                : p.interpolate({ inputRange: [0, 1], outputRange: ['8%', '100%'] }),
          }}
        />
      )}
    </View>
  );
}

export function WizardProgress({
  step,
  title,
  onBack,
  onStepPress,
  onClose,
}: {
  step: StepNo;
  title: string;
  onBack: () => void;
  /** ແຕະ step ທີ່ຜ່ານມາເພື່ອກັບໄປແກ້ໄຂ. ຖ້າບໍ່ສົ່ງມາ step badge ຈະບໍ່ກົດໄດ້. */
  onStepPress?: (step: StepNo) => void;
  /** ສະແດງປຸ່ມອອກ (✕) ຢູ່ມຸມຂວາຂອງ header. */
  onClose?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <View className="bg-background">
      <ScreenHeader
        title={title}
        onBack={onBack}
        borderless
        right={
          onClose ? (
            <Touchable
              onPress={onClose}
              hitSlop={8}
              pressScale={0.9}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              className="h-9 w-9 items-center justify-center rounded-full bg-muted"
            >
              <Ionicons name="close" size={18} color={colors.mutedForeground} />
            </Touchable>
          ) : undefined
        }
      />

      <View className="gap-2.5 px-5 pb-3 pt-1">
        {/* ແຖບ segment */}
        <View className="flex-row items-center gap-1.5">
          {STEPS.map(({ n }) => (
            <Segment
              key={n}
              state={n < step ? 'done' : n === step ? 'current' : 'todo'}
            />
          ))}
        </View>

        {/* badge + label ໃຕ້ແຕ່ລະ segment */}
        <View className="flex-row items-start">
          {STEPS.map(({ n, labelKey }) => {
            const state: StepState = n < step ? 'done' : n === step ? 'current' : 'todo';
            const interactive = state === 'done' && !!onStepPress;
            const label = t(labelKey);

            const inner = (
              <>
                <View
                  className={cn(
                    'h-6 w-6 flex-row items-center justify-center rounded-full',
                    state === 'current' && 'border-2 border-primary-subtle bg-primary',
                    state === 'done' && 'bg-primary',
                    state === 'todo' && 'bg-muted',
                  )}
                >
                  {state === 'done' ? (
                    <Ionicons name="checkmark" size={12} color={colors.primaryForeground} />
                  ) : (
                    <T
                      className={cn(
                        'font-lao-medium',
                        state === 'current' ? 'text-primary-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {n}
                    </T>
                  )}
                </View>
                <View className="mt-1 flex-row items-center gap-0.5">
                  <T
                    numberOfLines={1}
                    className={cn(
                      state === 'todo'
                        ? 'font-lao text-muted-foreground'
                        : 'font-lao-medium text-primary-strong',
                    )}
                  >
                    {label}
                  </T>
                  {interactive ? (
                    <Ionicons name="pencil" size={8} color={colors.primaryStrong} />
                  ) : null}
                </View>
              </>
            );

            if (interactive) {
              return (
                <Touchable
                  key={n}
                  onPress={() => onStepPress?.(n as StepNo)}
                  pressScale={0.94}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t('wizard.goToStep', { step: label })}
                  className="flex-1 items-center"
                >
                  {inner}
                </Touchable>
              );
            }

            return (
              <View key={n} className="flex-1 items-center">
                {inner}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
