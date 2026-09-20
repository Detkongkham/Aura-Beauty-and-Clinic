import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export type AnimatedEntranceProps = {
  children: React.ReactNode;
  /** ລຳດັບໃນ list — ໜ່ວງ 30ms/ລາຍການ (ສູງສຸດ ~250ms). */
  index?: number;
  /** ໄລຍະຍ້າຍຂຶ້ນ (px). */
  offset?: number;
  style?: StyleProp<ViewStyle>;
};

/** Fade + rise ຕອນ mount, stagger ຕາມ index. ຂ້າມເມື່ອ Reduce Motion. */
export function AnimatedEntrance({
  children,
  index = 0,
  offset = 10,
  style,
}: AnimatedEntranceProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const p = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      p.setValue(1);
      return;
    }
    const anim = Animated.timing(p, {
      toValue: 1,
      duration: 320,
      delay: Math.min(index * 30, 250),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [reduced, index, p]);

  return (
    <Animated.View
      style={[
        {
          opacity: p,
          transform: [
            { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
