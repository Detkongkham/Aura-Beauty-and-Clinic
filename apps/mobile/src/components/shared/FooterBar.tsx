import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView, glassBorder } from '../ui/GlassView';

/** Sticky bottom action bar — frosted glass, hairline top, safe-area inset. */
export function FooterBar({ children }: { children: ReactNode }): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <GlassView style={[glassBorder.top, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View className="gap-2.5 px-5 pt-3">{children}</View>
    </GlassView>
  );
}
