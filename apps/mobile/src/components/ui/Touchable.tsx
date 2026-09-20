import { forwardRef, useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type View,
} from 'react-native';
import { cssInterop } from 'nativewind';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { haptics } from '../../lib/haptics';
import { motion } from '../../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
// ຮັບປະກັນວ່າ NativeWind map `className` → `style` ເທິງ animated wrapper.
cssInterop(AnimatedPressable, { className: 'style' });

type HapticKind = 'select' | 'primary' | 'none';

export type TouchableProps = PressableProps & {
  /** ຄ່າ scale ຕອນກົດ (default 0.97). ໃສ່ 1 ເພື່ອປິດ scale. */
  pressScale?: number;
  /** haptic ຕອນກົດ — default 'select'. */
  haptic?: HapticKind;
  /** ຫຼຸດ opacity ຕອນກົດ (default true). */
  dim?: boolean;
};

/**
 * ພື້ນຖານ pressable ຂອງແອັບ — animated scale + opacity feedback (150–300ms, ease-out),
 * ເຄົາລົບ Reduce Motion, ແລະ haptic ເບົາໆ. ໃຊ້ແທນ Pressable ດິບໃນທຸກ control ທີ່ແຕະໄດ້.
 * Transform-only — ບໍ່ຍ້າຍ layout ຮອບຂ້າງ (pro-rules: Stable Interaction States).
 */
export const Touchable = forwardRef<View, TouchableProps>(function Touchable(
  {
    pressScale = motion.pressScale,
    haptic = 'select',
    dim = true,
    onPressIn,
    onPressOut,
    style,
    ...rest
  },
  ref,
) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const handleIn = useCallback(
    (e: GestureResponderEvent) => {
      if (haptic === 'select') haptics.select();
      else if (haptic === 'primary') haptics.tapPrimary();
      if (!reduced) {
        Animated.parallel([
          Animated.timing(scale, { toValue: pressScale, duration: motion.pressIn, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: dim ? 0.85 : 1, duration: motion.pressIn, useNativeDriver: true }),
        ]).start();
      }
      onPressIn?.(e);
    },
    [haptic, reduced, scale, opacity, pressScale, dim, onPressIn],
  );

  const handleOut = useCallback(
    (e: GestureResponderEvent) => {
      if (!reduced) {
        Animated.parallel([
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }),
          Animated.timing(opacity, { toValue: 1, duration: motion.pressOut, useNativeDriver: true }),
        ]).start();
      }
      onPressOut?.(e);
    },
    [reduced, scale, opacity, onPressOut],
  );

  const animatedStyle = useMemo(
    () => ({ transform: [{ scale }], opacity }),
    [scale, opacity],
  );

  return (
    <AnimatedPressable
      ref={ref as never}
      onPressIn={handleIn}
      onPressOut={handleOut}
      style={[animatedStyle, style as never]}
      {...rest}
    />
  );
});
