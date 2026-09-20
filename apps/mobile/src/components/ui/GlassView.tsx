import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

type Tint = 'light' | 'dark' | 'default';

export type GlassViewProps = {
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  /** ໂຕນແກ້ວ — ຖ້າບໍ່ລະບຸ ຈະຕາມໂໝດຂອງແອັບ (ສະຫວ່າງ→light, ມືດ→dark). */
  tint?: Tint;
  /** ໂຄ້ງມຸມ + overflow:hidden — ໃຊ້ເປັນບັດແກ້ວ ບໍ່ແມ່ນແຖບເຕັມ. */
  radius?: number;
  /** ກວາດແສງ specular 1 ຄັ້ງຕອນ mount (ເຄົາລົບ Reduce Motion). */
  sheen?: boolean;
  children?: React.ReactNode;
};

/** veil ໄລ່ເຂັ້ມ→ຈາງ ຈາກເທິງລົງລຸ່ມ — ໃຫ້ແກ້ວມີມິຕິ ບໍ່ແປ. */
const VEIL: Record<Tint, readonly [string, string]> = {
  light: ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.12)'],
  dark: ['rgba(10,12,16,0.52)', 'rgba(10,12,16,0.18)'],
  default: ['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.08)'],
};
/** ເສັ້ນແສງ specular ຂອບເທິງ (ແກ້ວຮັບແສງ). */
const EDGE: Record<Tint, string> = {
  light: 'rgba(255,255,255,0.65)',
  dark: 'rgba(255,255,255,0.14)',
  default: 'rgba(255,255,255,0.4)',
};
/** ພື້ນ fallback (Android/web — ບໍ່ມີ blur ຈິງ). */
const FALLBACK_BASE: Record<Tint, string> = {
  light: 'rgba(255,255,255,0.86)',
  dark: 'rgba(20,23,30,0.88)',
  default: 'rgba(255,255,255,0.7)',
};

/** ແສງກວາດຄັ້ງດຽວຕອນ mount — ຢູ່ຫຼັງ children, ໜ້າ veil. */
function Sheen({ tint }: { tint: Tint }): React.JSX.Element | null {
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    const anim = Animated.timing(x, {
      toValue: 1,
      duration: 1100,
      delay: 260,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [reduced, x]);

  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 88,
        backgroundColor: tint === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.34)',
        transform: [
          { rotate: '18deg' },
          { translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-170, 520] }) },
        ],
      }}
    />
  );
}

/**
 * Frosted-glass surface. iOS = real blur; Android/web = a layered translucent
 * fallback that keeps text legible. A luminous veil + top specular hairline give
 * it depth; `sheen` adds a one-shot light sweep on mount. Use for floating
 * headers / CTA bars / tab bars over content.
 */
export function GlassView({
  style,
  intensity = 40,
  tint,
  radius,
  sheen = false,
  children,
}: GlassViewProps): React.JSX.Element {
  // radius ⇒ clip the root (card use). ບໍ່ບັງຄັບ overflow ຕອນ sheen — ຄລິບ overlay
  // ຕ່າງຫາກ ເພື່ອບໍ່ໃຫ້ overflow:hidden ຕັດ shadow ຂອງ caller ໃນ iOS (ui-kit rule).
  const { isDark } = useTheme();
  const resolved: Tint = tint ?? (isDark ? 'dark' : 'light');
  const shape: ViewStyle | null = radius != null ? { borderRadius: radius, overflow: 'hidden' } : null;

  const overlay = (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <LinearGradient
        pointerEvents="none"
        colors={VEIL[resolved]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: StyleSheet.hairlineWidth,
          backgroundColor: EDGE[resolved],
        }}
      />
      {sheen ? <Sheen tint={resolved} /> : null}
    </View>
  );

  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={intensity} tint={resolved} style={[shape, style]}>
        {overlay}
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[{ backgroundColor: FALLBACK_BASE[resolved] }, shape, style]}>
      {overlay}
      {children}
    </View>
  );
}

/**
 * ເສັ້ນຂອບຜົມຂອງແຖບແກ້ວ — ອ່ານ token ປັດຈຸບັນທຸກຄັ້ງ (getter) ຈຶ່ງປ່ຽນຕາມໂໝດ.
 */
export const glassBorder = Object.defineProperties({} as { bottom: ViewStyle; top: ViewStyle }, {
  bottom: {
    enumerable: true,
    get: (): ViewStyle => ({
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    }),
  },
  top: {
    enumerable: true,
    get: (): ViewStyle => ({
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    }),
  },
}) as { bottom: ViewStyle; top: ViewStyle };
