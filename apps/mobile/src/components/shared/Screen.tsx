import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { type Edge, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: readonly Edge[];
  /** ເນື້ອຫາຄ້າງລຸ່ມ (sticky footer) — ຮັບ safe-area inset ອັດຕະໂນມັດ. */
  footer?: ReactNode;
};

const GUTTER = 20;

export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top'],
  footer,
}: ScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();

  const inner = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        padding: padded ? GUTTER : 0,
        paddingBottom: GUTTER + 16,
        flexGrow: 1,
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={padded ? 'flex-1 p-5' : 'flex-1'}>{children}</View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={edges}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {inner}
        {footer ? (
          <View
            className="border-t border-border bg-card px-5 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
