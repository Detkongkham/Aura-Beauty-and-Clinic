import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cn } from '../../lib/cn';
import { Gradient } from './Gradient';

/** Loading placeholder — shimmer sweep (iOS-style); static tint under Reduce Motion. */
export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  const onLayout = (e: LayoutChangeEvent): void => setW(e.nativeEvent.layout.width);

  useEffect(() => {
    if (reduced || w === 0) return;
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: 1300, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, w, x]);

  return (
    <Animated.View
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={reduced ? { opacity: 0.6 } : undefined}
      className={cn('overflow-hidden rounded-xl bg-muted', className)}
    >
      {!reduced && w > 0 ? (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: w,
            transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-w, w] }) }],
          }}
        >
          <Gradient preset="shimmer" style={StyleSheet.absoluteFillObject} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
