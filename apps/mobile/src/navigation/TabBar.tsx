import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from '../components/ui/GlassView';
import { Text } from '../components/ui/Text';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../lib/haptics';
import { colors, motion, shadow } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** [inactive, active] glyph ຕໍ່ແຕ່ລະ tab (ລວມທັງ customer ແລະ staff portal). */
const ICONS: Record<string, [IconName, IconName]> = {
  HomeTab: ['home-outline', 'home'],
  AppointmentsTab: ['calendar-outline', 'calendar'],
  ProfileTab: ['person-outline', 'person'],
  TodayTab: ['today-outline', 'today'],
  AttendanceTab: ['finger-print-outline', 'finger-print'],
  EarningsTab: ['wallet-outline', 'wallet'],
  MessagesTab: ['chatbubble-outline', 'chatbubble'],
};

const FALLBACK_ICON: [IconName, IconName] = ['ellipse-outline', 'ellipse'];

/**
 * Custom bottom tab bar (design-mobile.md §5.8) — frosted-glass surface, hairline top,
 * soft upward shadow. Active item: `text-primary` icon + label ກັບ `bg-primary` dot ທີ່
 * animate ເຂົ້າ. ເຄົາລົບ Reduce Motion ແລະ ໃຫ້ haptic ເບົາໆ ຕອນສະຫຼັບ tab.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <GlassView
      intensity={40}
      style={[
        styles.bar,
        shadow.lg,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          borderTopColor: colors.border,
        },
      ]}
    >
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options ?? {};
          const focused = state.index === index;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);
          const [outline, filled] = ICONS[route.name] ?? FALLBACK_ICON;

          const onPress = (): void => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              haptics.select();
              navigation.navigate(route.name);
            }
          };

          const onLongPress = (): void => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <TabButton
              key={route.key}
              focused={focused}
              label={label}
              iconName={focused ? filled : outline}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </GlassView>
  );
}

type TabButtonProps = {
  focused: boolean;
  label: string;
  iconName: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  onLongPress: () => void;
};

function TabButton({
  focused,
  label,
  iconName,
  accessibilityLabel,
  onPress,
  onLongPress,
}: TabButtonProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const press = useRef(new Animated.Value(0)).current;
  /** 0 = rest · 1 = punched — keyframe pop that overshoots then springs back. */
  const pop = useRef(new Animated.Value(0)).current;
  /** 0→1 expanding ring pulse, fired once each time the tab becomes active. */
  const halo = useRef(new Animated.Value(0)).current;
  const wasFocused = useRef(focused);

  useEffect(() => {
    if (reduced) {
      progress.setValue(focused ? 1 : 0);
      wasFocused.current = focused;
      return;
    }
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      speed: 16,
      bounciness: 8,
    }).start();

    // Only punch + pulse on the 0→1 edge, not on every re-render.
    if (focused && !wasFocused.current) {
      pop.setValue(0);
      halo.setValue(0);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pop, {
            toValue: 1,
            duration: 170,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          // Low friction → visible elastic overshoot on the way back to rest.
          Animated.spring(pop, {
            toValue: 0,
            friction: 3.5,
            tension: 140,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(halo, {
          toValue: 1,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
    wasFocused.current = focused;
  }, [focused, reduced, progress, pop, halo]);

  const animatePress = (to: number): void => {
    if (reduced) return;
    if (to) {
      Animated.timing(press, {
        toValue: 1,
        duration: motion.pressIn,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(press, {
        toValue: 0,
        useNativeDriver: true,
        friction: 4,
        tension: 160,
      }).start();
    }
  };

  const dotStyle = {
    opacity: progress,
    transform: [
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-3, 0] }) },
    ],
  };
  const haloStyle = {
    opacity: halo.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.3, 0] }),
    transform: [
      { scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.9] }) },
    ],
  };
  const iconStyle = {
    transform: [
      {
        scale: Animated.multiply(
          progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
          Animated.multiply(
            pop.interpolate({
              inputRange: [-0.35, 0, 1],
              outputRange: [0.94, 1, 1.32],
              extrapolate: 'clamp',
            }),
            press.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }),
          ),
        ),
      },
    ],
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => animatePress(1)}
      onPressOut={() => animatePress(0)}
      style={styles.item}
      hitSlop={8}
    >
      <Animated.View style={[styles.dot, { backgroundColor: colors.primary }, dotStyle]} />
      <View style={styles.iconWrap}>
        <Animated.View
          pointerEvents="none"
          style={[styles.halo, { backgroundColor: colors.primarySubtle }, haloStyle]}
        />
        <Animated.View style={iconStyle}>
          <Ionicons
            name={iconName}
            size={23}
            color={focused ? colors.primary : colors.mutedForeground}
          />
        </Animated.View>
      </View>
      <Text
        numberOfLines={1}
        variant="caption"
        className={focused ? 'font-lao-semibold text-[11px]' : 'text-[11px]'}
        style={{ color: focused ? colors.primary : colors.mutedForeground }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 999,
  },
  dot: {
    position: 'absolute',
    top: -6,
    width: 5,
    height: 5,
    borderRadius: 999,
  },
});
