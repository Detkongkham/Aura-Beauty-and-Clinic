import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { gradients, type GradientPreset, type GradientSpec } from '../../theme/gradients';

export type GradientProps = {
  preset: GradientPreset;
  /** ວາງເຕັມ parent (absolute) — ໃຊ້ເປັນ background layer. */
  fill?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  pointerEvents?: 'none' | 'auto' | 'box-none';
};

/** LinearGradient + brand presets. `fill` = absolute background layer. */
export function Gradient({
  preset,
  fill,
  radius,
  style,
  children,
  pointerEvents,
}: GradientProps): React.JSX.Element {
  const g = gradients[preset] as GradientSpec;
  return (
    <LinearGradient
      colors={g.colors}
      start={g.start}
      end={g.end}
      locations={g.locations}
      pointerEvents={pointerEvents}
      style={[
        fill ? StyleSheet.absoluteFillObject : null,
        radius != null ? { borderRadius: radius } : null,
        style,
      ]}
    >
      {children}
    </LinearGradient>
  );
}
